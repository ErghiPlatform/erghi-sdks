/** Injected into Shadow DOM — isolated from host page CSS */
export function buildStyles(primaryColor: string, position: 'bottom-left' | 'bottom-right'): string {
  // Bubble/panel anchoring is a physical placement choice (viewport corner), independent
  // of text direction. Everything inside the panel uses logical properties so the
  // layout mirrors automatically when the root carries dir="rtl".
  const anchor = position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;';
  return `
    :host, * { box-sizing: border-box; }
    .root {
      position: fixed;
      ${anchor}
      bottom: 20px;
      z-index: 2147483646;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1d29;
      -webkit-font-smoothing: antialiased;
    }
    .root[dir="rtl"] {
      font-family: Inter, -apple-system, 'Segoe UI', Tahoma, Roboto, sans-serif;
    }
    .panel {
      display: none;
      flex-direction: column;
      width: 380px;
      height: min(560px, calc(100vh - 100px));
      max-height: calc(100vh - 100px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
      overflow: hidden;
      margin-bottom: 12px;
      animation: cf-slide-up .25s ease-out;
    }
    .panel.open { display: flex; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: ${primaryColor};
      color: #fff;
      flex-shrink: 0;
    }
    .header-title { font-weight: 600; font-size: 15px; margin: 0; }
    .header-sub { font-size: 12px; opacity: .9; margin: 2px 0 0; }
    .icon-btn {
      background: rgba(255,255,255,.15);
      border: none;
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    }
    .icon-btn:hover { background: rgba(255,255,255,.25); }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8f9fb;
      scroll-behavior: smooth;
    }
    .msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .msg.visitor {
      align-self: flex-end;
      background: ${primaryColor};
      color: #fff;
      border-end-end-radius: 4px;
    }
    .msg.bot, .msg.agent {
      align-self: flex-start;
      background: #fff;
      color: #1a1d29;
      border: 1px solid #e8eaef;
      border-end-start-radius: 4px;
    }
    .msg.system {
      align-self: center;
      background: transparent;
      color: #6b7280;
      font-size: 12px;
      padding: 4px 8px;
      max-width: 100%;
      text-align: center;
    }
    .msg-label {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.7;
      margin-bottom: 4px;
    }
    .msg-text { white-space: pre-wrap; }
    .typing {
      align-self: flex-start;
      display: none;
      gap: 4px;
      padding: 12px 16px;
      background: #fff;
      border: 1px solid #e8eaef;
      border-radius: 14px;
      border-end-start-radius: 4px;
    }
    .typing.visible { display: flex; }
    .typing span {
      width: 7px; height: 7px;
      background: #9ca3af;
      border-radius: 50%;
      animation: cf-bounce 1.2s infinite ease-in-out;
    }
    .typing span:nth-child(2) { animation-delay: .15s; }
    .typing span:nth-child(3) { animation-delay: .3s; }
    .composer {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid #e8eaef;
      background: #fff;
      flex-shrink: 0;
      align-items: center;
    }
    .attach-btn {
      background: none; border: none; cursor: pointer; font-size: 1.1rem;
      padding: 4px 6px; border-radius: 6px; opacity: 0.75; flex-shrink: 0;
    }
    .attach-btn:hover { opacity: 1; background: #f3f4f6; }
    .composer input[type="text"] {
      flex: 1;
      border: 1px solid #e8eaef;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
    }
    .composer input:focus {
      border-color: ${primaryColor};
      box-shadow: 0 0 0 3px ${primaryColor}22;
    }
    .send-btn {
      width: 40px; height: 40px;
      border: none;
      border-radius: 50%;
      background: ${primaryColor};
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .send-btn:disabled { opacity: .45; cursor: not-allowed; }
    .root[dir="rtl"] .send-btn svg { transform: scaleX(-1); }
    .bubble {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: ${primaryColor};
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    .bubble:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    .bubble svg { width: 26px; height: 26px; fill: currentColor; }
    .bubble.hidden { display: none; }
    .bubble.has-unread {
      animation: cf-pulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 0 3px rgba(255,255,255,.9), 0 0 0 6px ${primaryColor};
    }
    @keyframes cf-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    @keyframes cf-slide-up {
      from { opacity: 0; transform: translateY(12px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes cf-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-5px); }
    }
    @media (max-width: 480px) {
      .root {
        ${position === 'bottom-right' ? 'right: 0;' : 'left: 0;'}
        bottom: 0;
        left: 0;
        right: 0;
      }
      .panel.open {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-height: 100%;
        margin: 0;
        border-radius: 0;
      }
      .bubble { margin: 16px; ${position === 'bottom-right' ? 'margin-left: auto;' : 'margin-right: auto;'} }
      .bubble.hidden { display: none; }
    }
  `;
}

export const ICON_CHAT = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
export const ICON_SEND = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
