/**
 * KWBA AI Receptionist Widget v2 — Real LLM Conversation
 * ──────────────────────────────────────────────────────
 * Multi-tenant. Each client has their own slug + knowledge base
 * configured in KWBA admin. Widget loads config from server, then
 * conducts a real Gemini-powered conversation that captures leads
 * naturally instead of via decision tree.
 *
 * Embed:
 *   <script
 *     src="https://kwba-agency.onrender.com/chatbot-widget.js"
 *     data-slug="smith-electrical-mk-x4f2a"
 *   ></script>
 *
 * Optional overrides:
 *   data-color, data-position (br|bl|tr|tl), data-greeting-delay (ms)
 */

(function () {
  'use strict';

  const script = document.currentScript ||
    document.querySelector('script[data-slug]') ||
    document.querySelector('script[src*="chatbot-widget"]');

  const slug = script?.getAttribute('data-slug');
  if (!slug) {
    console.warn('[KWBA Chatbot] Missing data-slug attribute. Widget not loaded.');
    return;
  }

  const scriptSrc = script.src || '';
  const API_BASE = scriptSrc
    .replace(/\/chatbot-widget\.js.*$/, '')
    .replace(/\/$/, '') ||
    'https://kwba-agency.onrender.com';

  const overrides = {
    color: script.getAttribute('data-color'),
    position: (script.getAttribute('data-position') || 'br').toLowerCase(),
    greetingDelay: parseInt(script.getAttribute('data-greeting-delay') || '0', 10),
  };

  let cfg = null;
  let messages = [];
  let isOpen = false;
  let isThinking = false;
  let leadAlreadyCaptured = false;
  const SESSION_KEY = 'kw_chat_session_' + slug;
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  function hex2rgb(h) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || '');
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '201,168,76';
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function md(t) {
    return escHtml(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
  function extractLead() {
    const userMsgs = messages.filter(m => m.role === 'user');
    const fullText = userMsgs.map(m => m.text).join(' ');
    const phoneMatch = fullText.match(/(?:\+?44\s?|0)(?:\d\s?){9,11}/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, ' ').trim() : '';
    const emailMatch = fullText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const email = emailMatch ? emailMatch[0] : '';
    let name = '';
    for (const m of userMsgs) {
      const nm = m.text.match(/(?:my name is|i'?m|i am|this is|call me|it'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (nm) { name = nm[1].trim(); break; }
    }
    const summary = userMsgs.map(m => m.text).join(' | ').slice(0, 500);
    return { name, phone, email, message: summary, sessionId };
  }

  function injectStyles() {
    const c = overrides.color || cfg.color || '#c9a84c';
    const rgb = hex2rgb(c);
    const pos = overrides.position;
    const posBtn = pos === 'bl' ? 'bottom:24px;left:24px' :
                   pos === 'tr' ? 'top:24px;right:24px' :
                   pos === 'tl' ? 'top:24px;left:24px' :
                                  'bottom:24px;right:24px';
    const posWin = pos === 'bl' ? 'bottom:96px;left:24px' :
                   pos === 'tr' ? 'top:96px;right:24px' :
                   pos === 'tl' ? 'top:96px;left:24px' :
                                  'bottom:96px;right:24px';

    const css = `
      .kw-host{--kw:rgba(${rgb},1);--kw-d:rgba(${rgb},0.13);--kw-b:rgba(${rgb},0.4);--kw-text:#ede9e0;--kw-bg:#0d0c0a;--kw-bg2:#15130f;--kw-line:rgba(255,255,255,.08)}
      #kw-btn{position:fixed;${posBtn};width:62px;height:62px;border-radius:50%;background:var(--kw);border:none;cursor:pointer;box-shadow:0 6px 28px rgba(${rgb},.45),0 1px 3px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;z-index:2147483646;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s}
      #kw-btn:hover{transform:scale(1.08);box-shadow:0 8px 38px rgba(${rgb},.6),0 2px 6px rgba(0,0,0,.25)}
      #kw-btn:active{transform:scale(.96)}
      #kw-btn svg{width:28px;height:28px;fill:none;stroke:#0a0906;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s}
      #kw-btn.open svg{transform:rotate(180deg)}
      #kw-pulse{position:absolute;inset:0;border-radius:50%;background:var(--kw);opacity:0;animation:kwPulse 2.5s ease-out infinite}
      #kw-btn.open #kw-pulse{display:none}
      @keyframes kwPulse{0%{transform:scale(1);opacity:.4}100%{transform:scale(1.6);opacity:0}}
      #kw-notif{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;background:#ef4444;border-radius:10px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-family:-apple-system,system-ui,sans-serif;font-weight:700;line-height:1;animation:kwBounce .6s ease-out}
      @keyframes kwBounce{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
      #kw-prompt{position:fixed;${pos === 'bl' ? 'bottom:96px;left:90px' : 'bottom:96px;right:90px'};max-width:240px;background:#fff;color:#1a1814;padding:11px 14px;border-radius:12px;font-size:13px;line-height:1.45;box-shadow:0 10px 40px rgba(0,0,0,.15),0 2px 6px rgba(0,0,0,.06);z-index:2147483645;font-family:-apple-system,system-ui,sans-serif;animation:kwSlideIn .4s cubic-bezier(.34,1.56,.64,1);cursor:pointer;display:none}
      #kw-prompt.show{display:block}
      #kw-prompt::after{content:'';position:absolute;${pos === 'bl' ? 'left:-6px' : 'right:-6px'};bottom:18px;width:12px;height:12px;background:#fff;transform:rotate(45deg)}
      #kw-prompt-x{position:absolute;top:4px;right:6px;background:none;border:none;cursor:pointer;color:#999;font-size:14px;padding:2px;line-height:1}
      #kw-prompt-x:hover{color:#000}
      @keyframes kwSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      #kw-win{position:fixed;${posWin};width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 120px);background:var(--kw-bg);border:1px solid var(--kw-line);border-radius:16px;display:none;flex-direction:column;z-index:2147483647;box-shadow:0 30px 90px rgba(0,0,0,.65),0 8px 24px rgba(0,0,0,.35);overflow:hidden;font-family:-apple-system,'SF Pro Text',system-ui,sans-serif;animation:kwOpen .35s cubic-bezier(.34,1.56,.64,1);transform-origin:${pos === 'bl' || pos === 'tl' ? 'bottom left' : 'bottom right'}}
      #kw-win.open{display:flex}
      @keyframes kwOpen{from{opacity:0;transform:scale(.92) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
      #kw-head{background:linear-gradient(135deg,var(--kw) 0%,rgba(${rgb},.85) 100%);padding:18px 18px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative}
      #kw-av{width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;position:relative}
      #kw-av::after{content:'';position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;background:#10b981;border-radius:50%;border:2px solid var(--kw)}
      #kw-hd{flex:1;min-width:0;color:#0a0906}
      #kw-hd-name{font-size:14.5px;font-weight:600;line-height:1.15}
      #kw-hd-status{font-size:11px;opacity:.72;margin-top:1px;display:flex;align-items:center;gap:4px}
      #kw-hd-status::before{content:'';width:6px;height:6px;background:#10b981;border-radius:50%;display:inline-block;animation:kwBlink 1.6s ease-in-out infinite}
      @keyframes kwBlink{50%{opacity:.4}}
      #kw-close{background:rgba(0,0,0,.08);border:none;cursor:pointer;color:rgba(10,9,6,.7);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:.18s;flex-shrink:0;font-size:14px;line-height:1}
      #kw-close:hover{background:rgba(0,0,0,.18);color:#0a0906}
      #kw-msgs{flex:1;overflow-y:auto;padding:18px 16px 8px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;background:var(--kw-bg)}
      #kw-msgs::-webkit-scrollbar{width:5px}
      #kw-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px}
      .kw-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;word-wrap:break-word;animation:kwMsgIn .3s ease-out}
      @keyframes kwMsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      .kw-msg.bot{background:var(--kw-bg2);color:var(--kw-text);border-radius:4px 14px 14px 14px;align-self:flex-start;border:1px solid var(--kw-line)}
      .kw-msg.user{background:var(--kw);color:#0a0906;border-radius:14px 4px 14px 14px;align-self:flex-end;font-weight:500}
      .kw-msg strong{font-weight:600}
      .kw-msg em{font-style:italic;opacity:.9}
      .kw-msg code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:'SF Mono',monospace;font-size:12px}
      .kw-typing{align-self:flex-start;background:var(--kw-bg2);padding:12px 16px;border-radius:4px 14px 14px 14px;border:1px solid var(--kw-line);display:flex;gap:5px;align-items:center;animation:kwMsgIn .3s ease-out}
      .kw-typing span{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.35);animation:kwDot 1.3s ease-in-out infinite}
      .kw-typing span:nth-child(2){animation-delay:.18s}
      .kw-typing span:nth-child(3){animation-delay:.36s}
      @keyframes kwDot{0%,80%,100%{transform:scale(.55);opacity:.45}40%{transform:scale(1);opacity:1}}
      #kw-quickreplies{padding:6px 16px 0;display:flex;flex-wrap:wrap;gap:6px;flex-shrink:0}
      .kw-qr{background:transparent;border:1px solid var(--kw-b);color:var(--kw);padding:6px 12px;border-radius:14px;font-size:12px;cursor:pointer;transition:.15s;font-family:inherit;line-height:1.4}
      .kw-qr:hover{background:var(--kw-d)}
      #kw-input-wrap{padding:12px 14px;display:flex;gap:8px;align-items:flex-end;flex-shrink:0;border-top:1px solid var(--kw-line);background:var(--kw-bg)}
      #kw-input{flex:1;background:var(--kw-bg2);border:1px solid var(--kw-line);color:var(--kw-text);padding:10px 14px;border-radius:18px;font-size:13.5px;outline:none;font-family:inherit;transition:.2s;resize:none;line-height:1.4;max-height:100px;min-height:20px}
      #kw-input:focus{border-color:var(--kw-b)}
      #kw-input::placeholder{color:rgba(255,255,255,.32)}
      #kw-send{background:var(--kw);border:none;width:38px;height:38px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.18s}
      #kw-send:hover:not(:disabled){transform:scale(1.06)}
      #kw-send:active:not(:disabled){transform:scale(.94)}
      #kw-send:disabled{opacity:.4;cursor:not-allowed}
      #kw-send svg{width:16px;height:16px;fill:none;stroke:#0a0906;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
      #kw-foot{padding:7px 14px 9px;text-align:center;font-size:10px;color:rgba(255,255,255,.22);letter-spacing:.04em;flex-shrink:0;background:var(--kw-bg)}
      #kw-foot a{color:rgba(${rgb},.5);text-decoration:none}
      #kw-foot a:hover{color:rgba(${rgb},.85)}
      .kw-error{align-self:center;background:rgba(217,83,79,.08);border:1px solid rgba(217,83,79,.3);color:#f87171;padding:9px 13px;border-radius:8px;font-size:12px;max-width:90%;text-align:center;line-height:1.5}
      @media(max-width:480px){
        #kw-win{width:calc(100vw - 16px) !important;right:8px !important;left:8px !important;bottom:84px !important;top:auto !important;height:calc(100vh - 100px);border-radius:12px}
        #kw-prompt{display:none !important}
        #kw-btn{width:56px;height:56px}
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'kw-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function buildDOM() {
    const host = document.createElement('div');
    host.className = 'kw-host';
    host.innerHTML = `
      <button id="kw-btn" aria-label="Open chat with ${escHtml(cfg.business_name)}">
        <span id="kw-pulse"></span>
        <span id="kw-notif" style="display:none">1</span>
        <svg viewBox="0 0 24 24" id="kw-icon">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </button>
      <div id="kw-prompt" role="button" tabindex="0">
        <button id="kw-prompt-x" aria-label="Dismiss">✕</button>
        <span id="kw-prompt-text">Hi! Need help with anything?</span>
      </div>
      <div id="kw-win" role="dialog" aria-label="Chat with ${escHtml(cfg.business_name)}">
        <div id="kw-head">
          <div id="kw-av">${escHtml(cfg.avatar || '💬')}</div>
          <div id="kw-hd">
            <div id="kw-hd-name">${escHtml(cfg.business_name)}</div>
            <div id="kw-hd-status">Online — replies instantly</div>
          </div>
          <button id="kw-close" aria-label="Close chat">✕</button>
        </div>
        <div id="kw-msgs" aria-live="polite"></div>
        <div id="kw-quickreplies"></div>
        <div id="kw-input-wrap">
          <textarea id="kw-input" placeholder="Type your message…" rows="1" maxlength="1000" aria-label="Type your message"></textarea>
          <button id="kw-send" aria-label="Send" disabled>
            <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
        <div id="kw-foot">AI receptionist · powered by <a href="https://kwba-agency.com" target="_blank" rel="noopener">KWBA</a></div>
      </div>
    `;
    document.body.appendChild(host);
  }

  function renderMessages() {
    const container = document.getElementById('kw-msgs');
    container.innerHTML = '';
    messages.forEach(m => {
      const d = document.createElement('div');
      d.className = 'kw-msg ' + (m.role === 'user' ? 'user' : 'bot');
      d.innerHTML = md(m.text);
      container.appendChild(d);
    });
    if (isThinking) {
      const t = document.createElement('div');
      t.className = 'kw-typing';
      t.id = 'kw-typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(t);
    }
    scrollToBottom();
  }
  function scrollToBottom() {
    const c = document.getElementById('kw-msgs');
    setTimeout(() => { c.scrollTop = c.scrollHeight; }, 30);
  }

  function renderQuickReplies() {
    const container = document.getElementById('kw-quickreplies');
    container.innerHTML = '';
    if (messages.length > 1 || isThinking) return;
    const niche = (cfg.niche || '').toLowerCase();
    const suggestions = (
      niche.includes('plumb') || niche.includes('electric') || niche.includes('build') || niche.includes('contractor')
        ? ['Get a quick quote', 'Emergency callout', 'Book an appointment']
        : niche.includes('dent')
        ? ['Book consultation', 'Treatment prices', 'Emergency appointment']
        : niche.includes('garage') || niche.includes('mot')
        ? ['Book MOT', 'Service quote', 'Repair enquiry']
        : niche.includes('estate') || niche.includes('property')
        ? ['Free valuation', 'View a property', 'Selling enquiry']
        : niche.includes('restaur') || niche.includes('cafe')
        ? ['Book a table', 'Private hire', 'See the menu']
        : niche.includes('salon') || niche.includes('beauty') || niche.includes('hair')
        ? ['Book an appointment', 'Service prices', 'Stylist availability']
        : niche.includes('gym') || niche.includes('fitness')
        ? ['Free trial', 'Membership prices', 'Class timetable']
        : niche.includes('legal') || niche.includes('solicit') || niche.includes('account')
        ? ['Book consultation', 'Service enquiry', 'Pricing question']
        : ['Get a quote', 'Book an appointment', 'Ask a question']
    );
    suggestions.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'kw-qr';
      btn.textContent = s;
      btn.onclick = () => { sendUserMessage(s); };
      container.appendChild(btn);
    });
  }

  async function sendUserMessage(text) {
    text = text.trim();
    if (!text || isThinking) return;
    messages.push({ role: 'user', text });
    isThinking = true;
    document.getElementById('kw-quickreplies').innerHTML = '';
    document.getElementById('kw-input').value = '';
    autoResizeInput();
    updateSendBtn();
    renderMessages();

    try {
      const r = await fetch(`${API_BASE}/api/chatbot/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messages })
      });
      isThinking = false;
      if (!r.ok) {
        const errText = r.status === 429
          ? "You're sending messages too fast. Please wait a moment."
          : "Sorry — there was a connection issue. Please try again, or call us directly.";
        showError(errText);
        renderMessages();
        return;
      }
      const data = await r.json();
      messages.push({ role: 'model', text: data.reply });
      renderMessages();
      if (data.leadCaptured && !leadAlreadyCaptured) {
        leadAlreadyCaptured = true;
        const lead = extractLead();
        if (lead.name || lead.phone || lead.email) {
          fetch(`${API_BASE}/api/chatbot/${slug}/lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, lead })
          }).catch(() => {});
        }
      }
    } catch (e) {
      isThinking = false;
      showError("Connection lost. Please check your internet and try again.");
      renderMessages();
    }
  }

  function showError(msg) {
    const container = document.getElementById('kw-msgs');
    const d = document.createElement('div');
    d.className = 'kw-error';
    d.textContent = msg;
    container.appendChild(d);
    scrollToBottom();
  }

  function autoResizeInput() {
    const el = document.getElementById('kw-input');
    el.style.height = 'auto';
    el.style.height = Math.min(100, el.scrollHeight) + 'px';
  }
  function updateSendBtn() {
    const btn = document.getElementById('kw-send');
    const inp = document.getElementById('kw-input');
    btn.disabled = !inp.value.trim() || isThinking;
  }

  function openChat() {
    if (isOpen) return;
    isOpen = true;
    document.getElementById('kw-btn').classList.add('open');
    document.getElementById('kw-win').classList.add('open');
    document.getElementById('kw-notif').style.display = 'none';
    document.getElementById('kw-prompt').classList.remove('show');
    sessionStorage.setItem('kw_opened_' + slug, '1');
    if (messages.length === 0) {
      const greeting = cfg.welcome_message || `Hi! I'm the AI receptionist for ${cfg.business_name}. How can I help you today?`;
      messages.push({ role: 'model', text: greeting });
      renderMessages();
      renderQuickReplies();
    }
    setTimeout(() => document.getElementById('kw-input').focus(), 250);
  }
  function closeChat() {
    isOpen = false;
    document.getElementById('kw-btn').classList.remove('open');
    document.getElementById('kw-win').classList.remove('open');
  }

  function attachEvents() {
    document.getElementById('kw-btn').addEventListener('click', () => isOpen ? closeChat() : openChat());
    document.getElementById('kw-close').addEventListener('click', closeChat);
    document.getElementById('kw-prompt').addEventListener('click', e => {
      if (e.target.id !== 'kw-prompt-x') openChat();
    });
    document.getElementById('kw-prompt-x').addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('kw-prompt').classList.remove('show');
      sessionStorage.setItem('kw_dismissed_' + slug, '1');
    });
    const inp = document.getElementById('kw-input');
    inp.addEventListener('input', () => { autoResizeInput(); updateSendBtn(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage(inp.value);
      }
    });
    document.getElementById('kw-send').addEventListener('click', () => sendUserMessage(inp.value));

    setTimeout(() => {
      if (!isOpen && !sessionStorage.getItem('kw_opened_' + slug) && !sessionStorage.getItem('kw_dismissed_' + slug)) {
        document.getElementById('kw-prompt').classList.add('show');
        document.getElementById('kw-notif').style.display = 'flex';
      }
    }, Math.max(8000, overrides.greetingDelay || 12000));

    let exitFired = false;
    document.addEventListener('mouseleave', e => {
      if (!exitFired && !isOpen && e.clientY <= 0 && !sessionStorage.getItem('kw_opened_' + slug)) {
        exitFired = true;
        document.getElementById('kw-prompt').classList.add('show');
        document.getElementById('kw-notif').style.display = 'flex';
        const promptText = document.getElementById('kw-prompt-text');
        if (promptText) promptText.textContent = 'Wait — got a quick question?';
      }
    });
  }

  async function boot() {
    try {
      const r = await fetch(`${API_BASE}/api/chatbot/${slug}`);
      if (!r.ok) {
        console.warn('[KWBA Chatbot] Could not load config for slug:', slug);
        return;
      }
      cfg = await r.json();
      injectStyles();
      buildDOM();
      attachEvents();
      window.KWChatbot = {
        open: openChat,
        close: closeChat,
        reset: () => {
          messages = [];
          leadAlreadyCaptured = false;
          renderMessages();
          renderQuickReplies();
        },
        config: cfg
      };
    } catch (e) {
      console.warn('[KWBA Chatbot] Boot failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
