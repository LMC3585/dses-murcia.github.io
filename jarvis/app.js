/* Jarvis: mobile control surface for Home Assistant.
 * No build step. Talks to Home Assistant's REST API directly from the phone.
 * Docs: https://developers.home-assistant.io/docs/api/rest/
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const SETTINGS_KEY = 'jarvis.settings.v1';
  const FAV_KEY = 'jarvis.favorites.v1';
  const POLL_MS = 5000;
  const DEFAULTS = { name: 'Jarvis', url: '', token: '', agentId: '', language: 'en', speak: true };

  // Domains shown on the Devices tab, in display order.
  const DOMAINS = {
    light: 'Lights', switch: 'Switches', fan: 'Fans', cover: 'Covers & doors', lock: 'Locks',
    climate: 'Climate', media_player: 'Media', scene: 'Scenes', script: 'Scripts',
    automation: 'Automations', input_boolean: 'Toggles', sensor: 'Sensors', binary_sensor: 'Binary sensors',
  };
  const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation']);

  const state = {
    settings: load(SETTINGS_KEY, DEFAULTS),
    favorites: new Set(load(FAV_KEY, [])),
    entities: [],
    demo: true,
    online: false,
    conversationId: null,
    pollTimer: null,
    view: 'devices',
    query: '',
  };

  // ---------- storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...structuredClone(fallback), ...JSON.parse(raw) } : structuredClone(fallback);
    } catch { return structuredClone(fallback); }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  }

  // ---------- Home Assistant client ----------
  function baseUrl() { return state.settings.url.replace(/\/+$/, ''); }

  async function ha(path, { method = 'GET', body } = {}) {
    const res = await fetch(baseUrl() + path, {
      method,
      headers: { Authorization: `Bearer ${state.settings.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) throw new Error('Unauthorized: check the access token.');
    if (!res.ok) throw new Error(`Home Assistant returned HTTP ${res.status}.`);
    return res.json();
  }

  function explain(err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return 'Home Assistant did not answer within 15 seconds. Is the URL reachable from this phone?';
    }
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
      return 'Could not reach Home Assistant. Check the URL uses HTTPS, and that this site is listed in http.cors_allowed_origins.';
    }
    return err.message || String(err);
  }

  async function fetchStates() {
    if (state.demo) return demoStates();
    const all = await ha('/api/states');
    return all.filter((e) => DOMAINS[e.entity_id.split('.')[0]]);
  }

  async function callService(domain, service, data) {
    if (state.demo) return demoService(domain, service, data);
    await ha(`/api/services/${domain}/${service}`, { method: 'POST', body: data });
  }

  async function converse(text) {
    if (state.demo) return demoConverse(text);
    const body = { text, language: state.settings.language || 'en' };
    if (state.conversationId) body.conversation_id = state.conversationId;
    if (state.settings.agentId) body.agent_id = state.settings.agentId;
    const r = await ha('/api/conversation/process', { method: 'POST', body });
    state.conversationId = r.conversation_id || state.conversationId;
    return r.response?.speech?.plain?.speech || '(no reply)';
  }

  // ---------- demo mode (works before any hub exists) ----------
  const DEMO = [
    ent('light.living_room', 'Living room light', 'on', { brightness: 180, supported_color_modes: ['brightness'] }),
    ent('light.bedroom', 'Bedroom light', 'off', { brightness: 0, supported_color_modes: ['brightness'] }),
    ent('switch.desk_fan', 'Desk fan', 'off'),
    ent('switch.coffee_maker', 'Coffee maker', 'off'),
    ent('cover.garage_door', 'Garage door', 'closed'),
    ent('lock.front_door', 'Front door', 'locked'),
    ent('climate.aircon', 'Aircon', 'cool', { current_temperature: 29, temperature: 24, min_temp: 16, max_temp: 30 }),
    ent('media_player.tv', 'Living room TV', 'playing', { volume_level: 0.4, media_title: 'Iron Man' }),
    ent('scene.movie_night', 'Movie night', 'scening'),
    ent('script.good_morning', 'Good morning routine', 'off'),
    ent('sensor.outdoor_temp', 'Outdoor temperature', '31', { unit_of_measurement: '°C' }),
    ent('binary_sensor.motion_hall', 'Hallway motion', 'off', { device_class: 'motion' }),
  ];
  function ent(entity_id, friendly_name, st, attrs = {}) {
    return { entity_id, state: st, attributes: { friendly_name, ...attrs } };
  }
  function demoStates() { return structuredClone(DEMO); }
  function demoService(domain, service, data) {
    const e = DEMO.find((x) => x.entity_id === data.entity_id);
    if (!e) return;
    const on = (v) => { e.state = v ? 'on' : 'off'; };
    if (service === 'toggle') { on(e.state !== 'on'); if (e.state === 'on' && !e.attributes.brightness && 'brightness' in e.attributes) e.attributes.brightness = 255; }
    else if (service === 'turn_on') { on(true); if (data.brightness_pct != null) e.attributes.brightness = Math.round(data.brightness_pct * 2.55); }
    else if (service === 'turn_off') on(false);
    else if (service === 'open_cover') e.state = 'open';
    else if (service === 'close_cover') e.state = 'closed';
    else if (service === 'lock') e.state = 'locked';
    else if (service === 'unlock') e.state = 'unlocked';
    else if (service === 'set_temperature') e.attributes.temperature = data.temperature;
    else if (service === 'media_play_pause') e.state = e.state === 'playing' ? 'paused' : 'playing';
    else if (service === 'volume_set') e.attributes.volume_level = data.volume_level;
  }
  function demoConverse(text) {
    const t = text.toLowerCase();
    const find = () => DEMO.find((e) => t.includes(e.attributes.friendly_name.toLowerCase().split(' ')[0]) && t.includes(e.attributes.friendly_name.toLowerCase()));
    const loose = () => DEMO.find((e) => e.attributes.friendly_name.toLowerCase().split(' ').some((w) => w.length > 3 && t.includes(w)));
    const target = find() || loose();
    const m = t.match(/\b(turn on|turn off|switch on|switch off|open|close|lock|unlock|play|pause)\b/);
    if (m && target) {
      const verb = m[1];
      const map = { 'turn on': 'turn_on', 'switch on': 'turn_on', 'turn off': 'turn_off', 'switch off': 'turn_off', open: 'open_cover', close: 'close_cover', lock: 'lock', unlock: 'unlock', play: 'media_play_pause', pause: 'media_play_pause' };
      demoService(target.entity_id.split('.')[0], map[verb], { entity_id: target.entity_id });
      return `Done. ${target.attributes.friendly_name} is now ${target.state}. (demo)`;
    }
    if (/status|what.*(on|running)|report/.test(t)) {
      const on = DEMO.filter((e) => ['on', 'open', 'unlocked', 'playing'].includes(e.state)).map((e) => e.attributes.friendly_name);
      return on.length ? `Currently active: ${on.join(', ')}. (demo)` : 'Everything is off. (demo)';
    }
    return `Demo mode: I can only handle simple commands like "turn on the bedroom light". Connect Home Assistant and Claude in Settings for real conversations.`;
  }

  // ---------- rendering ----------
  const els = {
    name: $('#app-name'), pill: $('#status-pill'), banner: $('#banner'), list: $('#device-list'), empty: $('#devices-empty'),
    search: $('#search'), messages: $('#messages'), chatForm: $('#chat-form'), chatInput: $('#chat-input'),
    mic: $('#btn-mic'), micHint: $('#mic-hint'), settingsForm: $('#settings-form'), testResult: $('#test-result'), toast: $('#toast'),
  };

  function setStatus() {
    els.name.textContent = state.settings.name || 'Jarvis';
    els.pill.className = 'pill ' + (state.demo ? 'pill-demo' : state.online ? 'pill-online' : 'pill-offline');
    els.pill.textContent = state.demo ? 'Demo mode' : state.online ? 'Online' : 'Offline';
    els.banner.hidden = !state.demo;
    els.banner.textContent = 'Demo mode: these are sample devices. Add your Home Assistant URL and token in Settings to control real ones.';
  }

  function friendly(e) { return e.attributes.friendly_name || e.entity_id; }
  function isOn(e) { return ['on', 'open', 'unlocked', 'playing', 'heat', 'cool', 'heat_cool', 'auto'].includes(e.state); }

  function renderDevices() {
    const q = state.query.trim().toLowerCase();
    const visible = state.entities.filter((e) => !q || friendly(e).toLowerCase().includes(q) || e.entity_id.includes(q));
    els.empty.hidden = visible.length > 0;
    const groups = new Map();
    const favs = visible.filter((e) => state.favorites.has(e.entity_id));
    if (favs.length) groups.set('Favorites', favs);
    for (const domain of Object.keys(DOMAINS)) {
      const items = visible.filter((e) => e.entity_id.startsWith(domain + '.'));
      if (items.length) groups.set(DOMAINS[domain], items.sort((a, b) => friendly(a).localeCompare(friendly(b))));
    }
    const frag = document.createDocumentFragment();
    for (const [title, items] of groups) {
      const h = document.createElement('div'); h.className = 'group-title'; h.textContent = title; frag.appendChild(h);
      for (const e of items) frag.appendChild(card(e));
    }
    els.list.replaceChildren(frag);
  }

  function card(e) {
    const domain = e.entity_id.split('.')[0];
    const c = document.createElement('div');
    c.className = 'card' + (isOn(e) ? ' on' : '');
    c.dataset.id = e.entity_id;

    const name = el('div', 'name');
    const star = el('button', 'star' + (state.favorites.has(e.entity_id) ? ' active' : ''), '★');
    star.title = 'Favorite';
    star.onclick = () => { toggleFav(e.entity_id); };
    name.append(star, document.createTextNode(friendly(e)));

    const st = el('div', 'state', stateText(e));
    const controls = el('div', 'controls');
    const left = el('div'); left.append(name, st);
    c.append(left, controls);

    const svc = (service, data = {}) => act(domain, service, { entity_id: e.entity_id, ...data });

    if (TOGGLE_DOMAINS.has(domain)) {
      const t = el('button', 'toggle' + (e.state === 'on' ? ' on' : ''));
      t.setAttribute('aria-label', 'Toggle ' + friendly(e));
      t.onclick = () => svc('toggle');
      controls.append(t);
      const modes = e.attributes.supported_color_modes || [];
      if (domain === 'light' && modes.some((m) => m !== 'onoff')) {
        const r = el('input', 'wide'); r.type = 'range'; r.min = 1; r.max = 100;
        r.value = Math.round((e.attributes.brightness || 0) / 2.55) || 1;
        r.onchange = () => svc('turn_on', { brightness_pct: Number(r.value) });
        c.append(r);
      }
    } else if (domain === 'cover') {
      controls.append(btn('Open', () => svc('open_cover')), btn('Stop', () => svc('stop_cover')), btn('Close', () => svc('close_cover')));
    } else if (domain === 'lock') {
      controls.append(e.state === 'locked' ? btn('Unlock', () => svc('unlock'), true) : btn('Lock', () => svc('lock'), true));
    } else if (domain === 'climate') {
      const target = Number(e.attributes.temperature ?? 24);
      const step = Number(e.attributes.target_temp_step || 1);
      controls.append(
        btn('−', () => svc('set_temperature', { temperature: target - step })),
        el('span', '', `${target}°`),
        btn('+', () => svc('set_temperature', { temperature: target + step })),
      );
    } else if (domain === 'media_player') {
      controls.append(btn(e.state === 'playing' ? 'Pause' : 'Play', () => svc('media_play_pause'), true));
      if (e.attributes.volume_level != null) {
        const r = el('input', 'wide'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(e.attributes.volume_level * 100);
        r.onchange = () => svc('volume_set', { volume_level: Number(r.value) / 100 });
        c.append(r);
      }
    } else if (domain === 'scene') {
      controls.append(btn('Activate', () => svc('turn_on'), true));
    } else if (domain === 'script') {
      controls.append(btn('Run', () => svc('turn_on'), true));
    }
    return c;
  }

  function stateText(e) {
    const unit = e.attributes.unit_of_measurement ? ' ' + e.attributes.unit_of_measurement : '';
    if (e.entity_id.startsWith('climate.')) return `${e.state}, now ${e.attributes.current_temperature ?? '?'}°`;
    if (e.entity_id.startsWith('media_player.') && e.attributes.media_title) return `${e.state}: ${e.attributes.media_title}`;
    if (e.entity_id.startsWith('scene.')) return 'scene';
    return e.state + unit;
  }

  function el(tag, cls = '', text) {
    const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n;
  }
  function btn(label, onClick, accent = false) {
    const b = el('button', 'btn' + (accent ? ' accent' : ''), label); b.type = 'button'; b.onclick = onClick; return b;
  }

  async function act(domain, service, data) {
    try {
      await callService(domain, service, data);
      await refresh();
    } catch (err) { toast(explain(err), true); }
  }

  function toggleFav(id) {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    save(FAV_KEY, [...state.favorites]);
    renderDevices();
  }

  async function refresh() {
    try {
      state.entities = await fetchStates();
      state.online = true;
    } catch (err) {
      state.online = false;
      if (!state.demo) toast(explain(err), true);
    }
    setStatus();
    renderDevices();
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && state.view === 'devices' && !state.demo) refresh();
    }, POLL_MS);
  }
  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }

  // ---------- chat & voice ----------
  function addMessage(text, who, isError = false) {
    const m = el('div', `msg ${who}${isError ? ' error' : ''}`, text);
    els.messages.append(m);
    m.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  async function send(text) {
    text = text.trim();
    if (!text) return;
    addMessage(text, 'user');
    els.chatInput.value = '';
    try {
      const reply = await converse(text);
      addMessage(reply, 'bot');
      speak(reply);
      if (state.view === 'devices') refresh();
    } catch (err) {
      addMessage(explain(err), 'bot', true);
    }
  }

  function speak(text) {
    if (!state.settings.speak || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\(demo\)/g, ''));
      u.lang = state.settings.language || 'en';
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  function setupVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { els.mic.hidden = true; els.micHint.hidden = false; return; }
    const rec = new SR();
    rec.lang = state.settings.language || 'en';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let listening = false;
    rec.onresult = (ev) => { const t = ev.results[0][0].transcript; els.chatInput.value = t; send(t); };
    rec.onerror = (ev) => { if (ev.error !== 'aborted') toast('Voice error: ' + ev.error, true); };
    rec.onend = () => { listening = false; els.mic.classList.remove('listening'); };
    els.mic.onclick = () => {
      if (listening) { rec.stop(); return; }
      speechSynthesis?.cancel?.();
      try { rec.start(); listening = true; els.mic.classList.add('listening'); }
      catch (err) { toast('Could not start microphone: ' + err.message, true); }
    };
  }

  // ---------- settings ----------
  function fillSettings() {
    const f = els.settingsForm;
    for (const [k, v] of Object.entries(state.settings)) {
      const input = f.elements[k]; if (!input) continue;
      if (input.type === 'checkbox') input.checked = Boolean(v); else input.value = v ?? '';
    }
  }
  function readSettings() {
    const f = els.settingsForm;
    const next = { ...state.settings };
    for (const k of Object.keys(DEFAULTS)) {
      const input = f.elements[k]; if (!input) continue;
      next[k] = input.type === 'checkbox' ? input.checked : input.value.trim();
    }
    return next;
  }

  async function testConnection(s) {
    if (!s.url || !s.token) throw new Error('Enter both the URL and the token.');
    if (!/^https:\/\//i.test(s.url) && !/^http:\/\/(localhost|127\.|192\.168\.|10\.)/.test(s.url)) {
      throw new Error('This site runs on HTTPS, so the browser will block a plain http:// Home Assistant URL. Use Home Assistant Cloud or Tailscale HTTPS.');
    }
    const prev = state.settings; state.settings = s; state.demo = false;
    try {
      const cfg = await ha('/api/config');
      return `Connected to "${cfg.location_name}" running Home Assistant ${cfg.version}.`;
    } finally { state.settings = prev; state.demo = !prev.url; }
  }

  // ---------- navigation ----------
  function show(view) {
    state.view = view;
    for (const v of $$('.view')) v.hidden = v.id !== `view-${view}`;
    for (const b of $$('.tabbar button')) b.classList.toggle('active', b.dataset.view === view);
    if (view === 'devices') refresh();
    if (view === 'chat') els.chatInput.focus();
  }

  function toast(text, isError = false) {
    els.toast.textContent = text;
    els.toast.className = 'toast' + (isError ? ' error' : '');
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { els.toast.hidden = true; }, 4000);
  }

  // ---------- boot ----------
  function boot() {
    state.demo = !state.settings.url;
    setStatus();
    fillSettings();
    setupVoice();

    $$('.tabbar button').forEach((b) => { b.onclick = () => show(b.dataset.view); });
    $('#btn-refresh').onclick = refresh;
    els.search.oninput = () => { state.query = els.search.value; renderDevices(); };
    els.chatForm.onsubmit = (ev) => { ev.preventDefault(); send(els.chatInput.value); };

    els.settingsForm.onsubmit = (ev) => {
      ev.preventDefault();
      state.settings = readSettings();
      save(SETTINGS_KEY, state.settings);
      state.demo = !state.settings.url;
      state.conversationId = null;
      toast('Saved.');
      setStatus();
      show('devices');
    };
    $('#btn-test').onclick = async () => {
      els.testResult.textContent = 'Testing…';
      try { els.testResult.textContent = await testConnection(readSettings()); }
      catch (err) { els.testResult.textContent = explain(err); }
    };
    $('#btn-reset').onclick = () => {
      if (!confirm('Remove the saved URL, token and favorites from this phone?')) return;
      localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(FAV_KEY);
      location.reload();
    };

    addMessage(`${state.settings.name || 'Jarvis'} online. Tap the mic or type a command.`, 'bot');
    refresh();
    startPolling();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  boot();
})();
