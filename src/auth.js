/* Client-side display routing only. This does not secure the embedded dataset. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const STORAGE_KEY = 'jiali-dashboard-access-session';
  let config, account = null, expiresAt = 0, callback = () => {}, initialized = false;
  let operation = 0, expirationTimer = null, cooldownTimer = null, failedAttempts = 0, cooldownUntil = 0;
  const publicAccount = a => Object.freeze({id:a.id,label:a.label,role:a.role,...(a.owner?{owner:a.owner}:{})});
  const removeSession = () => { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} };
  function error(message) { byId('loginError').textContent = message; }
  function resetPassword() {
    byId('loginPassword').value = '';
    byId('loginPassword').type = 'password';
    byId('toggleLoginPassword').textContent = '显示';
    byId('toggleLoginPassword').setAttribute('aria-pressed','false');
  }
  function setBusy(busy) {
    byId('loginForm').setAttribute('aria-busy',String(busy));
    byId('loginSubmit').disabled = busy || cooldownUntil > Date.now();
    byId('loginSubmit').textContent = busy ? '正在登录…' : '进入工作台';
  }
  function display() {
    byId('accountLabel').textContent = account ? account.label : '';
    byId('loginScreen').hidden = Boolean(account);
    byId('dashboardShell').hidden = !account;
    document.body.dataset.signedIn = account ? 'true' : 'false';
  }
  function notify() {
    // Clear/filter old dashboard content before making the new identity visible.
    try { callback(account); }
    catch (e) {
      account = null; expiresAt = 0; removeSession();
      byId('app').replaceChildren();
      document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      error('工作台加载失败，请刷新页面后重试。');
      console.error('Dashboard view initialization failed.');
    }
    display();
  }
  function scheduleExpiration() {
    clearTimeout(expirationTimer);
    if (account) expirationTimer = setTimeout(() => logout('本次登录已到期，请重新输入密码。'),Math.max(0,expiresAt-Date.now()));
  }
  function activate(source, expiry, persist) {
    account = publicAccount(source); expiresAt = expiry;
    if (persist) try { sessionStorage.setItem(STORAGE_KEY,JSON.stringify({version:config.version,accountId:account.id,expiresAt})); } catch {}
    resetPassword(); error(''); setBusy(false); scheduleExpiration(); notify();
  }
  function logout(message = '') {
    operation++; clearTimeout(expirationTimer);
    account = null; expiresAt = 0; removeSession(); resetPassword(); setBusy(false); error(typeof message==='string'?message:'');
    notify();
    requestAnimationFrame(()=>byId('loginPassword').focus({preventScroll:true}));
  }
  function validateSession() { if (account && expiresAt <= Date.now()) logout('本次登录已到期，请重新输入密码。'); }
  async function derive(candidate) {
    if (!globalThis.crypto?.subtle) throw new Error('unsupported');
    const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(candidate),'PBKDF2',false,['deriveBits']);
    const salt = Uint8Array.from(config.salt.match(/.{2}/g),n=>parseInt(n,16));
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:config.iterations},material,256);
    return [...new Uint8Array(bits)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  function cooldown() {
    clearTimeout(cooldownTimer);
    const seconds = Math.ceil((cooldownUntil-Date.now())/1000);
    if (seconds > 0) {
      byId('loginSubmit').disabled = true;
      error(`连续输入错误，请 ${seconds} 秒后重试。`);
      cooldownTimer = setTimeout(cooldown,1000);
    } else { cooldownUntil = 0; failedAttempts = 0; setBusy(false); error('可以重新输入密码。'); }
  }
  async function submit(event) {
    event.preventDefault();
    if (byId('loginForm').getAttribute('aria-busy')==='true') return;
    if (cooldownUntil > Date.now()) { cooldown(); return; }
    const candidate = byId('loginPassword').value.trim();
    if (!candidate) { error('请输入分配给你的密码。'); byId('loginPassword').focus(); return; }
    const attempt = ++operation; setBusy(true); error('');
    try {
      const hash = await derive(candidate);
      if (attempt !== operation) return;
      const match = config.accounts.find(a=>a.hash===hash);
      if (!match) {
        failedAttempts++; setBusy(false); error('密码不正确，请检查大小写和短横线后重试。');
        byId('loginPassword').select();
        if (failedAttempts >= 5) { cooldownUntil = Date.now()+30000; cooldown(); }
        return;
      }
      failedAttempts = 0; cooldownUntil = 0; clearTimeout(cooldownTimer);
      activate(match,Date.now()+config.sessionHours*60*60*1000,true);
    } catch {
      if (attempt !== operation) return;
      setBusy(false); error('当前环境无法验证密码。请使用最新版 Edge、Chrome 或 Safari，通过 HTTPS 链接或本地 HTML 文件打开。');
    }
  }
  function init(onChange) {
    if (initialized) return;
    initialized = true; callback = typeof onChange === 'function' ? onChange : () => {};
    byId('loginForm').addEventListener('submit',submit);
    byId('logoutBtn').addEventListener('click',()=>logout());
    byId('toggleLoginPassword').addEventListener('click',()=>{
      const visible=byId('loginPassword').type==='password';
      byId('loginPassword').type=visible?'text':'password';
      byId('toggleLoginPassword').textContent=visible?'隐藏':'显示';
      byId('toggleLoginPassword').setAttribute('aria-pressed',String(visible));
    });
    try {
      config=JSON.parse(byId('access-config').textContent);
      if(config.algorithm!=='PBKDF2-SHA256'||config.iterations!==210000||!Array.isArray(config.accounts)||!config.accounts.length||!/^[0-9a-f]{48}$/.test(config.salt)||config.sessionHours!==12)throw new Error('configuration');
      let saved;
      try { saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'); } catch {}
      const match=saved&&saved.version===config.version&&config.accounts.find(a=>a.id===saved.accountId);
      const expiry=Number(saved?.expiresAt), maxExpiry=Date.now()+config.sessionHours*60*60*1000;
      if(match&&Number.isFinite(expiry)&&expiry>Date.now()&&expiry<=maxExpiry){activate(match,expiry,false);}
      else {removeSession();notify();}
    } catch {
      removeSession(); notify(); byId('loginSubmit').disabled=true; error('登录配置暂不可用，请联系看板管理员。');
    }
    window.addEventListener('focus',validateSession);
    window.addEventListener('pageshow',validateSession);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)validateSession();});
  }
  window.DashboardAuth=Object.freeze({
    current:()=>account&&expiresAt>Date.now()?account:null,
    init,
    logout,
  });
})();
