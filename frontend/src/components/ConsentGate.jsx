import { useState } from 'react'

/**
 * ConsentGate — 监护人知情同意页（整改 A-2 / A-3）
 *
 * 首次使用前、采集孩子姓名/年龄之前出现。
 * - 列明采集项 / 用途 / 第三方流向 / 留存与删除
 * - 一句白话点明"孩子说的话会发送给第三方 AI 服务"
 * - 两个必须勾选项：监护人身份 + 全程陪同（硬前提）
 * - 两项都勾选才能继续，调用 onAgree()
 *
 * 注意：本组件只做"知情同意 UI"，不替代法务审查（见 docs/human-action-items.md）。
 */
function ConsentGate({ onAgree }) {
  const [isGuardian, setIsGuardian] = useState(false)
  const [willAccompany, setWillAccompany] = useState(false)

  const canContinue = isGuardian && willAccompany

  return (
    <div
      className="page-container consent-page"
      style={{ overflowY: 'auto', height: '100vh', paddingBottom: '24px' }}
    >
      <div className="consent-card">
        <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>给家长的知情同意</h2>
        <p className="subtitle" style={{ fontSize: '14px', marginBottom: '16px' }}>
          请家长（监护人）阅读后再让孩子开始
        </p>

        <div className="consent-section">
          <div className="consent-h">我们会用到这些信息</div>
          <ul className="consent-ul">
            <li>孩子的名字、年龄</li>
            <li>孩子与心屿的对话内容</li>
            <li>说话时的声学摘要（音量、停顿等，不保存原始录音）</li>
          </ul>
        </div>

        <div className="consent-section">
          <div className="consent-h">用来做什么</div>
          <ul className="consent-ul">
            <li>让心屿用名字称呼孩子、按年龄调整说话方式</li>
            <li>在家长后台生成"本次练习回顾"，仅供家长了解今天的参与情况</li>
          </ul>
        </div>

        <div className="consent-section">
          <div className="consent-h">信息会发送到哪里</div>
          <ul className="consent-ul">
            <li>对话内容 → 第三方 AI 服务（DeepSeek），用来生成心屿的回复</li>
            <li>语音 → 腾讯云，用来把说的话识别成文字</li>
            <li>第三方处理完即返回结果，本产品默认不另行保存</li>
          </ul>
        </div>

        <div className="consent-highlight">
          孩子说的话会发送给第三方 AI 服务，用来生成心屿的回复。
        </div>

        <div className="consent-section">
          <div className="consent-h">保存与删除</div>
          <ul className="consent-ul">
            <li>以上信息只存在这台设备的浏览器里</li>
            <li>可在对话页"清空所有记录"随时删除</li>
          </ul>
        </div>

        <div className="consent-note">
          本产品是「社交练习陪伴工具」，不是医疗器械、不是诊断工具，也不是危机干预工具。
          紧急情况请联系专业机构或当地求助热线。
        </div>

        <label className="consent-check">
          <input
            type="checkbox"
            checked={isGuardian}
            onChange={(e) => setIsGuardian(e.target.checked)}
          />
          <span>我是孩子的监护人，且同意以上数据处理方式</span>
        </label>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={willAccompany}
            onChange={(e) => setWillAccompany(e.target.checked)}
          />
          <span>我会全程陪同孩子使用</span>
        </label>

        <button
          className="btn-primary"
          onClick={() => canContinue && onAgree()}
          disabled={!canContinue}
          style={{ opacity: canContinue ? 1 : 0.4, marginTop: '12px' }}
          aria-label="同意并继续"
        >
          同意并继续
        </button>
      </div>
    </div>
  )
}

export default ConsentGate
