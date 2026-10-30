"""上游证据日志测试；仅使用合成响应，不产生正式实验记录。"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


class CallEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.transport = types.ModuleType("requests")
        self.transport.post = Mock()
        self.audit = types.SimpleNamespace(
            dispatch=Mock(return_value=None), received=Mock(),
            current=types.SimpleNamespace(get=lambda: None),
            AuditWriteError=type("AuditWriteError", (Exception,), {}),
        )
        experiment = types.ModuleType("experiment")
        experiment.audit = self.audit
        spec = importlib.util.spec_from_file_location(
            "llm_evidence_under_test", Path(__file__).parents[1] / "llm_client.py"
        )
        self.client = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"requests": self.transport, "experiment": experiment}):
            spec.loader.exec_module(self.client)
        self.env = patch.dict(os.environ, {"DEEPSEEK_API_KEY": "sk-synthetic-secret-never-log"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.model_env = patch.dict(os.environ, {"DEEPSEEK_MODEL": "deepseek-flash"})
        self.model_env.start()
        self.addCleanup(self.model_env.stop)

    def response(self, **updates):
        data = {
            "id": "test-completion-123", "model": "deepseek-flash",
            "choices": [{"message": {"content": "合成回复正文不可进入日志"}}],
            "usage": {"prompt_tokens": 23, "completion_tokens": 7, "total_tokens": 30},
        }
        data.update(updates)
        response = Mock(status_code=200)
        response.json.return_value = data
        self.transport.post.return_value = response
        return response

    def call(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = self.client.call_llm("合成系统提示不可进入日志", [{"role": "user", "content": "合成用户正文不可进入日志"}])
        line = out.getvalue().strip()
        record = json.loads(line.removeprefix("[LLM_EVIDENCE] ")) if line else None
        return result, record, line

    def test_success_preserves_reply_and_records_upstream_metadata_only(self):
        self.response()
        result, record, line = self.call()
        self.assertEqual(result, "合成回复正文不可进入日志")
        self.assertEqual(self.client.get_last_source(), "deepseek")
        self.assertEqual(record["response_model"], "deepseek-flash")
        self.assertEqual(record["usage"]["total_tokens"], 30)
        self.assertEqual(record["http_status"], 200)
        self.assertEqual(record["completion_id"], "test-completion-123")
        self.assertEqual(record["thinking_type"], "disabled")
        for forbidden in ("sk-synthetic-secret-never-log", "合成用户", "合成系统", "合成回复", "Authorization"):
            self.assertNotIn(forbidden, line)
        self.assertEqual(len(record["key_fingerprint"]), 16)
        self.audit.received.assert_called_once()

    def test_environment_model_and_actual_response_are_distinct(self):
        self.response(model="deepseek-v4-pro-0813")
        with patch.dict(os.environ, {"DEEPSEEK_MODEL": "deepseek-v4-pro"}):
            _, record, _ = self.call()
        self.assertEqual(record["requested_model"], "deepseek-v4-pro")
        self.assertEqual(record["response_model"], "deepseek-v4-pro-0813")
        self.assertEqual(self.transport.post.call_args.kwargs["json"]["model"], "deepseek-v4-pro")

    def test_missing_metadata_remains_unknown(self):
        self.response(id=None, model=None, usage=None)
        _, record, _ = self.call()
        self.assertIsNone(record["response_model"])
        self.assertIsNone(record["completion_id"])
        self.assertEqual(record["usage"], {})

    def test_untrusted_or_non_numeric_metadata_is_excluded(self):
        self.response(model="unexpected\nprivate text", id="contains spaces", usage={"prompt_tokens": True, "completion_tokens": -1, "total_tokens": "30", "extra": "private"})
        _, record, line = self.call()
        self.assertIsNone(record["response_model"])
        self.assertIsNone(record["completion_id"])
        self.assertEqual(record["usage"], {})
        self.assertNotIn("private", line)

    def test_provider_http_failure_keeps_fallback_and_omits_error_body(self):
        response = self.response()
        response.status_code = 401
        response.raise_for_status.side_effect = RuntimeError("sk-synthetic-secret-never-log private input")
        result, record, line = self.call()
        self.assertEqual(result, self.client.FALLBACK_REPLY)
        self.assertEqual(self.client.get_last_source(), "fallback")
        self.assertEqual(record["event"], "provider_failure")
        self.assertEqual(record["http_status"], 401)
        self.assertEqual(record["error_type"], "RuntimeError")
        self.assertNotIn("private", line)
        self.assertNotIn("sk-synthetic", line)

    def test_diagnostic_sink_failure_does_not_discard_paid_reply(self):
        self.response()
        with patch("builtins.print", side_effect=OSError("closed pipe")):
            result = self.client.call_llm("合成提示", [{"role": "user", "content": "合成输入"}])
        self.assertEqual(result, "合成回复正文不可进入日志")
        self.assertEqual(self.client.get_last_source(), "deepseek")

    def test_audit_storage_failure_remains_fail_closed(self):
        self.response()
        self.audit.received.side_effect = self.audit.AuditWriteError("storage unavailable")
        with self.assertRaises(self.audit.AuditWriteError):
            self.client.call_llm("合成提示", [{"role": "user", "content": "合成输入"}])


if __name__ == "__main__":
    unittest.main()
