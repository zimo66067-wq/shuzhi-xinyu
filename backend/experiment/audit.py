"""Request-local hooks. A normal chat has no observer and keeps its contract."""
from contextvars import ContextVar
from contextlib import contextmanager
import hashlib
import json
import os
import re
import time
import uuid

current = ContextVar("experiment_audit", default=None)


class AuditWriteError(RuntimeError):
    """Must propagate: an experiment may not silently lose its evidence."""


def uid():
    return str(uuid.uuid4())


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def redact(value):
    if isinstance(value, dict):
        return {k: "[REDACTED]" if re.search(
            r"authorization|password|secret|api.?key|access.?token|bearer|turnstile.?token|nonce", k, re.I
        ) else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        for name, secret in os.environ.items():
            if re.search(r"KEY|SECRET|PASSWORD|TOKEN", name) and len(secret) >= 8:
                value = value.replace(secret, "[REDACTED]")
        value = re.sub(r"\bsk-[A-Za-z0-9_-]{8,}", "[REDACTED]", value)
        value = re.sub(r"(?i)Bearer\s+[A-Za-z0-9_.~+/-]+", "Bearer [REDACTED]", value)
        value = re.sub(r'''(?i)(["']?(?:api[_-]?key|password|authorization|access_token|secret_key)["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;}]+)''',
                       lambda m: m.group(1)+'"[REDACTED]"', value)
    return value


class Trace:
    def __init__(self, emit, mode="LIVE"):
        self.emit = emit
        self.mode = mode
        self.source = "unknown"
        self.reason = None
        self.attempts = []
        self.raw_content = None

    def event(self, kind, data):
        try:
            return self.emit(kind, redact(data))
        except AuditWriteError:
            raise
        except Exception as exc:
            raise AuditWriteError("audit persistence failed") from exc


@contextmanager
def tracing(trace):
    token = current.set(trace)
    try:
        yield trace
    finally:
        current.reset(token)


def local(source, reason):
    trace = current.get()
    if trace:
        trace.source, trace.reason = source, reason
        trace.event("local_decision", {"source": source, "reason": reason})


def dispatch(payload, endpoint):
    trace = current.get()
    if not trace:
        return None
    attempt = {"attempt_id": uid(), "attempt_index": len(trace.attempts) + 1,
               "provider": "deepseek", "model_requested": payload["model"],
               "mode": trace.mode, "model_called": True, "endpoint": endpoint,
               "started_at": time.time(), "status": "started"}
    attempt["request_evidence"] = trace.event("provider_send", {**attempt, "payload": payload})
    trace.attempts.append(attempt)
    return attempt


def received(attempt, response=None, error=None, content=None):
    trace = current.get()
    if not trace or not attempt:
        return
    body = None
    if response is not None:
        try:
            body = response.json()
        except (ValueError, TypeError):
            body = None
    result = {"attempt_id": attempt["attempt_id"], "ended_at": time.time(),
              "http_status": response.status_code if response is not None else None,
              "error_type": type(error).__name__ if error else None,
              "error_message": str(error) if error else None,
              "raw_body": response.text if response is not None else None,
              "model_returned": body.get("model") if isinstance(body, dict) else None,
              "provider_response_id": body.get("id") if isinstance(body, dict) else None,
              "provider_request_id": response.headers.get("x-request-id") if response is not None else None,
              "usage": body.get("usage") if isinstance(body, dict) else None,
              "finish_reason": (body.get("choices") or [{}])[0].get("finish_reason")
              if isinstance(body, dict) and isinstance(body.get("choices"), list) else None}
    result["elapsed_ms"] = round((time.monotonic() - attempt.pop("_clock")) * 1000, 3)
    result["status"] = "error" if error else "success"
    result["response_evidence"] = trace.event("provider_result", result)
    attempt.update({k: v for k, v in result.items() if k != "raw_body"})
    trace.source = "api_error" if error else ("deepseek_api" if trace.mode == "LIVE" else "mock")
    trace.raw_content = content
    trace.reason = result["error_type"]
