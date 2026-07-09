// fallpaper SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallpaper/index.html · 136846 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallpaper" }); }
    else go();
  })();
'use strict';
// ════════════════════════════════════════════════════════════════
// FallPaper v1.0.0 · sovereign FCA-shaped document generator
// prime 733 · MIT · v20.4 socket compliant
// Client data never leaves the device.
// ════════════════════════════════════════════════════════════════
const TOOLNAME='fallpaper';
const VERSION='1.0.0';
const PRIME=733;
const STORE='fallpaper-v1';
const SCHEMA_VERSION='1.0';
const TABS=[
  {id:'dashboard', name:'Dashboard', ico:'◐'},
  {id:'generate',  name:'Generate',  ico:'△'},
  {id:'library',   name:'Library',   ico:'▦'},
  {id:'templates', name:'Templates', ico:'✆'},
  {id:'firm',      name:'Firm',      ico:'⌂'},
  {id:'audit',     name:'Audit',     ico:'◯'},
  {id:'help',      name:'Q & A',     ico:'?'},
];
let state={
  active:'dashboard',
  brandName:'FallPaper',
  firm:null,                 // single Firm record
  advisers:[],               // Adviser records
  clients:[],                // Client records (shared with bundle)
  documents:[],              // generated Document records
  templates:[],              // template definitions (custom edits saved)
  audit:[],                  // P3 chain
  ui:{
    selectedClientId:null,
    selectedTemplateId:'engagement-letter',
    selectedDocumentId:null,
    activeAdviserId:null,
    libFilterClient:'',
    libFilterTpl:'',
    libFilterStatus:'',
    scenarioFromAdviser:null,
    sectionOverrides:{},     // {tplId: {sectionId: text}}
    extraContext:{},         // user-supplied placeholders
    chat:[],
  },
  settings:{
    anthropicKey:'',
    auditChain:true,
    autoBroadcast:true,
  },
};
// ── util ──
const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const uid=(p='id')=>p+'_'+Math.random().toString(36).slice(2,11);
const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(+n||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});
const money=n=>'£'+fmt(n);
const moneyP=n=>'£'+(+n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateStr=ts=>{if(!ts)return '—';const d=new Date(ts);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
const dateTime=ts=>{if(!ts)return '—';const d=new Date(ts);return d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const isoDate=ts=>{if(!ts)return '';const d=new Date(ts);return d.toISOString().slice(0,10)};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),1900)}
async function sha256(s){
  const buf=new TextEncoder().encode(s);
  const h=await crypto.subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
// ════════════════════════════════════════════════════════════════
// IDB · multi-store per shared schema
// stores: firms, advisers, clients, documents, templates, audit, state
// ════════════════════════════════════════════════════════════════
let db;
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(STORE,1);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      ['firms','advisers','clients','documents','templates','audit','state'].forEach(s=>{
        if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='state'?undefined:'id'});
      });
    };
    r.onsuccess=e=>{db=e.target.result;res(db)};
    r.onerror=rej;
  });
}
function idbGetAll(store){
  return new Promise(res=>{
    const tx=db.transaction(store,'readonly');
    const q=tx.objectStore(store).getAll();
    q.onsuccess=()=>res(q.result||[]);
    q.onerror=()=>res([]);
  });
}
function idbGet(store,key){
  return new Promise(res=>{
    const tx=db.transaction(store,'readonly');
    const q=tx.objectStore(store).get(key);
    q.onsuccess=()=>res(q.result);
    q.onerror=()=>res(null);
  });
}
function idbPut(store,val,key){
  return new Promise(res=>{
    const tx=db.transaction(store,'readwrite');
    const o=tx.objectStore(store);
    const q=key!=null?o.put(val,key):o.put(val);
    q.onsuccess=()=>res(true);
    q.onerror=()=>res(false);
  });
}
function idbDel(store,key){
  return new Promise(res=>{
    const tx=db.transaction(store,'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete=()=>res(true);
  });
}
async function loadAll(){
  if(!db)await openDB();
  const [firms,advisers,clients,documents,templates,audit,uiState]=await Promise.all([
    idbGetAll('firms'),idbGetAll('advisers'),idbGetAll('clients'),
    idbGetAll('documents'),idbGetAll('templates'),idbGetAll('audit'),
    idbGet('state','ui'),
  ]);
  state.firm=firms[0]||null;
  state.advisers=advisers;
  state.clients=clients;
  state.documents=documents;
  state.audit=audit.sort((a,b)=>a.i-b.i);
  // Templates: merge custom overrides onto built-in catalogue
  state.templates=mergeTemplates(templates);
  if(uiState){
    state.ui=Object.assign({},state.ui,uiState.value||{});
    state.brandName=uiState.brand||'FallPaper';
    state.settings=Object.assign({},state.settings,uiState.settings||{});
  }
}
async function persistUI(){
  if(!db)await openDB();
  await idbPut('state',{value:state.ui,brand:state.brandName,settings:state.settings},'ui');
}
// ════════════════════════════════════════════════════════════════
// AUDIT chain (Mansoor P3 extended)
// ════════════════════════════════════════════════════════════════
async function audit(action,opts={}){
  if(!state.settings.auditChain)return;
  if(!db)await openDB();
  const prev=state.audit.length?state.audit[state.audit.length-1]:null;
  const prevHash=prev?prev.docHash:'';
  const i=(prev?prev.i:0)+1;
  const payload=opts.payload||{};
  const entry={
    id:uid('au'),
    i,
    ts:now(),
    tool:TOOLNAME,
    adviserId:opts.adviserId||state.ui.activeAdviserId||'',
    clientId:opts.clientId||'',
    action,
    reasoning:opts.reasoning||'',
    configVersion:TOOLNAME+'@'+VERSION,
    prevHash,
    docHash:'',
    payload,
  };
  entry.docHash=await sha256(JSON.stringify({i,ts:entry.ts,action,clientId:entry.clientId,prevHash,payload}));
  state.audit.push(entry);
  await idbPut('audit',entry);
}
// ════════════════════════════════════════════════════════════════
// BUNDLE MESH · fall-client + fall-signal
// ════════════════════════════════════════════════════════════════
let bcClient,bcSignal;
let bcDebounce={};
function broadcast(channel,type,payload){
  if(!state.settings.autoBroadcast)return;
  try{channel.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload})}catch(e){}
}
function debouncedBroadcast(key,channel,type,payload){
  clearTimeout(bcDebounce[key]);
  bcDebounce[key]=setTimeout(()=>broadcast(channel,type,payload),300);
}
async function initMesh(){
  // fall-signal · low-level handshake
  try{
    bcSignal=new BroadcastChannel('fall-signal');
    bcSignal.postMessage({source:TOOLNAME,type:'hello',prime:PRIME,version:VERSION,ts:now()});
    bcSignal.addEventListener('message',e=>{
      const m=e.data;if(!m)return;
      if(m.type==='ping')bcSignal.postMessage({source:TOOLNAME,type:'pong',prime:PRIME});
    });
  }catch(e){}
  // fall-client · shared schema mesh
  try{
    bcClient=new BroadcastChannel('fall-client');
    bcClient.addEventListener('message',handleClientMessage);
    // Boot-time sync request
    bcClient.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME,payload:{wants:['clients','advisers','firm']}});
  }catch(e){}
  // FallAdviser scenario channel
}
async function handleClientMessage(e){
  const m=e.data;if(!m||m.source===TOOLNAME)return;
  let dirty=false;
  if(m.type==='client.created'||m.type==='client.updated'){
    const c=m.payload;if(c&&c.id){
      const idx=state.clients.findIndex(x=>x.id===c.id);
      const existing=idx>=0?state.clients[idx]:null;
      if(!existing||(c.updatedAt||0)>=(existing.updatedAt||0)){
        if(idx>=0)state.clients[idx]=c;else state.clients.push(c);
        await idbPut('clients',c);
        dirty=true;
      }
    }
  }else if(m.type==='client.archived'){
    const c=m.payload;if(c&&c.id){
      const idx=state.clients.findIndex(x=>x.id===c.id);
      if(idx>=0){state.clients[idx]=c;await idbPut('clients',c);dirty=true}
    }
  }else if(m.type==='adviser.created'||m.type==='adviser.updated'){
    const a=m.payload;if(a&&a.id){
      const idx=state.advisers.findIndex(x=>x.id===a.id);
      if(idx>=0)state.advisers[idx]=a;else state.advisers.push(a);
      await idbPut('advisers',a);dirty=true;
    }
  }else if(m.type==='firm.updated'){
    const f=m.payload;if(f){state.firm=f;await idbPut('firms',f);dirty=true}
  }else if(m.type==='sync.request'){
    // Respond with our snapshot
    bcClient.postMessage({v:1,type:'sync.snapshot',ts:now(),source:TOOLNAME,
      payload:{clients:state.clients,advisers:state.advisers,firm:state.firm}});
  }else if(m.type==='sync.snapshot'){
    const p=m.payload||{};
    if(Array.isArray(p.clients))for(const c of p.clients){
      const idx=state.clients.findIndex(x=>x.id===c.id);
      const ex=idx>=0?state.clients[idx]:null;
      if(!ex||(c.updatedAt||0)>=(ex.updatedAt||0)){
        if(idx>=0)state.clients[idx]=c;else state.clients.push(c);
        await idbPut('clients',c);dirty=true;
      }
    }
    if(Array.isArray(p.advisers))for(const a of p.advisers){
      const idx=state.advisers.findIndex(x=>x.id===a.id);
      const ex=idx>=0?state.advisers[idx]:null;
      if(!ex||(a.updatedAt||0)>=(ex.updatedAt||0)){
        if(idx>=0)state.advisers[idx]=a;else state.advisers.push(a);
        await idbPut('advisers',a);dirty=true;
      }
    }
    if(p.firm&&(!state.firm||(p.firm.updatedAt||0)>(state.firm.updatedAt||0))){
      state.firm=p.firm;await idbPut('firms',p.firm);dirty=true;
    }
  }else if(m.type==='review.generate'){
    // FallAdviser v2 asking us to pre-fill an annual review
    const p=m.payload||{};
    state.ui.selectedTemplateId='annual-review';
    if(p.clientId)state.ui.selectedClientId=p.clientId;
    state.ui.scenarioFromAdviser=p.scenario||null;
    state.active='generate';
    await persistUI();
    render();
    toast('annual review pre-filled · falladviser');
  }
  if(dirty)render();
}
function handleWindowMessage(e){
  const m=e.data;if(!m||typeof m!=='object')return;
  if(m.type==='fall-adviser-scenario.response'&&m.scenario){
    state.ui.scenarioFromAdviser=m.scenario;
    toast('scenario received from falladviser');
    render();
  }
}
function requestAdviserScenario(){
  toast('requested scenario from FallAdviser');
}
async function emitClientUpdate(client){
  if(!bcClient)return;
  debouncedBroadcast('client-'+client.id,bcClient,'client.updated',client);
}
async function emitFirmUpdate(){
  if(!bcClient||!state.firm)return;
  debouncedBroadcast('firm',bcClient,'firm.updated',state.firm);
}
async function emitAdviserUpdate(a){
  if(!bcClient)return;
  debouncedBroadcast('adv-'+a.id,bcClient,'adviser.updated',a);
}
async function emitDocCreated(doc){
  if(!bcClient)return;
  broadcast(bcClient,'document.created',doc);
}
// ════════════════════════════════════════════════════════════════
// TEMPLATE CATALOGUE · FCA-shaped · 8 templates
// {id, name, version, kind, cobs, description, sections:[{id,heading,body,locked,requiredFields}]}
// body uses {{path.to.value}} interpolation; [SIGNATURE_BLOCK] is a special token.
// ════════════════════════════════════════════════════════════════
const TEMPLATES_BUILTIN=[];
TEMPLATES_BUILTIN.push({
  id:'engagement-letter', name:'Engagement Letter / Client Agreement', version:'1.0',
  cobs:'COBS 6.1', kind:'agreement',
  description:'Initial client agreement establishing scope of services and fee basis.',
  sections:[
{id:'header', heading:'Client Agreement',
 body:'**{{firm.name}}**\nFCA Reference: {{firm.fcaRefNo}}\nRegistered: {{firm.registeredAddress.line1}}, {{firm.registeredAddress.city}}, {{firm.registeredAddress.postcode}}\n\nFor the attention of: **{{client.title}} {{client.firstName}} {{client.lastName}}**\n{{client.address.line1}}, {{client.address.city}}, {{client.address.postcode}}\n\nDate: {{today}}',
 requiredFields:['firm.name','firm.fcaRefNo','client.firstName','client.lastName']},
{id:'introduction', heading:'1. Introduction',
 body:'This agreement sets out the basis on which {{firm.name}} ("we", "us", "our") will provide financial planning and investment advisory services to you. It should be read together with our Initial Disclosure Document.\n\nWe are authorised and regulated by the Financial Conduct Authority. Our FCA Reference Number is **{{firm.fcaRefNo}}**. You can verify this on the FCA Register at https://register.fca.org.uk.'},
{id:'services', heading:'2. Services we will provide',
 body:'We will provide the following services:\n\n- Initial assessment of your financial position, objectives, attitude to risk, capacity for loss, and knowledge & experience.\n- A personal recommendation that is suitable for you, in writing, supported by a Suitability Report (COBS 9.4).\n- Implementation of agreed recommendations.\n- {{engagement.type}} review service in accordance with the fee basis below.\n- Annual statement of ongoing services, costs and charges (MiFID II RTS).'},
{id:'fees', heading:'3. Fees and charges',
 body:'**Fee basis:** {{engagement.feeBasis}}\n**Initial fee:** £{{engagement.initialFee}}\n**Ongoing fee:** {{engagement.ongoingFee}} (annual, as a percentage of assets under management OR fixed amount as agreed)\n\nFees are agreed in advance and confirmed in writing. We do not accept commission from product providers for new investment business. Where commission is unavoidable (e.g. legacy protection products), it will be disclosed in £ and offset against our fees where possible.\n\nA full ex-ante costs & charges disclosure will be provided before any transaction.'},
{id:'authority', heading:'4. Authority to act',
 body:'We will not exercise discretion over your assets. All decisions to buy, sell or hold remain yours. Where you have signed a Letter of Authority, we may obtain information from your existing providers.'},
{id:'complaints', heading:'5. Complaints', locked:true,
 body:'If you have a complaint about any aspect of our service, please contact our Complaints Officer at {{firm.name}}, {{firm.registeredAddress.line1}}, {{firm.registeredAddress.postcode}}.\n\nIf you are not satisfied with our final response, or if we do not respond within eight weeks, you may refer the matter to the **Financial Ombudsman Service** (Exchange Tower, London E14 9SR · 0800 023 4567 · www.financial-ombudsman.org.uk). The FOS provides an impartial and free service for eligible complainants.'},
{id:'fscs', heading:'6. Compensation', locked:true,
 body:'We are covered by the **Financial Services Compensation Scheme** (FSCS). You may be entitled to compensation if we cannot meet our obligations.\n\n- Investment business: up to **£85,000** per person, per firm.\n- Deposits: up to £85,000 per person, per banking licence.\n- Long-term insurance and pensions: 100% with no upper limit (for claims against firms in default).\n\nFurther information is available from the FSCS at www.fscs.org.uk.'},
{id:'cancellation', heading:'7. Cancellation rights', locked:true,
 body:'You have the right to cancel this agreement within **14 days** of signing, without penalty and without giving any reason. To cancel, please write to us at the address above. Cancellation does not affect fees properly incurred for services already provided.'},
{id:'data', heading:'8. Data protection',
 body:'We process your personal data as a Data Controller under the UK GDPR and the Data Protection Act 2018, for the purposes of providing the advice and services described in this agreement, complying with our regulatory obligations, and the prevention of money laundering. We retain client records for **at least seven years** following the end of our engagement, as required by FCA SYSC.'},
{id:'termination', heading:'9. Termination',
 body:'Either party may terminate this agreement at any time by giving 30 days written notice. Fees for ongoing services will cease on the effective date. Initial fees are non-refundable once advice has been provided.'},
{id:'governing', heading:'10. Governing law',
 body:'This agreement is governed by the laws of England and Wales. Any dispute shall be subject to the exclusive jurisdiction of the courts of England and Wales.'},
{id:'signatures', heading:'11. Acceptance',
 body:'I have read, understood, and accept the terms of this agreement.\n\n[SIGNATURE_BLOCK]'}
]});
TEMPLATES_BUILTIN.push({
  id:'fact-find', name:'Client Fact-Find', version:'1.0',
  cobs:'COBS 9.2 · know-your-client', kind:'discovery',
  description:'Full personal & financial discovery — required basis for any suitable personal recommendation.',
  sections:[
{id:'header', heading:'Client Fact-Find',
 body:'**Firm:** {{firm.name}}\n**Adviser:** {{adviser.name}}\n**Date prepared:** {{today}}\n**Review due:** annually or on material change of circumstances.\n\nThis document records the information used to formulate any personal recommendation. It must be kept current. Failure to disclose relevant facts may affect the suitability of the advice given.'},
{id:'identity', heading:'1. Identity & residence',
 body:'**Full legal name:** {{client.title}} {{client.firstName}} {{client.middleName}} {{client.lastName}}\n**Preferred name:** {{client.preferredName}}\n**Date of birth:** {{client.dob}}\n**Nationality:** {{client.nationality}}\n**Country of residence:** {{client.countryOfResidence}}\n**Tax residency:** {{client.taxResidency}}\n**National Insurance No:** {{client.nino}}\n**UTR (if SA):** {{client.utr}}\n\n**Address:** {{client.address.line1}}, {{client.address.city}}, {{client.address.postcode}}\n**Resident at this address since:** {{client.address.since}}\n\n**Phone:** {{client.phone}}\n**Email:** {{client.email}}',
 requiredFields:['client.firstName','client.lastName','client.dob','client.nino']},
{id:'dependants', heading:'2. Family and dependants',
 body:'Relationships recorded for this client:\n\n{{client.relationshipsList}}'},
{id:'employment', heading:'3. Employment and income',
 body:'**Employment status:** {{ctx.employmentStatus}}\n**Employer / business:** {{ctx.employer}}\n**Occupation:** {{ctx.occupation}}\n\n**Gross annual employment income:** £{{ctx.income}}\n**Self-employment income:** £{{ctx.selfEmployedIncome}}\n**Dividend income:** £{{ctx.dividendIncome}}\n**Rental income:** £{{ctx.rentalIncome}}\n**Other income:** £{{ctx.otherIncome}}\n**Pension income (if drawing):** £{{ctx.pensionIncomeNow}}\n\n**Total gross income:** £{{ctx.totalIncome}}'},
{id:'expenditure', heading:'4. Regular expenditure',
 body:'**Mortgage / rent (monthly):** £{{ctx.mortgage}}\n**Utilities, council tax, insurance:** £{{ctx.utilities}}\n**Food, household, travel:** £{{ctx.living}}\n**Loans, credit cards (servicing):** £{{ctx.debtServicing}}\n**Pension contributions (gross):** £{{ctx.pensionContrib}}\n**Insurance premiums (life, IP, CIC):** £{{ctx.insurance}}\n**Discretionary:** £{{ctx.discretionary}}\n\n**Monthly disposable surplus:** £{{ctx.disposableMonthly}}'},
{id:'assets', heading:'5. Existing assets and liabilities',
 body:'**Cash savings:** £{{ctx.cashSavings}}\n**ISAs (S&S):** £{{ctx.ssIsa}}\n**ISAs (cash):** £{{ctx.cashIsa}}\n**General investment accounts:** £{{ctx.gia}}\n**Property (primary residence value):** £{{ctx.primaryResidence}}\n**Property (other):** £{{ctx.otherProperty}}\n**Other investments / business interests:** £{{ctx.otherAssets}}\n\n**Mortgage outstanding:** £{{ctx.mortgageBalance}}\n**Other loans:** £{{ctx.otherLoans}}\n**Credit card balances:** £{{ctx.creditCards}}\n\n**Net worth (excl. pensions):** £{{ctx.netWorthExclPensions}}'},
{id:'pensions', heading:'6. Pension provision',
 body:'**Workplace pension (current employer):** £{{ctx.workplacePension}}\n**Personal pensions / SIPPs:** £{{ctx.personalPensions}}\n**Defined Benefit (CETV if known):** £{{ctx.dbPensionCetv}}\n**State Pension qualifying years:** {{ctx.stateQualYears}} of 35\n**Forecast State Pension (£/week):** £{{ctx.statePensionForecast}}\n**Target retirement age:** {{ctx.targetRetirementAge}}\n**Target retirement income (today’s £):** £{{ctx.targetRetirementIncome}}'},
{id:'protection', heading:'7. Protection in force',
 body:'**Life cover (sum assured):** £{{ctx.lifeCover}}\n**Income protection (monthly benefit):** £{{ctx.ipBenefit}}\n**Critical illness cover:** £{{ctx.cicCover}}\n**Private medical insurance:** {{ctx.pmiYesNo}}\n**Will in place:** {{ctx.willYesNo}} (last reviewed {{ctx.willReviewed}})\n**LPA registered (PFA / H&W):** {{ctx.lpaYesNo}}'},
{id:'objectives', heading:'8. Objectives and priorities',
 body:'Recorded objectives (in priority order):\n\n{{suitability.objectivesList}}\n\n**Investment horizon:** {{suitability.investmentHorizon}} years\n**Income required from portfolio (£/yr):** £{{suitability.incomeNeeds}}\n**Ethical / ESG preferences:** {{suitability.ethicalPreferences}}'},
{id:'risk', heading:'9. Attitude to risk · capacity for loss · knowledge & experience', locked:true,
 body:'**Attitude to Risk (ATR):** {{suitability.attitudeToRisk}} of 7 — {{suitability.atrLabel}}\n**Capacity for Loss (CFL):** {{suitability.capacityForLoss}}\n**Knowledge & Experience (K&E):** {{suitability.knowledgeExperience}}\n\nThese three measures together establish the suitability envelope. ATR is the client’s emotional comfort with volatility; CFL is the financial ability to absorb a fall in capital without material impact on standard of living; K&E reflects familiarity with the products being considered. All three must be assessed before any recommendation (COBS 9A.2.4R).'},
{id:'vulnerability', heading:'10. Vulnerable customer assessment (FCA FG21/1)', locked:true,
 body:'**Vulnerability flag:** {{client.kyc.vulnerableCustomerFlag}}\n**Category (if any):** {{client.kyc.vulnerabilityCategory}}\n**Notes / accommodations:** {{client.kyc.vulnerabilityNotes}}\n\nUnder FCA FG21/1 we are required to identify drivers of vulnerability (health, life events, resilience, capability) and to adapt the service we provide accordingly. This assessment is reviewed at every annual review and on disclosure of any material change.'},
{id:'declaration', heading:'11. Client declaration',
 body:'I confirm that the information recorded above is true and complete to the best of my knowledge, and that I have not knowingly withheld any information that may be relevant to the advice to be given. I understand that the advice provided will be based on this information and that it is my responsibility to inform {{firm.name}} of any material change.\n\n[SIGNATURE_BLOCK]'}
]});
TEMPLATES_BUILTIN.push({
  id:'suitability', name:'Suitability Report', version:'1.0',
  cobs:'COBS 9.4', kind:'recommendation',
  description:'Reasoned personal recommendation. Required before any retail investment transaction.',
  sections:[
{id:'header', heading:'Suitability Report',
 body:'**Prepared for:** {{client.title}} {{client.firstName}} {{client.lastName}}\n**Prepared by:** {{adviser.name}} on behalf of {{firm.name}}\n**Date:** {{today}}\n**Report reference:** {{docRef}}\n\nThis report sets out the personal recommendation we have made to you, the reasons it is suitable for you, the risks, and the costs. It should be read in full. If anything is unclear please contact us before acting.'},
{id:'context', heading:'1. Your circumstances',
 body:'You are aged {{client.age}} and resident in {{client.address.city}}. Your gross annual income is £{{ctx.income}} and your net worth (excluding primary residence and pensions) is approximately £{{ctx.netWorthExclPensions}}.\n\nYou have an emergency cash reserve of £{{ctx.cashSavings}} ({{ctx.emergencyMonths}} months of expenditure). Your investment time horizon for the assets covered by this advice is **{{suitability.investmentHorizon}} years**.'},
{id:'objectives', heading:'2. Your objectives',
 body:'You have identified the following objectives, in priority order:\n\n{{suitability.objectivesList}}\n\nIncome required from the portfolio: £{{suitability.incomeNeeds}} per annum.\nEthical / ESG preferences: {{suitability.ethicalPreferences}}'},
{id:'risk-profile', heading:'3. Attitude to risk and capacity for loss', locked:true,
 body:'On a scale of 1 (lowest) to 7 (highest), you have an **Attitude to Risk score of {{suitability.attitudeToRisk}} ({{suitability.atrLabel}})**.\n\nYour **Capacity for Loss is assessed as {{suitability.capacityForLoss}}** — a fall in the value of your investments would have a {{suitability.cflImpact}} impact on your standard of living.\n\nYour **Knowledge & Experience of investments is {{suitability.knowledgeExperience}}**.\n\nTogether these three measures establish that an asset allocation broadly in line with a **{{recommendation.modelPortfolio}}** model is suitable for you. We do not recommend taking risk beyond this level, even if returns might otherwise be higher.'},
{id:'recommendation', heading:'4. Our recommendation',
 body:'We recommend that you:\n\n{{recommendation.actions}}\n\nThe target asset allocation for the resulting portfolio is set out below.\n\n**Total to be invested:** £{{recommendation.totalAmount}}\n**Tax wrapper(s) used:** {{recommendation.wrappers}}\n**Provider / platform:** {{recommendation.provider}}\n**Model portfolio:** {{recommendation.modelPortfolio}}'},
{id:'why-suitable', heading:'5. Why this recommendation is suitable for you',
 body:'{{recommendation.suitabilityRationale}}\n\nIn particular:\n- It is aligned with your stated attitude to risk and capacity for loss.\n- It uses the most tax-efficient wrappers available to you given your remaining allowances.\n- It supports the income and growth profile your objectives require over a {{suitability.investmentHorizon}}-year horizon.\n- The cost (set out in section 7) is proportionate to the service and the expected outcome.'},
{id:'risks', heading:'6. Risks of this recommendation', locked:true,
 body:'You should be aware of the following risks before acting:\n\n- **Capital risk:** the value of your investments can fall as well as rise. You may get back less than you invested.\n- **Inflation risk:** the real value of cash holdings will be eroded by inflation over time.\n- **Currency risk:** funds with overseas exposure are affected by movements in exchange rates.\n- **Liquidity risk:** some assets may not be sold quickly or at a fair price in stressed markets.\n- **Provider risk:** the platform or fund manager may fail. FSCS protection (£85,000 per firm) applies to investment business.\n- **Tax-rule risk:** allowances, bands and reliefs can be changed by future Finance Acts. Past tax treatment is not a guarantee of future treatment.\n\nPast performance is not a reliable indicator of future results.'},
{id:'costs', heading:'7. Costs and charges',
 body:'Costs are disclosed below on an ex-ante basis as required by MiFID II RTS. Actual ex-post figures will be reported annually.\n\n| Charge | Year 1 (£) | Ongoing (£/yr) |\n|---|---:|---:|\n| Our initial advice fee | {{recommendation.feeInitial}} | — |\n| Our ongoing advice fee | — | {{recommendation.feeOngoing}} |\n| Platform charge | {{recommendation.platformInitial}} | {{recommendation.platformOngoing}} |\n| Underlying fund OCFs | — | {{recommendation.fundOcf}} |\n| Transaction costs (PRIIPs) | {{recommendation.transactionCosts}} | {{recommendation.transactionCostsOngoing}} |\n| **Total** | **{{recommendation.totalYear1}}** | **{{recommendation.totalOngoing}}** |\n\n**Reduction in Yield (RIY):** {{recommendation.riy}}% per annum.\n\nThese figures are based on the amounts to be invested and may vary with the value of your portfolio.'},
{id:'alternatives', heading:'8. Alternatives considered',
 body:'{{recommendation.alternativesConsidered}}\n\nWe selected the recommended solution because, on balance, it best meets your objectives within your risk envelope at a proportionate cost.'},
{id:'cooling-off', heading:'9. Cancellation', locked:true,
 body:'You normally have **30 calendar days** to cancel a pension contract and **14 calendar days** to cancel a non-pension investment from the date you receive cancellation notice. Where you cancel within the period, you may receive back less than you invested if the unit price has fallen.'},
{id:'next-steps', heading:'10. Next steps',
 body:'If you wish to proceed, please sign the acceptance block below and return one copy to us. We will then arrange the transactions described and confirm completion in writing within 10 working days.\n\nIf you have questions or wish to discuss alternatives, please contact {{adviser.name}} on {{adviser.phone}} or by email.'},
{id:'declarations', heading:'11. Declarations', locked:true,
 body:'**Adviser declaration:** I confirm that the recommendations set out in this report are based on the information disclosed by the client, and that I have considered the client’s objectives, attitude to risk, capacity for loss and knowledge & experience in formulating this advice (COBS 9.2 / COBS 9A).\n\n**Client declaration:** I confirm that I have read this report and that the information on which it is based remains accurate. I wish to proceed with the recommendation set out in section 4.\n\n[SIGNATURE_BLOCK]'}
]});
TEMPLATES_BUILTIN.push({
  id:'annual-review', name:'Annual Review Pack', version:'1.0',
  cobs:'COBS 9.4.10R · ongoing suitability', kind:'review',
  description:'Annual review document confirming continued suitability and disclosing ex-post costs.',
  sections:[
{id:'header', heading:'Annual Review',
 body:'**Client:** {{client.title}} {{client.firstName}} {{client.lastName}}\n**Review date:** {{today}}\n**Adviser:** {{adviser.name}}\n**Period covered:** {{review.periodFrom}} to {{review.periodTo}}'},
{id:'change-summary', heading:'1. Material changes since last review',
 body:'{{review.materialChanges}}\n\nWhere any of the above represents a change in your circumstances, we have updated the fact-find accordingly. A revised attitude-to-risk assessment has {{review.atrReassessed}} been carried out.'},
{id:'objectives-review', heading:'2. Review of objectives',
 body:'Your objectives remain as follows:\n\n{{suitability.objectivesList}}\n\nProgress against each objective is summarised below.\n\n{{review.objectiveProgress}}'},
{id:'performance', heading:'3. Portfolio performance',
 body:'**Opening valuation:** £{{review.openValue}}\n**Closing valuation:** £{{review.closeValue}}\n**Contributions in period:** £{{review.contributions}}\n**Withdrawals in period:** £{{review.withdrawals}}\n**Net change:** £{{review.netChange}}\n**Return (time-weighted):** {{review.twr}}%\n**Benchmark return ({{review.benchmark}}):** {{review.benchmarkReturn}}%\n**Relative performance:** {{review.relative}}%\n\nPast performance is not a reliable indicator of future returns.'},
{id:'allowances', heading:'4. Allowance utilisation (UK 2025-26)',
 body:'| Allowance | Limit | Used | Remaining |\n|---|---:|---:|---:|\n| ISA | £20,000 | £{{review.isaUsed}} | £{{review.isaRemaining}} |\n| Pension annual | £60,000 | £{{review.paaUsed}} | £{{review.paaRemaining}} |\n| CGT annual exempt | £3,000 | £{{review.cgtUsed}} | £{{review.cgtRemaining}} |\n| LISA | £4,000 | £{{review.lisaUsed}} | £{{review.lisaRemaining}} |\n\nWhere allowances remain unused with less than 60 days until tax year-end, we recommend topping up where cashflow permits — see section 6.'},
{id:'costs-expost', heading:'5. Ex-post costs and charges (MiFID II)', locked:true,
 body:'The following table sets out actual costs and charges in the period covered, in £ and as a percentage of average portfolio value, in line with MiFID II RTS 28 / COBS 6.1ZA.\n\n| Charge | £ | % of avg AUM |\n|---|---:|---:|\n| Adviser ongoing fee | {{review.feeAdviser}} | {{review.feeAdviserPct}}% |\n| Platform charge | {{review.feePlatform}} | {{review.feePlatformPct}}% |\n| Fund OCFs | {{review.feeFunds}} | {{review.feeFundsPct}}% |\n| Transaction costs (PRIIPs) | {{review.feeTrans}} | {{review.feeTransPct}}% |\n| **Total** | **{{review.feeTotal}}** | **{{review.feeTotalPct}}%** |\n\nThis is the cumulative effect of charges on your return for the period.'},
{id:'recommendations', heading:'6. Recommendations for the year ahead',
 body:'{{review.recommendations}}'},
{id:'continuing-suitability', heading:'7. Confirmation of continuing suitability', locked:true,
 body:'Based on the information you have provided, we confirm that the existing portfolio and the recommended changes (if any) **remain suitable for you** with reference to your objectives, attitude to risk, capacity for loss, and knowledge & experience as assessed at this review.\n\nIf any of the underlying facts change before the next scheduled review, please contact us promptly.'},
{id:'sign', heading:'8. Acknowledgement',
 body:'I acknowledge receipt of this annual review and confirm that my circumstances are as recorded above.\n\n[SIGNATURE_BLOCK]'}
]});
TEMPLATES_BUILTIN.push({
  id:'mifid-costs', name:'MiFID II Costs & Charges Disclosure', version:'1.0',
  cobs:'COBS 6.1ZA · MiFID II RTS', kind:'disclosure',
  description:'Ex-ante or ex-post itemised cost disclosure.',
  sections:[
{id:'header', heading:'Costs & Charges Disclosure',
 body:'**Client:** {{client.firstName}} {{client.lastName}}\n**Firm:** {{firm.name}}\n**Date:** {{today}}\n**Basis:** {{ctx.costBasis}}  (ex-ante = before transaction · ex-post = annual statement)'},
{id:'aggregate', heading:'1. Aggregate costs', locked:true,
 body:'The total cost of the service over the next 12 months (ex-ante) or the most recent 12-month period (ex-post) is presented both in money terms and as a percentage of investment value. This is a regulatory requirement under MiFID II (COBS 6.1ZA / RTS).'},
{id:'itemised', heading:'2. Itemised costs',
 body:'| Category | £ amount | % of invested amount |\n|---|---:|---:|\n| One-off charges (initial advice) | {{ctx.oneOffCharges}} | {{ctx.oneOffPct}}% |\n| Ongoing charges (adviser + platform) | {{ctx.ongoingCharges}} | {{ctx.ongoingPct}}% |\n| Transaction costs | {{ctx.txCosts}} | {{ctx.txCostsPct}}% |\n| Costs related to ancillary services | {{ctx.ancillary}} | {{ctx.ancillaryPct}}% |\n| Incidental costs (e.g. performance fees) | {{ctx.incidental}} | {{ctx.incidentalPct}}% |\n| **Aggregate total** | **{{ctx.totalCosts}}** | **{{ctx.totalCostsPct}}%** |'},
{id:'effect', heading:'3. Cumulative effect on return',
 body:'A return of {{ctx.grossReturn}}% gross becomes a return of {{ctx.netReturn}}% net of all the charges above (the "Reduction in Yield" is **{{ctx.riy}}%**). Over a {{ctx.horizonYears}}-year horizon, the compounding effect is **£{{ctx.compoundedDrag}}** on a starting investment of £{{ctx.startingInvestment}}.'},
{id:'notes', heading:'4. Notes',
 body:'- Costs vary with portfolio value and turnover.\n- Transaction costs are reported on a PRIIPs basis and may include implicit slippage.\n- Where charges are paid from the portfolio they will reduce the units held; where charged externally they will not affect units but will be invoiced separately.'}
]});
TEMPLATES_BUILTIN.push({
  id:'cidd', name:'Client Investment Disclosure Document (CIDD)', version:'1.0',
  cobs:'KFD / firm disclosure', kind:'disclosure',
  description:'Plain-English summary of the firm, services and charges. Issued before first engagement.',
  sections:[
{id:'about', heading:'About us',
 body:'**{{firm.name}}** ({{firm.tradingName}}) is authorised and regulated by the **Financial Conduct Authority** (FCA Reference: **{{firm.fcaRefNo}}**). You can verify our authorisation on the FCA Register at https://register.fca.org.uk.\n\nWe provide independent / restricted (delete as applicable) financial advice to retail clients.'},
{id:'services', heading:'Services we offer',
 body:'- Initial financial planning and personal recommendation\n- Investment advice (regulated)\n- Pension and retirement planning\n- Inheritance & estate planning (in conjunction with your solicitor)\n- Annual review and ongoing service'},
{id:'how-paid', heading:'How we are paid',
 body:'We do not receive commission for new investment business. We charge fees agreed in advance. Our standard fee structure is:\n\n- **Initial advice:** {{firm.initialFeeBasis}} (minimum £{{firm.minInitialFee}})\n- **Ongoing service:** {{firm.ongoingFeeBasis}} per annum\n\nAll fees will be confirmed in writing before any work is carried out.'},
{id:'complaints-fos', heading:'Complaints and FOS', locked:true,
 body:'Complaints should be made in writing to: **Complaints Officer, {{firm.name}}, {{firm.registeredAddress.line1}}, {{firm.registeredAddress.postcode}}**. We will acknowledge within 3 working days and provide a final response within 8 weeks.\n\nIf you remain unsatisfied you may refer the matter to the **Financial Ombudsman Service** (www.financial-ombudsman.org.uk · 0800 023 4567).'},
{id:'fscs', heading:'Compensation', locked:true,
 body:'We are covered by the **Financial Services Compensation Scheme**. Limits: £85,000 per person per firm for investment business; 100% (no cap) for protection / long-term insurance claims; £85,000 per person per banking licence for deposits.'}
]});
TEMPLATES_BUILTIN.push({
  id:'vulnerable', name:'Vulnerable Customer Assessment Note', version:'1.0',
  cobs:'FCA FG21/1', kind:'evidence',
  description:'Internal note evidencing the firm has identified and accommodated vulnerability.',
  sections:[
{id:'header', heading:'Vulnerable Customer Assessment',
 body:'**Client:** {{client.firstName}} {{client.lastName}} ({{client.id}})\n**Adviser:** {{adviser.name}}\n**Date:** {{today}}\n**Reference:** FCA FG21/1 — Guidance for firms on the fair treatment of vulnerable customers'},
{id:'drivers', heading:'1. Drivers identified',
 body:'**Health drivers:** {{ctx.vulnHealth}}\n**Life-event drivers:** {{ctx.vulnLifeEvent}}\n**Financial-resilience drivers:** {{ctx.vulnResilience}}\n**Capability drivers (numeracy, digital, language):** {{ctx.vulnCapability}}'},
{id:'impact', heading:'2. Impact on this client', body:'{{ctx.vulnImpact}}'},
{id:'accommodations', heading:'3. Accommodations agreed', body:'{{ctx.vulnAccommodations}}'},
{id:'review-date', heading:'4. Review',
 body:'This assessment will be reviewed at the next scheduled annual review on or before **{{ctx.vulnNextReview}}**, or sooner if a material change is disclosed.\n\nAdviser signature: ____________________________________ Date: __________________'}
]});
TEMPLATES_BUILTIN.push({
  id:'tax-year-end', name:'Tax Year-End Letter', version:'1.0',
  cobs:'service letter', kind:'service',
  description:'Annual prompt sent in late February / early March to use remaining allowances.',
  sections:[
{id:'header', heading:'Tax year-end reminder · {{ctx.taxYear}}',
 body:'Dear {{client.preferredName}} {{client.lastName}},\n\nThe end of the **{{ctx.taxYear}}** tax year on **5 April {{ctx.taxYearEnd}}** is approaching. This is the deadline by which several annual allowances must be used or lost. Please find a summary of your position below.'},
{id:'isa', heading:'ISA allowance',
 body:'You have used **£{{review.isaUsed}}** of the £20,000 ISA allowance this tax year. **£{{review.isaRemaining}}** remains available until 5 April.'},
{id:'pension', heading:'Pension annual allowance',
 body:'You have used **£{{review.paaUsed}}** of the £60,000 pension annual allowance. **£{{review.paaRemaining}}** remains. You may also be able to use up to three years of carry-forward — please contact us to confirm.'},
{id:'cgt', heading:'Capital gains tax allowance',
 body:'The annual CGT exempt amount is **£3,000** for {{ctx.taxYear}}. You have realised gains of approximately **£{{review.cgtUsed}}** so far. Where appropriate we may recommend "bed & ISA" or inter-spouse transfers to use any remaining allowance before year-end.'},
{id:'action', heading:'Recommended action',
 body:'{{ctx.tyeAction}}\n\nPlease reply to confirm whether you wish to proceed. To allow time for transactions to settle, please respond by **{{ctx.tyeDeadline}}**.'},
{id:'sign-off', heading:'',
 body:'Yours sincerely,\n\n**{{adviser.name}}**\n{{firm.name}}'}
]});
function mergeTemplates(customs){
  const map=new Map();
  for(const t of TEMPLATES_BUILTIN)map.set(t.id,JSON.parse(JSON.stringify(t)));
  for(const c of customs||[]){
    const base=map.get(c.id);
    if(!base){map.set(c.id,c);continue}
    if(c.sectionOverrides){
      for(const sec of base.sections){
        if(sec.locked)continue;
        if(c.sectionOverrides[sec.id]!=null)sec.body=c.sectionOverrides[sec.id];
      }
    }
    base._custom=true;
  }
  return Array.from(map.values());
}
// ════════════════════════════════════════════════════════════════
// INTERPOLATION & RENDERING
// ════════════════════════════════════════════════════════════════
const ATR_LABELS=['','Defensive','Cautious','Moderately cautious','Balanced','Moderately adventurous','Adventurous','Aggressive'];
const CFL_IMPACT={low:'significant',medium:'moderate but manageable',high:'minor'};
function getPath(obj,path){
  if(obj==null)return undefined;
  const parts=path.split('.');
  let cur=obj;
  for(const p of parts){
    if(cur==null)return undefined;
    cur=cur[p];
  }
  return cur;
}
function age(dob){
  if(!dob)return '';
  const b=new Date(dob);if(isNaN(b))return '';
  const t=new Date();
  let a=t.getFullYear()-b.getFullYear();
  const m=t.getMonth()-b.getMonth();
  if(m<0||(m===0&&t.getDate()<b.getDate()))a--;
  return a;
}
function relationshipsList(client){
  if(!client||!client.relationships||!client.relationships.length)return '_No relationships recorded._';
  return client.relationships.map(r=>{
    const other=state.clients.find(c=>c.id===r.toClientId);
    const nm=other?(other.firstName+' '+other.lastName):'(unknown)';
    return '- **'+r.type+'**: '+nm+(r.notes?' — '+r.notes:'');
  }).join('\n');
}
function objectivesList(client){
  const objs=getPath(client,'suitability.objectives');
  if(!objs||!objs.length)return '_No objectives recorded._';
  return objs.map((o,i)=>(i+1)+'. **'+(o.name||'Objective')+'** — horizon '+(o.horizon||'?')+' years, target £'+fmt(o.target||0)+(o.notes?'  \n   _'+o.notes+'_':'')).join('\n');
}
function buildContext(clientId,extra){
  const client=state.clients.find(c=>c.id===clientId)||{};
  const firm=state.firm||{};
  const adviser=state.advisers.find(a=>a.id===(client.adviserId||state.ui.activeAdviserId))||{name:'(unassigned adviser)',phone:'',email:''};
  const today=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const taxYear='2025-26';
  const clientCopy=JSON.parse(JSON.stringify(client));
  clientCopy.age=age(client.dob);
  clientCopy.relationshipsList=relationshipsList(client);
  const suit=Object.assign({attitudeToRisk:4,capacityForLoss:'medium',knowledgeExperience:'medium',investmentHorizon:20,objectives:[],incomeNeeds:0,ethicalPreferences:'No specific preferences disclosed.'},client.suitability||{});
  suit.atrLabel=ATR_LABELS[suit.attitudeToRisk]||'Balanced';
  suit.cflImpact=CFL_IMPACT[suit.capacityForLoss]||'moderate';
  suit.objectivesList=objectivesList(client);
  const eng=client.engagement||{type:'ongoing',feeBasis:'AUM%',initialFee:0,ongoingFee:0};
  const docRef='FP-'+(client.id||'demo').slice(-6).toUpperCase()+'-'+new Date().toISOString().slice(0,10);
  const adv=state.ui.scenarioFromAdviser||{};
  const recDefault={
    actions:'1. Open a Stocks & Shares ISA and contribute £20,000 to use the current-year allowance.\n2. Make a £20,000 lump-sum personal pension contribution to your SIPP.\n3. Re-balance the General Investment Account to the recommended balanced allocation.',
    totalAmount:'40,000', wrappers:'ISA + SIPP + GIA',
    provider:'(platform / provider name)',
    modelPortfolio:'Balanced (60/40 equity-bond)',
    suitabilityRationale:'You have a long investment horizon, a moderate attitude to risk and adequate capacity for loss. A diversified multi-asset portfolio at the balanced level captures long-term equity premia while moderating drawdowns in stressed markets.',
    feeInitial:'1,200',feeOngoing:'400',platformInitial:'0',platformOngoing:'140',
    fundOcf:'88',transactionCosts:'40',transactionCostsOngoing:'40',
    totalYear1:'1,328',totalOngoing:'668',riy:'0.92',
    alternativesConsidered:'We considered (a) leaving funds in cash, rejected for inflation drag over a 20-year horizon; (b) a Defensive (30/70) model, rejected as below your stated risk tolerance and unlikely to meet your retirement income target; (c) a self-select platform with individual ETF picks, rejected as the additional administration cost and concentration risk outweighed any saving on OCF.'
  };
  const rec=Object.assign(recDefault,adv.recommendation||{});
  const revDefault={
    periodFrom:'6 April 2025',periodTo:'5 April 2026',
    materialChanges:'No material changes to circumstances disclosed since the last review.',
    atrReassessed:'not',
    objectiveProgress:'Each objective remains on track at the current contribution rate.',
    openValue:'185,000',closeValue:'207,500',contributions:'24,000',withdrawals:'0',netChange:'22,500',
    twr:'4.5',benchmark:'Composite 60/40',benchmarkReturn:'4.1',relative:'+0.4',
    isaUsed:'20,000',isaRemaining:'0',
    paaUsed:'8,000',paaRemaining:'52,000',
    cgtUsed:'0',cgtRemaining:'3,000',
    lisaUsed:'0',lisaRemaining:'4,000',
    feeAdviser:'820',feeAdviserPct:'0.40',feePlatform:'288',feePlatformPct:'0.14',
    feeFunds:'180',feeFundsPct:'0.09',feeTrans:'82',feeTransPct:'0.04',
    feeTotal:'1,370',feeTotalPct:'0.67',
    recommendations:'1. Continue current monthly contributions.\n2. Use carry-forward to top up pension by a further £20,000 before tax year-end.\n3. Re-balance the portfolio back to the model allocation (currently 3% over-weight UK equity).'
  };
  const review=Object.assign(revDefault,adv.review||{});
  const ctxDefault={
    employmentStatus:'Employed',employer:'',occupation:'',
    income:50000,selfEmployedIncome:0,dividendIncome:0,rentalIncome:0,otherIncome:0,pensionIncomeNow:0,totalIncome:50000,
    mortgage:1200,utilities:380,living:600,debtServicing:0,pensionContrib:300,insurance:80,discretionary:600,disposableMonthly:540,
    cashSavings:25000,ssIsa:18000,cashIsa:0,gia:6000,primaryResidence:380000,otherProperty:0,otherAssets:0,
    mortgageBalance:215000,otherLoans:0,creditCards:0,netWorthExclPensions:213900,
    workplacePension:42000,personalPensions:18000,dbPensionCetv:0,stateQualYears:24,statePensionForecast:230,
    targetRetirementAge:67,targetRetirementIncome:30000,
    lifeCover:200000,ipBenefit:2200,cicCover:50000,pmiYesNo:'No',willYesNo:'Yes',willReviewed:'2024',lpaYesNo:'No',
    emergencyMonths:9,
    costBasis:'ex-ante',oneOffCharges:'1,200',oneOffPct:'1.20',ongoingCharges:'540',ongoingPct:'0.54',
    txCosts:'80',txCostsPct:'0.08',ancillary:'0',ancillaryPct:'0.00',incidental:'0',incidentalPct:'0.00',
    totalCosts:'1,820',totalCostsPct:'1.82',grossReturn:'5.5',netReturn:'4.6',riy:'0.92',
    horizonYears:20,compoundedDrag:'24,700',startingInvestment:'100,000',
    vulnHealth:'None identified at this time.',vulnLifeEvent:'None identified.',vulnResilience:'Adequate emergency reserve.',vulnCapability:'High numeracy, fluent English, comfortable with digital channels.',
    vulnImpact:'No material impact identified.',vulnAccommodations:'Standard service.',
    vulnNextReview:new Date(Date.now()+365*86400000).toLocaleDateString('en-GB'),
    taxYear:'2025-26',taxYearEnd:'2026',
    tyeAction:'Top up your ISA by £4,000 and your SIPP by £8,000 to use remaining allowances.',
    tyeDeadline:'21 March '+(new Date().getFullYear()+(new Date().getMonth()>=9?1:0))
  };
  const ctx=Object.assign(ctxDefault,state.ui.extraContext||{},extra||{},adv.ctx||{});
  return {client:clientCopy, firm, adviser, suitability:suit, engagement:eng, recommendation:rec, review, ctx, today, docRef, taxYear};
}
function interpolate(body,ctx){
  return body.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g,function(_,path){
    const v=getPath(ctx,path);
    if(v==null||v===''){
      return '<span class="placeholder-empty">{{'+path+'}}</span>';
    }
    if(Array.isArray(v))return v.join(', ');
    return String(v);
  });
}
function inlineMd(s){
  return s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
          .replace(/_([^_]+)_/g,'<em>$1</em>');
}
function md2html(s){
  if(!s)return '';
  s=s.replace(/\[SIGNATURE_BLOCK\]/g,'<div class="sig-block"><div><div class="sig-line"></div>Signed (client)<br>Date: ________________</div><div><div class="sig-line"></div>Signed (adviser)<br>Date: ________________</div></div>');
  s=s.replace(/(^\|.+\|$\n?){2,}/gm,function(block){
    const lines=block.trim().split('\n');
    if(lines.length<2)return block;
    const headers=lines[0].split('|').slice(1,-1).map(c=>c.trim());
    const align=lines[1].split('|').slice(1,-1).map(c=>c.trim().endsWith(':')?'right':'left');
    const rows=lines.slice(2).map(l=>l.split('|').slice(1,-1).map(c=>c.trim()));
    const ths=headers.map((h,i)=>'<th style="text-align:'+align[i]+'">'+inlineMd(h)+'</th>').join('');
    const trs=rows.map(r=>'<tr>'+r.map((c,i)=>'<td style="text-align:'+align[i]+'">'+inlineMd(c)+'</td>').join('')+'</tr>').join('');
    return '<table><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table>';
  });
  const lines=s.split('\n');
  let html='';let inList=null;
  for(let i=0;i<lines.length;i++){
    const ln=lines[i];
    const mUl=ln.match(/^\s*[-*]\s+(.*)$/);
    const mOl=ln.match(/^\s*\d+\.\s+(.*)$/);
    if(mUl){
      if(inList!=='ul'){if(inList)html+='</'+inList+'>';html+='<ul>';inList='ul';}
      html+='<li>'+inlineMd(mUl[1])+'</li>';
    }else if(mOl){
      if(inList!=='ol'){if(inList)html+='</'+inList+'>';html+='<ol>';inList='ol';}
      html+='<li>'+inlineMd(mOl[1])+'</li>';
    }else{
      if(inList){html+='</'+inList+'>';inList=null;}
      if(ln.trim()==='')html+='';
      else if(ln.trim().startsWith('<table'))html+=ln;
      else if(ln.trim().startsWith('<'))html+=ln;
      else html+='<p>'+inlineMd(ln)+'</p>';
    }
  }
  if(inList)html+='</'+inList+'>';
  return html;
}
function renderTemplate(tplId,clientId,extra){
  const tpl=state.templates.find(t=>t.id===tplId);
  if(!tpl)return {html:'',markdown:'',missing:[]};
  const ctx=buildContext(clientId,extra);
  const overrides=(state.ui.sectionOverrides||{})[tplId]||{};
  let html='<h1>'+esc(tpl.name)+'</h1>';
  html+='<div class="doc-meta">'+esc(tpl.cobs||'')+' · '+esc(ctx.today)+' · '+esc(state.firm?state.firm.name:'')+'</div>';
  let md='# '+tpl.name+'\n\n_'+(tpl.cobs||'')+' · '+ctx.today+'_\n\n';
  const missing=[];
  for(const sec of tpl.sections){
    if(sec.requiredFields){
      for(const f of sec.requiredFields){
        const v=getPath(ctx,f);
        if(v==null||v==='')missing.push(f);
      }
    }
    const rawBody=overrides[sec.id]!=null?overrides[sec.id]:sec.body;
    const interp=interpolate(rawBody,ctx);
    const sechtml=md2html(interp);
    if(sec.heading)html+='<h2>'+esc(sec.heading)+'</h2>';
    if(sec.locked)html+='<div class="clause-locked">'+sechtml+'</div>';
    else html+=sechtml;
    if(sec.heading)md+='## '+sec.heading+'\n\n';
    md+=interp.replace(/<[^>]+>/g,'')+'\n\n';
  }
  return {html, markdown:md, missing};
}
// ════════════════════════════════════════════════════════════════
// T0 KEYWORD ROUTER · offline Q&A about doc types & regulation
// ════════════════════════════════════════════════════════════════
const T0_RULES=[
  {kw:['engagement','letter','client agreement','cobs 6'], a:'The Engagement Letter (COBS 6.1) sets out the basis of the relationship: firm details, scope of services, fee basis and amount, complaints process, FOS reference, FSCS limits, cancellation rights and signature blocks. It must be provided in good time before the firm is bound to a contract.'},
  {kw:['fact find','fact-find','know your client','cobs 9.2'], a:'The Fact-Find captures the information needed to formulate a personal recommendation: identity, dependants, employment, income, expenditure, assets, liabilities, pensions, protection, objectives, attitude to risk, capacity for loss, knowledge & experience, vulnerability. COBS 9.2 requires "necessary information" — incomplete fact-finding makes any recommendation potentially unsuitable.'},
  {kw:['suitability','cobs 9.4','suitability report'], a:'A Suitability Report (COBS 9.4) is required before any retail investment transaction following advice. It must state why the recommendation is suitable, the risks, the costs (RIY), the alternatives considered, cancellation rights, and adviser/client declarations. Lack of a clear suitability rationale is one of the most common FCA enforcement findings.'},
  {kw:['annual review','ongoing service','9.4.10'], a:'COBS 9.4.10R requires firms providing ongoing personal recommendations to undertake a periodic review of suitability. The Annual Review Pack documents material changes, performance vs benchmark, allowance utilisation, ex-post costs (MiFID II RTS) and confirms continuing suitability.'},
  {kw:['mifid','costs','charges','cidd','6.1za'], a:'MiFID II costs & charges disclosure (COBS 6.1ZA) requires both ex-ante (before transaction) and ex-post (annual statement) itemised disclosure of all costs in £ and % terms, including transaction costs on a PRIIPs basis. The aggregate must show the cumulative effect on return ("RIY").'},
  {kw:['cidd','disclosure document','kfd'], a:'A Client Investment Disclosure Document (CIDD) is the plain-English summary of the firm, services and charges — typically the document a prospective client reads before signing the Engagement Letter. Often includes FCA reference, independence statement, fee basis, FOS and FSCS.'},
  {kw:['vulnerable','vulnerability','fg21'], a:'FCA FG21/1 requires firms to identify and accommodate vulnerable customers. Four drivers: health, life events, resilience, capability. The Vulnerable Customer Assessment Note evidences identification, impact assessment, and accommodations agreed — it is the file evidence the FCA looks for in supervisory review.'},
  {kw:['tax year end','allowances','5 april','isa deadline'], a:'The Tax Year-End Letter is a service touch in late February or early March. Reminds the client to use the ISA allowance (£20,000), pension annual allowance (£60,000), CGT exempt amount (£3,000) and LISA allowance (£4,000) before 5 April. Allowances do not roll over (except pension carry-forward).'},
  {kw:['fscs','compensation','85000','85,000'], a:'The FSCS protects investment business up to £85,000 per person per firm. Protection / long-term insurance is 100% with no cap. Bank deposits are protected up to £85,000 per banking licence. The limits should appear in the Engagement Letter and CIDD.'},
  {kw:['fos','ombudsman','complaint','complaints'], a:'The Financial Ombudsman Service handles complaints not resolved within 8 weeks or where the consumer is not satisfied. Free for eligible complainants. Contact: 0800 023 4567 / www.financial-ombudsman.org.uk. Every regulated document should reference FOS escalation.'},
  {kw:['atr','attitude to risk','capacity for loss','cfl','knowledge'], a:'ATR / CFL / K&E are the three pillars of suitability (COBS 9A.2.4R). ATR measures emotional tolerance for volatility (typical scale 1–7). CFL measures financial ability to absorb a fall without material lifestyle impact. K&E measures product familiarity. All three must be assessed before recommending.'},
  {kw:['cancellation','cooling off','14 days','30 days'], a:'Most retail investment contracts have a 14-day cancellation period; pension contracts typically 30 days. Cancellation does not guarantee return of original capital if unit prices have fallen. Cancellation rights must be disclosed in the Suitability Report and Engagement Letter.'},
];
function t0Answer(q){
  if(!q)return null;
  const Q=q.toLowerCase();
  for(const r of T0_RULES){
    if(r.kw.some(k=>Q.includes(k)))return {text:r.a, source:'T0 · offline keyword router'};
  }
  return null;
}
async function t3Answer(q){
  if(!state.settings.anthropicKey)return {text:'T3 (BYOK) requires an Anthropic API key in Settings. T0 has no match for this question.', source:'T3 · no key'};
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':state.settings.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:600,messages:[{role:'user',content:'You are an assistant inside FallPaper, a sovereign FCA-shaped document generator for UK financial advisers. Answer briefly and accurately. If you are unsure, say so. Question: '+q}]})
    });
    if(!r.ok){const txt=await r.text();return {text:'API error · '+r.status+' · '+txt.slice(0,200), source:'T3 · error'}}
    const j=await r.json();
    return {text:(j.content&&j.content[0]&&j.content[0].text)||'(empty)', source:'T3 · Claude Haiku 4.5'};
  }catch(e){return {text:'Network error: '+e.message, source:'T3 · error'}}
}
async function answerQuestion(q){
  const t0=t0Answer(q);
  if(t0)return t0;
  return await t3Answer(q);
}
// ════════════════════════════════════════════════════════════════
// DEMO SEEDING · Marcus Osei rule (overwrite-me)
// ════════════════════════════════════════════════════════════════
async function maybeSeedDemo(){
  if(state.firm||state.clients.length>0)return;
  const firmId='fm_'+crypto.randomUUID().slice(0,8);
  const adviserId='ad_'+crypto.randomUUID().slice(0,8);
  const clientId='cl_'+crypto.randomUUID().slice(0,8);
  state.firm={
    id:firmId,createdAt:now(),updatedAt:now(),
    name:'DEMO Wealth Ltd · overwrite me',
    tradingName:'DEMO Wealth',
    fcaRefNo:'000000',
    companiesHouseNo:'00000000',
    vatNumber:'',
    registeredAddress:{line1:'1 Example Street',line2:'',city:'London',postcode:'SW1A 1AA',country:'GB'},
    piInsurer:'',piPolicyNo:'',piExpiresAt:null,
    professionalBody:'CISI',
    brandColor:'#8b1a1a',brandLogoDataUri:'',
    setupCompletedAt:now(),
    initialFeeBasis:'1.5% of investable assets',
    minInitialFee:'1,500',
    ongoingFeeBasis:'0.75%'
  };
  await idbPut('firms',state.firm);
  const adviser={
    id:adviserId,firmId,createdAt:now(),updatedAt:now(),archivedAt:null,
    name:'Aleksandra Demo',email:'aleks@demo.example',phone:'020 7000 0000',
    fcaRefNo:'',smcrRole:'SMF22',status:'active',startedAt:now(),leftAt:null
  };
  state.advisers.push(adviser);
  await idbPut('advisers',adviser);
  state.ui.activeAdviserId=adviserId;
  const client={
    id:clientId,firmId,createdAt:now(),updatedAt:now(),archivedAt:null,
    title:'Mr',firstName:'Marcus',middleName:'',lastName:'Osei',preferredName:'Marcus',
    dob:'1981-06-12',gender:'',nationality:'GB',countryOfResidence:'GB',
    nino:'AB123456C',utr:'',taxResidency:['GB'],
    email:'marcus@demo.example',phone:'+44 7700 900000',
    address:{line1:'12 Granary Square',line2:'',city:'London',region:'England',postcode:'N1C 4AA',country:'GB',since:'2019-08-01'},
    addressHistory:[],
    relationships:[],
    kyc:{status:'verified',riskGrade:'low',pepFlag:false,pepDetails:'',sanctionsStatus:'clear',sanctionsCheckedAt:now()-86400000*30,sanctionsCheckedBy:adviserId,sourceOfFunds:'earnings',sourceOfFundsNotes:'',sourceOfWealth:'earnings',sourceOfWealthNotes:'',vulnerableCustomerFlag:false,vulnerabilityCategory:'',vulnerabilityNotes:'',documentsHeld:[],lastReviewAt:now()-86400000*30,nextReviewDue:now()+86400000*335},
    suitability:{attitudeToRisk:4,capacityForLoss:'medium',knowledgeExperience:'medium',investmentHorizon:22,objectives:[
      {priority:1,name:'Retirement at 65',horizon:22,target:600000,notes:'Income £30k pa in today money'},
      {priority:2,name:'Mortgage neutral by 55',horizon:12,target:215000,notes:'Overpay or invest in parallel'}
    ],incomeNeeds:0,ethicalPreferences:'Avoid tobacco and controversial weapons',lastReviewAt:now()-86400000*30},
    adviserId,
    engagement:{startedAt:now()-86400000*60,type:'ongoing',feeBasis:'AUM%',feeAgreementHash:'',feeAgreementSignedAt:now()-86400000*55,initialFee:1500,ongoingFee:0.0075,nextReviewDue:now()+86400000*335},
    notes:[{ts:now()-86400000*30,adviserId,text:'Initial fact-find completed. Recommend balanced multi-asset.'}],
    links:{falladviserScenarios:[],fallpracticeFeeLedgerIds:[],fallpaperDocumentIds:[]}
  };
  state.clients.push(client);
  await idbPut('clients',client);
  state.ui.selectedClientId=clientId;
  // generate the demo suitability report
  const r=renderTemplate('suitability',clientId,null);
  const doc={
    id:'dc_'+crypto.randomUUID().slice(0,8),
    clientId, templateId:'suitability', templateName:'Suitability Report',
    version:'1.0',
    title:'DEMO · Marcus Osei · Suitability Report · overwrite me',
    html:r.html, markdown:r.markdown,
    sha256:await sha256(r.html),
    generatedAt:now(), generatedBy:adviserId,
    signed:false, signedAt:null, signatureHash:'',
    status:'draft'
  };
  state.documents.push(doc);
  await idbPut('documents',doc);
  await audit('demo.seeded',{clientId,adviserId,reasoning:'Initial empty-state demo data — Marcus Osei rule.',payload:{firmId,adviserId,clientId,docId:doc.id}});
  await persistUI();
}
// ════════════════════════════════════════════════════════════════
// VIEW · TAB SHELL + ROUTER
// ════════════════════════════════════════════════════════════════
function renderTabs(){
  const nav=$('#tabNav');
  nav.innerHTML=TABS.map(t=>'<button data-tab="'+t.id+'" class="'+(state.active===t.id?'active':'')+'"><span style="font-family:var(--serif);font-size:14px;color:var(--brass)">'+t.ico+'</span> '+t.name+'</button>').join('');
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.active=b.dataset.tab;persistUI();render();});
  $('#brandName').textContent=state.brandName||'FallPaper';
  $('#tierBadge').textContent=state.settings.anthropicKey?'T3':'T0';
}
function renderDisclaimer(){
  return '<div class="disclaimer"><strong>Disclaimer.</strong> FallPaper produces FCA-shaped templates for UK financial-advisory firms. Templates are guidance, not compliance certification — the firm’s compliance officer remains responsible for accuracy and completeness. <strong>Sovereign · client data never leaves the device.</strong></div>';
}
function render(){
  renderTabs();
  const v=$('#view');
  let html=renderDisclaimer();
  switch(state.active){
    case 'dashboard': html+=viewDashboard();break;
    case 'clients':   html+=viewClients();break;
    case 'generate':  html+=viewGenerate();break;
    case 'library':   html+=viewLibrary();break;
    case 'templates': html+=viewTemplates();break;
    case 'firm':      html+=viewFirm();break;
    case 'audit':     html+=viewAudit();break;
    case 'help':      html+=viewHelp();break;
    default: html+=viewDashboard();
  }
  v.innerHTML=html;
  // post-render bindings
  bindCurrentView();
}
function bindCurrentView(){
  // delegated handlers per view
  $$('[data-action]').forEach(el=>{
    el.onclick=e=>{
      const a=el.dataset.action;
      const handler=ACTIONS[a];
      if(handler)handler(el,e);
    };
  });
  $$('[data-bind-input]').forEach(el=>{
    el.oninput=e=>{
      const a=el.dataset.bindInput;
      const handler=INPUTS[a];
      if(handler)handler(el,e);
    };
  });
  $$('[data-bind-change]').forEach(el=>{
    el.onchange=e=>{
      const a=el.dataset.bindChange;
      const handler=INPUTS[a];
      if(handler)handler(el,e);
    };
  });
}
// ════════════════════════════════════════════════════════════════
// VIEW · DASHBOARD
// ════════════════════════════════════════════════════════════════
function viewDashboard(){
  const docsByTpl={};state.documents.forEach(d=>{docsByTpl[d.templateId]=(docsByTpl[d.templateId]||0)+1});
  const recent=state.documents.slice().sort((a,b)=>b.generatedAt-a.generatedAt).slice(0,8);
  return `
<div class="section-h"><h2>Dashboard</h2><div class="sub">v${VERSION} · prime ${PRIME} · ${state.documents.length} docs · ${state.clients.length} clients</div></div>
<div class="grid">
  <div class="card">
    <h3>Firm <span class="meta">${state.firm?'CONFIGURED':'NOT SET'}</span></h3>
    <div class="kpi"><span class="l">Name</span><span class="v">${esc(state.firm?state.firm.name:'—')}</span></div>
    <div class="kpi"><span class="l">FCA Ref</span><span class="v">${esc(state.firm?state.firm.fcaRefNo||'—':'—')}</span></div>
    <div class="kpi"><span class="l">Advisers</span><span class="v">${state.advisers.length}</span></div>
    <div class="kpi"><span class="l">Clients</span><span class="v brass">${state.clients.length}</span></div>
  </div>
  <div class="card">
    <h3>Document library</h3>
    <div class="kpi"><span class="l">Drafts</span><span class="v">${state.documents.filter(d=>d.status==='draft').length}</span></div>
    <div class="kpi"><span class="l">Issued</span><span class="v amber">${state.documents.filter(d=>d.status==='issued').length}</span></div>
    <div class="kpi"><span class="l">Signed</span><span class="v green">${state.documents.filter(d=>d.status==='signed').length}</span></div>
    <div class="kpi"><span class="l">Templates</span><span class="v">${state.templates.length}</span></div>
  </div>
  <div class="card">
    <h3>Quick start</h3>
    <p style="font-size:12px;color:var(--cream-dim);margin-bottom:9px">Pick a template, pick a client, generate.</p>
    <button class="btn primary" data-action="goto-generate">Generate document →</button>
    <div style="height:6px"></div>
    <button class="btn ghost" data-action="goto-firm">Configure firm</button>
  </div>
  <div class="card">
    <h3>Bundle mesh <span class="meta">fall-client · prime ${PRIME}</span></h3>
    <p style="font-size:12px;color:var(--cream-dim)">Live link to FallAdviser · FallOnboard · FallPractice.</p>
    <button class="btn sm ghost" data-action="resync">Re-sync now</button>
    <button class="btn sm ghost" data-action="request-scenario">Pull FallAdviser scenario</button>
  </div>
</div>
<div class="section-h" style="margin-top:24px"><h2>Recent documents</h2></div>
${recent.length?'<table><thead><tr><th>Generated</th><th>Client</th><th>Template</th><th>Status</th><th></th></tr></thead><tbody>'+
  recent.map(d=>{
    const c=state.clients.find(x=>x.id===d.clientId);
    return '<tr><td>'+dateTime(d.generatedAt)+'</td><td>'+(c?esc(c.firstName+' '+c.lastName):'—')+'</td><td>'+esc(d.templateName)+'</td><td><span class="pill '+d.status+'">'+d.status+'</span></td><td><button class="btn sm ghost" data-action="open-doc" data-id="'+d.id+'">open</button></td></tr>';
  }).join('')+'</tbody></table>':'<div class="empty"><h3>No documents yet</h3><p>The empty state seeded a demo. Go to Library to inspect or Generate to make your own.</p></div>'}
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · CLIENTS (read shared schema · edit local · broadcast)
// ════════════════════════════════════════════════════════════════
function viewClients(){
  const cs=state.clients.filter(c=>!c.archivedAt);
  return `
<div class="section-h"><h2>Clients</h2>
 <div class="actions">
  <button class="btn ghost sm" data-action="resync">re-sync mesh</button>
  <button class="btn primary sm" data-action="client-new">+ new client</button>
 </div>
</div>
${cs.length?cs.map(c=>{
  const adv=state.advisers.find(a=>a.id===c.adviserId);
  const ndocs=state.documents.filter(d=>d.clientId===c.id).length;
  return `<div class="card" style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <h3 style="margin-bottom:4px">${esc(c.title||'')} ${esc(c.firstName||'')} ${esc(c.lastName||'')} <span class="meta">${esc(c.id)}</span></h3>
        <div style="font-size:11px;color:var(--cream-dim);font-family:var(--mono)">${esc(c.email||'—')} · ${esc(c.phone||'—')}</div>
        <div style="font-size:11px;color:var(--cream-muted);margin-top:4px">${esc(c.address?(c.address.line1+', '+c.address.city+', '+c.address.postcode):'')}</div>
        <div style="margin-top:6px">
          <span class="tag ${c.kyc&&c.kyc.status==='verified'?'green':'amber'}">KYC ${esc((c.kyc&&c.kyc.status)||'pending')}</span>
          <span class="tag muted">ATR ${esc((c.suitability&&c.suitability.attitudeToRisk)||'—')}</span>
          <span class="tag muted">CFL ${esc((c.suitability&&c.suitability.capacityForLoss)||'—')}</span>
          ${c.kyc&&c.kyc.vulnerableCustomerFlag?'<span class="tag red">vulnerable</span>':''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">Adviser: ${esc(adv?adv.name:'—')}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--brass);margin-top:3px">${ndocs} document${ndocs===1?'':'s'}</div>
        <div style="margin-top:8px;display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn sm ghost" data-action="client-edit" data-id="${c.id}">edit</button>
          <button class="btn sm" data-action="client-generate" data-id="${c.id}">generate doc →</button>
        </div>
      </div>
    </div>
  </div>`;
}).join(''):'<div class="empty"><h3>No clients in store</h3><p>Open FallOnboard to capture clients, or click + new client to enter one manually.</p></div>'}
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · GENERATE
// ════════════════════════════════════════════════════════════════
function viewGenerate(){
  const cid=state.ui.selectedClientId;
  const tid=state.ui.selectedTemplateId;
  const tpl=state.templates.find(t=>t.id===tid);
  const cs=state.clients.filter(c=>!c.archivedAt);
  let preview='<div class="empty"><h3>Pick a client and template</h3><p>Both are required to render a document.</p></div>';
  let missingChips='';
  if(cid&&tpl){
    const r=renderTemplate(tid,cid,null);
    preview='<div class="paper">'+r.html+'</div>';
    if(r.missing.length){
      missingChips='<div class="req-list">'+r.missing.map(m=>'<span class="req miss">missing: '+esc(m)+'</span>').join('')+'</div>';
    }else{
      missingChips='<div class="req-list"><span class="req ok">all required fields present</span></div>';
    }
  }
  const overrides=(state.ui.sectionOverrides||{})[tid]||{};
  return `
<div class="section-h"><h2>Generate document</h2>
 <div class="actions">
  ${cid&&tpl?'<button class="btn ghost sm" data-action="request-scenario">+ scenario from FallAdviser</button>':''}
  ${cid&&tpl?'<button class="btn primary sm" data-action="commit-doc">commit + save →</button>':''}
 </div>
</div>
<div class="doc-stage">
  <aside class="doc-side">
    <div class="card">
      <h3>1 · Client</h3>
      <select data-bind-change="select-client" style="width:100%">
        <option value="">— select client —</option>
        ${cs.map(c=>'<option value="'+c.id+'"'+(c.id===cid?' selected':'')+'>'+esc(c.firstName+' '+c.lastName)+(c.id===cid?'':'')+'</option>').join('')}
      </select>
      ${cid?'<div style="margin-top:6px;font-size:10px;color:var(--cream-muted);font-family:var(--mono)">'+esc(cid)+'</div>':''}
    </div>
    <div class="card">
      <h3>2 · Template</h3>
      <div class="tpl-list">
        ${state.templates.map(t=>'<div class="tpl-row '+(t.id===tid?'active':'')+'" data-action="select-tpl" data-id="'+t.id+'"><div><div class="nm">'+esc(t.name)+'</div><div class="sub">'+esc(t.cobs||'')+' · '+esc(t.kind)+'</div></div></div>').join('')}
      </div>
    </div>
    ${cid&&tpl?'<div class="card"><h3>3 · Required fields</h3>'+missingChips+'</div>':''}
    ${state.ui.scenarioFromAdviser?'<div class="card"><h3>Scenario · FallAdviser</h3><div style="font-size:11px;color:var(--cream-dim);font-family:var(--mono)">'+esc(JSON.stringify(state.ui.scenarioFromAdviser).slice(0,200))+'…</div><button class="btn sm ghost" style="margin-top:6px" data-action="clear-scenario">clear</button></div>':''}
  </aside>
  <section>
      tpl.sections.map(sec=>{
        const cur=overrides[sec.id]!=null?overrides[sec.id]:sec.body;
        return '<div class="section-edit '+(sec.locked?'locked':'')+'"><div class="hd"><div class="nm">'+esc(sec.heading||'(no heading)')+'</div><div class="tg">'+esc(sec.id)+(sec.locked?' · locked':'')+'</div></div>'+
          (sec.locked?'<div style="font-family:var(--mono);font-size:11px;color:var(--cream-dim);padding:6px 0">Regulatory clause — locked. Edit blocked to protect compliance.</div>':
          '<textarea data-bind-input="edit-section" data-tpl="'+esc(tid)+'" data-sec="'+esc(sec.id)+'" rows="6">'+esc(cur)+'</textarea>')+
          (overrides[sec.id]!=null&&!sec.locked?'<button class="btn sm ghost" style="margin-top:6px" data-action="reset-section" data-tpl="'+esc(tid)+'" data-sec="'+esc(sec.id)+'">reset to default</button>':'')+
        '</div>';
      }).join('')+
      '</div></details>':''}
    ${preview}
    ${cid&&tpl?'<div style="margin-top:14px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost sm" data-action="export-md">↓ markdown</button><button class="btn ghost sm" data-action="export-html">↓ standalone html</button><button class="btn ghost sm" data-action="hand-off-fallpdf">→ FallPDF</button><button class="btn primary" data-action="commit-doc">commit + save</button></div>':''}
  </section>
</div>
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · LIBRARY
// ════════════════════════════════════════════════════════════════
function viewLibrary(){
  const fc=state.ui.libFilterClient||'';
  const ft=state.ui.libFilterTpl||'';
  const fs=state.ui.libFilterStatus||'';
  let docs=state.documents.slice();
  if(fc)docs=docs.filter(d=>d.clientId===fc);
  if(ft)docs=docs.filter(d=>d.templateId===ft);
  if(fs)docs=docs.filter(d=>d.status===fs);
  docs.sort((a,b)=>b.generatedAt-a.generatedAt);
  const opened=state.ui.selectedDocumentId?state.documents.find(d=>d.id===state.ui.selectedDocumentId):null;
  return `
<div class="section-h"><h2>Document library</h2><div class="sub">${state.documents.length} total · ${docs.length} after filter</div></div>
<div class="card" style="margin-bottom:14px">
  <div class="row-3">
    <div class="field"><label>Client</label><select data-bind-change="lib-filter-client"><option value="">all</option>${state.clients.map(c=>'<option value="'+c.id+'"'+(c.id===fc?' selected':'')+'>'+esc(c.firstName+' '+c.lastName)+'</option>').join('')}</select></div>
    <div class="field"><label>Template</label><select data-bind-change="lib-filter-tpl"><option value="">all</option>${state.templates.map(t=>'<option value="'+t.id+'"'+(t.id===ft?' selected':'')+'>'+esc(t.name)+'</option>').join('')}</select></div>
    <div class="field"><label>Status</label><select data-bind-change="lib-filter-status"><option value="">all</option><option value="draft"${fs==='draft'?' selected':''}>draft</option><option value="issued"${fs==='issued'?' selected':''}>issued</option><option value="signed"${fs==='signed'?' selected':''}>signed</option></select></div>
  </div>
</div>
${docs.length?'<table><thead><tr><th>Generated</th><th>Title</th><th>Client</th><th>Template</th><th>Status</th><th>Hash</th><th></th></tr></thead><tbody>'+
  docs.map(d=>{
    const c=state.clients.find(x=>x.id===d.clientId);
    return '<tr><td>'+dateTime(d.generatedAt)+'</td><td>'+esc(d.title||'—')+'</td><td>'+(c?esc(c.firstName+' '+c.lastName):'—')+'</td><td>'+esc(d.templateName)+'</td><td><span class="pill '+d.status+'">'+d.status+'</span></td><td style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">'+(d.sha256||'').slice(0,10)+'…</td><td style="white-space:nowrap"><button class="btn sm ghost" data-action="open-doc" data-id="'+d.id+'">open</button> <button class="btn sm ghost" data-action="del-doc" data-id="'+d.id+'">×</button></td></tr>';
  }).join('')+'</tbody></table>':'<div class="empty"><h3>No documents match these filters</h3><p>Adjust the filters above or go to Generate to create a new document.</p></div>'}
${opened?'<div class="card" style="margin-top:18px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0">'+esc(opened.title||opened.templateName)+'</h3><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn sm ghost" data-action="export-doc-md" data-id="'+opened.id+'">↓ md</button><button class="btn sm ghost" data-action="export-doc-html" data-id="'+opened.id+'">↓ html</button>'+(opened.status==='draft'?'<button class="btn sm" data-action="mark-issued" data-id="'+opened.id+'">mark issued</button>':'')+(opened.status!=='signed'?'<button class="btn sm" data-action="mark-signed" data-id="'+opened.id+'">mark signed</button>':'')+'<button class="btn sm ghost" data-action="close-doc">close</button></div></div><div class="paper">'+opened.html+'</div></div>':''}
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · TEMPLATES (editor — unlocked sections only)
// ════════════════════════════════════════════════════════════════
function viewTemplates(){
  const tid=state.ui.selectedTemplateId;
  const tpl=state.templates.find(t=>t.id===tid)||state.templates[0];
  return `
<div class="section-h"><h2>Template editor</h2><div class="sub">${state.templates.length} templates · regulatory clauses locked</div></div>
<div class="grid-2">
  <div>
    <div class="card">
      <h3>Catalogue</h3>
      <div class="tpl-list">
        ${state.templates.map(t=>'<div class="tpl-row '+(tpl&&t.id===tpl.id?'active':'')+'" data-action="select-tpl-editor" data-id="'+t.id+'"><div><div class="nm">'+esc(t.name)+(t._custom?' <span style="font-family:var(--mono);font-size:9px;color:var(--brass)">CUSTOM</span>':'')+'</div><div class="sub">'+esc(t.cobs||'')+'</div></div></div>').join('')}
      </div>
    </div>
  </div>
  <div>
    ${tpl?'<div class="card"><h3>'+esc(tpl.name)+' <span class="meta">v'+esc(tpl.version)+'</span></h3><p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">'+esc(tpl.description)+'</p><div style="font-size:10px;color:var(--cream-muted);font-family:var(--mono);margin-bottom:14px">'+esc(tpl.cobs||'')+'</div>'+
      tpl.sections.map(sec=>{
        const overrides=(state.ui.sectionOverrides||{})[tpl.id]||{};
        const cur=overrides[sec.id]!=null?overrides[sec.id]:sec.body;
        return '<div class="section-edit '+(sec.locked?'locked':'')+'"><div class="hd"><div class="nm">'+esc(sec.heading||'(no heading)')+'</div><div class="tg">'+esc(sec.id)+(sec.locked?' · locked · regulatory':'')+'</div></div>'+
          (sec.locked?'<pre style="font-family:var(--mono);font-size:11px;color:var(--cream-dim);white-space:pre-wrap;margin:6px 0">'+esc(sec.body)+'</pre>':
          '<textarea data-bind-input="edit-tpl-section" data-tpl="'+esc(tpl.id)+'" data-sec="'+esc(sec.id)+'" rows="6">'+esc(cur)+'</textarea>')+
          (overrides[sec.id]!=null&&!sec.locked?'<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center"><span style="font-family:var(--mono);font-size:10px;color:var(--brass);text-transform:uppercase;letter-spacing:0.08em">edited</span><button class="btn sm ghost" data-action="reset-tpl-section" data-tpl="'+esc(tpl.id)+'" data-sec="'+esc(sec.id)+'">reset</button></div>':'')+
        '</div>';
      }).join('')+
      '<div style="margin-top:14px;display:flex;gap:5px;justify-content:flex-end"><button class="btn primary sm" data-action="save-tpl-overrides" data-tpl="'+esc(tpl.id)+'">save customisations</button></div>'+
    '</div>':''}
  </div>
</div>
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · FIRM (single record per device · broadcast on save)
// ════════════════════════════════════════════════════════════════
function viewFirm(){
  const f=state.firm||{name:'',fcaRefNo:'',tradingName:'',companiesHouseNo:'',vatNumber:'',registeredAddress:{line1:'',line2:'',city:'',postcode:'',country:'GB'},piInsurer:'',piPolicyNo:'',piExpiresAt:null,professionalBody:'',brandColor:'#8b1a1a',initialFeeBasis:'',minInitialFee:'',ongoingFeeBasis:''};
  return `
<div class="section-h"><h2>Firm</h2><div class="actions">${state.firm?'<button class="btn primary sm" data-action="firm-save">save + broadcast</button>':'<button class="btn primary sm" data-action="firm-save">create firm record</button>'}</div></div>
<div class="card">
  <h3>Firm identity</h3>
  <div class="row">
    <div class="field"><label>Legal name</label><input id="f-name" value="${esc(f.name)}"></div>
    <div class="field"><label>Trading name</label><input id="f-trading" value="${esc(f.tradingName)}"></div>
  </div>
  <div class="row">
    <div class="field"><label>FCA reference</label><input id="f-fca" value="${esc(f.fcaRefNo)}"></div>
    <div class="field"><label>Companies House no</label><input id="f-ch" value="${esc(f.companiesHouseNo)}"></div>
  </div>
  <div class="row">
    <div class="field"><label>VAT no</label><input id="f-vat" value="${esc(f.vatNumber)}"></div>
    <div class="field"><label>Professional body</label><input id="f-pro" value="${esc(f.professionalBody)}"></div>
  </div>
</div>
<div class="card" style="margin-top:12px">
  <h3>Registered address</h3>
  <div class="row">
    <div class="field"><label>Line 1</label><input id="f-a1" value="${esc(f.registeredAddress.line1)}"></div>
    <div class="field"><label>Line 2</label><input id="f-a2" value="${esc(f.registeredAddress.line2)}"></div>
  </div>
  <div class="row-3">
    <div class="field"><label>City</label><input id="f-city" value="${esc(f.registeredAddress.city)}"></div>
    <div class="field"><label>Postcode</label><input id="f-pc" value="${esc(f.registeredAddress.postcode)}"></div>
    <div class="field"><label>Country</label><input id="f-cc" value="${esc(f.registeredAddress.country)}"></div>
  </div>
</div>
<div class="card" style="margin-top:12px">
  <h3>PI insurance</h3>
  <div class="row-3">
    <div class="field"><label>Insurer</label><input id="f-pi" value="${esc(f.piInsurer)}"></div>
    <div class="field"><label>Policy no</label><input id="f-pino" value="${esc(f.piPolicyNo)}"></div>
    <div class="field"><label>Expires</label><input id="f-pix" type="date" value="${isoDate(f.piExpiresAt)}"></div>
  </div>
</div>
<div class="card" style="margin-top:12px">
  <h3>Standard fee basis (used by Engagement Letter & CIDD)</h3>
  <div class="row-3">
    <div class="field"><label>Initial fee basis</label><input id="f-ifb" value="${esc(f.initialFeeBasis)}" placeholder="e.g. 1.5% of investable assets"></div>
    <div class="field"><label>Minimum initial fee (£)</label><input id="f-mif" value="${esc(f.minInitialFee)}"></div>
    <div class="field"><label>Ongoing fee basis</label><input id="f-ofb" value="${esc(f.ongoingFeeBasis)}" placeholder="e.g. 0.75% per annum"></div>
  </div>
</div>
<div class="section-h" style="margin-top:24px"><h2>Advisers</h2><div class="actions"><button class="btn primary sm" data-action="adv-new">+ adviser</button></div></div>
${state.advisers.length?state.advisers.map(a=>'<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><div style="font-family:var(--serif);font-size:14px">'+esc(a.name)+' <span class="meta" style="font-family:var(--mono);font-size:10px;color:var(--brass);letter-spacing:0.1em;margin-left:6px">'+esc(a.smcrRole||'')+'</span></div><div style="font-size:11px;color:var(--cream-muted);font-family:var(--mono)">'+esc(a.email||'')+' · '+esc(a.phone||'')+' · '+esc(a.fcaRefNo||'no FCA ref')+'</div></div><div style="display:flex;gap:4px"><button class="btn sm ghost" data-action="adv-active" data-id="'+a.id+'">'+(state.ui.activeAdviserId===a.id?'active':'set active')+'</button><button class="btn sm ghost" data-action="adv-edit" data-id="'+a.id+'">edit</button></div></div></div>').join(''):'<div class="empty"><h3>No advisers</h3><p>Add an adviser before generating documents.</p></div>'}
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · AUDIT
// ════════════════════════════════════════════════════════════════
function viewAudit(){
  const rows=state.audit.slice().reverse().slice(0,500);
  return `
<div class="section-h"><h2>Audit chain</h2><div class="sub">${state.audit.length} entries · P3 · sha-256 chained</div>
 <div class="actions"><button class="btn ghost sm" data-action="audit-export">↓ export JSON</button><button class="btn ghost sm" data-action="audit-verify">verify chain</button></div>
</div>
<div class="card">
  <div style="display:grid;grid-template-columns:90px 110px 1fr 100px;gap:8px;padding:6px 10px;font-family:var(--mono);font-size:10px;color:var(--brass);letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid var(--line)"><div>#</div><div>when</div><div>action / reasoning</div><div>hash</div></div>
  ${rows.length?rows.map(e=>'<div class="audit-row"><div>'+e.i+'</div><div>'+new Date(e.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</div><div><strong style="color:var(--cream)">'+esc(e.action)+'</strong>'+(e.reasoning?' · '+esc(e.reasoning):'')+'</div><div style="color:var(--cream-muted)">'+(e.docHash||'').slice(0,8)+'</div></div>').join(''):'<div class="empty"><p>No audit entries yet.</p></div>'}
</div>
`;
}
// ════════════════════════════════════════════════════════════════
// VIEW · HELP / Q&A (T0 + T3)
// ════════════════════════════════════════════════════════════════
function viewHelp(){
  const chat=state.ui.chat||[];
  return `
<div class="section-h"><h2>Q & A</h2><div class="sub">T0 offline keyword router · T3 BYOK fallback</div></div>
<div class="card">
  <div class="chat" id="chatBox">
    ${chat.length?chat.map(m=>'<div class="msg '+m.role+'">'+esc(m.text)+(m.source?'<div class="src">'+esc(m.source)+'</div>':'')+'</div>').join(''):'<div class="empty"><h3>Ask anything about FCA-shaped docs</h3><p>e.g. <em>"when must a suitability report be issued?"</em>, <em>"what is FSCS limit for investment business?"</em>, <em>"what is FG21/1?"</em></p></div>'}
  </div>
  <div class="chat-input">
    <input id="chatQ" placeholder="ask about regulatory purpose, COBS rules, when to issue…" data-bind-input="chat-q">
    <button class="btn primary" data-action="chat-send">ask</button>
  </div>
  <p style="font-size:11px;color:var(--cream-muted);margin-top:8px;font-family:var(--mono)">T0 rules: ${T0_RULES.length} · T3: ${state.settings.anthropicKey?'configured':'not configured (Settings)'}</p>
</div>
`;
}
// ════════════════════════════════════════════════════════════════
// SETTINGS modal
// ════════════════════════════════════════════════════════════════
function openModal(kind){
  const m=$('#modal');
  if(kind==='settings'){
    $('#modalTitle').textContent='Settings';
    $('#modalBody').innerHTML=`
      <div class="field" style="margin-bottom:10px"><label>Brand name (forkable)</label><input id="s-brand" value="${esc(state.brandName||'')}"></div>
      <div class="field" style="margin-bottom:10px"><label>Anthropic API key (T3 BYOK · never leaves device)</label><input id="s-key" type="password" placeholder="sk-ant-..." value="${esc(state.settings.anthropicKey||'')}"></div>
      <div class="field" style="margin-bottom:10px"><label><input type="checkbox" id="s-audit" ${state.settings.auditChain?'checked':''}> audit chain on every change</label></div>
      <div class="field" style="margin-bottom:10px"><label><input type="checkbox" id="s-broadcast" ${state.settings.autoBroadcast?'checked':''}> broadcast changes on fall-client mesh</label></div>
      <p style="font-size:11px;color:var(--cream-muted);font-family:var(--mono)">${TOOLNAME}@${VERSION} · prime ${PRIME} · schema ${SCHEMA_VERSION}</p>
      <div class="actions"><button class="btn ghost" onclick="closeModal()">cancel</button><button class="btn primary" id="s-save">save</button></div>
    `;
    $('#s-save').onclick=async()=>{
      state.brandName=$('#s-brand').value.trim()||'FallPaper';
      state.settings.anthropicKey=$('#s-key').value.trim();
      state.settings.auditChain=$('#s-audit').checked;
      state.settings.autoBroadcast=$('#s-broadcast').checked;
      await persistUI();
      closeModal();render();toast('settings saved');
    };
  }else if(kind==='client-edit'||kind==='client-new'){
    const c=kind==='client-new'?{title:'Mr',firstName:'',lastName:'',dob:'',nino:'',email:'',phone:'',address:{line1:'',city:'',postcode:'',country:'GB'},kyc:{status:'pending',riskGrade:'low'},suitability:{attitudeToRisk:4,capacityForLoss:'medium',knowledgeExperience:'medium',investmentHorizon:20,objectives:[]},engagement:{type:'ongoing',feeBasis:'AUM%',initialFee:0,ongoingFee:0}}:state.clients.find(x=>x.id===state._editingClientId);
    $('#modalTitle').textContent=kind==='client-new'?'New client':'Edit '+(c.firstName+' '+c.lastName);
    $('#modalBody').innerHTML=`
      <div class="row-3"><div class="field"><label>Title</label><input id="c-title" value="${esc(c.title||'')}"></div><div class="field"><label>First</label><input id="c-first" value="${esc(c.firstName||'')}"></div><div class="field"><label>Last</label><input id="c-last" value="${esc(c.lastName||'')}"></div></div>
      <div class="row"><div class="field"><label>DOB</label><input id="c-dob" type="date" value="${esc(c.dob||'')}"></div><div class="field"><label>NINO</label><input id="c-nino" value="${esc(c.nino||'')}"></div></div>
      <div class="row"><div class="field"><label>Email</label><input id="c-email" value="${esc(c.email||'')}"></div><div class="field"><label>Phone</label><input id="c-phone" value="${esc(c.phone||'')}"></div></div>
      <div class="row"><div class="field"><label>Address line 1</label><input id="c-a1" value="${esc(c.address&&c.address.line1||'')}"></div><div class="field"><label>City</label><input id="c-city" value="${esc(c.address&&c.address.city||'')}"></div></div>
      <div class="row"><div class="field"><label>Postcode</label><input id="c-pc" value="${esc(c.address&&c.address.postcode||'')}"></div><div class="field"><label>Adviser</label><select id="c-adv"><option value="">—</option>${state.advisers.map(a=>'<option value="'+a.id+'"'+(a.id===c.adviserId?' selected':'')+'>'+esc(a.name)+'</option>').join('')}</select></div></div>
      <div class="row-3"><div class="field"><label>ATR (1-7)</label><input id="c-atr" type="number" min="1" max="7" value="${esc((c.suitability&&c.suitability.attitudeToRisk)||4)}"></div><div class="field"><label>Capacity for loss</label><select id="c-cfl"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div><div class="field"><label>K&E</label><select id="c-ke"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></div></div>
      <div class="row"><div class="field"><label>Investment horizon (years)</label><input id="c-horiz" type="number" value="${esc((c.suitability&&c.suitability.investmentHorizon)||20)}"></div><div class="field"><label>KYC status</label><select id="c-kyc"><option value="pending">pending</option><option value="verified">verified</option><option value="review">review</option><option value="failed">failed</option></select></div></div>
      <div class="field" style="margin-bottom:10px"><label><input type="checkbox" id="c-vuln" ${c.kyc&&c.kyc.vulnerableCustomerFlag?'checked':''}> vulnerable customer flag (FG21/1)</label></div>
      <div class="actions"><button class="btn ghost" onclick="closeModal()">cancel</button>${kind==='client-edit'?'<button class="btn danger ghost" id="c-archive">archive</button>':''}<button class="btn primary" id="c-save">save + broadcast</button></div>
    `;
    setTimeout(()=>{
      $('#c-cfl').value=(c.suitability&&c.suitability.capacityForLoss)||'medium';
      $('#c-ke').value=(c.suitability&&c.suitability.knowledgeExperience)||'medium';
      $('#c-kyc').value=(c.kyc&&c.kyc.status)||'pending';
    },10);
    $('#c-save').onclick=async()=>{
      const isNew=kind==='client-new';
      const id=isNew?'cl_'+crypto.randomUUID().slice(0,8):c.id;
      const upd={...(isNew?{}:c),
        id,firmId:state.firm?state.firm.id:'',
        createdAt:c.createdAt||now(),updatedAt:now(),archivedAt:c.archivedAt||null,
        title:$('#c-title').value,firstName:$('#c-first').value,lastName:$('#c-last').value,
        dob:$('#c-dob').value,nino:$('#c-nino').value,email:$('#c-email').value,phone:$('#c-phone').value,
        address:{line1:$('#c-a1').value,line2:'',city:$('#c-city').value,region:'England',postcode:$('#c-pc').value,country:'GB',since:c.address&&c.address.since||''},
        adviserId:$('#c-adv').value||c.adviserId||state.ui.activeAdviserId,
        suitability:{...(c.suitability||{}),attitudeToRisk:+$('#c-atr').value||4,capacityForLoss:$('#c-cfl').value,knowledgeExperience:$('#c-ke').value,investmentHorizon:+$('#c-horiz').value||20,objectives:c.suitability&&c.suitability.objectives||[]},
        kyc:{...(c.kyc||{}),status:$('#c-kyc').value,vulnerableCustomerFlag:$('#c-vuln').checked},
        engagement:c.engagement||{type:'ongoing',feeBasis:'AUM%',initialFee:0,ongoingFee:0},
        relationships:c.relationships||[],
        links:c.links||{falladviserScenarios:[],fallpracticeFeeLedgerIds:[],fallpaperDocumentIds:[]}
      };
      const idx=state.clients.findIndex(x=>x.id===id);
      if(idx>=0)state.clients[idx]=upd;else state.clients.push(upd);
      await idbPut('clients',upd);
      await audit(isNew?'client.created':'client.updated',{clientId:id,reasoning:isNew?'Client added via FallPaper':'Client edited via FallPaper',payload:{id,name:upd.firstName+' '+upd.lastName}});
      await emitClientUpdate(upd);
      closeModal();render();toast(isNew?'client created · broadcast':'client saved · broadcast');
    };
    if(kind==='client-edit'){
      $('#c-archive').onclick=async()=>{
        if(!confirm('Archive (soft-delete, FCA 7-year retention)?'))return;
        c.archivedAt=now();c.updatedAt=now();
        await idbPut('clients',c);
        await audit('client.archived',{clientId:c.id,reasoning:'Soft-archive (retention).',payload:{id:c.id}});
        broadcast(bcClient,'client.archived',c);
        closeModal();render();toast('client archived');
      };
    }
  }else if(kind==='adv-new'||kind==='adv-edit'){
    const a=kind==='adv-new'?{name:'',email:'',phone:'',fcaRefNo:'',smcrRole:'SMF22',status:'active'}:state.advisers.find(x=>x.id===state._editingAdvId);
    $('#modalTitle').textContent=kind==='adv-new'?'New adviser':'Edit '+a.name;
    $('#modalBody').innerHTML=`
      <div class="field" style="margin-bottom:8px"><label>Name</label><input id="a-name" value="${esc(a.name)}"></div>
      <div class="row"><div class="field"><label>Email</label><input id="a-email" value="${esc(a.email)}"></div><div class="field"><label>Phone</label><input id="a-phone" value="${esc(a.phone)}"></div></div>
      <div class="row"><div class="field"><label>FCA ref</label><input id="a-fca" value="${esc(a.fcaRefNo)}"></div><div class="field"><label>SM&CR role</label><input id="a-smcr" value="${esc(a.smcrRole)}"></div></div>
      <div class="actions"><button class="btn ghost" onclick="closeModal()">cancel</button><button class="btn primary" id="a-save">save + broadcast</button></div>
    `;
    $('#a-save').onclick=async()=>{
      const isNew=kind==='adv-new';
      const id=isNew?'ad_'+crypto.randomUUID().slice(0,8):a.id;
      const upd={...(isNew?{}:a),id,firmId:state.firm?state.firm.id:'',createdAt:a.createdAt||now(),updatedAt:now(),archivedAt:a.archivedAt||null,
        name:$('#a-name').value,email:$('#a-email').value,phone:$('#a-phone').value,fcaRefNo:$('#a-fca').value,smcrRole:$('#a-smcr').value,status:'active',startedAt:a.startedAt||now(),leftAt:null};
      const idx=state.advisers.findIndex(x=>x.id===id);
      if(idx>=0)state.advisers[idx]=upd;else state.advisers.push(upd);
      await idbPut('advisers',upd);
      await audit(isNew?'adviser.created':'adviser.updated',{adviserId:id,reasoning:isNew?'Adviser added':'Adviser edited',payload:{name:upd.name}});
      await emitAdviserUpdate(upd);
      closeModal();render();toast(isNew?'adviser created · broadcast':'adviser saved · broadcast');
    };
  }
  m.classList.add('open');
}
function closeModal(){$('#modal').classList.remove('open')}
// ════════════════════════════════════════════════════════════════
// ACTIONS · delegated click handlers
// ════════════════════════════════════════════════════════════════
const ACTIONS={
  'goto-generate':()=>{state.active='generate';persistUI();render()},
  'goto-firm':()=>{state.active='firm';persistUI();render()},
  'goto-library':()=>{state.active='library';persistUI();render()},
  'resync':()=>{if(bcClient){bcClient.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME,payload:{wants:['clients','advisers','firm']}});toast('sync.request sent')}},
  'request-scenario':()=>requestAdviserScenario(),
  'clear-scenario':()=>{state.ui.scenarioFromAdviser=null;persistUI();render()},
  'select-tpl':el=>{state.ui.selectedTemplateId=el.dataset.id;persistUI();render()},
  'select-tpl-editor':el=>{state.ui.selectedTemplateId=el.dataset.id;persistUI();render()},
  'open-doc':el=>{state.ui.selectedDocumentId=el.dataset.id;state.active='library';persistUI();render()},
  'close-doc':()=>{state.ui.selectedDocumentId=null;persistUI();render()},
  'del-doc':async el=>{
    if(!confirm('Delete this document record?'))return;
    const id=el.dataset.id;
    state.documents=state.documents.filter(d=>d.id!==id);
    await idbDel('documents',id);
    await audit('document.deleted',{reasoning:'User deleted document record.',payload:{id}});
    render();toast('deleted');
  },
  'mark-issued':async el=>{
    const id=el.dataset.id;const d=state.documents.find(x=>x.id===id);if(!d)return;
    d.status='issued';d.issuedAt=now();await idbPut('documents',d);
    await audit('document.issued',{clientId:d.clientId,reasoning:'Marked issued to client.',payload:{id}});
    render();toast('marked issued');
  },
  'mark-signed':async el=>{
    const id=el.dataset.id;const d=state.documents.find(x=>x.id===id);if(!d)return;
    d.status='signed';d.signed=true;d.signedAt=now();
    d.signatureHash=await sha256((d.html||'')+'|signed:'+d.signedAt);
    await idbPut('documents',d);
    await audit('document.signed',{clientId:d.clientId,reasoning:'Marked signed.',payload:{id,signatureHash:d.signatureHash}});
    render();toast('marked signed');
  },
  'export-md':()=>{
    const r=renderTemplate(state.ui.selectedTemplateId,state.ui.selectedClientId,null);
    downloadText(r.markdown,(state.ui.selectedTemplateId||'doc')+'-preview.md','text/markdown');
  },
  'export-html':()=>{
    const r=renderTemplate(state.ui.selectedTemplateId,state.ui.selectedClientId,null);
    downloadText(standaloneHtml(r.html),(state.ui.selectedTemplateId||'doc')+'-preview.html','text/html');
  },
  'export-doc-md':el=>{const d=state.documents.find(x=>x.id===el.dataset.id);if(!d)return;downloadText(d.markdown||'',(d.templateId||'doc')+'.md','text/markdown');},
  'export-doc-html':el=>{const d=state.documents.find(x=>x.id===el.dataset.id);if(!d)return;downloadText(standaloneHtml(d.html||''),(d.templateId||'doc')+'.html','text/html');},
  'hand-off-fallpdf':()=>{
    const r=renderTemplate(state.ui.selectedTemplateId,state.ui.selectedClientId,null);
    const filename=(state.ui.selectedTemplateId||'doc')+'-'+(state.ui.selectedClientId||'demo').slice(-6)+'.pdf';
    toast('handed off to FallPDF (if open)');
  },
  'commit-doc':async()=>{
    if(!state.ui.selectedClientId||!state.ui.selectedTemplateId){toast('pick a client and template');return}
    const tpl=state.templates.find(t=>t.id===state.ui.selectedTemplateId);
    const client=state.clients.find(c=>c.id===state.ui.selectedClientId);
    const r=renderTemplate(tpl.id,client.id,null);
    const doc={
      id:'dc_'+crypto.randomUUID().slice(0,8),
      clientId:client.id, templateId:tpl.id, templateName:tpl.name,
      version:tpl.version,
      title:tpl.name+' · '+(client.firstName+' '+client.lastName)+' · '+new Date().toLocaleDateString('en-GB'),
      html:r.html, markdown:r.markdown,
      sha256:await sha256(r.html),
      generatedAt:now(), generatedBy:state.ui.activeAdviserId||client.adviserId||'',
      signed:false, signedAt:null, signatureHash:'',
      status:'draft'
    };
    state.documents.push(doc);
    await idbPut('documents',doc);
    if(client.links){client.links.fallpaperDocumentIds=client.links.fallpaperDocumentIds||[];client.links.fallpaperDocumentIds.push(doc.id);client.updatedAt=now();await idbPut('clients',client);}
    await audit('document.created',{clientId:client.id,reasoning:tpl.name+' generated for '+client.firstName+' '+client.lastName,payload:{id:doc.id,templateId:tpl.id,sha256:doc.sha256}});
    await emitDocCreated(doc);
    toast('committed · '+doc.id);
    state.ui.selectedDocumentId=doc.id;state.active='library';
    await persistUI();render();
  },
  'edit-section':()=>{},
  'reset-section':el=>{
    const tpl=el.dataset.tpl,sec=el.dataset.sec;
    if(state.ui.sectionOverrides[tpl])delete state.ui.sectionOverrides[tpl][sec];
    persistUI();render();
  },
  'edit-tpl-section':()=>{},
  'reset-tpl-section':el=>{
    const tpl=el.dataset.tpl,sec=el.dataset.sec;
    if(state.ui.sectionOverrides[tpl])delete state.ui.sectionOverrides[tpl][sec];
    persistUI();render();toast('section reset');
  },
  'save-tpl-overrides':async el=>{
    const tplId=el.dataset.tpl;
    const overrides=(state.ui.sectionOverrides||{})[tplId]||{};
    const rec={id:tplId,sectionOverrides:overrides,updatedAt:now()};
    await idbPut('templates',rec);
    state.templates=mergeTemplates(await idbGetAll('templates'));
    await audit('template.customised',{reasoning:'Template '+tplId+' customised.',payload:{id:tplId,sectionsChanged:Object.keys(overrides)}});
    toast('template customisations saved');
    render();
  },
  'client-new':()=>{openModal('client-new')},
  'client-edit':el=>{state._editingClientId=el.dataset.id;openModal('client-edit')},
  'client-generate':el=>{state.ui.selectedClientId=el.dataset.id;state.active='generate';persistUI();render()},
  'adv-new':()=>{openModal('adv-new')},
  'adv-edit':el=>{state._editingAdvId=el.dataset.id;openModal('adv-edit')},
  'adv-active':async el=>{state.ui.activeAdviserId=el.dataset.id;await persistUI();render();toast('active adviser set')},
  'firm-save':async()=>{
    const f=state.firm||{id:'fm_'+crypto.randomUUID().slice(0,8),createdAt:now()};
    f.updatedAt=now();
    f.name=$('#f-name').value;f.tradingName=$('#f-trading').value;f.fcaRefNo=$('#f-fca').value;f.companiesHouseNo=$('#f-ch').value;f.vatNumber=$('#f-vat').value;f.professionalBody=$('#f-pro').value;
    f.registeredAddress={line1:$('#f-a1').value,line2:$('#f-a2').value,city:$('#f-city').value,postcode:$('#f-pc').value,country:$('#f-cc').value};
    f.piInsurer=$('#f-pi').value;f.piPolicyNo=$('#f-pino').value;f.piExpiresAt=$('#f-pix').value?new Date($('#f-pix').value).getTime():null;
    f.initialFeeBasis=$('#f-ifb').value;f.minInitialFee=$('#f-mif').value;f.ongoingFeeBasis=$('#f-ofb').value;
    f.setupCompletedAt=f.setupCompletedAt||now();
    state.firm=f;await idbPut('firms',f);
    await audit('firm.updated',{reasoning:'Firm record edited.',payload:{id:f.id,name:f.name}});
    await emitFirmUpdate();
    toast('firm saved · broadcast');render();
  },
  'chat-send':async()=>{
    const i=$('#chatQ');const q=(i.value||'').trim();if(!q)return;
    state.ui.chat=state.ui.chat||[];
    state.ui.chat.push({role:'user',text:q});
    i.value='';render();
    const a=await answerQuestion(q);
    state.ui.chat.push({role:'bot',text:a.text,source:a.source});
    await persistUI();render();
    requestAnimationFrame(()=>{const c=$('#chatBox');if(c)c.scrollTop=c.scrollHeight});
  },
  'audit-export':()=>{downloadText(JSON.stringify(state.audit,null,2),'fallpaper-audit-'+new Date().toISOString().slice(0,10)+'.json','application/json')},
  'audit-verify':async()=>{
    let ok=true;let prevHash='';
    for(const e of state.audit){
      if((e.prevHash||'')!==prevHash){ok=false;break}
      prevHash=e.docHash;
    }
    toast(ok?'chain intact · '+state.audit.length+' entries':'CHAIN BROKEN');
  }
};
const INPUTS={
  'select-client':el=>{state.ui.selectedClientId=el.value;persistUI();render()},
  'edit-section':el=>{
    const tpl=el.dataset.tpl,sec=el.dataset.sec;
    state.ui.sectionOverrides[tpl]=state.ui.sectionOverrides[tpl]||{};
    state.ui.sectionOverrides[tpl][sec]=el.value;
    // re-render the preview without re-rendering whole view (debounced)
    clearTimeout(window._sectEdit);
    window._sectEdit=setTimeout(()=>{render()},400);
  },
  'edit-tpl-section':el=>{
    const tpl=el.dataset.tpl,sec=el.dataset.sec;
    state.ui.sectionOverrides[tpl]=state.ui.sectionOverrides[tpl]||{};
    state.ui.sectionOverrides[tpl][sec]=el.value;
  },
  'lib-filter-client':el=>{state.ui.libFilterClient=el.value;persistUI();render()},
  'lib-filter-tpl':el=>{state.ui.libFilterTpl=el.value;persistUI();render()},
  'lib-filter-status':el=>{state.ui.libFilterStatus=el.value;persistUI();render()},
  'chat-q':()=>{},
};
// ════════════════════════════════════════════════════════════════
// EXPORT helpers
// ════════════════════════════════════════════════════════════════
function downloadText(text,filename,mime){
  const blob=new Blob([text],{type:mime||'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},100);
}
function standaloneHtml(inner){
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>FallPaper document</title>
<style>
body{background:#f3eee2;color:#1a1611;font-family:'Libre Baskerville',Georgia,serif;font-size:13px;line-height:1.7;padding:40px;max-width:820px;margin:0 auto}
h1{font-size:22px;text-align:center;margin-bottom:6px}
h2{font-size:16px;margin:22px 0 8px;border-bottom:1px solid #cfc7b3;padding-bottom:4px;color:#3a1e10}
h3{font-size:14px;margin:16px 0 6px;font-style:italic}
p{margin:8px 0;text-align:justify}ul,ol{margin:8px 0 8px 22px}li{margin:3px 0}
.doc-meta{text-align:center;font-size:11px;color:#6a5a40;font-family:monospace;margin-bottom:18px;letter-spacing:0.08em}
.sig-block{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:30px;font-size:12px}
.sig-line{border-bottom:1px solid #1a1611;min-height:38px;margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-family:sans-serif;font-size:12px}
th,td{border:1px solid #cfc7b3;padding:6px 9px}
th{background:#e6dec6;color:#3a1e10;text-align:left}
.clause-locked{background:#efe7d2;border-left:3px solid #8b1a1a;padding:8px 12px;margin:8px 0;font-size:12px;font-style:italic}
.placeholder-empty{background:#ffe9b3;color:#8b1a1a;padding:0 4px;border-radius:2px;font-weight:700}
hr{border:none;border-top:1px solid #cfc7b3;margin:14px 0}
</style></head><body>${inner}</body></html>`;
}
// ════════════════════════════════════════════════════════════════
// KONOMI shim (sovereign tier · inert)
// ════════════════════════════════════════════════════════════════
// Globally exposed for debugging + the verify protocol
// ════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════
(async function init(){
  try{
    await openDB();
    await loadAll();
    await maybeSeedDemo();
    await loadAll();
    await initMesh();
    render();
    setTimeout(()=>{if(bcClient)bcClient.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME,payload:{wants:['clients','advisers','firm']}});},500);
  }catch(e){
    console.error(e);
  }
})();

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { VERSION };
