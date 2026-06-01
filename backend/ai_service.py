from dotenv import load_dotenv
load_dotenv()
"""
ai_service.py — 业务逻辑层（加固版）
集中实现：输入校验 / JSON 修复 / 输出过滤 / 历史截断
压力测试修复点：A1 / A3 / B1 / B2 / B3 / B5 / B6 / C1 / C4
"""

import json
import os
import re

from llm_client import call_llm

# ── 配置项 ──────────────────────────────────────────────────────────────

PROMPT_DIR = os.path.join(os.path.dirname(__file__), "prompts")

# C1 修复：滚动窗口长度，超过则只保留最近 N 条
MAX_HISTORY_TURNS = 20

# B1 + P6 修复：score 必须包含的五个维度，缺则补
EXPECTED_DIMS = ["主动发起", "话题维持", "情绪识别", "礼貌用语", "参与度"]

# B6 修复：报告中的禁用词清单
BLOCKED_WORDS = [
    "自闭症", "ASD", "asd", "孤独症", "障碍", "缺陷", "病症", "异常",
    "残疾", "智力低下", "发育迟缓",
]

# 任务 2 训练阶段：合法阶段集合 + 标签正则
VALID_STAGES = {"welcome", "free_chat", "emotion_guide", "scenario_test", "ending"}
STAGE_PATTERN = re.compile(r"\[STAGE\s*:\s*(\w+)\s*\]\s*$", re.IGNORECASE)

# 任务 3 多年龄分档：从 system message "X 岁" 抽取年龄并归档
AGE_PATTERN = re.compile(r"(\d+)\s*岁")

# 三档 prompt 说明（注入到 {age_band} 占位符）
AGE_BAND_PROMPTS = {
    "low": (
        "当前对话对象年龄段：3-5 岁（低龄）。\n"
        "  - 词汇要求：只用最常见的具象词（吃饭/玩/妈妈/开心/累），不用抽象词。\n"
        "  - 句子长度：每句不超过 6 个字。\n"
        "  - 示例选择：用家里、玩具、吃东西、睡觉等熟悉场景。\n"
        "  - 引导方式：多用是非题（'好玩吗？'），少用开放题。"
    ),
    "mid": (
        "当前对话对象年龄段：6-9 岁（中龄）。\n"
        "  - 词汇要求：常用具象词，可以出现学校、朋友、老师、作业等词。\n"
        "  - 句子长度：每句 8-10 个字。\n"
        "  - 示例选择：用学校、同学、爱好、家人等日常场景。\n"
        "  - 引导方式：可问'谁/什么/什么时候'等具体疑问句。"
    ),
    "high": (
        "当前对话对象年龄段：10 岁及以上（高龄）。\n"
        "  - 词汇要求：可以用稍复杂的情绪词（紧张/担心/被理解/失落），仍避免比喻和成语。\n"
        "  - 句子长度：每句 10-14 个字均可。\n"
        "  - 示例选择：可以涉及同学关系、考试压力、兴趣爱好的细节。\n"
        "  - 引导方式：可问'你觉得'类反思性问题，但仍保持温和直白。"
    ),
}


def _age_to_band(age: int) -> str:
    """3-5 → low；6-9 → mid；10+ → high。"""
    if age <= 5:
        return "low"
    if age <= 9:
        return "mid"
    return "high"


def _extract_age_band(messages: list[dict]) -> str:
    """从首条 system message 抠出 'X 岁' 并归档；找不到返回 'mid'。"""
    for m in messages:
        if m.get("role") == "system":
            content = str(m.get("content", ""))
            match = AGE_PATTERN.search(content)
            if match:
                try:
                    age = int(match.group(1))
                    return _age_to_band(age)
                except ValueError:
                    pass
            break  # 只看第一条 system
    return "mid"


def _extract_stage(reply: str) -> tuple[str, str | None]:
    """
    从 reply 末尾抠出 [STAGE:xxx] 标签，返回 (清洗后的 reply, stage 或 None)。
    DeepSeek 偶尔会忘记标签或写错位置，多种 fallback：
      1. 标准格式：末尾 [STAGE:xxx]
      2. 不在末尾：正文任意位置匹配最后一个
      3. 找不到：返回 None，让前端按轮数推断
    """
    if not reply:
        return reply, None

    # 1. 末尾匹配
    m = STAGE_PATTERN.search(reply)
    if m:
        stage = m.group(1).lower()
        if stage in VALID_STAGES:
            return STAGE_PATTERN.sub("", reply).strip(), stage

    # 2. 任意位置匹配最后一个
    matches = list(re.finditer(r"\[STAGE\s*:\s*(\w+)\s*\]", reply, re.IGNORECASE))
    if matches:
        last = matches[-1]
        stage = last.group(1).lower()
        if stage in VALID_STAGES:
            cleaned = re.sub(r"\[STAGE\s*:\s*\w+\s*\]", "", reply).strip()
            return cleaned, stage

    return reply.strip(), None

# P5 缓存：自动记录上一次评分结果，供 report() 对比使用
_last_score_cache = None
_prev_score_cache = None


# ── 工具函数 ────────────────────────────────────────────────────────────

def _load_prompt(filename: str) -> str:
    """读取 prompts/ 目录下的 prompt 文件。"""
    with open(os.path.join(PROMPT_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


# 中危 #11：单条 user 消息长度上限（防止超长输入烧 token / 滥用）
MAX_USER_CONTENT_LEN = 500

# 中危 #11：常见 prompt 注入模式（命中后做温和拒绝，不发给 LLM）
# 只针对 user role；assistant/system 信任来自后端构造
_INJECTION_PATTERNS = [
    re.compile(r"忽略[\s\S]{0,8}(之前|以前|上面|所有)[\s\S]{0,8}(指令|规则|提示|prompt)", re.IGNORECASE),
    re.compile(r"ignore\s+(all|previous|prior|above)\s+(instructions?|prompts?|rules?)", re.IGNORECASE),
    re.compile(r"你\s*现在\s*是\s*[一]?个", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+a\s+", re.IGNORECASE),
    re.compile(r"假装|pretend\s+to\s+be", re.IGNORECASE),
    re.compile(r"system\s*[:：]\s*", re.IGNORECASE),
    re.compile(r"</?\s*(system|user|assistant)\s*>", re.IGNORECASE),
    re.compile(r"\[\s*INST\s*\]", re.IGNORECASE),
]


def _looks_like_injection(text: str) -> bool:
    """检测明显的 prompt 注入尝试。命中返回 True。"""
    if not text:
        return False
    for pat in _INJECTION_PATTERNS:
        if pat.search(text):
            return True
    return False


def _validate_messages(messages) -> list[dict]:
    """
    A1 + A3 修复 + 中危 #11：
    - 丢弃缺字段、非法 role、空 content 的项
    - user 消息超长直接截断
    - user 消息命中注入模式直接丢弃（不让其污染 LLM 上下文）
    - 非 list 输入返回 []
    """
    if not isinstance(messages, list):
        return []
    cleaned = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content", "")
        if role not in ("user", "assistant", "system"):
            continue
        content = str(content).strip()
        if not content:
            continue

        # user 消息特殊处理（最不可信）
        if role == "user":
            # 长度截断（超出部分悄悄截掉，不报错）
            if len(content) > MAX_USER_CONTENT_LEN:
                content = content[:MAX_USER_CONTENT_LEN]
            # 注入检测：命中则不放进 messages，回头返回温和拒绝
            if _looks_like_injection(content):
                cleaned.append({"role": role, "content": "__INJECTION_BLOCKED__", "_blocked": True})
                continue

        cleaned.append({"role": role, "content": content})
    return cleaned


def _truncate_history(messages: list[dict]) -> list[dict]:
    """
    C1 修复：保留最近 N 条，且确保首条是 user。
    """
    if len(messages) <= MAX_HISTORY_TURNS:
        return messages
    truncated = messages[-MAX_HISTORY_TURNS:]
    while truncated and truncated[0]["role"] != "user":
        truncated = truncated[1:]
    return truncated


def _strip_json_fence(text: str) -> str:
    """
    B2 修复：强化 JSON 围栏剥离，处理英文/全角/无围栏多种情况。
    最终用首个 { 到最后一个 } 兜底截取。
    """
    text = text.strip()

    # 剥前缀围栏
    for prefix in ("```json", "```JSON", "```", "｀｀｀"):
        if text.startswith(prefix):
            text = text[len(prefix):].lstrip()
            break

    # 剥后缀围栏
    for suffix in ("```", "｀｀｀"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].rstrip()

    # 兜底：截取最外层大括号范围
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start: end + 1]
    return text


def _validate_and_repair_score(parsed) -> dict:
    """
    B1 + B3 修复：校验并修复 score JSON 结构与分数范围。
    缺维度自动补 3 分；分数超界 clip 到 1-5；total_score 强制重算。
    """
    if not isinstance(parsed, dict):
        # 中危 #8：不再返回 raw（避免泄漏 LLM 原文 / fingerprint 模型）
        print(f"[score] parsed not dict: {str(parsed)[:200]}", flush=True)
        return {"total_score": 0, "error": "解析失败"}

    dims_raw = parsed.get("dimensions", {})
    if not isinstance(dims_raw, dict):
        dims_raw = {}

    # 补齐维度，clip 分数到 1-5
    dims_fixed = {}
    for d in EXPECTED_DIMS:
        item = dims_raw.get(d, {})
        if not isinstance(item, dict):
            item = {}
        score_val = item.get("score", 3)
        try:
            score_val = int(score_val)
        except (TypeError, ValueError):
            score_val = 3
        score_val = max(1, min(5, score_val))
        dims_fixed[d] = {
            "score": score_val,
            "max": 5,
            "comment": str(item.get("comment", ""))[:50],
        }
    parsed["dimensions"] = dims_fixed

    # 强制重算 total_score（防止模型自己算错）
    total = sum(dims_fixed[d]["score"] for d in EXPECTED_DIMS)
    parsed["total_score"] = round(total / 25 * 100)

    # 补齐其他字段
    for k in ("highlights", "improvements"):
        v = parsed.get(k, [])
        parsed[k] = v if isinstance(v, list) else []
    parsed.setdefault("next_training", "")

    return parsed


def _remove_sentences_with_blocked_words(text: str) -> str:
    """P7 修复：删除包含禁用词的整句，避免残留片段。"""
    sentences = re.split(r'(?<=[。！？\n])', text)
    result = []
    for s in sentences:
        s_stripped = s.strip()
        if not s_stripped:
            continue
        blocked = False
        for w in BLOCKED_WORDS:
            if w in s_stripped:
                blocked = True
                break
        if not blocked:
            result.append(s)
    return "".join(result)


def _filter_report_text(text: str) -> str:
    """
    B6 + P7 修复：禁用词整句移除 + 清理多余空白。
    """
    # P7：删除包含禁用词的整句
    text = _remove_sentences_with_blocked_words(text)

    # 清理多余空白
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _sanitize_for_scoring(content: str) -> str:
    """
    B5 修复：评分场景对话内容做轻度去毒，防止 prompt 注入。
    把可能影响 prompt 结构的字符替换为全角同形。
    """
    return (
        content
        .replace("```", "")
        .replace("{", "｛")
        .replace("}", "｝")
    )


# ── 业务接口 ────────────────────────────────────────────────────────────

def chat(messages) -> dict:
    """
    ASD 约束对话。
    输入校验失败时返回友好兜底，不抛异常。
    任务 3：从首条 system message 抽取年龄并注入 {age_band} 占位符。
    中危 #11：最新一条 user 消息若被注入检测拦截，直接返回温和拒绝，不调 LLM。
    """
    cleaned = _validate_messages(messages)
    if not cleaned:
        return {"reply": "你好。我在这里。"}

    # 中危 #11：最后一条若是被拦截的 user 注入，直接温和拒绝
    last = cleaned[-1]
    if last.get("role") == "user" and last.get("_blocked"):
        return {
            "reply": "我们就聊聊你今天的事吧。",
            "stage": None,
            "age_band": None,
        }
    # 过滤掉被标记的注入条目，再继续
    cleaned = [{"role": m["role"], "content": m["content"]} for m in cleaned if not m.get("_blocked")]
    if not cleaned:
        return {"reply": "你好。我在这里。"}

    # 任务 3：在截断前从原始 cleaned 抽年龄（system 在最前易被截掉）
    age_band = _extract_age_band(cleaned)

    cleaned = _truncate_history(cleaned)
    system_prompt = _load_prompt("prompt_chat.txt")
    # 注入年龄分档说明；若模板里没有占位符则不变
    system_prompt = system_prompt.replace("{age_band}", AGE_BAND_PROMPTS.get(age_band, AGE_BAND_PROMPTS["mid"]))

    raw_reply = call_llm(system_prompt, cleaned)
    reply, stage = _extract_stage(raw_reply)
    return {"reply": reply, "stage": stage, "age_band": age_band}


def score(messages, level=None) -> dict:
    """
    对对话进行社交技能评分。
    level: 可选，"beginner" / "intermediate" / "advanced"，调整评分期望。
    返回结构永远完整：缺字段会被自动补齐，超界分数会被 clip。
    """
    global _last_score_cache, _prev_score_cache
    cleaned = _validate_messages(messages)
    if not cleaned:
        return {"total_score": 0, "error": "对话为空，无法评分"}

    prompt_template = _load_prompt("prompt_scoring.txt")

    # P10：训练等级注入（影响评分期望）
    level_map = {"beginner": "初学", "intermediate": "进阶", "advanced": "熟练"}
    if level and level in level_map:
        level_note = (
            f"当前训练者等级：{level_map[level]}，"
            f"评分时对主动发起等维度适当放宽期望。"
        )
    else:
        level_note = "未设置训练者等级，按常规标准评分。"
    prompt_template = prompt_template.replace("{level_note}", level_note)

    # 格式化对话内容（含注入防护）
    lines = []
    for m in cleaned:
        safe = _sanitize_for_scoring(m["content"])
        lines.append(f"{m['role']}: {safe}")
    conversation_text = "\n".join(lines)

    system_prompt = prompt_template.replace("{conversation}", conversation_text)
    trigger = [{"role": "user", "content": "请评分"}]
    raw = call_llm(system_prompt, trigger)

    # 解析 JSON
    try:
        parsed = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        # 中危 #8：内部日志保留原文，对外不暴露
        print(f"[score] JSONDecodeError raw={raw[:200]}", flush=True)
        return {"total_score": 0, "error": "解析失败"}

    # 校验并修复
    result = _validate_and_repair_score(parsed)
    # P5：缓存结果供 report() 自动对比
    _prev_score_cache = _last_score_cache
    _last_score_cache = result
    return result


def report(score_data, previous_score=None, level=None) -> dict:
    """
    根据评分数据生成家长报告。
    previous_score: 可选，上一次评分结果，用于进步对比。
    level: 可选，"beginner" / "intermediate" / "advanced"，影响反馈语气。
    输出会经过禁用词过滤。
    """
    if not isinstance(score_data, dict):
        return {"report_text": "暂无评分数据，无法生成报告。"}

    prompt_template = _load_prompt("prompt_report.txt")

    # 进步对比（P5）：自动回退到缓存
    if previous_score is None:
        previous_score = _prev_score_cache

    if previous_score is not None and isinstance(previous_score, dict):
        prev_total = previous_score.get("total_score", 0)
        current_total = score_data.get("total_score", 0)
        diff = current_total - prev_total
        if diff > 0:
            comparison = (
                f"相比上次训练有进步（上次{prev_total}分，本次{current_total}分），"
                f"请给予简单肯定。"
            )
        elif diff < 0:
            comparison = (
                f"本次分数略低于上次（上次{prev_total}分，本次{current_total}分），"
                f"请温和对待，不说负面比较的话。"
            )
        else:
            comparison = "两次训练分数相近，请肯定孩子保持稳定。"
    else:
        comparison = "无历史对比数据。"
    prompt_template = prompt_template.replace("{previous_comparison}", comparison)

    # 训练等级（P10）
    level_map = {"beginner": "初学", "intermediate": "进阶", "advanced": "熟练"}
    if level and level in level_map:
        level_note = (
            f"训练者当前等级：{level_map[level]}，"
            f"反馈难度和建议深度应匹配此等级。"
        )
    else:
        level_note = "未设置训练等级。"
    prompt_template = prompt_template.replace("{level_note}", level_note)

    # 评分数据注入
    score_json = json.dumps(score_data, ensure_ascii=False, indent=2)
    system_prompt = prompt_template.replace("{score_data}", score_json)
    trigger = [{"role": "user", "content": "请生成报告"}]

    raw = call_llm(system_prompt, trigger)
    return {"report_text": _filter_report_text(raw)}
