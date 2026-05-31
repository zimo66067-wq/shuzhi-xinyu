# 心屿 3D 模型制作需求（Blender 端）

> **接收对象**：Blender 建模负责人
> **目标**：交付一个能直接替换 `frontend/public/models/xinyu.glb` 的卡通女童模型，**前端代码零改动**即可生效。
> **截止参考**：建议在比赛 demo 前 1 周完成，留出至少 3 天给前端联调。

---

## 1. 角色定位（风格基线）

| 项 | 要求 |
|---|---|
| 名字 | **心屿**（项目中不出现"暖暖"或其他旧名） |
| 性别/年龄表征 | 女童，视觉年龄 8-10 岁，柔卡通风格 |
| 风格 | 接近《灵笼》原画儿童设计 / 微软 Bing 卡通形象 / Apple Memoji 简化版 |
| 严格避免 | 写实皮肤纹理 / 成年特征 / 恐怖谷脸型 / 戏剧化表情 |
| 配色 | 头发暖棕（#7B6D5C 附近），衣服可选柔粉 #FFD4D4 或柔绿 #A8D8B9（项目色板） |

> 用户会另外提供 1-3 张风格参考图，请以参考图为准。

---

## 2. 模型必备 Blend Shapes（绝对不能少 — 影响功能）

### 2.1 ARKit 标准 4 件套（P0 已在用）
模型必须包含以下 4 个 morph target（命名严格一致，区分大小写）：

```
eyeBlinkLeft
eyeBlinkRight
mouthOpen
mouthSmile
```

> 前端 `XinyuModel.jsx` 通过这 4 个 morph 驱动眨眼 / 张嘴 / 微笑。任一缺失会导致对应表情失效。

### 2.2 口型同步 14 件 viseme 集（P1 任务 1 预留 — 强烈建议）

下表是 Oculus / Ready Player Me 通用的 viseme 命名，与 Rhubarb Lip Sync 输出可一对一映射：

```
viseme_PP    viseme_FF    viseme_TH    viseme_DD
viseme_kk    viseme_CH    viseme_SS    viseme_nn
viseme_RR    viseme_aa    viseme_E     viseme_I
viseme_O     viseme_U
```

> 当前 demo 跳过了 Rhubarb 口型同步（任务 1），但**未来一定要做**。如果模型里没这些 viseme，未来要重新返工。**强烈建议这次一次性带上**。

---

## 3. 几何与拓扑

| 项 | 要求 |
|---|---|
| 范围 | 半身或全身皆可（前端 `THREE.Box3` 自适应 fit） |
| 面数 | 三角面 ≤ 50,000（移动端友好） |
| 骨骼 | 含基础人形骨架（可参考 mixamo rig），头部要可独立旋转 |
| 嘴部网格 | 嘴部周围拓扑要细密（≥ 8 圈环形 loop），保证 viseme 形变自然 |
| 眼部 | 眼球独立 mesh，可上下/左右转动 |

---

## 4. 材质与贴图

| 项 | 要求 |
|---|---|
| 材质类型 | Principled BSDF（glTF 兼容） |
| 贴图分辨率 | 1024×1024（皮肤）/ 512×512（衣服配件） |
| 贴图格式 | PNG，不要用 EXR 或 HDR |
| **不要使用** | 程序化纹理、节点组复杂网络（glTF 导不出） |

---

## 5. 导出设置（关键！否则前端加载失败）

Blender 菜单：`File → Export → glTF 2.0 (.glb)`

必须勾选：

- [x] **Format: glTF Binary (.glb)**
- [x] **Include → Selected Objects**（先选中要导的模型，避免把灯光/相机也带进去）
- [x] **Transform → +Y Up**
- [x] **Geometry → Apply Modifiers**
- [x] **Geometry → UVs**
- [x] **Geometry → Normals**
- [x] **Geometry → Vertex Colors**（可选，看模型用没用）
- [x] **Animation → Shape Keys**（⚠️ 这一项不勾的话 morph targets 全部丢失！）
- [x] **Animation → Skinning**

可以不勾：
- [ ] Animation → Animations（除非有 idle 动画；前端用 JS 控制）
- [ ] Materials → Punctual Lights（前端自己打光）

---

## 6. 文件交付

| 项 | 要求 |
|---|---|
| 文件名 | `xinyu.glb`（严格一致，前端代码硬编码） |
| 文件大小 | **< 10 MB**（移动端加载时间） |
| 交付方式 | 直接覆盖 `frontend/public/models/xinyu.glb` |
| 同时提供 | 原始 .blend 工程文件（备份，后续返工用） |

---

## 7. 自验流程（交付前必做）

1. **本地预览**：用 https://gltf-viewer.donmccurdy.com/ 在线打开 .glb，确认模型正常显示、没有黑面/法线翻转
2. **morph 清单检查**：用 https://gltf.report 上传 .glb → 切到 "JSON" tab → 搜索 `targets` 字段，对照本文档第 2 节清单核验 morph 是否齐全
3. **大小确认**：右键文件 → 属性，确认 < 10 MB
4. **试播微笑**：在 https://gltf.report 里手动拨 `mouthSmile` 滑块到 1.0，看嘴角是否上扬

---

## 8. 验收标准（前端联调时验证）

替换文件后，访问对话页面应看到：

- 心屿正面朝向摄像机（不需要旋转，相机固定）
- 角色周期性自动眨眼（约 4-6 秒一次）
- 点表情按钮"我很开心"时，心屿嘴巴会张合（驱动 `mouthOpen`）
- 点"我很开心"时如果有 `mouthSmile`，可看到微笑表情

> ⚠️ 如出现：模型显示为灰色立方体 / 模型加载后页面白屏 / morph 滑动无变化，说明导出环节有问题，请回到第 5 节核对。

---

## 9. 范围外（不在本期交付）

- 多套换装 / 配饰系统 → 后续版本
- 全身骨骼绑定 / 走路动画 → 后续版本（demo 只用半身定点）
- LipSync 自动驱动 → 前端做，不需要 Blender 端预制动画
- 口型同步音素时间轴 → 后端 Rhubarb 跑出来，不需要 Blender 端预制

---

## 10. 常见坑（避雷清单）

| 现象 | 原因 | 解决 |
|---|---|---|
| 前端加载后模型不显示 | 导出时没勾 "Apply Modifiers" | 重新导出，勾上 |
| 嘴巴/眼睛动不了 | 导出时没勾 "Shape Keys" | 重新导出，勾上 |
| 文件超 50MB | 贴图分辨率过高，或带了大量未用 mesh | 压缩贴图到 1024，删掉无用对象 |
| 模型颜色全黑 | 材质用了程序化纹理 / 节点组 | 烘焙到普通 PNG 贴图 |
| 模型脸朝下 / 倒立 | 导出时 axis 设置错 | 必须 +Y Up |
| morph target 名字不对 | 在 Blender 里 Shape Key 命名时写错 | 严格按本文档第 2 节命名 |

---

## 联系人

- 项目负责人：xxx（用户）
- 前端联调：xxx（自动加载，无需对接，覆盖文件即可）

**有任何不确定的点，先发消息确认，不要靠猜。**
