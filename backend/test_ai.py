"""
test_ai.py — 独立测试脚本
不依赖 Flask，直接调用 ai_service 的三个函数并打印结果。
运行前请确保环境变量已设置：DEEPSEEK_API_KEY
用法：python test_ai.py
"""

import json
import sys
import os

# 确保能找到同目录下的模块
sys.path.insert(0, os.path.dirname(__file__))

from ai_service import chat, score, report

# ── 测试用样本数据 ─────────────────────────────────────────────────────────

# 6轮日常聊天对话（user 为被评分方）
SAMPLE_CONVERSATION = [
    {"role": "assistant", "content": "你好！今天过得怎么样？"},
    {"role": "user",      "content": "你好，还不错。"},
    {"role": "assistant", "content": "有什么有趣的事情发生吗？"},
    {"role": "user",      "content": "我今天画了一幅画，我很喜欢画画。"},
    {"role": "assistant", "content": "哇，画了什么内容呢？"},
    {"role": "user",      "content": "画了一只猫，谢谢你问我。"},
]

# 最小评分样本（用于测试 report）
SAMPLE_SCORE = {
    "total_score": 70,
    "dimensions": {
        "主动发起": {"score": 3, "max": 5, "comment": "第2轮主动分享画画"},
        "话题维持": {"score": 4, "max": 5, "comment": "围绕画画话题延续3轮"},
        "情绪识别": {"score": 3, "max": 5, "comment": "未明显回应对方情绪"},
        "礼貌用语": {"score": 4, "max": 5, "comment": "第6轮使用了谢谢"},
        "参与度": {"score": 4, "max": 5, "comment": "主动分享爱好，投入度高"},
    },
    "highlights": ["主动分享兴趣爱好", "使用了礼貌用语"],
    "improvements": ["可以尝试提问对方", "回应对方的情绪变化"],
    "next_training": "晚饭时练习问对方'今天你开心吗'",
}


# ── 工具函数 ───────────────────────────────────────────────────────────────

def print_section(title: str) -> None:
    """打印分隔标题"""
    print("\n" + "═" * 50)
    print(f"  {title}")
    print("═" * 50)


def check_pass(condition: bool, label: str) -> bool:
    """打印通过/失败标记"""
    status = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {status}  {label}")
    return condition


# ── 测试 1：chat() ─────────────────────────────────────────────────────────

def test_chat() -> bool:
    print_section("测试 1 / 3 — chat()")
    test_messages = [{"role": "user", "content": "你好，我想聊天。"}]

    try:
        result = chat(test_messages)
        print(f"  返回预览：{str(result)[:120]}")

        ok1 = check_pass(isinstance(result, dict), "返回值是 dict")
        ok2 = check_pass("reply" in result,        "包含 'reply' 键")
        ok3 = check_pass(len(result.get("reply", "")) > 0, "reply 不为空")
        return ok1 and ok2 and ok3
    except Exception as e:
        print(f"  ❌ 异常：{e}")
        return False


# ── 测试 2：score() ────────────────────────────────────────────────────────

def test_score() -> bool:
    print_section("测试 2 / 3 — score()")

    try:
        result = score(SAMPLE_CONVERSATION)
        print(f"  返回预览：{json.dumps(result, ensure_ascii=False)[:200]}")

        ok1 = check_pass(isinstance(result, dict),               "返回值是 dict")
        ok2 = check_pass("total_score" in result,                "包含 'total_score' 键")
        ok3 = check_pass("error" not in result,                  "无解析错误")
        ok4 = check_pass(isinstance(result.get("total_score"), (int, float)),
                         "total_score 是数字")
        ok5 = check_pass(len(result.get("dimensions", {})) >= 5,
                         "包含 5 个评估维度（含参与度）")
        return ok1 and ok2 and ok3 and ok4 and ok5
    except Exception as e:
        print(f"  ❌ 异常：{e}")
        return False


# ── 测试 3：report() ──────────────────────────────────────────────────────

def test_report() -> bool:
    print_section("测试 3 / 3 — report()")

    try:
        result = report(SAMPLE_SCORE)
        print(f"  返回预览：{str(result)[:200]}")

        ok1 = check_pass(isinstance(result, dict),                  "返回值是 dict")
        ok2 = check_pass("report_text" in result,                   "包含 'report_text' 键")
        ok3 = check_pass(len(result.get("report_text", "")) > 10,   "report_text 有实际内容")
        return ok1 and ok2 and ok3
    except Exception as e:
        print(f"  ❌ 异常：{e}")
        return False


# ── 测试 4：report() 带历史对比 ──────────────────────────────────────────

def test_report_with_history() -> bool:
    print_section("测试 4 / 4 — report() 带历史对比 & 等级")

    try:
        result = report(SAMPLE_SCORE, level="beginner")
        ok1 = check_pass("report_text" in result, "初学等级报告生成成功")
        print(f"  返回预览：{result.get('report_text', '')[:200]}")

        fake_prev = dict(SAMPLE_SCORE)
        fake_prev["total_score"] = 55
        result2 = report(SAMPLE_SCORE, previous_score=fake_prev)
        ok2 = check_pass("report_text" in result2, "进步对比报告生成成功")
        print(f"  返回预览：{result2.get('report_text', '')[:200]}")
        return ok1 and ok2
    except Exception as e:
        print(f"  ❌ 异常：{e}")
        return False


# ── 入口 ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n数智心屿 AI 服务层 — 单元测试")
    print("确保 DEEPSEEK_API_KEY 已设置\n")

    results = {
        "chat":              test_chat(),
        "score":             test_score(),
        "report":            test_report(),
        "report_history":    test_report_with_history(),
    }

    print_section("汇总")
    all_pass = all(results.values())
    for name, ok in results.items():
        check_pass(ok, name)

    print("\n" + ("🎉 全部通过" if all_pass else "⚠️  存在失败项，请检查上方日志") + "\n")
    sys.exit(0 if all_pass else 1)
