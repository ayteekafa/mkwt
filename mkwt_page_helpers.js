(function(){
  const MKWT = window.MKWT = window.MKWT || {};
  MKWT.$ = function(id){ return document.getElementById(id); };
  MKWT.text = function(elOrId, value){
    const el = typeof elOrId === 'string' ? MKWT.$(elOrId) : elOrId;
    if (el) el.textContent = value == null ? '' : String(value);
    return el;
  };
  let toastHideTimer = null;
  let toastExitTimer = null;
  function getToastEl(){
    let el = MKWT.$('mkwtToast');
    if (el) return el;
    if (!document.body) return null;
    el = document.createElement('div');
    el.id = 'mkwtToast';
    el.className = 'mkwtToast hidden';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }
  function clearStatusTarget(el){
    if (!el) return;
    el.textContent = '';
    el.className = Array.from(el.classList).filter(c => c !== 'ok' && c !== 'bad').join(' ') || 'muted';
    el.classList.add('hidden');
    el.hidden = true;
  }
  MKWT.showToast = function(message, ok=true, options={}){
    const text = String(message || '').trim();
    const el = getToastEl();
    if (toastHideTimer){
      clearTimeout(toastHideTimer);
      toastHideTimer = null;
    }
    if (toastExitTimer){
      clearTimeout(toastExitTimer);
      toastExitTimer = null;
    }
    if (!el) return null;
    if (!text){
      el.classList.remove('is-visible');
      el.textContent = '';
      el.className = 'mkwtToast hidden';
      el.hidden = true;
      return el;
    }
    const isOk = ok !== false;
    const autoHide = options.autoHide !== false;
    const timeout = Number.isFinite(Number(options.timeout)) ? Math.max(800, Number(options.timeout)) : 2000;
    el.hidden = false;
    el.textContent = text;
    el.className = 'mkwtToast ' + (isOk ? 'ok' : 'bad');
    el.setAttribute('role', isOk ? 'status' : 'alert');
    el.setAttribute('aria-live', isOk ? 'polite' : 'assertive');
    requestAnimationFrame(() => {
      if (el.textContent === text) el.classList.add('is-visible');
    });
    if (autoHide){
      toastHideTimer = setTimeout(() => {
        if (el.textContent !== text) return;
        el.classList.remove('is-visible');
        toastHideTimer = null;
        toastExitTimer = setTimeout(() => {
          if (el.textContent !== text) return;
          el.textContent = '';
          el.className = 'mkwtToast hidden';
          el.hidden = true;
          toastExitTimer = null;
        }, 220);
      }, timeout);
    }
    return el;
  };
  MKWT.setStatus = function(targets, msg, ok){
    const text = String(msg || '').trim();
    const arr = Array.isArray(targets) ? targets : [targets];
    arr.forEach((target)=>{
      const el = typeof target === 'string' ? MKWT.$(target) : target;
      clearStatusTarget(el);
    });
    MKWT.showToast(text, ok !== false);
  };
  MKWT.setDebug = function(target, msg){
    const el = typeof target === 'string' ? MKWT.$(target) : target;
    if (el) el.textContent = msg || '';
  };

  MKWT.storageKeys = Object.freeze({
    theme: 'mkwt_theme',
    minVrFilter: 'mkwt_min_vr_filter',
    guestProfile: 'mkwt_guest_profile_v1',
    guestMatches: 'mkwt_guest_matches_v1',
    lastMode: 'mkwt_last_mode',
    mode: 'mkwt_mode',
    lastPage: 'mkwt_last_page'
  });
  MKWT.readStorage = function(key, fallback=''){
    try{
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    }catch(e){ return fallback; }
  };
  MKWT.writeStorage = function(key, value){
    try{ localStorage.setItem(key, String(value)); return true; }catch(e){ return false; }
  };
  MKWT.readStorageInt = function(key, fallback=0){
    try{
      const value = parseInt(localStorage.getItem(key) || String(fallback), 10);
      return Number.isFinite(value) ? value : fallback;
    }catch(e){ return fallback; }
  };
  MKWT.getMinVrFilter = function(){
    try{
      const v = parseInt(localStorage.getItem('mkwt_min_vr_filter') || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    }catch(e){ return 0; }
  };
  MKWT.passesMinVrFilter = function(match, minVr){
    try{
      const min = Number(minVr || 0);
      if (!min || min <= 0) return true;
      const after = Number(match?.vr_after);
      const delta = Number(match?.vr_change || 0);
      if (!Number.isFinite(after)) return true;
      const before = after - (Number.isFinite(delta) ? delta : 0);
      if (Number.isFinite(before) && before < min) return false;
      if (after < min) return false;
      return true;
    }catch(e){ return true; }
  };
  const GUEST_PROFILE_KEY = MKWT.storageKeys.guestProfile;
  MKWT.loadGuestProfile = function(){
    try{
      const raw = localStorage.getItem(GUEST_PROFILE_KEY);
      if(!raw) return { id:'guest', nickname:'Guest', current_vr:0, created_at:null };
      const obj = JSON.parse(raw);
      if(!obj || typeof obj !== 'object') return { id:'guest', nickname:'Guest', current_vr:0, created_at:null };
      const nickname = String(obj.nickname || '').trim() || 'Guest';
      const current_vr = Number(obj.current_vr);
      return { id:'guest', nickname, current_vr: Number.isFinite(current_vr) ? current_vr : 0, created_at: obj.created_at || null };
    }catch(e){ return { id:'guest', nickname:'Guest', current_vr:0, created_at:null }; }
  };
  MKWT.saveGuestProfile = function(profile){
    try{
      const payload = { nickname: String(profile?.nickname || '').trim() || 'Guest', current_vr: Number(profile?.current_vr) || 0, created_at: profile?.created_at || new Date().toISOString() };
      localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(payload));
    }catch(e){ /* safe to ignore */ }
  };
  MKWT.setTopInfo = function(map){ Object.entries(map || {}).forEach(([id, value])=>{ if (value != null) MKWT.text(id, value); }); };
  MKWT.bindInfoOverlay = function(options){
    const cfg = Object.assign({ overlayId:'infoOverlay', titleId:'infoTitle', bodyId:'infoBody', closeId:'infoClose', triggerSelector:'.mcard__infoBtn[data-info]', titleFallback:'Info', texts:{} }, options || {});
    let overlayHome = null;
    function getText(key){ return cfg.texts?.[key] || { title: cfg.titleFallback, body: '' }; }
    function placeOverlayForTrigger(overlay, trigger){
      if(!overlay) return;
      if(!overlayHome) overlayHome = { parent: overlay.parentNode, next: overlay.nextSibling };
      const hostDialog = trigger?.closest?.('dialog[open]');
      if(hostDialog && overlay.parentNode !== hostDialog) {
        hostDialog.appendChild(overlay);
        hostDialog.addEventListener('close', closeInfo, { once:true });
      }
      else if(!hostDialog && overlayHome.parent && overlay.parentNode !== overlayHome.parent) overlayHome.parent.insertBefore(overlay, overlayHome.next);
    }
    function restoreOverlayHome(overlay){
      if(!overlay || !overlayHome?.parent || overlay.parentNode === overlayHome.parent) return;
      overlayHome.parent.insertBefore(overlay, overlayHome.next);
    }
    function openInfo(key, trigger){
      const overlay = MKWT.$(cfg.overlayId), title = MKWT.$(cfg.titleId), body = MKWT.$(cfg.bodyId), info = getText(key);
      placeOverlayForTrigger(overlay, trigger);
      if (title) title.textContent = info.title || cfg.titleFallback;
      if (body){
        if (info.bodyHtml) body.innerHTML = String(info.bodyHtml);
        else body.textContent = info.body || '';
      }
      if (overlay){ overlay.hidden = false; overlay.style.display = 'flex'; }
    }
    function closeInfo(){ const overlay = MKWT.$(cfg.overlayId); if (overlay){ overlay.hidden = true; overlay.style.display = 'none'; restoreOverlayHome(overlay); } }
    function bindInfoTargets(){
      MKWT.$(cfg.closeId)?.addEventListener('click', closeInfo);
      document.querySelectorAll(cfg.triggerSelector).forEach((btn)=>{
        btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); openInfo(btn.dataset.info || btn.dataset.chart || '', btn); });
      });
      MKWT.$(cfg.overlayId)?.addEventListener('click', (e)=>{ if (e.target === MKWT.$(cfg.overlayId)) closeInfo(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindInfoTargets, { once: true });
    else bindInfoTargets();
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeInfo(); });
    return { openInfo, closeInfo };
  };
  MKWT.setActiveButton = function(btn){
    try{
      if(!btn) return;
      const group = btn.closest('[data-btn-group]') || btn.closest('.chartBtns') || btn.parentElement;
      if(group){ group.querySelectorAll('button').forEach(b=>b.classList.remove('active')); }
      btn.classList.add('active');
    }catch(e){ /* safe to ignore */ }
  };
  MKWT.setActiveById = function(id){ const btn = MKWT.$(id); if (btn) MKWT.setActiveButton(btn); };
})();
