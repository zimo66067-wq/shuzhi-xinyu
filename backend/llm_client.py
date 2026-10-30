"""
llm_client.py — LLM 调用层（DeepSeek 单一）

设计要点：
  - 单一 LLM：DeepSeek V4.1 Flash (`deepseek-flash`)，可选择 `deepseek-v4-pro`
  - 请求超时 25s（< Flask worker 默认 30s，留余地）
  - 失败永不抛异常：返回兜底字符串 FALLBACK_REPLY，由上层决定是否提示用户
  - 调用源通过 get_last_source() 暴露给运维（"deepseek" / "fallback" / "none"）

⚠️ 硬性约束（不可违反）：
  - 本模块**只允许**调用 DeepSeek，禁止以任何形式引入其他 LLM provider
    （包括但不限于 OpenAI / Claude / 文心 / 通义 等）作为降级或主路径
  - 禁止在任何地方读取除 DEEPSEEK_API_KEY 之外的 LLM API 密钥环境变量
  - 如未来确需多 provider，必须先经产品评审 + 隐私政策（PRIVACY.md）同步更新
"""

import hashlib
import json
import logging
import os
import re
import time
import uuid
from contextvars import ContextVar

import requests
from experiment import audit

# 略短于 Flask worker 默认超时（30s），给应用层留余地
REQUEST_TIMEOUT = 25
SUPPORTED_MODELS = {"deepseek-flash", "deepseek-v4-pro"}


def get_model_config() -> dict:
    """返回实际用于请求和实验冻结的配置；不含 API 密钥。"""
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash").strip()
    if model not in SUPPORTED_MODELS:
        raise ValueError("DEEPSEEK_MODEL must be deepseek-flash or deepseek-v4-pro")
    return {
        "model": model,
        "thinking": {"type": "disabled"},
        "temperature": 0.8,
        "max_tokens": 500,
    }

# 兜底字符串单独定义，方便上层识别
FALLBACK_REPLY = "我现在遇到一些问题，稍后再试试吧。"

# 记录最后一次调用的来源（deepseek / fallback / none）
_last_source = ContextVar("last_llm_source", default="none")


def get_last_source() -> str:
    """返回上一次调用的来源标识，用于运维监控。"""
    return _last_source.get()


def _emit_call_evidence(payload, response, data, api_key, trace_id, started, error=None):
    """只记录上游调用元数据；不记录密钥、对话、提示或回复正文。"""
    def tag(value):
        return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.:/-]{1,160}", value) else None

    try:
        data = data if isinstance(data, dict) else {}
        usage = data.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        token_counts = {key: usage[key] for key in (
            "prompt_tokens", "completion_tokens", "total_tokens",
            "prompt_cache_hit_tokens", "prompt_cache_miss_tokens",
        ) if type(usage.get(key)) is int and usage[key] >= 0}
        status = getattr(response, "status_code", None)
        record = {
            "event": "provider_failure" if error is not None else "provider_success",
            "provider": "deepseek",
            "endpoint": "https://api.deepseek.com/chat/completions",
            "trace_id": trace_id,
            "requested_model": tag(payload.get("model")),
            "response_model": tag(data.get("model")),
            "completion_id": tag(data.get("id")),
            "thinking_type": payload.get("thinking", {}).get("type"),
            "http_status": status if type(status) is int else None,
            "usage": token_counts,
            "elapsed_ms": round((time.monotonic() - started) * 1000, 2),
            "key_fingerprint": hashlib.sha256(api_key.encode()).hexdigest()[:16],
            "error_type": type(error).__name__ if error is not None else None,
        }
        print("[LLM_EVIDENCE] " + json.dumps(record, ensure_ascii=True), flush=True)
    except Exception:
        # 诊断输出异常不能把一次已成功计费的回复变成业务失败。
        pass


# ── DeepSeek 调用 ─────────────────────────────────────────────────────────

def call_deepseek(
    system_prompt: str,
    messages: list[dict],
    model: str | None = None,
) -> str:
    """
    调用 DeepSeek Chat Completions API。
    默认 model=deepseek-flash（DeepSeek V4.1 Flash，非思考模式）。
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise ValueError("环境变量 DEEPSEEK_API_KEY 未设置")

    full_messages = [{"role": "system", "content": system_prompt}] + messages

    payload = get_model_config()
    if model is not None:
        if model not in SUPPORTED_MODELS:
            raise ValueError("unsupported DeepSeek model")
        payload["model"] = model
    payload["messages"] = full_messages
    endpoint = "https://api.deepseek.com/chat/completions"
    attempt = audit.dispatch(payload, endpoint)
    if attempt is not None:
        attempt["_clock"] = time.monotonic()
    response = None
    response_data = None
    trace_id = uuid.uuid4().hex
    started = time.monotonic()
    try:
        response = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload, timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        response_data = response.json()
        content = response_data["choices"][0]["message"]["content"]
        if audit.current.get() and (not isinstance(content, str) or not content.strip()):
            raise ValueError("empty upstream content")
    except Exception as exc:
        audit.received(attempt, response, error=exc)
        _emit_call_evidence(payload, response, response_data, api_key, trace_id, started, error=exc)
        raise
    audit.received(attempt, response, content=content)
    _emit_call_evidence(payload, response, response_data, api_key, trace_id, started)
    return content


# ── 统一入口（含兜底）─────────────────────────────────────────────────────

def call_llm(system_prompt: str, messages: list[dict]) -> str:
    """
    调用 DeepSeek，失败返回兜底字符串。永不抛出异常。
    """
    try:
        result = call_deepseek(system_prompt, messages)
        _last_source.set("deepseek")
        return result
    except audit.AuditWriteError:
        raise
    except Exception as e:
        # Exception bodies can contain user input or credentials. No raw body in logs.
        logging.warning("[LLM] DeepSeek 调用失败：%s", type(e).__name__)
        if audit.current.get() and not audit.current.get().attempts:
            audit.local("local_fallback", type(e).__name__)

    _last_source.set("fallback")
    return FALLBACK_REPLY

