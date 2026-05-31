"""
llm_client.py — LLM 调用层（加固版）
封装 DeepSeek 和 Gemini，支持自动降级。
压力测试修复点：A4 / B7 / B8
"""

import logging
import os

import requests

# A4 修复：略短于 Flask worker 默认超时（30s），给应用层留余地
REQUEST_TIMEOUT = 25

# B8 修复：兜底字符串单独定义，方便上层识别
FALLBACK_REPLY = "我现在遇到一些问题，稍后再试试吧。"

# B8 修复：记录最后一次调用的来源（deepseek / gemini / fallback）
# 上层可调用 get_last_source() 判断是否为兜底，决定前端是否提示
_last_source = "none"


def get_last_source() -> str:
    """返回上一次调用的来源标识，用于运维和前端降级提示。"""
    return _last_source


# ── DeepSeek 调用 ─────────────────────────────────────────────────────────

def call_deepseek(
    system_prompt: str,
    messages: list[dict],
    model: str = "deepseek-chat",
) -> str:
    """调用 DeepSeek Chat API。
    默认 model=deepseek-chat（别名，当前指向 V4-flash 对话模型，原 V3 升级版）。
    可选 deepseek-v4-pro（推理模型，慢且贵，不建议聊天用）。
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


# ── Gemini 调用 ──────────────────────────────────────────────────────────

def call_gemini(system_prompt: str, messages: list[dict]) -> str:
    """
    调用 Gemini 2.0 Flash API。
    Gemini 有两个特殊要求：
      1. 角色字段 'assistant' 要换成 'model'
      2. 第一条消息必须是 user 角色（B7 修复点）
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("环境变量 GEMINI_API_KEY 未设置")

    # B7 修复：过滤掉前导的 assistant/system 消息，确保首条是 user
    filtered = list(messages)
    while filtered and filtered[0].get("role") != "user":
        filtered = filtered[1:]
    if not filtered:
        raise ValueError("Gemini 调用至少需要一条 user 消息（首条非 user）")

    def convert_role(role: str) -> str:
        return "model" if role == "assistant" else role

    contents = [
        {"role": convert_role(m["role"]), "parts": [{"text": m["content"]}]}
        for m in filtered
    ]

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-2.0-flash:generateContent?key={api_key}"
    )
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "temperature": 0.8,
                "maxOutputTokens": 500,
            },
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["candidates"][0]["content"]["parts"][0]["text"]


# ── 统一入口（含降级）────────────────────────────────────────────────────

def call_llm(system_prompt: str, messages: list[dict]) -> str:
    """
    只使用 DeepSeek。失败返回兜底字符串。
    Gemini 降级已按用户要求移除（call_gemini 函数保留以备回滚）。
    永不抛出异常。来源信息通过 get_last_source() 获取（B8）。
    """
    global _last_source

    try:
        result = call_deepseek(system_prompt, messages)
        _last_source = "deepseek"
        return result
    except Exception as e:
        logging.warning(f"[LLM] DeepSeek 失败：{e}")

    # 兜底
    _last_source = "fallback"
    return FALLBACK_REPLY
