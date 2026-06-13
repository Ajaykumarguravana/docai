// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════
let docText      = '';
let docFilename  = '';
let chatHistory  = [];
let isAnalyzing  = false;
let isChatting   = false;
let currentUser  = null;
let authToken    = localStorage.getItem('docai_token') || null;

// ═══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════════════════
const uploadZone      = document.getElementById('upload-zone');
const fileInput       = document.getElementById('file-input');
const fileInfoEl      = document.getElementById('file-info');
const fileNameEl      = document.getElementById('file-name');
const fileMetaEl      = document.getElementById('file-meta');
const fileIconEl      = document.getElementById('file-icon');
const removeFileBtn   = document.getElementById('remove-file-btn');
const analyzeBtn      = document.getElementById('analyze-btn');
const analyzeBtnTxt   = document.getElementById('analyze-btn-text');
const modelSelect     = document.getElementById('model-select');

const welcomeScreen   = document.getElementById('welcome-screen');
const analysisScreen  = document.getElementById('analysis-screen');
const docTypeBadge    = document.getElementById('doc-type-badge');
const docFilenameEl   = document.getElementById('doc-filename');
const docMetaRow      = document.getElementById('doc-meta-row');
const summaryText     = document.getElementById('summary-text');
const findingsList    = document.getElementById('findings-list');
const riskList        = document.getElementById('risk-list');
const entitiesGrid    = document.getElementById('entities-grid');

const chatMessages    = document.getElementById('chat-messages');
const chatEmpty       = document.getElementById('chat-empty');
const chatInput       = document.getElementById('chat-input');
const sendBtn         = document.getElementById('send-btn');
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');

const authModal       = document.getElementById('auth-modal');
const headerGuest     = document.getElementById('header-guest');
const headerUser      = document.getElementById('header-user');
const userAvatar      = document.getElementById('user-avatar');
const userNameDisplay = document.getElementById('user-name-display');
const historyList     = document.getElementById('history-list');
const historyBadge    = document.getElementById('history-badge');

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '💡' };
  toast.innerHTML = `<span>${icons[type] || '💡'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════
function setStatus(text, color = 'var(--green)') {
  statusText.textContent = text;
  statusDot.style.background = color;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function authHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function setLoggedIn(user, token) {
  currentUser = user;
  authToken   = token;
  localStorage.setItem('docai_token', token);

  headerGuest.style.display   = 'none';
  headerUser.style.display    = 'flex';
  userAvatar.textContent      = getInitials(user.name);
  userNameDisplay.textContent = user.name.split(' ')[0];

  loadHistory();
}

function setLoggedOut() {
  currentUser = null;
  authToken   = null;
  localStorage.removeItem('docai_token');

  headerGuest.style.display = 'block';
  headerUser.style.display  = 'none';
  historyList.innerHTML     = `<div class="history-empty"><div class="history-empty-icon">📭</div><p>Sign in to see your document history.</p></div>`;
  historyBadge.style.display = 'none';
}

window.showAuthModal = function() {
  authModal.classList.remove('hidden');
};

window.continueAsGuest = function() {
  authModal.classList.add('hidden');
  showToast('Continuing as guest — documents won\'t be saved to history.', 'info');
};

window.handleSignOut = function() {
  setLoggedOut();
  showToast('Signed out successfully.', 'success');
  // Clear form fields and show login modal
  switchAuthTab('login');
  authModal.classList.remove('hidden');
};

window.switchAuthTab = function(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').style.display        = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display     = tab === 'register' ? 'block' : 'none';
  document.getElementById('register-otp-form').style.display = 'none';
  document.getElementById('forgot-password-form').style.display = 'none';
  
  // Clear all fields and errors on tab switch
  document.getElementById('login-email').value    = '';
  document.getElementById('login-password').value = '';
  document.getElementById('reg-name').value       = '';
  document.getElementById('reg-email').value      = '';
  document.getElementById('reg-password').value   = '';
  document.getElementById('reg-otp').value        = '';
  document.getElementById('fp-email').value       = '';
  document.getElementById('fp-otp').value         = '';
  document.getElementById('fp-new-password').value = '';
  
  document.getElementById('login-error').classList.remove('visible');
  document.getElementById('reg-error').classList.remove('visible');
  document.getElementById('reg-otp-error').classList.remove('visible');
  document.getElementById('fp-email-error').classList.remove('visible');
  document.getElementById('fp-reset-error').classList.remove('visible');
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER & OTP FLOW
// ═══════════════════════════════════════════════════════════════════════════════
let regTempData = null; // Store registration inputs temporarily while verifying OTP

window.handleRegisterSubmit = async function() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  const btn      = document.getElementById('register-btn');

  errEl.classList.remove('visible');
  if (!name || !email || !password) { errEl.textContent = 'All fields are required.'; errEl.classList.add('visible'); return; }

  const emailErr = validateEmail(email);
  if (emailErr) { errEl.textContent = emailErr; errEl.classList.add('visible'); return; }

  const pwdErr = validatePassword(password);
  if (pwdErr) { errEl.textContent = pwdErr; errEl.classList.add('visible'); return; }

  btn.disabled = true; btn.textContent = 'Sending OTP…';
  try {
    const res  = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }

    // Save registration info for step 2
    regTempData = { name, email, password };
    
    // Switch to Register OTP view
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('register-otp-form').style.display = 'block';
    document.getElementById('register-otp-email-label').textContent = email;
    document.getElementById('reg-otp').value = '';
    
    showToast('OTP sent successfully! Please check your email.', 'success');
  } catch (err) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Verification Code';
  }
};

window.handleVerifyRegisterOTP = async function() {
  if (!regTempData) return;
  const otp   = document.getElementById('reg-otp').value.trim();
  const errEl = document.getElementById('reg-otp-error');
  
  errEl.classList.remove('visible');
  if (!otp || otp.length !== 6) {
    errEl.textContent = 'Please enter a valid 6-digit verification code.';
    errEl.classList.add('visible');
    return;
  }

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...regTempData, otp })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    
    authModal.classList.add('hidden');
    setLoggedIn(data.user, data.token);
    showToast(`Welcome, ${data.user.name}! 🎉`, 'success');
    regTempData = null; // clear temp data
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

window.backToRegister = function(e) {
  if (e) e.preventDefault();
  document.getElementById('register-otp-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
};

// ═══════════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD FLOW
// ═══════════════════════════════════════════════════════════════════════════════
window.showForgotPasswordForm = function(e) {
  if (e) e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('register-otp-form').style.display = 'none';
  document.getElementById('forgot-password-form').style.display = 'block';
  
  document.getElementById('fp-step1').style.display = 'block';
  document.getElementById('fp-step2').style.display = 'none';
  document.getElementById('fp-email').value = '';
  document.getElementById('fp-otp').value = '';
  document.getElementById('fp-new-password').value = '';
  
  document.getElementById('fp-email-error').classList.remove('visible');
  document.getElementById('fp-reset-error').classList.remove('visible');
};

window.backToLogin = function(e) {
  if (e) e.preventDefault();
  switchAuthTab('login');
};

window.handleSendResetOTP = async function() {
  const email = document.getElementById('fp-email').value.trim();
  const errEl = document.getElementById('fp-email-error');
  
  errEl.classList.remove('visible');
  if (!email) { errEl.textContent = 'Email is required.'; errEl.classList.add('visible'); return; }
  
  const emailErr = validateEmail(email);
  if (emailErr) { errEl.textContent = emailErr; errEl.classList.add('visible'); return; }
  
  try {
    const res = await fetch('/api/auth/send-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    
    // Switch to step 2
    document.getElementById('fp-step1').style.display = 'none';
    document.getElementById('fp-step2').style.display = 'block';
    showToast('Reset code sent to your email. Check your inbox!', 'success');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

window.handleResetPassword = async function() {
  const email    = document.getElementById('fp-email').value.trim();
  const otp      = document.getElementById('fp-otp').value.trim();
  const password = document.getElementById('fp-new-password').value;
  const errEl    = document.getElementById('fp-reset-error');
  
  errEl.classList.remove('visible');
  if (!otp || !password) { errEl.textContent = 'All fields are required.'; errEl.classList.add('visible'); return; }
  if (otp.length !== 6) { errEl.textContent = 'Verification code must be 6 digits.'; errEl.classList.add('visible'); return; }
  
  const pwdErr = validatePassword(password);
  if (pwdErr) { errEl.textContent = pwdErr; errEl.classList.add('visible'); return; }
  
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    
    showToast('Password reset successfully! You can now log in.', 'success');
    switchAuthTab('login');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function validatePassword(password) {
  if (password.length < 8)          return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password))      return 'Password must contain at least one capital letter.';
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;\'/]/.test(password)) return 'Password must contain at least one special character (e.g. @, #, !).';
  return null;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Please enter a valid email address (e.g. you@example.com).';
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
window.handleLogin = async function() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.classList.remove('visible');
  if (!email || !password) { errEl.textContent = 'Email and password are required.'; errEl.classList.add('visible'); return; }

  const emailErr = validateEmail(email);
  if (emailErr) { errEl.textContent = emailErr; errEl.classList.add('visible'); return; }

  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const res  = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password}) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }
    authModal.classList.add('hidden');
    setLoggedIn(data.user, data.token);
    showToast(`Welcome back, ${data.user.name}! 👋`, 'success');
  } catch { errEl.textContent = 'Network error. Please try again.'; errEl.classList.add('visible'); }
  finally { btn.disabled = false; btn.textContent = 'Sign In'; }
};

// Enter key on auth forms
document.getElementById('login-password').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
document.getElementById('reg-password').addEventListener('keydown',   e => e.key === 'Enter' && handleRegisterSubmit());
document.getElementById('reg-otp').addEventListener('keydown',        e => e.key === 'Enter' && handleVerifyRegisterOTP());
document.getElementById('fp-email').addEventListener('keydown',       e => e.key === 'Enter' && handleSendResetOTP());
document.getElementById('fp-new-password').addEventListener('keydown',e => e.key === 'Enter' && handleResetPassword());

// ═══════════════════════════════════════════════════════════════════════════════
// RESTORE SESSION
// ═══════════════════════════════════════════════════════════════════════════════
async function restoreSession() {
  if (!authToken) { authModal.classList.remove('hidden'); return; }
  try {
    const res  = await fetch('/api/auth/me', { headers: authHeaders() });
    const data = await res.json();
    if (res.ok) { setLoggedIn(data.user, authToken); authModal.classList.add('hidden'); }
    else         { setLoggedOut(); authModal.classList.remove('hidden'); }
  } catch { authModal.classList.remove('hidden'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR TABS
// ═══════════════════════════════════════════════════════════════════════════════
window.switchSidebarTab = function(tab) {
  const chatPanel    = document.getElementById('chat-panel');
  const historyPanel = document.getElementById('history-panel');
  const tabChat      = document.getElementById('tab-chat-btn');
  const tabHistory   = document.getElementById('tab-history-btn');

  if (tab === 'chat') {
    chatPanel.style.display    = 'flex';
    historyPanel.style.display = 'none';
    tabChat.classList.add('active');
    tabHistory.classList.remove('active');
  } else {
    chatPanel.style.display    = 'none';
    historyPanel.style.display = 'flex';
    tabChat.classList.remove('active');
    tabHistory.classList.add('active');
    if (currentUser) loadHistory();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
async function loadHistory() {
  if (!currentUser || !authToken) return;
  try {
    const res  = await fetch('/api/history', { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return;
    renderHistory(data.documents || []);
  } catch {}
}

function renderHistory(docs) {
  historyList.innerHTML = '';

  if (!docs.length) {
    historyList.innerHTML = `<div class="history-empty"><div class="history-empty-icon">📭</div><p>No documents yet. Analyze a document to see it here.</p></div>`;
    historyBadge.style.display = 'none';
    return;
  }

  historyBadge.textContent    = docs.length;
  historyBadge.style.display  = 'inline';

  docs.forEach(doc => {
    const typeClass = getDocTypeClass(doc.doc_type);
    const date      = new Date(doc.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const ext       = doc.filename.split('.').pop().toLowerCase();
    const icon      = ext === 'pdf' ? '📕' : ext === 'docx' ? '📘' : '📄';

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-item-icon">${icon}</div>
      <div class="history-item-info">
        <div class="history-item-name">${escapeHtml(doc.filename)}</div>
        <div class="history-item-meta">
          <span class="history-doc-badge ${typeClass}">${escapeHtml(doc.doc_type || 'Unknown')}</span>
          <span class="history-item-date">${date}</span>
        </div>
      </div>
      <button class="history-delete-btn" data-id="${doc.id}" title="Delete">🗑️</button>`;

    item.addEventListener('click', (e) => {
      if (!e.target.closest('.history-delete-btn')) loadHistoryDoc(doc.id);
    });
    item.querySelector('.history-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryDoc(doc.id, item);
    });

    historyList.appendChild(item);
  });
}

async function loadHistoryDoc(id) {
  try {
    setStatus('Loading from history…', 'var(--cyan)');
    const res  = await fetch(`/api/history/${id}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { showToast('Could not load document.', 'error'); return; }

    const doc = data.document;
    const analysis = typeof doc.analysis === 'string' ? JSON.parse(doc.analysis) : doc.analysis;

    welcomeScreen.style.display  = 'none';
    analysisScreen.style.display = 'block';
    docFilename = doc.filename;
    docText = ''; // no raw text from history

    renderAnalysis(analysis, doc.filename, doc.word_count);
    setStatus('Loaded from history', 'var(--green)');
    switchSidebarTab('chat');
    showToast('Document loaded from history ✅', 'success');
    chatInput.disabled = false;
    sendBtn.disabled   = false;
  } catch { showToast('Failed to load document.', 'error'); }
}

async function deleteHistoryDoc(id, el) {
  try {
    const res = await fetch(`/api/history/${id}`, { method:'DELETE', headers: authHeaders() });
    if (!res.ok) { showToast('Could not delete.', 'error'); return; }
    el.style.animation = 'none';
    el.style.opacity   = '0';
    el.style.transform = 'translateX(-20px)';
    el.style.transition = 'all .3s';
    setTimeout(() => { el.remove(); const remaining = historyList.querySelectorAll('.history-item').length; if (!remaining) { historyBadge.style.display = 'none'; historyList.innerHTML = `<div class="history-empty"><div class="history-empty-icon">📭</div><p>No documents yet.</p></div>`; } else { historyBadge.textContent = remaining; } }, 300);
    showToast('Document deleted.', 'info');
  } catch { showToast('Failed to delete.', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
removeFileBtn.addEventListener('click', resetFile);

function getFileIcon(filename) { const ext = filename.split('.').pop().toLowerCase(); return ext === 'pdf' ? '📕' : ext === 'docx' ? '📘' : '📄'; }
function formatBytes(b) { return b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'; }
function getDocTypeClass(type) { if (!type) return 'general'; if (/legal/i.test(type)) return 'legal'; if (/financial/i.test(type)) return 'financial'; if (/research/i.test(type)) return 'research'; return 'general'; }

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf','txt','docx'].includes(ext)) { alert('Please upload a PDF, DOCX, or TXT file.'); return; }

  docFilename = file.name;
  fileIconEl.textContent = getFileIcon(file.name);
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = formatBytes(file.size);
  fileInfoEl.classList.add('visible');
  analyzeBtn.disabled = false;
  setStatus('Parsing document…', 'var(--orange)');

  try {
    if (ext === 'txt')        docText = await readTextFile(file);
    else if (ext === 'pdf')   docText = await readPDF(file);
    else if (ext === 'docx')  docText = await readDOCX(file);
    const wordCount = docText.trim().split(/\s+/).length;
    fileMetaEl.textContent = `${formatBytes(file.size)} · ~${wordCount.toLocaleString()} words`;
    setStatus('Ready to analyze', 'var(--green)');
  } catch (err) { setStatus('Parse error', 'var(--red)'); alert('Could not parse: ' + err.message); }
}

function readTextFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); });
}
async function readPDF(file) {
  const ab = await file.arrayBuffer();
  const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const c = await page.getTextContent(); text += c.items.map(it => it.str).join(' ') + '\n'; }
  return text;
}
async function readDOCX(file) {
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return result.value;
}

function resetFile() {
  docText = ''; docFilename = ''; chatHistory = [];
  fileInput.value = '';
  fileInfoEl.classList.remove('visible');
  analyzeBtn.disabled = true;
  analyzeBtnTxt.textContent = '✨ Analyze Document';
  chatInput.disabled = true; sendBtn.disabled = true;
  welcomeScreen.style.display  = '';
  analysisScreen.style.display = 'none';
  chatMessages.innerHTML = ''; chatMessages.appendChild(chatEmpty);
  chatEmpty.style.display = '';
  setStatus('Ready', 'var(--green)');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYZE
// ═══════════════════════════════════════════════════════════════════════════════
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!docText || isAnalyzing) return;
  isAnalyzing = true;

  welcomeScreen.style.display  = 'none';
  analysisScreen.style.display = 'block';
  showSkeleton();
  analyzeBtn.disabled = true;
  analyzeBtnTxt.textContent = '⏳ Analyzing…';
  setStatus('Analyzing with AI…', 'var(--orange)');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: docText, filename: docFilename, model: modelSelect.value }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Server error'); }

    const data = await res.json();
    const wordCount = docText.trim().split(/\s+/).length;
    renderAnalysis(data, docFilename, wordCount);

    setStatus('Analysis complete', 'var(--green)');
    analyzeBtnTxt.textContent = '🔄 Re-analyze';
    analyzeBtn.disabled = false;
    chatInput.disabled  = false;
    sendBtn.disabled    = false;

    if (data.historyId) {
      showToast('Analysis saved to your history ✅', 'success');
      loadHistory();
    } else if (!currentUser) {
      showToast('Sign in to save documents to history', 'info');
    }
  } catch (err) {
    setStatus('Error', 'var(--red)');
    analyzeBtn.disabled = false; analyzeBtnTxt.textContent = '✨ Analyze Document';
    showToast('Analysis failed: ' + err.message, 'error');
    welcomeScreen.style.display  = '';
    analysisScreen.style.display = 'none';
  } finally { isAnalyzing = false; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON
// ═══════════════════════════════════════════════════════════════════════════════
function showSkeleton() {
  summaryText.innerHTML = [80,92,85,70].map(w => `<div class="skeleton" style="height:13px;margin-bottom:9px;width:${w}%"></div>`).join('');
  findingsList.innerHTML = [1,2,3,4,5].map(() => `<div class="skeleton" style="height:13px;margin-bottom:7px"></div>`).join('');
  riskList.innerHTML = [1,2].map(() => `<div class="skeleton" style="height:54px;margin-bottom:7px;border-radius:9px"></div>`).join('');
  entitiesGrid.innerHTML = `<div class="skeleton" style="height:78px;border-radius:9px"></div><div class="skeleton" style="height:78px;border-radius:9px"></div>`;
  docTypeBadge.textContent = '—'; docTypeBadge.className = 'doc-type-badge general';
  docFilenameEl.textContent = docFilename;
  docMetaRow.innerHTML = `<span class="skeleton" style="display:inline-block;width:140px;height:11px"></span>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
function renderAnalysis(data, filename, wordCount) {
  const dt      = data.docType || 'General Document';
  const dtClass = getDocTypeClass(dt);
  docTypeBadge.textContent = dt;
  docTypeBadge.className   = `doc-type-badge ${dtClass}`;

  docFilenameEl.textContent = filename || docFilename;
  docMetaRow.innerHTML = `~${(wordCount||0).toLocaleString()} words${data.truncated ? '<span class="truncated-warn">⚠ Large doc — first portion analyzed</span>' : ''}${data.historyId ? '<span class="saved-badge">💾 Saved</span>' : ''}`;

  summaryText.textContent = data.summary || 'No summary available.';

  findingsList.innerHTML = '';
  (data.keyFindings || []).forEach(f => {
    const d = document.createElement('div'); d.className = 'finding-item';
    d.innerHTML = `<div class="finding-dot"></div><span>${escapeHtml(f)}</span>`;
    findingsList.appendChild(d);
  });
  if (!data.keyFindings?.length) findingsList.innerHTML = '<span style="color:var(--text-3);font-size:.78rem">No findings extracted.</span>';

  riskList.innerHTML = '';
  const risks = data.riskFlags || [];
  if (!risks.length) { riskList.innerHTML = `<div class="no-risks">✅ No significant risk flags detected.</div>`; }
  else risks.forEach(r => {
    const d = document.createElement('div'); d.className = `risk-item ${r.severity||'Low'}`;
    d.innerHTML = `<div class="risk-header"><span class="risk-severity">${escapeHtml(r.severity||'Low')}</span><span class="risk-flag">${escapeHtml(r.flag||'')}</span></div><div class="risk-detail">${escapeHtml(r.detail||'')}</div>`;
    riskList.appendChild(d);
  });

  const ents  = data.entities || {};
  const groups = [
    { label:'👤 Parties',   items: ents.parties   || [] },
    { label:'📅 Dates',     items: ents.dates     || [] },
    { label:'💰 Amounts',   items: ents.amounts   || [] },
    { label:'📍 Locations', items: ents.locations || [] },
  ];
  entitiesGrid.innerHTML = '';
  groups.forEach(g => {
    const d = document.createElement('div'); d.className = 'entity-group';
    d.innerHTML = `<h4>${g.label}</h4><div class="entity-tags">${g.items.length ? g.items.map(i=>`<span class="entity-tag">${escapeHtml(i)}</span>`).join('') : '<span class="entity-empty">None found</span>'}</div>`;
    entitiesGrid.appendChild(d);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════════════════════
sendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = Math.min(chatInput.scrollHeight,90)+'px'; });

document.getElementById('suggestion-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) { chatInput.value = chip.dataset.q; sendChat(); }
});

async function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg || isChatting) return;
  isChatting = true;
  chatEmpty.style.display = 'none';
  appendBubble('user', msg);
  chatInput.value = ''; chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  const thinkingEl = appendThinking();
  chatHistory.push({ role:'user', text: msg });

  try {
    const res  = await fetch('/api/chat', { method:'POST', headers: authHeaders(), body: JSON.stringify({ message:msg, docText, history:chatHistory.slice(-10), model:modelSelect.value }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    thinkingEl.remove();
    appendBubble('ai', data.reply);
    chatHistory.push({ role:'model', text: data.reply });
  } catch (err) { thinkingEl.remove(); appendBubble('ai', '⚠️ Error: ' + err.message); }
  finally { isChatting = false; sendBtn.disabled = false; chatInput.focus(); }
}

function appendBubble(role, text) {
  const d = document.createElement('div'); d.className = `bubble ${role}`;
  d.innerHTML = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight;
  return d;
}
function appendThinking() {
  const d = document.createElement('div'); d.className = 'bubble thinking';
  d.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>';
  chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight;
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
restoreSession();
