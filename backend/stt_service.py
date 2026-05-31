"""
stt_service.py — 腾讯云 ASR 一句话识别
浏览器录 webm/opus → 后端 pydub 转 16kHz wav → 腾讯云"一句话识别" → 中文文本
"""

import base64
import os
import uuid
from io import BytesIO

import imageio_ffmpeg
from pydub import AudioSegment

from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.asr.v20190614 import asr_client, models

# pydub 用 imageio-ffmpeg 自带的 ffmpeg 二进制（避免依赖系统 PATH）
AudioSegment.converter = imageio_ffmpeg.get_ffmpeg_exe()


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
    http_profile.endpoint = "asr.tencentcloudapi.com"
    http_profile.reqTimeout = 25
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    return asr_client.AsrClient(cred, "ap-shanghai", client_profile)


def _webm_to_wav(webm_bytes: bytes) -> bytes:
    """把浏览器 MediaRecorder 录出来的 webm/opus 转成 16kHz 单声道 16bit wav。"""
    audio = AudioSegment.from_file(BytesIO(webm_bytes))
    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    out = BytesIO()
    audio.export(out, format="wav")
    return out.getvalue()


def recognize(audio_bytes: bytes) -> str:
    """
    一句话识别（≤60s 短音频）。
    输入：浏览器录的 webm/opus 二进制
    输出：识别出的中文文本（可能为空，表示没说话或没听清）
    """
    if not audio_bytes:
        raise ValueError("audio_bytes 为空")
    if not is_configured():
        raise RuntimeError("STT 未配置：缺少 TENCENT_SECRET_ID/SECRET_KEY")

    # 转格式
    try:
        wav_bytes = _webm_to_wav(audio_bytes)
    except Exception as e:
        raise RuntimeError(f"音频转码失败（webm→wav）: {e}") from e

    # 调腾讯云 ASR
    client = _get_client()
    req = models.SentenceRecognitionRequest()
    req.ProjectId = 0
    req.SubServiceType = 2          # 一句话识别
    req.EngSerViceType = "16k_zh"   # 16kHz 普通话
    req.SourceType = 1               # 1 = 音频数据
    req.VoiceFormat = "wav"
    req.UsrAudioKey = str(uuid.uuid4())
    req.Data = base64.b64encode(wav_bytes).decode("utf-8")
    req.DataLen = len(wav_bytes)

    try:
        resp = client.SentenceRecognition(req)
    except TencentCloudSDKException as e:
        raise RuntimeError(f"腾讯云 ASR 调用失败: {e}") from e

    return (resp.Result or "").strip()
