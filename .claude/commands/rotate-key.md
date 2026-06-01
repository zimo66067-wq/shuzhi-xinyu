---
description: 引导用户更换 DeepSeek 或腾讯云 API key 的 step-by-step 流程
---

帮用户安全地轮换一个 API key。**不要**直接帮用户改 .env（密钥应该由用户亲手粘贴）。

## 第 1 步：问用户要换哪个

让用户从这两个中选：
- DeepSeek（对话/评分/报告）
- 腾讯云（TTS + STT 共用同一对 SecretId/SecretKey）

## 第 2 步：发给用户对应的网址

### 如果是 DeepSeek
告诉用户：
1. 打开 https://platform.deepseek.com → API keys
2. 把旧 key **删除**（点垃圾桶图标）
3. 点 "Create new API key" → 起名 `xinyu-prod-$(Get-Date -Format yyyyMMdd)` → 创建
4. **立刻复制**生成的完整 key（关掉弹窗就再也看不到了）
5. 回来告诉我"复制好了"

### 如果是腾讯云
告诉用户：
1. 打开 https://console.cloud.tencent.com/cam/capi
2. 点"新建密钥"生成新的 SecretId + SecretKey
3. **点显示按钮**把 SecretKey 完整复制（默认隐藏）
4. SecretId 和 SecretKey 都要记下来
5. 旧密钥**先不要删**，等新 key 验证可用后再禁用 + 删除

## 第 3 步：让用户自己改 .env

**不要替用户写 key**。让用户：
1. VS Code 打开 `backend/.env`
2. 找到对应行，把 `=` 后面的旧值替换为新值
3. Ctrl+S 保存

## 第 4 步：重启后端验证

执行 `/stop-dev` 然后 `/start-dev`。

## 第 5 步：跑 `/health` 验证新 key 可用

如果 DeepSeek 那一项 OK，让用户回腾讯云控制台把旧密钥禁用 + 删除。

## 安全提醒

- 如果用户把新 key 直接粘到聊天里（不该这样做），立刻告诉他"这个 key 已经暴露在对话里了，请你再换一次"
- 旧 key 已经在公开对话里出现过的，**必须删**，不能只禁用
