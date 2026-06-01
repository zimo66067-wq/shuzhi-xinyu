"""
llm_client.py — LLM 调用层（DeepSeek）

设计要点：
  - 单一 LLM：DeepSeek `deepseek-chat`（V3 对话模型）
  - 请求超时 25s（< Flask worker 默认 30s，留余地）
  - 失败永不抛异常：返回兜底字符串 FALLBACK_REPLY，由上层决定是否提示用户
  - 调用源通过 get_last_source() 暴露给运维（"deepseek" / "fallback" / "none"）

历史说明：曾经支持 Gemini 作为降级备选，后按用户要求移除。
"""

import logging
import os

import requests

# 略短于 Flask worker 默认超时（30s），给应用层留余地
REQUEST_TIMEOUT = 25

# 兜底字符串单独定义，方便上层识别
FALLBACK_REPLY = "我现在遇到一些问题，稍后再试试吧。"

# 记录最后一次调用的来源（deepseek / fallback / none）
_last_source = "none"


def get_last_source() -> str:
    """返回上一次调用的来源标识，用于运维监控。"""
    return _last_source


# ── DeepSeek 调用 ─────────────────────────────────────────────────────────

def call_deepseek(
    system_prompt: str,
    messages: list[dict],
    model: str = "deepseek-chat",
) -> str:
    """
    调用 DeepSeek Chat Completions API。
    默认 model=deepseek-chat（V3 对话模型）。
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise ValueError("环境变量 DEEPSEEK_API_KEY 未设置")

    full_messages = [{"role": "system", "content": system_prompt}] + messages

    response = requests.post(
        "https://api.deepseek.com/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": full_messages,
            "temperature": 0.8,
            "max_tokens": 500,
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


# ── 统一入口（含兜底）─────────────────────────────────────────────────────

def call_llm(system_prompt: str, messages: list[dict]) -> str:
    """
    调用 DeepSeek，失败返回兜底字符串。永不抛出异常。
    """
    global _last_source

    try:
        result = call_deepseek(system_prompt, messages)
        _last_source = "deepseek"
        return result
    except Exception as e:
        logging.warning(f"[LLM] DeepSeek 调用失败：{e}")

    _last_source = "fallback"
    return FALLBACK_REPLY
