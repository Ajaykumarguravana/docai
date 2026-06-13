// Initialize Theme immediately on load to prevent flash of style
(function initTheme() {
  const savedTheme = localStorage.getItem('docai_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  }
})();

window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('docai_theme', isLight ? 'light' : 'dark');
};

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
let docImageBase64 = '';
let docImageMimeType = '';

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

  // Populate dropdown header
  document.getElementById('dropdown-user-email').textContent = user.email;
  const joinedDate = user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : 'Recent';
  document.getElementById('dropdown-user-joined').textContent = `Member since: ${joinedDate}`;

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
  
  const clearBtn = document.getElementById('history-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  
  // Close user dropdown if open
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.style.display = 'none';
  const arrow = document.getElementById('menu-arrow-icon');
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

// ─── USER DROPDOWN MENU ──────────────────────────────────────────────────────
window.toggleUserMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('user-dropdown-menu');
  const arrow = document.getElementById('menu-arrow-icon');
  const isOpen = menu.style.display === 'block';
  
  menu.style.display = isOpen ? 'none' : 'block';
  arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
};

// Close dropdown on click outside
document.addEventListener('click', () => {
  const menu = document.getElementById('user-dropdown-menu');
  const arrow = document.getElementById('menu-arrow-icon');
  if (menu && menu.style.display === 'block') {
    menu.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }

  const exportMenu = document.getElementById('export-dropdown-menu');
  if (exportMenu && exportMenu.style.display === 'block') {
    exportMenu.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM FEATURES UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
window.toggleExportMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('export-dropdown-menu');
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
};

window.copyTextToClipboard = async function(text, btnEl) {
  try {
    await navigator.clipboard.writeText(text);
    const originalContent = btnEl.innerHTML;
    btnEl.innerHTML = '✅';
    showToast('Copied to clipboard!', 'success', 2000);
    setTimeout(() => {
      btnEl.innerHTML = originalContent;
    }, 2000);
  } catch (err) {
    showToast('Failed to copy to clipboard', 'error');
  }
};

window.copySummary = function() {
  const text = document.getElementById('summary-text').textContent;
  const btn = document.getElementById('copy-summary-btn');
  window.copyTextToClipboard(text, btn);
};

window.copyChatMessage = function(btn, rawText) {
  window.copyTextToClipboard(rawText, btn);
};

window.exportAsTXT = function() {
  const filename = document.getElementById('doc-filename').textContent || docFilename || 'analysis';
  const docType = document.getElementById('doc-type-badge').textContent || 'General';
  const summary = document.getElementById('summary-text').textContent || '';
  
  const findings = [];
  document.querySelectorAll('#findings-list .finding-item span').forEach(el => {
    findings.push(`- ${el.textContent}`);
  });
  
  const risks = [];
  document.querySelectorAll('#risk-list .risk-item').forEach(el => {
    const severity = el.querySelector('.risk-severity')?.textContent || '';
    const flag = el.querySelector('.risk-flag')?.textContent || '';
    const detail = el.querySelector('.risk-detail')?.textContent || '';
    risks.push(`[${severity}] ${flag}: ${detail}`);
  });
  
  const entitiesText = [];
  document.querySelectorAll('.entity-group').forEach(el => {
    const title = el.querySelector('h4')?.textContent || '';
    const tags = [];
    el.querySelectorAll('.entity-tag').forEach(tag => tags.push(tag.textContent));
    entitiesText.push(`${title}: ${tags.join(', ') || 'None'}`);
  });

  const content = `=========================================
DocAI Analysis Report
=========================================
File Name: ${filename}
Document Type: ${docType}
Date: ${new Date().toLocaleString()}

-----------------------------------------
EXECUTIVE SUMMARY
-----------------------------------------
${summary}

-----------------------------------------
KEY FINDINGS
-----------------------------------------
${findings.join('\n') || 'None detected.'}

-----------------------------------------
RISK FLAGS
-----------------------------------------
${risks.join('\n') || 'No significant risk flags detected.'}

-----------------------------------------
KEY ENTITIES
-----------------------------------------
${entitiesText.join('\n')}

=========================================
Generated by DocAI
=========================================`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  a.download = `${baseName}_analysis.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Text report downloaded successfully!', 'success');
};

window.exportAsPDF = function() {
  const filename = document.getElementById('doc-filename').textContent || docFilename || 'analysis';
  const docType = document.getElementById('doc-type-badge').textContent || 'General';
  const summary = document.getElementById('summary-text').innerHTML || '';
  const findingsHTML = document.getElementById('findings-list').innerHTML || 'No findings extracted.';
  const risksHTML = document.getElementById('risk-list').innerHTML || 'No risks detected.';
  const entitiesHTML = document.getElementById('entities-grid').innerHTML || '';
  const badgeClass = getDocTypeClass(docType);

  const printWindow = window.open('', '_blank');
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>DocAI Report - ${escapeHtml(filename)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    body {
      font-family: 'Inter', sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 40px;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 5px;
    }
    .logo span {
      color: #7c3aed;
    }
    .meta {
      font-size: 13px;
      color: #64748b;
      margin-top: 5px;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .badge.legal { background: #f3e8ff; color: #6b21a8; }
    .badge.financial { background: #d1fae5; color: #065f46; }
    .badge.research { background: #e0f2fe; color: #075985; }
    .badge.general { background: #f1f5f9; color: #334155; }
    
    h2 {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      margin-top: 30px;
      margin-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 6px;
      page-break-after: avoid;
    }
    
    .summary-section {
      font-size: 14px;
      color: #1e293b;
    }
    
    .finding-item {
      display: flex;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 13.5px;
    }
    .finding-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #7c3aed;
      margin-top: 8px;
      flex-shrink: 0;
    }
    
    .risk-item {
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 10px;
      border-left: 4px solid #cbd5e1;
      font-size: 13px;
      background: #f8fafc;
    }
    .risk-item.High { border-left-color: #ef4444; background: #fef2f2; }
    .risk-item.Medium { border-left-color: #f59e0b; background: #fffbeb; }
    .risk-item.Low { border-left-color: #10b981; background: #ecfdf5; }
    .risk-header { font-weight: 700; margin-bottom: 4px; display: flex; gap: 8px; }
    .risk-severity {
      text-transform: uppercase;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .High .risk-severity { background: #fee2e2; color: #991b1b; }
    .Medium .risk-severity { background: #fef3c7; color: #92400e; }
    .Low .risk-severity { background: #d1fae5; color: #065f46; }
    .risk-detail { color: #475569; }
    
    .no-risks {
      padding: 12px;
      background: #ecfdf5;
      color: #065f46;
      border-radius: 6px;
      font-size: 13px;
    }

    .entities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .entity-group h4 {
      font-size: 12px;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 8px;
    }
    .entity-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .entity-tag {
      font-size: 12px;
      padding: 2px 8px;
      background: #f1f5f9;
      border-radius: 4px;
      color: #334155;
    }
    .entity-empty { font-size: 12px; color: #94a3b8; font-style: italic; }
    
    @media print {
      body { padding: 0; }
      @page { margin: 2cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Doc<span>AI</span> Analysis Report</div>
    <div class="meta"><strong>Document:</strong> ${escapeHtml(filename)}</div>
    <div class="meta"><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
    <span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(docType)}</span>
  </div>
  
  <h2>Executive Summary</h2>
  <div class="summary-section">${summary}</div>
  
  <h2>Key Findings</h2>
  <div>${findingsHTML}</div>
  
  <h2>Risk Flags</h2>
  <div>${risksHTML}</div>
  
  <h2>Key Entities</h2>
  <div class="entities-grid">${entitiesHTML}</div>
</body>
</html>
  `;
  
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  printWindow.onload = function() {
    printWindow.print();
  };
};

window.confirmClearAllHistory = async function() {
  if (!currentUser) {
    showToast('Please sign in to view or manage document history.', 'info');
    return;
  }
  
  const confirmed = confirm('⚠️ Are you sure you want to clear your entire document analysis history? This action cannot be undone.');
  if (!confirmed) return;
  
  try {
    setStatus('Clearing history…', 'var(--orange)');
    const res = await fetch('/api/history', {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    
    showToast('Document history cleared successfully.', 'success');
    renderHistory([]);
    resetFile();
    setStatus('Ready', 'var(--green)');
  } catch (err) {
    setStatus('Error', 'var(--red)');
    showToast('Failed to clear history: ' + err.message, 'error');
  }
};

// ─── ACCOUNT SETTINGS MODAL ──────────────────────────────────────────────────
window.openProfileSettingsModal = function(type) {
  const modal = document.getElementById('profile-modal');
  modal.classList.remove('hidden');

  // Hide dropdown menu
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.style.display = 'none';
  const arrow = document.getElementById('menu-arrow-icon');
  if (arrow) arrow.style.transform = 'rotate(0deg)';

  // Hide all sub-forms
  document.getElementById('change-name-form').style.display = 'none';
  document.getElementById('change-password-form').style.display = 'none';
  document.getElementById('delete-account-form').style.display = 'none';

  // Reset inputs and errors
  document.getElementById('change-name-input').value = currentUser ? currentUser.name : '';
  document.getElementById('change-pass-current').value = '';
  document.getElementById('change-pass-new').value = '';
  document.getElementById('delete-account-password').value = '';

  document.getElementById('change-name-error').classList.remove('visible');
  document.getElementById('change-pass-error').classList.remove('visible');
  document.getElementById('delete-account-error').classList.remove('visible');

  // Set titles dynamically
  const iconEl = document.getElementById('profile-modal-icon');
  const titleEl = document.getElementById('profile-modal-title');
  const subtitleEl = document.getElementById('profile-modal-subtitle');

  if (type === 'name') {
    iconEl.textContent = '✏️';
    titleEl.innerHTML = 'Change <span>Name</span>';
    subtitleEl.textContent = 'Update your profile display username';
    document.getElementById('change-name-form').style.display = 'block';
  } else if (type === 'password') {
    iconEl.textContent = '🔑';
    titleEl.innerHTML = 'Change <span>Password</span>';
    subtitleEl.textContent = 'Create a secure new password for your account';
    document.getElementById('change-password-form').style.display = 'block';
  } else if (type === 'delete') {
    iconEl.textContent = '🗑️';
    titleEl.innerHTML = 'Delete <span>Account</span>';
    subtitleEl.textContent = 'Permanently delete your profile and all history';
    document.getElementById('delete-account-form').style.display = 'block';
  }
};

window.closeProfileModal = function() {
  const modal = document.getElementById('profile-modal');
  modal.classList.add('hidden');
};

window.handleChangeNameSubmit = async function() {
  const name = document.getElementById('change-name-input').value.trim();
  const errEl = document.getElementById('change-name-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.add('visible'); return; }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }

    currentUser.name = data.user.name;
    userAvatar.textContent = getInitials(currentUser.name);
    userNameDisplay.textContent = currentUser.name.split(' ')[0];
    
    closeProfileModal();
    showToast('Username updated successfully!', 'success');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

window.handleChangePasswordSubmit = async function() {
  const currentPassword = document.getElementById('change-pass-current').value;
  const newPassword = document.getElementById('change-pass-new').value;
  const errEl = document.getElementById('change-pass-error');

  errEl.classList.remove('visible');
  if (!currentPassword || !newPassword) {
    errEl.textContent = 'Both fields are required.';
    errEl.classList.add('visible');
    return;
  }

  const pwdErr = validatePassword(newPassword);
  if (pwdErr) { errEl.textContent = pwdErr; errEl.classList.add('visible'); return; }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }

    closeProfileModal();
    showToast('Password updated successfully!', 'success');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

window.handleDeleteAccountSubmit = async function() {
  const password = document.getElementById('delete-account-password').value;
  const errEl = document.getElementById('delete-account-error');

  errEl.classList.remove('visible');
  if (!password) { errEl.textContent = 'Please enter your password to confirm.'; errEl.classList.add('visible'); return; }

  try {
    const res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); return; }

    closeProfileModal();
    setLoggedOut();
    showToast('Your account has been deleted permanently.', 'info');
    authModal.classList.remove('hidden');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

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

let regTimer = null;
let fpTimer = null;

function clearResendTimers() {
  if (regTimer) { clearInterval(regTimer); regTimer = null; }
  if (fpTimer) { clearInterval(fpTimer); fpTimer = null; }
  
  const regBtn = document.getElementById('reg-resend-btn');
  if (regBtn) { regBtn.disabled = true; regBtn.textContent = 'Resend Code (30s)'; }
  const fpBtn = document.getElementById('fp-resend-btn');
  if (fpBtn) { fpBtn.disabled = true; fpBtn.textContent = 'Resend Code (30s)'; }
}

function startResendTimer(buttonId, purpose) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  if (purpose === 'register' && regTimer) clearInterval(regTimer);
  if (purpose === 'reset' && fpTimer) clearInterval(fpTimer);

  let secondsLeft = 30;
  btn.disabled = true;
  btn.textContent = `Resend Code (${secondsLeft}s)`;

  const interval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.textContent = 'Resend Code';
      if (purpose === 'register') regTimer = null;
      if (purpose === 'reset') fpTimer = null;
    } else {
      btn.textContent = `Resend Code (${secondsLeft}s)`;
    }
  }, 1000);

  if (purpose === 'register') regTimer = interval;
  if (purpose === 'reset') fpTimer = interval;
}

window.switchAuthTab = function(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').style.display        = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display     = tab === 'register' ? 'block' : 'none';
  document.getElementById('register-otp-form').style.display = 'none';
  document.getElementById('forgot-password-form').style.display = 'none';
  
  clearResendTimers();

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
    startResendTimer('reg-resend-btn', 'register');
  } catch (err) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Verification Code';
  }
};

window.handleResendRegisterOTP = async function() {
  if (!regTempData) return;
  const btn = document.getElementById('reg-resend-btn');
  const errEl = document.getElementById('reg-otp-error');
  
  errEl.classList.remove('visible');
  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regTempData.email })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); btn.disabled = false; btn.textContent = 'Resend Code'; return; }
    
    showToast('Verification code resent successfully!', 'success');
    startResendTimer('reg-resend-btn', 'register');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
    btn.disabled = false; btn.textContent = 'Resend Code';
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
    startResendTimer('fp-resend-btn', 'reset');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
  }
};

window.handleResendResetOTP = async function() {
  const email = document.getElementById('fp-email').value.trim();
  const btn = document.getElementById('fp-resend-btn');
  const errEl = document.getElementById('fp-reset-error');
  
  errEl.classList.remove('visible');
  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/auth/send-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.add('visible'); btn.disabled = false; btn.textContent = 'Resend Code'; return; }
    
    showToast('Verification code resent successfully!', 'success');
    startResendTimer('fp-resend-btn', 'reset');
  } catch {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.add('visible');
    btn.disabled = false; btn.textContent = 'Resend Code';
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
  const clearBtn = document.getElementById('history-clear-btn');

  if (!docs.length) {
    historyList.innerHTML = `<div class="history-empty"><div class="history-empty-icon">📭</div><p>No documents yet. Analyze a document to see it here.</p></div>`;
    historyBadge.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  historyBadge.textContent    = docs.length;
  historyBadge.style.display  = 'inline';
  if (clearBtn) clearBtn.style.display = 'flex';

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
    docText = doc.doc_text || '';
    docImageBase64 = doc.doc_image || '';
    docImageMimeType = doc.doc_image_mime || '';

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
    setTimeout(() => { el.remove(); const remaining = historyList.querySelectorAll('.history-item').length; if (!remaining) { historyBadge.style.display = 'none'; historyList.innerHTML = `<div class="history-empty"><div class="history-empty-icon">📭</div><p>No documents yet.</p></div>`; const clearBtn = document.getElementById('history-clear-btn'); if (clearBtn) clearBtn.style.display = 'none'; } else { historyBadge.textContent = remaining; } }, 300);
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

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext === 'pdf' ? '📕' : ext === 'docx' ? '📘' : ['png','jpg','jpeg','webp'].includes(ext) ? '🖼️' : '📄';
}
function formatBytes(b) { return b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'; }
function getDocTypeClass(type) { if (!type) return 'general'; if (/legal/i.test(type)) return 'legal'; if (/financial/i.test(type)) return 'financial'; if (/research/i.test(type)) return 'research'; return 'general'; }

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const isImage = ['png','jpg','jpeg','webp'].includes(ext);
  if (!['pdf','txt','docx','png','jpg','jpeg','webp'].includes(ext)) { alert('Please upload a PDF, DOCX, TXT, or Image file.'); return; }

  docFilename = file.name;
  fileIconEl.textContent = getFileIcon(file.name);
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = formatBytes(file.size);
  fileInfoEl.classList.add('visible');
  analyzeBtn.disabled = false;
  setStatus('Parsing document…', 'var(--orange)');

  try {
    if (ext === 'txt') {
      docText = await readTextFile(file);
      docImageBase64 = ''; docImageMimeType = '';
    } else if (ext === 'pdf') {
      docText = await readPDF(file);
      docImageBase64 = ''; docImageMimeType = '';
    } else if (ext === 'docx') {
      docText = await readDOCX(file);
      docImageBase64 = ''; docImageMimeType = '';
    } else if (isImage) {
      const base64DataUrl = await readImageAsBase64(file);
      docImageBase64 = base64DataUrl.split(',')[1];
      docImageMimeType = file.type || `image/${ext}`;
      docText = '';
    }
    const wordCount = isImage ? 0 : docText.trim().split(/\s+/).length;
    fileMetaEl.textContent = isImage ? `${formatBytes(file.size)} · Image` : `${formatBytes(file.size)} · ~${wordCount.toLocaleString()} words`;
    setStatus('Ready to analyze', 'var(--green)');
  } catch (err) { setStatus('Parse error', 'var(--red)'); alert('Could not parse: ' + err.message); }
}

function readTextFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); });
}
function readImageAsBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); });
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
  docImageBase64 = ''; docImageMimeType = '';
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
  if (isAnalyzing) return;
  const hasImage = !!docImageBase64;
  if ((!docText || !docText.trim()) && !hasImage) {
    showToast('This document contains no readable content. Please upload a valid document or image.', 'error');
    return;
  }
  isAnalyzing = true;

  welcomeScreen.style.display  = 'none';
  analysisScreen.style.display = 'block';
  showSkeleton();
  analyzeBtn.disabled = true;
  analyzeBtnTxt.textContent = '⏳ Analyzing…';
  setStatus('Analyzing with AI…', 'var(--orange)');

  try {
    const payload = { filename: docFilename, model: modelSelect.value };
    if (hasImage) {
      payload.image = docImageBase64;
      payload.mimeType = docImageMimeType;
    } else {
      payload.text = docText;
    }

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Server error'); }

    const data = await res.json();
    const wordCount = hasImage ? 0 : docText.trim().split(/\s+/).length;
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

  // Render Preview Card content
  const previewCard = document.getElementById('preview-card');
  const previewImage = document.getElementById('preview-image');
  const previewTextWrap = document.getElementById('preview-text-wrap');
  
  if (previewCard) {
    if (docImageBase64) {
      previewImage.src = `data:${docImageMimeType};base64,${docImageBase64}`;
      previewImage.style.display = 'block';
      previewTextWrap.style.display = 'none';
      previewCard.style.display = 'flex';
    } else if (docText && docText.trim()) {
      previewTextWrap.textContent = docText;
      previewTextWrap.style.display = 'block';
      previewImage.style.display = 'none';
      previewCard.style.display = 'flex';
    } else {
      previewCard.style.display = 'none';
    }
  }

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
    const payload = {
      message: msg,
      history: chatHistory.slice(-10),
      model: modelSelect.value
    };
    if (docImageBase64) {
      payload.image = docImageBase64;
      payload.mimeType = docImageMimeType;
    } else {
      payload.docText = docText;
    }

    const res  = await fetch('/api/chat', { method:'POST', headers: authHeaders(), body: JSON.stringify(payload) });
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
  let formatted = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  d.innerHTML = formatted;
  
  if (role === 'ai') {
    d.style.position = 'relative';
    d.style.paddingRight = '32px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-bubble-btn';
    copyBtn.title = 'Copy Message';
    copyBtn.innerHTML = '📋';
    copyBtn.onclick = function(e) {
      e.stopPropagation();
      window.copyChatMessage(this, text);
    };
    d.appendChild(copyBtn);
  }
  
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

// Global fetch interceptor to enforce single active session policy
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const res = await originalFetch(...args);
  if (res.status === 401 && authToken) {
    const isMeRoute = args[0] && (args[0] === '/api/auth/me' || args[0].includes('/api/auth/me'));
    try {
      const clone = res.clone();
      const data = await clone.json();
      if (data.code === 'SESSION_EXPIRED') {
        setLoggedOut();
        showToast('Logged out: New login detected on another device.', 'error', 5000);
        authModal.classList.remove('hidden');
      }
    } catch (e) {
      if (!isMeRoute) {
        setLoggedOut();
        authModal.classList.remove('hidden');
      }
    }
  }
  return res;
};

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
restoreSession();
