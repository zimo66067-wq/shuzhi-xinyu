---
description: 检查后端是否在跑 + DeepSeek/腾讯云是否能正常调用
---

快速诊断后端健康状态。

## 步骤

1. **基础健康检查**（确认 Flask 在监听）：
   ```powershell
   try {
     $r = (Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 3).Content
     Write-Output "Flask: OK"
     Write-Output $r
   } catch {
     Write-Output "Flask: DOWN — 后端没在跑，执行 /start-dev"
     return
   }
   ```

2. **DeepSeek 联通性**（发一条真实对话）：
   ```powershell
   $tmp = New-TemporaryFile
   $body = '{"messages":[{"role":"system","content":"这个孩子叫测试，8岁。"},{"role":"user","content":"你好"}]}'
   [System.IO.File]::WriteAllText($tmp.FullName, $body, [System.Text.UTF8Encoding]::new($false))
   $r = curl.exe -s -X POST "http://localhost:5000/api/chat" -H "Content-Type: application/json" --data-binary "@$($tmp.FullName)"
   Remove-Item $tmp -Force
   $r
   ```
   - 返回里有 `reply` + `stage` + `age_band` 三个字段 → DeepSeek OK ✓
   - 返回里 `reply` 是"心屿暂时说不出话" → DeepSeek key 失效或额度用完

3. **腾讯云 TTS 联通性**（生成一小段音频）：
   ```powershell
   $tmp = New-TemporaryFile
   $body = '{"text":"你好"}'
   [System.IO.File]::WriteAllText($tmp.FullName, $body, [System.Text.UTF8Encoding]::new($false))
   $r = curl.exe -s -o "$env:TEMP\_test_tts.mp3" -w "%{http_code}" -X POST "http://localhost:5000/api/tts" -H "Content-Type: application/json" --data-binary "@$($tmp.FullName)"
   Remove-Item $tmp -Force
   if ($r -eq "200") { "TTS: OK (mp3 size: $((Get-Item $env:TEMP\_test_tts.mp3).Length) bytes)" } else { "TTS: FAIL HTTP $r" }
   ```

汇报给用户每一项 OK / FAIL。
