"""
tts_service.py — 腾讯云 TTS 语音合成服务

文档：https://cloud.tencent.com/document/api/1073/37995
新用户首次赠送 100 万字符免费额度，足够 demo 使用。

声音 VoiceType 推荐：
  101001  智瑜  情感女声（温柔，推荐心屿场景）
  101011  智育  通用女声（儿童友好）
  101016  智甜  甜美女声
  1001    智瑜  基础版（兜底）
"""

import base64
import os
import uuid

from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.tts.v20190823 import tts_client, models

DEFAULT_VOICE = 101005  # 智莉 · 温柔女声（幼儿园老师/邻家姐姐感）

# 可选女声：用户在 demo 期间可在前端 /api/tts 请求里传 voice 参数切换
ALLOWED_VOICES = {
    101001,  # 智瑜 · 情感女声（成熟御姐风）
    101005,  # 智莉 · 温柔女声（姐姐/老师感）
    101008,  # 智琪 · 清新客服女声
    101011,  # 智育 · 儿童女声（模仿小女孩）
    101016,  # 智甜 · 甜美少女音（推荐 ASD 儿童陪伴）
    1001, 1002, 1003,  # 基础版兜底
}


def is_configured() -> bool:
    return bool(
        os.environ.get("TENCENT_SECRET_ID")
        and os.environ.get("TENCENT_SECRET_KEY")
    )


def _get_client():
    cred = credential.Credential(
        os.environ["TENCENT_SECRET_ID"],
        os.environ["TENCENT_SECRET_KEY"],
    )
    http_profile = HttpProfile()
    http_profile.endpoint = "tts.tencentcloudapi.com"
    http_profile.reqTimeout = 20

    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile

    return tts_client.TtsClient(cred, "ap-guangzhou", client_profile)


def synthesize(text: str, voice: int = DEFAULT_VOICE,
               rate_percent: int = -10, pitch_hz: int = 0) -> bytes:
    """返回 MP3 二进制。"""
    if not text or not text.strip():
        raise ValueError("text 为空")

    if not is_configured():
        raise RuntimeError("TTS 未配置：缺少 TENCENT_SECRET_ID/SECRET_KEY")

    if voice not in ALLOWED_VOICES:
        voice = DEFAULT_VOICE

    # 腾讯云 Speed 范围 [-2, 6]，0=正常。
    # 我们的 rate_percent: -10 → -0.5（略慢，ASD 友好），范围限到 [-2, 6]
    speed = max(-2, min(6, rate_percent / 20))

    client = _get_client()
    req = models.TextToVoiceRequest()
    req.Text = text
    req.SessionId = str(uuid.uuid4())
    req.VoiceType = voice
    req.Codec = "mp3"
    req.PrimaryLanguage = 1  # 中文
    req.SampleRate = 16000
    req.Speed = speed
    req.Volume = 0  # 0=默认音量

    try:
        resp = client.TextToVoice(req)
    except TencentCloudSDKException as e:
        raise RuntimeError(f"腾讯云 TTS 调用失败: {e}") from e

    if not resp.Audio:
        raise RuntimeError("腾讯云返回空音频")

    return base64.b64decode(resp.Audio)
