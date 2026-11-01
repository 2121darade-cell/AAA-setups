/**
 * Unified Trading Platform 2.0
 * 3-in-1 Platform: Chart • Trade Setup (Heikin Ashi Scanner) • AAA (Nifty 200 Screener)
 * White Theme • Major Indices • Full Day Candles (09:15 - 15:30) • Real-Time SSE Cloud Sync
 */

// =============================================================================
// 1. Authentication & Real-Time Cloud Sync Engine (SSE + ntfy.sh)
// =============================================================================
const ADMIN_MASTER_PIN = "Admin@Fin2026";
const CLOUD_TOPIC_URL = "https://ntfy.sh/fin_auth_hub_2026";
const STORAGE_USER_KEY = "fin_auth_user_v2";
const STORAGE_USERS_DB = "fin_users_database_v2";

// IST Timezone Offset (UTC + 05:30 = 19,800 seconds)
const IST_OFFSET_SEC = 19800;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIst(unixMs) {
  // IST is UTC + 05:30 (19800000 ms)
  const istDate = new Date(Number(unixMs) + 19800000);
  const hh = String(istDate.getUTCHours()).padStart(2, '0');
  const mm = String(istDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[istDate.getUTCMonth()];
  const yyyy = istDate.getUTCFullYear();
  return {
    hh,
    mm,
    ss,
    dd,
    mon,
    yyyy,
    hhmm: `${hh}:${mm}`,
    ddMon: `${dd} ${mon}`,
    fullDate: `${dd} ${mon} ${yyyy}`,
    fullDateTime: `${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} IST`,
    isoLocal: `${yyyy}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${dd} ${hh}:${mm}:${ss} IST`
  };
}
window.formatIst = formatIst;

const DEFAULT_USERS = [
  { id: "usr_admin", name: "System Admin", phone: "9999999999", email: "admin@tradingplatform.com", status: "APPROVED", date: "2026-09-18 09:00", vipKey: "VIP-ADMIN-777" },
  { id: "usr_demo", name: "Demo User", phone: "9822000000", email: "demo@tradingplatform.com", status: "APPROVED", date: "2026-09-18 09:15", vipKey: "VIP-DEMO-100" },
  { id: "usr_user_test", name: "test", phone: "9359998294", email: "9359998294@tradingplatform.com", status: "PENDING", date: "2026-09-18 17:30", vipKey: "VIP-8294-101" }
];

function showToastNotification(msg, type = "info") {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.style.cssText = "position:fixed;top:70px;right:20px;background:#ffffff;color:#0f172a;padding:12px 18px;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.15);border-left:4px solid #2563eb;font-size:13px;font-weight:700;z-index:99999;display:none;max-width:350px;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.borderLeftColor = (type === "error" ? "#ef4444" : (type === "success" ? "#10b981" : "#2563eb"));
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = "none"; }, 3500);
}
window.showToastNotification = showToastNotification;

function getUsersDB() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_DB);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_DB, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_USERS_DB, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    // Ensure test user is present
    if (!parsed.some(u => u.phone === "9359998294")) {
      parsed.push(DEFAULT_USERS[2]);
      localStorage.setItem(STORAGE_USERS_DB, JSON.stringify(parsed));
    }
    return parsed;
  } catch (e) {
    return DEFAULT_USERS;
  }
}

function saveUsersDB(users) {
  try {
    localStorage.setItem(STORAGE_USERS_DB, JSON.stringify(users));
  } catch (e) {
    console.warn("Storage write error:", e);
  }
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  } catch (e) {
    console.warn("Storage write error:", e);
  }
}

// Publish Realtime Event to Cloud Event Bus
async function postCloudEvent(payload) {
  try {
    await fetch(CLOUD_TOPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn("Cloud event post error:", e);
  }
}

// Fetch Cloud Event History on page load or on refresh
async function fetchCloudHistory() {
  try {
    const res = await fetch(`${CLOUD_TOPIC_URL}/json?poll=1&since=12h`);
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split("\n");
    const events = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.event === "message" && item.message) {
          const payload = typeof item.message === "string" ? JSON.parse(item.message) : item.message;
          events.push(payload);
        }
      } catch (err) {}
    }
    return events;
  } catch (e) {
    console.warn("Cloud history fetch error:", e);
    return [];
  }
}

// Process incoming realtime payload
function handleIncomingCloudPayload(payload) {
  if (!payload || !payload.action) return;

  const db = getUsersDB();
  let changed = false;

  if (payload.action === "USER_REGISTER" && payload.user) {
    const u = payload.user;
    const existing = db.find(x => (x.phone && x.phone === u.phone) || (x.id && x.id === u.id));
    if (!existing) {
      db.unshift(u);
      changed = true;
      showToastNotification(`🔔 नवीन नोंदणी विनंती: ${u.name} (${u.phone})`, "info");
    }
  } else if (payload.action === "USER_APPROVE" && (payload.phone || payload.id)) {
    const target = db.find(x => (payload.phone && x.phone === payload.phone) || (payload.id && x.id === payload.id));
    if (target) {
      target.status = "APPROVED";
      changed = true;
    }
    // Check if this approval applies to current user on this device!
    const curr = getCurrentUser();
    if (curr && ((payload.phone && curr.phone === payload.phone) || (payload.id && curr.id === payload.id))) {
      curr.status = "APPROVED";
      setCurrentUser(curr);
      AuthEngine.grantAccess(curr);
      showToastNotification("🎉 तुमचे ॲक्सेस ॲडमिनद्वारे मंजूर करण्यात आले आहे!", "success");
    }
  } else if (payload.action === "USER_DELETE" && payload.userId) {
    const idx = db.findIndex(x => x.id === payload.userId);
    if (idx >= 0) {
      db.splice(idx, 1);
      changed = true;
    }
  } else if (payload.action === "SYNC_ALL" && Array.isArray(payload.users)) {
    payload.users.forEach(cu => {
      if (!cu || (!cu.phone && !cu.id)) return;
      const found = db.find(x => (cu.phone && x.phone === cu.phone) || (cu.id && x.id === cu.id));
      if (!found) {
        db.push(cu);
        changed = true;
      } else {
        if (cu.status === "APPROVED" && found.status !== "APPROVED") {
          found.status = "APPROVED";
          changed = true;
        }
      }
    });

    const curr = getCurrentUser();
    if (curr) {
      const up = db.find(x => (curr.phone && x.phone === curr.phone) || (curr.id && x.id === curr.id));
      if (up && up.status === "APPROVED" && curr.status !== "APPROVED") {
        curr.status = "APPROVED";
        setCurrentUser(curr);
        AuthEngine.grantAccess(curr);
        showToastNotification("🎉 तुमचे ॲक्सेस मंजूर झाले आहे!", "success");
      }
    }
  }

  if (changed) {
    saveUsersDB(db);
    if (AuthEngine.isAdminLoggedIn) {
      AuthEngine.renderAdminDashboard();
    }
  }
}

async function syncUsersWithCloud() {
  const events = await fetchCloudHistory();
  if (events && events.length > 0) {
    events.forEach(e => handleIncomingCloudPayload(e));
  }
  // If admin, broadcast local state so all devices stay in perfect harmony
  if (AuthEngine.isAdminLoggedIn) {
    const db = getUsersDB();
    postCloudEvent({ action: "SYNC_ALL", users: db });
  }
}

// Auth Engine Controller
const AuthEngine = {
  isAdminLoggedIn: false,
  checkInterval: null,
  eventSource: null,

  init() {
    // 1. Check URL parameters for 1-click VIP unlock
    const urlParams = new URLSearchParams(window.location.search);
    const vipParam = urlParams.get('vip');
    if (vipParam) {
      this.handleVipUnlock(vipParam.trim());
    }

    // 2. Initial state verification
    const user = getCurrentUser();
    const btnLogin = document.getElementById('btnHeaderLogin');
    if (!user) {
      if (btnLogin) btnLogin.style.display = 'inline-flex';
      this.showAuthModal('login');
    } else if (user.status === 'PENDING') {
      if (btnLogin) btnLogin.style.display = 'inline-flex';
      this.showPendingModal(user);
      // Immediately check backend server status in case user was approved while offline
      const tjParam = user.tradejiniClientId || '';
      fetch(`./api/auth/status?id=${encodeURIComponent(user.id || '')}&phone=${encodeURIComponent(user.phone || '')}&tjId=${encodeURIComponent(tjParam)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.status === 'APPROVED' && data.user) {
            if (this.checkInterval) {
              clearInterval(this.checkInterval);
              this.checkInterval = null;
            }
            setCurrentUser(data.user);
            const modal = document.getElementById('pendingModal');
            if (modal) modal.classList.remove('active');
            this.grantAccess(data.user);
            const isEn = window.I18N && window.I18N.getLang() === 'en';
            showToastNotification(
              isEn ? '🎉 Your account has been approved by admin! Welcome.' : '🎉 तुमचे खाते मंजूर झाले आहे! पोर्टल सुरु झाले.',
              'success'
            );
          }
        })
        .catch(() => {});
    } else if (user.status === 'APPROVED') {
      this.grantAccess(user);
    }

    // 3. Connect Real-time SSE listener
    this.initRealtimeSSE();

    // 4. Initial Sync with Cloud History
    syncUsersWithCloud();

    // 5. Periodic heartbeat sync (every 5 seconds)
    setInterval(syncUsersWithCloud, 5000);

    this.bindEvents();
  },

  initRealtimeSSE() {
    try {
      if (this.eventSource) {
        this.eventSource.close();
      }
      this.eventSource = new EventSource(`${CLOUD_TOPIC_URL}/sse`);
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "message" && data.message) {
            const payload = typeof data.message === "string" ? JSON.parse(data.message) : data.message;
            handleIncomingCloudPayload(payload);
          }
        } catch (err) {}
      };
      this.eventSource.onerror = () => {
        // Will auto reconnect
      };
    } catch (e) {
      console.warn("SSE init error:", e);
    }
  },

  showAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('active');
    const closeBtn = document.getElementById('btnCloseAuthModal');
    if (closeBtn) closeBtn.style.display = 'block';
    const tabLogin = document.getElementById('tabBtnLogin');
    const tabRegister = document.getElementById('tabBtnRegister');
    const panelLogin = document.getElementById('panelLogin');
    const panelRegister = document.getElementById('panelRegister');

    if (tab === 'login') {
      if (tabLogin) tabLogin.classList.add('active');
      if (tabRegister) tabRegister.classList.remove('active');
      if (panelLogin) panelLogin.style.display = 'block';
      if (panelRegister) panelRegister.style.display = 'none';
      const inp = document.getElementById('authInputLoginId');
      if (inp) setTimeout(() => inp.focus(), 80);
    } else {
      if (tabRegister) tabRegister.classList.add('active');
      if (tabLogin) tabLogin.classList.remove('active');
      if (panelLogin) panelLogin.style.display = 'none';
      if (panelRegister) panelRegister.style.display = 'block';
      const inp = document.getElementById('authInputName');
      if (inp) setTimeout(() => inp.focus(), 80);
    }
  },

  hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('active');
  },

  showPendingModal(user) {
    this.hideAuthModal();
    const modal = document.getElementById('pendingApprovalModal');
    if (!modal) return;
    const nameEl = document.getElementById('pendingName');
    const phoneEl = document.getElementById('pendingPhone');
    const tjEl = document.getElementById('pendingTjId');
    if (nameEl) nameEl.textContent = user.name || 'Member';
    if (phoneEl) phoneEl.textContent = user.phone || '--';
    if (tjEl) tjEl.textContent = user.tradejiniClientId || user.tjId || '--';
    modal.classList.add('active');

    // Lock terminal view
    const vw = document.getElementById('viewsWrapper') || document.querySelector('.views-wrapper');
    if (vw) {
      vw.style.filter = 'blur(10px)';
      vw.style.pointerEvents = 'none';
    }

    // Auto-poll approval status every 3 seconds from server
    if (!this.checkInterval) {
      this.checkInterval = setInterval(async () => {
        try {
          const curr = getCurrentUser();
          if (!curr) return;
          const tjParam = curr.tradejiniClientId || '';
          const res = await fetch(`./api/auth/status?id=${encodeURIComponent(curr.id || '')}&phone=${encodeURIComponent(curr.phone || '')}&tjId=${encodeURIComponent(tjParam)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.status === 'APPROVED' && data.user) {
              clearInterval(this.checkInterval);
              this.checkInterval = null;
              setCurrentUser(data.user);
              modal.classList.remove('active');
              this.grantAccess(data.user);
              const isEn = window.I18N && window.I18N.getLang() === 'en';
              showToastNotification(
                isEn 
                  ? '🎉 Your Tradejini account has been approved by admin! Welcome to AAA Setup.' 
                  : '🎉 तुमचे Tradejini खाते ॲडमिनद्वारे मंजूर झाले आहे! पोर्टल सुरु झाले.', 
                'success'
              );
            }
          }
        } catch (e) {
          // Local storage fallback check
          const db = getUsersDB();
          const found = db.find(u => (u.phone && u.phone === user.phone) || (u.email && u.email === user.email));
          if (found && found.status === 'APPROVED') {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            setCurrentUser(found);
            modal.classList.remove('active');
            this.grantAccess(found);
          }
        }
      }, 3000);
    }
  },

  hidePendingModal() {
    const modal = document.getElementById('pendingApprovalModal');
    if (modal) modal.classList.remove('active');
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  },

  grantAccess(user) {
    this.hideAuthModal();
    this.hidePendingModal();

    // Unlock terminal view
    const vw = document.getElementById('viewsWrapper') || document.querySelector('.views-wrapper');
    if (vw) {
      vw.style.filter = 'none';
      vw.style.pointerEvents = 'auto';
    }

    const btnLogin = document.getElementById('btnHeaderLogin');
    if (btnLogin) btnLogin.style.display = 'none';

    const closeBtn = document.getElementById('btnCloseAuthModal');
    if (closeBtn) closeBtn.style.display = 'block';

    const badge = document.getElementById('userBadgeChip');
    const nameEl = document.getElementById('userBadgeName');
    const profName = document.getElementById('userProfileName');
    const profSub = document.getElementById('userProfileSub');
    const profStatus = document.getElementById('userProfileStatus');

    if (badge && nameEl) {
      badge.style.display = 'inline-flex';
      nameEl.textContent = user.name ? user.name.split(' ')[0] : 'User';
    }
    if (profName) profName.textContent = user.name || 'Member';
    if (profSub) {
      const tjPart = user.tradejiniClientId ? `TJ: ${user.tradejiniClientId}` : '';
      const phPart = user.phone ? `📱 ${user.phone}` : '';
      profSub.textContent = [tjPart, phPart].filter(Boolean).join(' • ') || user.email || '';
    }
    if (profStatus) {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      profStatus.textContent = isEn ? '🟢 Approved Access' : '🟢 अधिकृत ॲक्सेस (Approved)';
    }
  },

  logout() {
    setCurrentUser(null);
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Lock terminal view
    const vw = document.getElementById('viewsWrapper') || document.querySelector('.views-wrapper');
    if (vw) {
      vw.style.filter = 'blur(10px)';
      vw.style.pointerEvents = 'none';
    }

    const badge = document.getElementById('userBadgeChip');
    const menu = document.getElementById('userProfileMenu');
    const btnLogin = document.getElementById('btnHeaderLogin');
    const closeBtn = document.getElementById('btnCloseAuthModal');

    if (badge) badge.style.display = 'none';
    if (menu) menu.style.display = 'none';
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (closeBtn) closeBtn.style.display = 'none';

    const isEn = window.I18N && window.I18N.getLang() === 'en';
    showToastNotification(isEn ? 'Logged out successfully!' : 'यशस्वीरित्या लॉग आऊट झाले!', 'info');
    this.showAuthModal('login');
  },

  async handleQuickLogin(loginId, password) {
    if (!loginId || loginId.trim().length === 0) {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      showToastNotification(isEn ? 'Please enter your Tradejini Client ID or Mobile Number.' : 'कृपया Tradejini Client ID किंवा मोबाईल नंबर टाका.', 'error');
      return;
    }

    const clean = loginId.trim();
    const isVipMaster = clean.toUpperCase() === "FINVIP2026" || clean.toUpperCase() === "ADMIN@FIN2026" || clean.toUpperCase() === "VIP-FIN-ALL";
    if (isVipMaster) {
      this.handleVipUnlock(clean);
      return;
    }

    // Attempt Server Login API
    try {
      const res = await fetch('./api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: clean, password: password || '' })
      });
      const data = await res.json();

      if (res.ok && data.s === 'ok' && data.user) {
        setCurrentUser(data.user);
        this.grantAccess(data.user);
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        showToastNotification(isEn ? `Welcome back, ${data.user.name}!` : `स्वागत आहे, ${data.user.name}! लॉगिन यशस्वी.`, 'success');
        return;
      } else if (data.s === 'pending' && data.user) {
        setCurrentUser(data.user);
        this.showPendingModal(data.user);
        return;
      } else if (data.message) {
        showToastNotification(data.message, 'error');
        return;
      }
    } catch (e) {
      console.warn("Server login offline, falling back to local database:", e);
    }

    // Local Database Fallback
    const cleanPhone = clean.replace(/\D/g, '');
    const db = getUsersDB();

    let found = db.find(u => 
      (u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === clean.toUpperCase()) ||
      (cleanPhone.length === 10 && u.phone === cleanPhone) ||
      (u.vipKey && u.vipKey.toUpperCase() === clean.toUpperCase()) ||
      (u.email && u.email.toLowerCase() === clean.toLowerCase())
    );

    if (found) {
      if (password && found.password && found.password !== password.trim()) {
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        showToastNotification(isEn ? 'Invalid password. Please check your credentials.' : 'अवैध पासवर्ड! कृपया योग्य पासवर्ड प्रविष्ट करा.', 'error');
        return;
      }
      if (found.status === 'APPROVED') {
        setCurrentUser(found);
        this.grantAccess(found);
        const isEn = window.I18N && window.I18N.getLang() === 'en';
        showToastNotification(isEn ? `Welcome back, ${found.name}!` : `स्वागत आहे, ${found.name}! लॉगिन यशस्वी.`, 'success');
      } else {
        setCurrentUser(found);
        this.showPendingModal(found);
      }
      return;
    }

    const isEn = window.I18N && window.I18N.getLang() === 'en';
    showToastNotification(
      isEn 
        ? 'Account not found. Please switch to "Tradejini Onboarding" tab to register.' 
        : 'हे खाते सापडले नाही. कृपया "Tradejini नवीन नोंदणी" टॅबमधून माहिती भरा.', 
      'error'
    );
  },

  async handleRegistration(name, email, phone, password, tradejiniClientId) {
    const isEn = window.I18N && window.I18N.getLang() === 'en';

    if (!name || name.trim().length < 2) {
      showToastNotification(isEn ? "Please enter your full name." : "कृपया आपले पूर्ण नाव प्रविष्ट करा.", "error");
      return;
    }
    if (!email || !email.includes('@')) {
      showToastNotification(isEn ? "Please enter a valid email address." : "कृपया वैध ईमेल आयडी प्रविष्ट करा.", "error");
      return;
    }
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToastNotification(isEn ? "Please enter a valid 10-digit mobile number." : "कृपया वैध १० अंकी मोबाईल नंबर प्रविष्ट करा.", "error");
      return;
    }
    if (!password || password.trim().length < 4) {
      showToastNotification(isEn ? "Please create a password (min 4 characters)." : "कृपया किमान ४ अक्षरी पासवर्ड तयार करा.", "error");
      return;
    }
    const cleanTj = (tradejiniClientId || '').trim().toUpperCase();
    if (!cleanTj || cleanTj.length < 2) {
      showToastNotification(
        isEn 
          ? "Please enter your Tradejini Client ID. If you don't have one, please contact our help desk below." 
          : "कृपया तुमचा Tradejini क्लायंट आयडी प्रविष्ट करा. नसल्यास खालील क्रमांकांवर संपर्क साधा.", 
        "error"
      );
      return;
    }

    // Call Server Registration API
    try {
      const res = await fetch('./api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: cleanPhone,
          password: password.trim(),
          tradejiniClientId: cleanTj
        })
      });
      const data = await res.json();

      if (data.s === 'ok' || data.s === 'pending') {
        setCurrentUser(data.user);
        this.showPendingModal(data.user);
        showToastNotification(
          isEn 
            ? "Registration submitted successfully! Awaiting admin approval." 
            : "नोंदणी यशस्वी! ॲडमिन मंजुरीसाठी पाठवले आहे.", 
          "success"
        );
        return;
      } else if (data.s === 'approved') {
        setCurrentUser(data.user);
        this.grantAccess(data.user);
        showToastNotification(
          isEn ? `Welcome back, ${data.user.name}! Your account is approved.` : `स्वागत आहे, ${data.user.name}! तुमचे ॲक्सेस मंजूर आहे.`,
          "success"
        );
        return;
      } else if (data.message) {
        showToastNotification(data.message, "error");
        return;
      }
    } catch (e) {
      console.warn("Server register offline, fallback to local storage:", e);
    }

    // Local Storage Fallback
    const db = getUsersDB();
    let existing = db.find(u => u.phone === cleanPhone || u.email.toLowerCase() === email.toLowerCase() || (u.tradejiniClientId && u.tradejiniClientId.toUpperCase() === cleanTj));

    if (existing) {
      if (existing.status === 'APPROVED') {
        setCurrentUser(existing);
        this.grantAccess(existing);
        showToastNotification(`स्वागत आहे, ${existing.name}! तुमचे ॲक्सेस मंजूर आहे.`, "success");
        return;
      } else {
        existing.password = password.trim();
        existing.tradejiniClientId = cleanTj;
        saveUsersDB(db);
        setCurrentUser(existing);
        this.showPendingModal(existing);
        return;
      }
    }

    const vipKey = `VIP-${cleanPhone.slice(-4)}-${Math.floor(Math.random() * 899 + 100)}`;
    const newUser = {
      id: `usr_${Date.now()}`,
      name: name.trim(),
      phone: cleanPhone,
      email: email.trim().toLowerCase(),
      password: password.trim(),
      tradejiniClientId: cleanTj,
      status: 'PENDING',
      date: new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      vipKey: vipKey
    };

    db.unshift(newUser);
    saveUsersDB(db);
    setCurrentUser(newUser);
    this.showPendingModal(newUser);

    // Broadcast registration in real-time to cloud event bus
    await postCloudEvent({ action: "USER_REGISTER", user: newUser });
    await postCloudEvent({ action: "SYNC_ALL", users: db });
    showToastNotification("नोंदणी यशस्वी! ॲडमिन मंजुरीसाठी पाठवले आहे.", "success");
  },

  async handleVipUnlock(code) {
    if (!code) return;
    const clean = code.trim().toUpperCase();
    if (clean === "FINVIP2026" || clean === "ADMIN@FIN2026" || clean === "VIP-FIN-ALL") {
      const user = getCurrentUser() || {
        id: `vip_${Date.now()}`,
        name: "VIP Member",
        phone: "9822000000",
        email: "vip@tradingplatform.com",
        tradejiniClientId: "TR2488",
        status: "APPROVED"
      };
      user.status = 'APPROVED';
      setCurrentUser(user);
      this.grantAccess(user);
      showToastNotification("🎉 व्हीआयपी ॲक्सेस सक्रिय झाला! पोर्टल कायमस्वरूपी अनलॉक झाले आहे.", "success");
      return;
    }

    const db = getUsersDB();
    const found = db.find(u => u.vipKey && u.vipKey.toUpperCase() === clean);
    if (found) {
      found.status = 'APPROVED';
      saveUsersDB(db);
      setCurrentUser(found);
      this.grantAccess(found);
      await postCloudEvent({ action: "USER_APPROVE", phone: found.phone, id: found.id });
      await postCloudEvent({ action: "SYNC_ALL", users: db });
      showToastNotification(`🎉 अभिनंदन ${found.name}! व्हीआयपी कोडद्वारे पोर्टल मंजूर झाले आहे.`, "success");
    } else {
      showToastNotification("अवैध व्हीआयपी कोड! कृपया योग्य कोड टाका किंवा ॲडमिनशी संपर्क साधा.", "error");
    }
  },

  openAdminModal() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;
    modal.classList.add('active');
    if (this.isAdminLoggedIn) {
      this.renderAdminDashboard();
    } else {
      const gate = document.getElementById('adminAuthGate');
      const dash = document.getElementById('adminDashboardView');
      const pass = document.getElementById('adminPasswordInput');
      if (gate) gate.style.display = 'block';
      if (dash) dash.style.display = 'none';
      if (pass) { pass.value = ''; pass.focus(); }
    }
  },

  verifyAdminPin(pin) {
    if (pin === ADMIN_MASTER_PIN || pin === "admin123" || pin === "Admin@Fin777" || pin === "Admin@Fin2026") {
      this.isAdminLoggedIn = true;
      const gate = document.getElementById('adminAuthGate');
      const dash = document.getElementById('adminDashboardView');
      if (gate) gate.style.display = 'none';
      if (dash) dash.style.display = 'flex';
      this.renderAdminDashboard();
      syncUsersWithCloud();
    } else {
      showToastNotification("Invalid Admin PIN! Please enter the correct password.", "error");
    }
  },

  async renderAdminDashboard() {
    let db = getUsersDB();

    // Fetch latest users from Server API
    try {
      const res = await fetch('./api/admin/users?pin=Admin@Fin2026');
      if (res.ok) {
        const data = await res.json();
        if (data.s === 'ok' && Array.isArray(data.users)) {
          db = data.users;
          saveUsersDB(db);
        }
      }
    } catch (e) {}

    const tot = db.length;
    const app = db.filter(u => u.status === 'APPROVED').length;
    const pend = db.filter(u => u.status === 'PENDING').length;

    const elTot = document.getElementById('adminStatTotal');
    const elApp = document.getElementById('adminStatApproved');
    const elPend = document.getElementById('adminStatPending');
    if (elTot) elTot.textContent = tot;
    if (elApp) elApp.textContent = app;
    if (elPend) elPend.textContent = pend;

    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    if (db.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">No registration requests available.</td></tr>';
      return;
    }

    tbody.innerHTML = db.map(u => {
      const isApp = u.status === 'APPROVED';
      const statusPill = isApp
        ? '<span style="background:#ecfdf5; color:#065f46; font-weight:800; padding:2px 8px; border-radius:4px; font-size:11px;">🟢 Approved</span>'
        : '<span style="background:#fffbeb; color:#b45309; font-weight:800; padding:2px 8px; border-radius:4px; font-size:11px;">🟡 Pending</span>';

      const tjBadge = `<span class="badge-tj-id">${u.tradejiniClientId || '--'}</span>`;

      return `
        <tr>
          <td><strong>${u.name}</strong><br><small style="color:#64748b;">${u.email || ''}</small></td>
          <td>${u.phone}</td>
          <td>${tjBadge}</td>
          <td>${u.date || '--'}</td>
          <td>${statusPill}</td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!isApp ? `<button class="btn-admin-approve" onclick="AuthEngine.approveUser('${u.id}', '${u.phone}')">✅ Approve</button>` : ''}
            <button class="btn-admin-vip" onclick="AuthEngine.copyVipKey('${u.vipKey}', '${u.name}')" title="Copy VIP Access Key">🔑 VIP Key</button>
            <button class="btn-admin-del" onclick="AuthEngine.deleteUser('${u.id}', '${u.phone}')">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async approveUser(userId, phone) {
    try {
      const res = await fetch('./api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: 'Admin@Fin2026', userId, phone })
      });
      const data = await res.json();
      if (res.ok && data.s === 'ok') {
        showToastNotification(data.message || 'User approved successfully!', 'success');
      }
    } catch (e) {}

    const db = getUsersDB();
    const target = db.find(u => u.id === userId || (phone && u.phone === phone));
    if (target) {
      target.status = 'APPROVED';
      saveUsersDB(db);

      const curr = getCurrentUser();
      if (curr && (curr.id === userId || (phone && curr.phone === phone))) {
        curr.status = 'APPROVED';
        setCurrentUser(curr);
        this.grantAccess(curr);
      }

      await postCloudEvent({ action: "USER_APPROVE", phone: target.phone, id: target.id });
      await postCloudEvent({ action: "SYNC_ALL", users: db });
    }

    this.renderAdminDashboard();
  },

  async deleteUser(userId, phone) {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;

    try {
      await fetch('./api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: 'Admin@Fin2026', userId, phone })
      });
    } catch (e) {}

    let db = getUsersDB();
    const target = db.find(u => u.id === userId || (phone && u.phone === phone));
    db = db.filter(u => !(u.id === userId || (phone && u.phone === phone)));
    saveUsersDB(db);
    this.renderAdminDashboard();

    if (target) {
      await postCloudEvent({ action: "USER_DELETE", userId: userId, phone: target.phone });
    }
    await postCloudEvent({ action: "SYNC_ALL", users: db });
    showToastNotification("User deleted successfully.", "info");
  },

  copyVipKey(key, name) {
    const fullText = `VIP Access Key for ${name}:\nKey: ${key}\nLink: ${window.location.origin}${window.location.pathname}?vip=${key}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        showToastNotification("VIP Key copied to clipboard!", "success");
      }).catch(() => {
        showToastNotification(`VIP Code: ${key}`, "info");
      });
    } else {
      showToastNotification(`VIP Code: ${key}`, "info");
    }
  },

  bindEvents() {
    // 1. Dual Tab Switching (Login vs Tradejini Onboarding)
    const tabLogin = document.getElementById('tabBtnLogin');
    const tabRegister = document.getElementById('tabBtnRegister');
    if (tabLogin) tabLogin.addEventListener('click', () => this.showAuthModal('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => this.showAuthModal('register'));

    // Switch links
    const linkReg = document.getElementById('linkSwitchToRegister');
    if (linkReg) linkReg.addEventListener('click', () => this.showAuthModal('register'));
    const linkLog = document.getElementById('linkSwitchToLogin');
    if (linkLog) linkLog.addEventListener('click', () => this.showAuthModal('login'));

    // 2. Submit Quick Login
    const btnSubmitQuickLogin = document.getElementById('btnSubmitQuickLogin');
    const submitLoginAction = () => {
      const loginId = document.getElementById('authInputLoginId').value;
      const pass = document.getElementById('authInputLoginPassword')?.value || '';
      this.handleQuickLogin(loginId, pass);
    };
    if (btnSubmitQuickLogin) {
      btnSubmitQuickLogin.addEventListener('click', submitLoginAction);
    }
    ['authInputLoginId', 'authInputLoginPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submitLoginAction();
        });
      }
    });

    // 3. Submit Registration (Tradejini Onboarding)
    const btnSubmitAuth = document.getElementById('btnSubmitAuth');
    const submitRegisterAction = () => {
      const name = document.getElementById('authInputName').value;
      const email = document.getElementById('authInputEmail').value;
      const phone = document.getElementById('authInputPhone').value;
      const pass = document.getElementById('authInputPassword').value;
      const tjId = document.getElementById('authInputTjClientId').value;
      this.handleRegistration(name, email, phone, pass, tjId);
    };
    if (btnSubmitAuth) {
      btnSubmitAuth.addEventListener('click', submitRegisterAction);
    }

    // Pressing Enter on Tradejini Client ID field automatically triggers submission!
    ['authInputName', 'authInputEmail', 'authInputPhone', 'authInputPassword', 'authInputTjClientId'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submitRegisterAction();
        });
      }
    });

    // 4. Pending Modal Switch Account Button
    const btnPendingSwitch = document.getElementById('btnPendingSwitchAccount');
    if (btnPendingSwitch) {
      btnPendingSwitch.addEventListener('click', () => {
        this.logout();
      });
    }

    // 5. Header Login Button & Profile Toggle
    const btnHeaderLogin = document.getElementById('btnHeaderLogin');
    if (btnHeaderLogin) {
      btnHeaderLogin.addEventListener('click', () => {
        this.showAuthModal('login');
      });
    }

    const badgeChip = document.getElementById('userBadgeChip');
    const profileMenu = document.getElementById('userProfileMenu');
    if (badgeChip && profileMenu) {
      badgeChip.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', (e) => {
        if (!profileMenu.contains(e.target) && !badgeChip.contains(e.target)) {
          profileMenu.style.display = 'none';
        }
      });
    }

    const btnLogoutUser = document.getElementById('btnLogoutUser');
    if (btnLogoutUser) {
      btnLogoutUser.addEventListener('click', () => {
        this.logout();
      });
    }

    const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
    if (btnCloseAuthModal) {
      btnCloseAuthModal.addEventListener('click', () => {
        this.hideAuthModal();
        const vw = document.getElementById('viewsWrapper') || document.querySelector('.views-wrapper');
        if (vw) {
          vw.style.filter = '';
          vw.style.pointerEvents = 'auto';
        }
        if (AppState.chart && typeof AppState.chart.resize === 'function') {
          setTimeout(AppState.chart.resize, 50);
        }
      });
    }

    // 6. VIP Code Unlock
    const linkHaveVipCode = document.getElementById('linkHaveVipCode');
    if (linkHaveVipCode) {
      linkHaveVipCode.addEventListener('click', () => {
        const code = prompt("तुमचा व्हीआयपी अप्रूव्हल कोड (VIP Unlock Key) प्रविष्ट करा:");
        if (code) this.handleVipUnlock(code);
      });
    }

    const btnApplyVip = document.getElementById('btnApplyVipCode');
    if (btnApplyVip) {
      btnApplyVip.addEventListener('click', () => {
        const code = document.getElementById('inputVipCode').value;
        this.handleVipUnlock(code);
      });
    }

    // 7. Admin In-App Modal
    const linkAdminLogin = document.getElementById('linkAdminLogin');
    if (linkAdminLogin) {
      linkAdminLogin.addEventListener('click', () => {
        this.openAdminModal();
      });
    }

    const btnOpenAdmin = document.getElementById('btnOpenAdmin');
    if (btnOpenAdmin) {
      btnOpenAdmin.addEventListener('click', () => {
        this.openAdminModal();
      });
    }

    const btnCloseAdmin = document.getElementById('btnCloseAdmin');
    if (btnCloseAdmin) {
      btnCloseAdmin.addEventListener('click', () => {
        document.getElementById('adminModal').classList.remove('active');
      });
    }

    const btnVerifyAdmin = document.getElementById('btnVerifyAdmin');
    if (btnVerifyAdmin) {
      btnVerifyAdmin.addEventListener('click', () => {
        const pin = document.getElementById('adminPasswordInput').value;
        this.verifyAdminPin(pin);
      });
    }
    const adminPassInput = document.getElementById('adminPasswordInput');
    if (adminPassInput) {
      adminPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.verifyAdminPin(adminPassInput.value);
        }
      });
    }

    const btnRefreshCloud = document.getElementById('btnAdminRefreshCloud');
    if (btnRefreshCloud) {
      btnRefreshCloud.addEventListener('click', async () => {
        btnRefreshCloud.textContent = "⏳ Syncing...";
        await syncUsersWithCloud();
        await this.renderAdminDashboard();
        btnRefreshCloud.textContent = "🔄 Refresh (Sync Now)";
        showToastNotification("Cloud data synchronized successfully!", "success");
      });
    }

    const btnRenewDhan = document.getElementById('btnAdminRenewDhan');
    if (btnRenewDhan) {
      btnRenewDhan.addEventListener('click', async () => {
        btnRenewDhan.disabled = true;
        btnRenewDhan.textContent = "⏳ Generating Token...";
        try {
          const res = await fetch('./api/dhan/refresh', { method: 'POST' });
          const data = await res.json();
          if (data && data.s === 'ok') {
            showToastNotification("DhanHQ token regenerated successfully via TOTP!", "success");
            const badge = document.getElementById('adminDhanStatusBadge');
            if (badge) badge.innerHTML = "🟢 CONNECTED (TOTP)";
          } else {
            showToastNotification("Dhan renewal failed: " + (data.message || 'Error'), "error");
          }
        } catch (err) {
          showToastNotification("Renewal error: " + err.message, "error");
        } finally {
          btnRenewDhan.disabled = false;
          btnRenewDhan.textContent = "🔄 Re-authenticate Dhan (TOTP)";
        }
      });
    }

    const btnExport = document.getElementById('btnExportUsersJson');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const db = getUsersDB();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `trading_users_${Date.now()}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    }
  }
};
window.AuthEngine = AuthEngine;

// =============================================================================
// 2. Navigation Tab Switcher (Chart • Trade Setup • AAA)
// =============================================================================
function switchView(viewName) {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  const views = document.querySelectorAll('.app-view');
  views.forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });

  // Ensure scroll is at top when switching views
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const vw = document.querySelector('.views-wrapper');
  if (vw) vw.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  if (viewName === 'chart') {
    if (AppState.chart) {
      AppState.chart.resize();
      setTimeout(() => AppState.chart && AppState.chart.resize(), 60);
      setTimeout(() => AppState.chart && AppState.chart.resize(), 180);
    }
  } else if (viewName === 'trade-setup') {
    if (window.TradeSetupModule) {
      window.TradeSetupModule.init();
    }
  } else if (viewName === 'aaa') {
    if (window.AAAScreenerModule) {
      window.AAAScreenerModule.init();
    }
  }
}
window.switchView = switchView;

// =============================================================================
// 3. Major Indices Definition & Application State
// =============================================================================
const MAJOR_INDICES = [
  { symbol: "NIFTY 50", key: "nifty", name: "NIFTY 50 Benchmark Index", exchange: "NSE", yahoo: "^NSEI", basePrice: 22703.30, prevClose: 22553.00 },
  { symbol: "BANK NIFTY", key: "banknifty", name: "NIFTY Bank Index", exchange: "NSE", yahoo: "^NSEBANK", basePrice: 54998.80, prevClose: 54610.00 },
  { symbol: "SENSEX", key: "sensex", name: "BSE SENSEX Benchmark Index", exchange: "BSE", yahoo: "^BSESN", basePrice: 72886.70, prevClose: 72450.00 },
  { symbol: "MIDCAP NIFTY", key: "midcap", name: "NIFTY Midcap Select Index", exchange: "NSE", yahoo: "^NSEMDCP50", basePrice: 13798.00, prevClose: 13680.00 },
  { symbol: "FIN NIFTY", key: "finnifty", name: "NIFTY Financial Services Index", exchange: "NSE", yahoo: "NIFTY_FIN_SERVICE.NS", basePrice: 24877.40, prevClose: 24710.00 }
];

window.LIVE_TJ_QUOTES = {};

function applyQuoteToUniverse(sym, q) {
  if (!sym || !q || !q.price) return;
  const cleanSym = sym.toUpperCase().trim();
  window.LIVE_TJ_QUOTES[cleanSym] = q;

  MAJOR_INDICES.forEach(idx => {
    if (idx.symbol.toUpperCase() === cleanSym || idx.key.toUpperCase() === cleanSym) {
      idx.basePrice = q.price;
      idx.price = q.price;
      idx.prevClose = q.prevClose || q.open || q.price;
      idx.change = q.change;
      idx.changePercent = q.changePercent;
    }
  });

  const allStocks = window.NIFTY_500_STOCKS || [];
  allStocks.forEach(s => {
    if (s.symbol && s.symbol.toUpperCase() === cleanSym) {
      s.price = q.price;
      s.basePrice = q.price;
      s.prevClose = q.prevClose || q.open || q.price;
      s.change = q.change;
      s.changePercent = q.changePercent;
    }
  });

  const allMcx = window.MCX_COMMODITIES || [];
  allMcx.forEach(m => {
    if (m.symbol && m.symbol.toUpperCase() === cleanSym) {
      m.price = q.price;
      m.basePrice = q.price;
      m.prevClose = q.prevClose || q.open || q.price;
      m.change = q.change;
      m.changePercent = q.changePercent;
    }
  });
}

async function syncLiveQuotesFromTradejini() {
  try {
    const res = await fetch('./api/tradejini/quotes');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.s === 'ok' && data.quotes) {
      Object.keys(data.quotes).forEach(sym => {
        applyQuoteToUniverse(sym, data.quotes[sym]);
      });
      if (typeof window.renderWatchlistItems === 'function') {
        window.renderWatchlistItems();
      }
    }
  } catch (e) {}
}

function updateMajorIndicesPrices() {
  MAJOR_INDICES.forEach(idx => {
    const q = window.LIVE_TJ_QUOTES && window.LIVE_TJ_QUOTES[idx.symbol.toUpperCase()];
    if (q && q.price) {
      idx.basePrice = q.price;
      idx.prevClose = q.prevClose || idx.prevClose;
    }
  });
}

const AppState = {
  currentAsset: {
    symbol: "NIFTY 50",
    name: "NIFTY 50 Benchmark Index",
    exchange: "NSE",
    price: 22703.30,
    prevClose: 22553.00,
    change: 150.30,
    changePercent: 0.67,
    yahoo: "^NSEI"
  },
  prevClosePrice: 22553.00,
  currentTimeframe: "5",
  chartType: "candlestick",
  indicators: {
    ema21: true,
    ema9: false,
    ema50: false,
    ema200: false,
    rsi: true,
    vol: true,
    signals: true
  },
  currentDrawTool: 'crosshair',
  drawnPriceLines: [],
  rsiSettings: {
    length: 7,
    maLength: 14,
    upperBand: 80,
    midBand: 50,
    lowerBand: 20
  },
  customWatchlists: {},
  activeWatchlistId: "default",
  chart: null,
  liveCandles: [],
  candleCountdownTimer: null,
  livePollerTimer: null
};
window.AppState = AppState;

// =============================================================================
// 4. Market Hours & Autonomous Live Feed
// =============================================================================
const NSE_HOLIDAYS_SET = new Set([
  '2026-01-26', '2026-02-18', '2026-03-03', '2026-03-26', '2026-04-03',
  '2026-04-14', '2026-05-01', '2026-05-28', '2026-06-17', '2026-08-15',
  '2026-09-16', '2026-10-02', '2026-10-20', '2026-10-21', '2026-11-08',
  '2026-11-10', '2026-11-24', '2026-12-25'
]);

function isNseMarketOpen() {
  const istOffset = 19800000; // +05:30 in ms
  const istDate = new Date(Date.now() + istOffset);
  const day = istDate.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
  if (day === 0 || day === 6) return false;

  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  if (NSE_HOLIDAYS_SET.has(`${yyyy}-${mm}-${dd}`)) return false;

  const mins = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  return mins >= 555 && mins <= 930; // 09:15 to 15:30 IST
}

function isCurrentMarketOpen() {
  if (AppState.currentAsset && AppState.currentAsset.exchange === "MCX") {
    if (window.REAL_TJ_MARKET_STATUS && typeof window.REAL_TJ_MARKET_STATUS.MCX === 'number') {
      return window.REAL_TJ_MARKET_STATUS.MCX === 1;
    }
    return window.isMcxMarketOpen ? window.isMcxMarketOpen() : false;
  }
  // True exchange clock hours (09:15 to 15:30 IST on working days)
  if (isNseMarketOpen()) {
    return true;
  }
  if (window.REAL_TJ_MARKET_STATUS && window.REAL_TJ_MARKET_STATUS.NSE === 1) {
    return true;
  }
  return false;
}

function updateMarketStatusDisplay() {
  const label = document.getElementById('marketStatusLabel');
  if (!label) return;
  const dot = label.parentElement ? label.parentElement.querySelector('.pulse-dot') : null;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

  if (isCurrentMarketOpen()) {
    const liveTxt = window.I18N ? I18N.t('market_live') : 'LIVE OPEN';
    label.textContent = `${timeStr} IST • ${liveTxt}`;
    if (label.parentElement) {
      label.parentElement.style.background = '#ecfdf5';
      label.parentElement.style.borderColor = '#a7f3d0';
      label.parentElement.style.color = '#065f46';
    }
    if (dot) {
      dot.style.background = '#089981';
      dot.style.boxShadow = '0 0 0 0 rgba(8, 153, 129, 0.7)';
      dot.style.animation = 'pulseGreen 1.8s infinite';
    }
  } else {
    const closedTxt = window.I18N ? I18N.t('market_closed') : 'MARKET CLOSED';
    label.textContent = `${timeStr} IST • ${closedTxt}`;
    if (label.parentElement) {
      label.parentElement.style.background = '#f1f5f9';
      label.parentElement.style.borderColor = '#cbd5e1';
      label.parentElement.style.color = '#64748b';
    }
    if (dot) {
      dot.style.background = '#94a3b8';
      dot.style.boxShadow = 'none';
      dot.style.animation = 'none';
    }
  }
}

function getSecondsUntilCandleClose(timeframe) {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  const s = ist.getSeconds();
  const m = ist.getMinutes();
  const h = ist.getHours();

  if (timeframe === "1") {
    return 60 - s;
  } else if (timeframe === "5") {
    return (5 - (m % 5)) * 60 - s;
  } else if (timeframe === "15") {
    return (15 - (m % 15)) * 60 - s;
  } else if (timeframe === "60") {
    return (60 - m) * 60 - s;
  } else if (timeframe === "D") {
    const closeMins = (AppState.currentAsset.exchange === "MCX") ? (23 * 60 + 30) : (15 * 60 + 30);
    const currMins = h * 60 + m;
    const diff = (closeMins - currMins) * 60 - s;
    return Math.max(diff, 0);
  }
  return 60 - s;
}

function startCandleCountdown() {
  if (AppState.candleCountdownTimer) {
    clearInterval(AppState.candleCountdownTimer);
  }

  const el = document.getElementById('candle-countdown-val');

  AppState.candleCountdownTimer = setInterval(() => {
    updateMarketStatusDisplay();

    const rem = getSecondsUntilCandleClose(AppState.currentTimeframe);
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    if (el) {
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (rem === 1 && isCurrentMarketOpen()) {
      handleCandleRollover();
    }
  }, 1000);
}

function handleCandleRollover() {
  fetchLiveCandlesFromTradejini(AppState.currentAsset, false);
}

// -----------------------------------------------------------------------------
// Pure Native WebSocket Streaming Engine (DhanHQ Sub-Second Live Feed)
// -----------------------------------------------------------------------------
function initNativeWebSocketStream() {
  if (AppState.wsClient && (AppState.wsClient.readyState === WebSocket.OPEN || AppState.wsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = window.location.pathname.startsWith('/aaa') ? '/aaa/ws' : '/ws';
  const wsUrl = `${protocol}//${window.location.host}${basePath}`;
  console.log('[Native WebSocket] Connecting to live DhanHQ stream:', wsUrl);

  try {
    const ws = new WebSocket(wsUrl);
    AppState.wsClient = ws;

    ws.onopen = () => {
      console.log('[Native WebSocket] Connected to live tick stream!');
      const badgeText = document.getElementById('tjLoginBadgeText');
      if (badgeText) {
        badgeText.textContent = 'DhanHQ • Live WS';
      }
      const badgeDot = document.querySelector('#tjAutoLoginBadge .tj-dot');
      if (badgeDot) {
        badgeDot.style.background = '#22c55e';
      }

      // Immediately subscribe to current active asset and watchlist
      subscribeActiveSymbols();
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (!data) return;

        if (data.type === 'snapshot' || data.type === 'initialQuotes') {
          if (data.quotes) {
            const list = Array.isArray(data.quotes) ? data.quotes : Object.values(data.quotes);
            list.forEach(q => {
              if (q && q.symbol) {
                applyQuoteToUniverse(q.symbol, q);
              }
            });
            if (typeof window.renderWatchlistItems === 'function') {
              window.renderWatchlistItems();
            }
          }
          if (data.marketStatus) {
            window.REAL_TJ_MARKET_STATUS = data.marketStatus;
            updateMarketStatusDisplay();
          }
        } else if (data.type === 'tick' && data.tick) {
          handleIncomingLiveTick(data.tick);
        } else if (data.type === 'marketStatus' && data.status) {
          window.REAL_TJ_MARKET_STATUS = data.status;
          updateMarketStatusDisplay();
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      console.warn('[Native WebSocket] Connection dropped. Auto-reconnecting in 2s...');
      const badgeDot = document.querySelector('#tjAutoLoginBadge .tj-dot');
      if (badgeDot) {
        badgeDot.style.background = '#eab308';
      }
      setTimeout(initNativeWebSocketStream, 2000);
    };

    ws.onerror = (err) => {
      console.warn('[Native WebSocket] Stream error:', err);
    };
  } catch (e) {
    console.warn('[Native WebSocket] Initialization exception:', e);
    setTimeout(initNativeWebSocketStream, 3000);
  }
}

function subscribeActiveSymbols() {
  if (!AppState.wsClient || AppState.wsClient.readyState !== WebSocket.OPEN) return;
  const syms = new Set();
  if (AppState.currentAsset && AppState.currentAsset.symbol) {
    syms.add(AppState.currentAsset.symbol);
  }
  ['NIFTY 50', 'BANK NIFTY', 'FIN NIFTY', 'MIDCAP NIFTY', 'SENSEX', 'GOLD', 'CRUDE OIL', 'RELIANCE', 'ADANIENT', 'ADANIPORTS', 'TCS', 'HDFCBANK', 'INFY'].forEach(s => syms.add(s));

  const currList = AppState.activeWatchlistTab === 'indices' ? (window.CORE_INDICES || []) :
                   AppState.activeWatchlistTab === 'mcx' ? (window.MCX_COMMODITIES || []) : (window.NIFTY_STOCKS || []);
  currList.forEach(item => {
    if (item && item.symbol) syms.add(item.symbol);
  });

  AppState.wsClient.send(JSON.stringify({
    type: 'subscribe',
    symbols: Array.from(syms)
  }));
}

let watchlistRenderTimer = null;
function scheduleWatchlistRender() {
  if (watchlistRenderTimer) return;
  watchlistRenderTimer = setTimeout(() => {
    watchlistRenderTimer = null;
    if (typeof window.renderWatchlistItems === 'function') {
      window.renderWatchlistItems();
    }
  }, 1200);
}

function getTimeframeDurationMs(tf) {
  const norm = String(tf || '5').toUpperCase();
  if (norm === '1' || norm === '1M') return 60 * 1000;
  if (norm === '5' || norm === '5M') return 5 * 60 * 1000;
  if (norm === '15' || norm === '15M') return 15 * 60 * 1000;
  if (norm === '60' || norm === '1H') return 60 * 60 * 1000;
  if (norm === 'D' || norm === '1D') return 24 * 60 * 60 * 1000;
  if (norm === 'W' || norm === '1W') return 7 * 24 * 60 * 60 * 1000;
  if (norm === 'M' || norm === '1M_MONTH') return 30 * 24 * 60 * 60 * 1000;
  return 5 * 60 * 1000;
}

function handleIncomingLiveTick(tick) {
  if (!tick || !tick.symbol) return;
  const sym = tick.symbol.toUpperCase().trim();

  // 1. Update live quote universe & watchlist cache
  applyQuoteToUniverse(sym, tick);

  // Directly update specific DOM node without rebuilding whole watchlist DOM
  const priceEl = document.getElementById(`wl-price-${sym}`);
  const pctEl = document.getElementById(`wl-pct-${sym}`);
  if (priceEl && tick.price > 0) {
    priceEl.textContent = `₹${tick.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }
  if (pctEl && typeof tick.changePercent === 'number') {
    const isUp = tick.changePercent >= 0;
    const sign = isUp ? '+' : '';
    pctEl.textContent = `${sign}${tick.changePercent.toFixed(2)}%`;
    pctEl.style.color = isUp ? 'var(--green-bull)' : 'var(--red-bear)';
    pctEl.style.background = isUp ? '#ecfdf5' : '#fef2f2';
  }

  // Throttled full watchlist update (max once per 1.2s to prevent UI thread lockup & dropped clicks)
  scheduleWatchlistRender();

  // 2. Active Chart Asset Live Tick Update
  const currSym = (AppState.currentAsset && AppState.currentAsset.symbol ? AppState.currentAsset.symbol : '').toUpperCase().trim();
  const cleanStr = (s) => String(s || '').toUpperCase().replace(/[\s\-_.]/g, '');
  const cSym = cleanStr(currSym);
  const tSym = cleanStr(sym);
  const isMatch = (
    cSym === tSym ||
    (cSym === 'NIFTY50' && (tSym === 'NIFTY' || tSym === 'NIFTY50' || tSym === '1NSE')) ||
    (cSym === 'BANKNIFTY' && (tSym === 'BANKNIFTY' || tSym === '20NSE')) ||
    (cSym === 'FINNIFTY' && (tSym === 'FINNIFTY' || tSym === '21NSE')) ||
    (cSym === 'MIDCAPNIFTY' && (tSym === 'MIDCAP' || tSym === 'MIDCAPNIFTY' || tSym === '18NSE')) ||
    (cSym === 'SENSEX' && (tSym === 'SENSEX' || tSym === '51BSE')) ||
    (cSym.includes('GOLD') && tSym.includes('GOLD')) ||
    (cSym.includes('CRUDE') && tSym.includes('CRUDE')) ||
    (cSym === 'TATAMOTORS' && (tSym === 'TMCV' || tSym === 'TMPV' || tSym === 'TATAMOTORS')) ||
    (cSym === 'LTIM' && (tSym === 'LTM' || tSym === 'LTIM')) ||
    (cSym === 'REC' && (tSym === 'RECLTD' || tSym === 'REC')) ||
    (cSym.includes('ICICIPRU') && tSym.includes('ICICI'))
  );

  if (isMatch) {
    if (tick.price > 0) {
      AppState.currentAsset.price = tick.price;
      updateHeaderPrice(tick.price);
    }

    if (AppState.liveCandles && AppState.liveCandles.length > 0) {
      const lastCandle = AppState.liveCandles[AppState.liveCandles.length - 1];
      const tf = AppState.currentTimeframe;
      const tfMs = getTimeframeDurationMs(tf);
      let tickTs = tick.timestamp || (tick.time ? tick.time * 1000 : Date.now());
      // Guard against future timestamps or excessive skew
      if (tickTs > Date.now() + 60000 || tickTs < Date.now() - 86400000 * 7) {
        tickTs = Date.now();
      }
      const barStartTs = Math.floor(tickTs / tfMs) * tfMs;

      let targetCandle = lastCandle;
      // If tick timestamp crosses into a new intraday candle period, spawn a new candle
      if (['1', '5', '15', '60'].includes(tf) && barStartTs > lastCandle.timestamp) {
        const ist = formatIst(barStartTs);
        targetCandle = {
          timestamp: barStartTs,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.volume || 0,
          date: ist.hhmm,
          time: `${ist.hhmm} IST`,
          fullDate: ist.fullDate
        };
        AppState.liveCandles.push(targetCandle);
      } else if (tf === 'D') {
        const todayFullDate = formatIst(Date.now()).fullDate;
        if (lastCandle.fullDate !== todayFullDate) {
          const ist = formatIst(Date.now());
          const todayStartMs = new Date(ist.fullDate).getTime() || Date.now();
          targetCandle = {
            timestamp: todayStartMs,
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
            volume: tick.volume || 0,
            date: ist.ddMon,
            time: 'Daily (1D)',
            fullDate: todayFullDate
          };
          AppState.liveCandles.push(targetCandle);
        } else {
          if (tick.price > targetCandle.high) targetCandle.high = tick.price;
          if (tick.price < targetCandle.low && tick.price > 0) targetCandle.low = tick.price;
          targetCandle.close = tick.price;
          if (tick.volume) targetCandle.volume = tick.volume;
        }
      } else {
        if (tick.price > targetCandle.high) targetCandle.high = tick.price;
        if (tick.price < targetCandle.low && tick.price > 0) targetCandle.low = tick.price;
        targetCandle.close = tick.price;
        if (tick.volume) targetCandle.volume = tick.volume;
      }

      // Real-Time Sub-Second update on TradingView Series (shifted by IST_OFFSET_SEC)
      const tsSec = Math.floor(Number(targetCandle.timestamp) / 1000) + IST_OFFSET_SEC;
      if (AppState.chartType === 'line' && AppState.tvAreaSeries) {
        AppState.tvAreaSeries.update({ time: tsSec, value: targetCandle.close });
      } else if (AppState.tvCandleSeries) {
        let o = targetCandle.open, h = targetCandle.high, l = targetCandle.low, cl = targetCandle.close;
        if (AppState.chartType === 'heikinashi' && AppState.liveCandles.length >= 2) {
          const prevCandle = AppState.liveCandles[AppState.liveCandles.length - 2];
          const prevHaOpen = prevCandle.haOpen != null ? prevCandle.haOpen : (prevCandle.open + prevCandle.close) / 2;
          const prevHaClose = prevCandle.haClose != null ? prevCandle.haClose : (prevCandle.open + prevCandle.high + prevCandle.low + prevCandle.close) / 4;
          const haClose = (o + h + l + cl) / 4;
          const haOpen = (prevHaOpen + prevHaClose) / 2;
          const haHigh = Math.max(h, haOpen, haClose);
          const haLow = Math.min(l, haOpen, haClose);
          targetCandle.haOpen = Number(haOpen.toFixed(2));
          targetCandle.haHigh = Number(haHigh.toFixed(2));
          targetCandle.haLow = Number(haLow.toFixed(2));
          targetCandle.haClose = Number(haClose.toFixed(2));
          o = targetCandle.haOpen;
          h = targetCandle.haHigh;
          l = targetCandle.haLow;
          cl = targetCandle.haClose;
        }
        AppState.tvCandleSeries.update({
          time: tsSec,
          open: o,
          high: h,
          low: l,
          close: cl
        });
      }

      if (AppState.tvVolumeSeries && targetCandle.volume) {
        AppState.tvVolumeSeries.update({
          time: tsSec,
          value: targetCandle.volume,
          color: targetCandle.close >= targetCandle.open ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)'
        });
      }

      // Update OHLC display banner above chart
      updateOHLCDisplay(targetCandle);
    }
  }
}

function startLivePoller() {
  // Clear any existing polling intervals - pure WebSocket only!
  if (AppState.livePollerTimer) {
    clearInterval(AppState.livePollerTimer);
    AppState.livePollerTimer = null;
  }
  if (AppState.quotesPollerTimer) {
    clearInterval(AppState.quotesPollerTimer);
    AppState.quotesPollerTimer = null;
  }

  // Connect native WebSocket
  initNativeWebSocketStream();
}

async function updateTradejiniBadge() {
  const badgeText = document.getElementById('tjLoginBadgeText');
  const badgeDot = document.querySelector('#tjAutoLoginBadge .tj-dot');
  if (!badgeText) return;
  try {
    const res = await fetch('./api/tradejini/status');
    if (!res.ok) return;
    const data = await res.json();
    if (AppState.wsClient && AppState.wsClient.readyState === WebSocket.OPEN) {
      badgeText.textContent = 'DhanHQ • Live WS';
      if (badgeDot) badgeDot.style.background = '#22c55e';
    } else if (data.connected) {
      badgeText.textContent = `${data.clientCode || 'TR2488'} • ${data.todayDate || 'Live'}`;
      if (badgeDot) badgeDot.style.background = '#22c55e';
    } else {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      badgeText.textContent = isEn ? 'Tradejini Login Required' : 'Tradejini री-लॉगिन आवश्यक';
      if (badgeDot) badgeDot.style.background = '#ef4444';
    }
  } catch (e) {
    // Keep current
  }
}

function initTradejiniAutoLoginBadge() {
  updateTradejiniBadge();
  setInterval(updateTradejiniBadge, 30000);

  const btnRefresh = document.getElementById('btnRefreshTjAuth');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnRefresh.style.animation = 'spin 0.8s linear infinite';
      try {
        const res = await fetch('./api/tradejini/auth-refresh', { method: 'POST' });
        const data = await res.json();
        if (data && data.s === 'ok') {
          showToastNotification(`Tradejini ऑटो-लॉगिन यशस्वी (${data.clientCode}) • आजचा डेटा (${data.todayDate}) रिफ्रेश झाला!`, 'success');
          updateTradejiniBadge();
          if (AppState.currentAsset) {
            fetchLiveCandlesFromTradejini(AppState.currentAsset, false);
          }
          if (window.AAAScreenerModule && typeof window.AAAScreenerModule.runScreener === 'function') {
            window.AAAScreenerModule.runScreener();
          }
        } else {
          showToastNotification(`Tradejini लॉगिन त्रुटी: ${data.message || 'Error'}`, 'error');
        }
      } catch (err) {
        showToastNotification(`सर्व्हर कनेक्ट त्रुटी: ${err.message}`, 'error');
      } finally {
        setTimeout(() => { btnRefresh.style.animation = ''; }, 600);
      }
    });
  }
}

async function fetchLiveCandlesFromTradejini(asset, resetZoom = false) {
  if (!asset || !asset.symbol) return;
  const sym = asset.symbol;
  const tf = AppState.currentTimeframe;

  try {
    const days = (tf === 'W' || tf === 'M') ? 365 : (tf === 'D' ? 90 : 7);
    const res = await fetch(`./api/tradejini/candles?symbol=${encodeURIComponent(sym)}&interval=${tf}&days=${days}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.s === 'ok' && Array.isArray(data.candles) && data.candles.length > 0) {
      const incoming = data.candles;
      AppState.liveCandles = incoming;
      const last = incoming[incoming.length - 1];
      if (data.quote && data.quote.prevClose) {
        AppState.prevClosePrice = data.quote.prevClose;
        AppState.currentAsset.prevClose = data.quote.prevClose;
        applyQuoteToUniverse(sym, data.quote);
      } else if (last) {
        for (let i = incoming.length - 2; i >= 0; i--) {
          if (incoming[i].fullDate && incoming[i].fullDate !== last.fullDate) {
            AppState.prevClosePrice = incoming[i].close;
            AppState.currentAsset.prevClose = incoming[i].close;
            break;
          }
        }
      }
      if (last) {
        AppState.currentAsset.price = last.close;
        updateHeaderPrice(last.close);
        updateOHLCDisplay(last);
        if (!data.quote) {
          const pc = AppState.prevClosePrice || incoming[0].open;
          const chg = Number((last.close - pc).toFixed(2));
          const pct = pc > 0 ? Number(((chg / pc) * 100).toFixed(2)) : 0;
          applyQuoteToUniverse(sym, { symbol: sym, price: last.close, prevClose: pc, change: chg, changePercent: pct });
        }
        if (typeof window.renderWatchlistItems === 'function') {
          window.renderWatchlistItems();
        }
      }
      if (resetZoom) {
        AppState._zoomNeedsReset = true;
      }
      renderEChart(resetZoom);
    }
  } catch (e) {
    // Continuous polling catch
  }
}

// =============================================================================
// 5. Technical Indicators (RSI 7, MA 14, EMA 20)
// =============================================================================
function calculateRSI(closes, period = 7) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : Number((100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
  }
  return rsi;
}

function calculateSMA(data, period = 14) {
  const sma = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = 0; j < period; j++) {
      if (data[i - j] != null) {
        sum += data[i - j];
        count++;
      }
    }
    if (count === period) {
      sma[i] = Number((sum / period).toFixed(2));
    }
  }
  return sma;
}

function calculateEMA(data, period = 21) {
  if (!data || data.length === 0) return [];
  const n = data.length;
  const ema = new Array(n);
  const k = 2 / (period + 1);

  let currentEma = (data[0] != null && !isNaN(data[0])) ? data[0] : 0;
  ema[0] = Number(currentEma.toFixed(2));

  for (let i = 1; i < n; i++) {
    const val = data[i];
    if (val == null || isNaN(val)) {
      ema[i] = ema[i - 1];
    } else {
      currentEma = (val - currentEma) * k + currentEma;
      ema[i] = Number(currentEma.toFixed(2));
    }
  }
  return ema;
}

// =============================================================================
// 6. ECharts Candlestick & Indicator Rendering (White Theme)
// =============================================================================
// =============================================================================
// 6. TradingView Lightweight Charts & Technical Indicators (Native Pan & Margin)
// =============================================================================
function renderEChart(resetZoom = false) {
  const container = document.getElementById('echarts-candlestick-container');
  if (!container) return;

  const candles = AppState.liveCandles || [];
  if (candles.length === 0) return;

  const rsiPaneWrapper = document.getElementById('tv-rsi-subpane-wrapper');
  const rsiContainer = document.getElementById('tv-rsi-chart-container');
  const hasRsi = Boolean(AppState.indicators.rsi);

  if (rsiPaneWrapper) {
    rsiPaneWrapper.style.display = hasRsi ? 'flex' : 'none';
  }

  // 1. Initialize TradingView Main Price Chart if not already created
  if (!AppState.tvChart) {
    container.innerHTML = '';
    if (typeof LightweightCharts === 'undefined') {
      console.error('TradingView LightweightCharts library not loaded');
      return;
    }

    AppState.tvChart = LightweightCharts.createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 420,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#334155',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      },
      localization: {
        priceFormatter: (p) => (typeof p === 'number' ? p.toFixed(2) : p),
        timeFormatter: (timeVal) => {
          const tsMs = typeof timeVal === 'number' ? (timeVal - IST_OFFSET_SEC) * 1000 : new Date(timeVal).getTime();
          const ist = formatIst(tsMs);
          return AppState.currentTimeframe === 'D' ? ist.fullDate : `${ist.ddMon} ${ist.hhmm} IST`;
        }
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#2563eb', width: 1, style: 2, labelBackgroundColor: '#0f172a' },
        horzLine: { color: '#2563eb', width: 1, style: 2, labelBackgroundColor: '#0f172a' }
      },
      rightPriceScale: {
        borderColor: '#e2e8f0',
        scaleMargins: {
          top: 0.08,
          bottom: 0.20 // Confines price candles above volume (NEVER OVERLAP!)
        }
      },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // DRAGGING LEFT REVEALS OPEN CANVAS ON RIGHT!
        barSpacing: 10,
        minBarSpacing: 3,
        fixLeftEdge: false,
        tickMarkFormatter: (timeVal, tickMarkType) => {
          const tsMs = typeof timeVal === 'number' ? (timeVal - IST_OFFSET_SEC) * 1000 : new Date(timeVal).getTime();
          const ist = formatIst(tsMs);
          if (tickMarkType === 3) {
            return ist.hhmm;
          }
          if (tickMarkType === 2) {
            return ist.ddMon;
          }
          if (tickMarkType === 1) {
            return ist.mon;
          }
          if (tickMarkType === 0) {
            return String(ist.yyyy);
          }
          return null;
        }
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });

    // Auto-Resize Observer on Container
    AppState.chart = {
      resize: () => {
        if (AppState.tvChart && container) {
          AppState.tvChart.applyOptions({
            width: container.clientWidth || 800,
            height: container.clientHeight || 380
          });
        }
        if (AppState.tvRsiChart && rsiContainer && rsiPaneWrapper && rsiPaneWrapper.style.display !== 'none') {
          AppState.tvRsiChart.applyOptions({
            width: rsiContainer.clientWidth || 800,
            height: rsiContainer.clientHeight || 95
          });
        }
      }
    };

    const ro = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !AppState.tvChart) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        AppState.tvChart.applyOptions({ width, height });
      }
    });
    ro.observe(container);

    // Crosshair Hover Handler
    AppState.tvChart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        if (AppState.liveCandles && AppState.liveCandles.length > 0) {
          const last = AppState.liveCandles[AppState.liveCandles.length - 1];
          const cl = AppState.liveCandles.map(x => x.close);
          const rArr = calculateRSI(cl, AppState.rsiSettings.length || 7);
          const rmArr = calculateSMA(rArr, AppState.rsiSettings.maLength || 14);
          const eArr = calculateEMA(cl, 21);
          const li = cl.length - 1;
          updateOHLCDisplay(last, rArr[li], rmArr[li], eArr[li]);
        }
        return;
      }

      const activeMain = (AppState.chartType === 'line') ? AppState.tvAreaSeries : AppState.tvCandleSeries;
      const barData = activeMain ? param.seriesData.get(activeMain) : null;
      const volData = AppState.tvVolumeSeries ? param.seriesData.get(AppState.tvVolumeSeries) : null;
      const emaData = AppState.tvEma21Series ? param.seriesData.get(AppState.tvEma21Series) : null;
      const rsiData = AppState.tvRsiSeries ? param.seriesData.get(AppState.tvRsiSeries) : null;
      const rsiMaData = AppState.tvRsiMaSeries ? param.seriesData.get(AppState.tvRsiMaSeries) : null;

      if (barData) {
        const rawTs = typeof param.time === 'number' ? (param.time - IST_OFFSET_SEC) * 1000 : new Date(param.time).getTime();
        const ist = formatIst(rawTs);
        const candleObj = {
          fullDate: ist.fullDate,
          time: AppState.currentTimeframe === 'D' ? 'Daily (1D)' : `${ist.hhmm} IST`,
          open: barData.open !== undefined ? barData.open : barData.value,
          high: barData.high !== undefined ? barData.high : barData.value,
          low: barData.low !== undefined ? barData.low : barData.value,
          close: barData.close !== undefined ? barData.close : barData.value,
          volume: volData ? volData.value : 0
        };
        updateOHLCDisplay(
          candleObj,
          rsiData ? rsiData.value : null,
          rsiMaData ? rsiMaData.value : null,
          emaData ? emaData.value : null
        );
      }
    });
  }

  // 2. Initialize Dedicated RSI Sub-Pane Chart if enabled
  if (hasRsi && rsiContainer) {
    if (!AppState.tvRsiChart) {
      rsiContainer.innerHTML = '';
      AppState.tvRsiChart = LightweightCharts.createChart(rsiContainer, {
        width: rsiContainer.clientWidth || 800,
        height: rsiContainer.clientHeight || 95,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#64748b',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        },
        localization: {
          priceFormatter: (p) => (typeof p === 'number' ? p.toFixed(1) : p),
          timeFormatter: (timeVal) => {
            const tsMs = typeof timeVal === 'number' ? (timeVal - IST_OFFSET_SEC) * 1000 : new Date(timeVal).getTime();
            const ist = formatIst(tsMs);
            return AppState.currentTimeframe === 'D' ? ist.fullDate : `${ist.ddMon} ${ist.hhmm} IST`;
          }
        },
        grid: {
          vertLines: { color: '#f8fafc' },
          horzLines: { color: '#f1f5f9' }
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#7c3aed', width: 1, style: 2 },
          horzLine: { color: '#7c3aed', width: 1, style: 2 }
        },
        rightPriceScale: {
          borderColor: '#e2e8f0',
          scaleMargins: { top: 0.12, bottom: 0.12 },
          autoScale: false
        },
        timeScale: {
          visible: false,
          borderColor: '#e2e8f0',
          rightOffset: 12
        }
      });

      AppState.tvRsiSeries = AppState.tvRsiChart.addLineSeries({
        color: '#7c3aed',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'RSI(7)'
      });

      AppState.tvRsiMaSeries = AppState.tvRsiChart.addLineSeries({
        color: '#2563eb',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'MA(14)'
      });

      // Fixed Reference Levels (80 Overbought, 50 Midline, 20 Oversold)
      AppState.tvRsiSeries.createPriceLine({
        price: 80,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'OB 80'
      });
      AppState.tvRsiSeries.createPriceLine({
        price: 50,
        color: '#94a3b8',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: '50'
      });
      AppState.tvRsiSeries.createPriceLine({
        price: 20,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'OS 20'
      });

      const rsiRo = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || !AppState.tvRsiChart) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0) {
          AppState.tvRsiChart.applyOptions({ width, height: height || 95 });
        }
      });
      rsiRo.observe(rsiContainer);
    }

    // Attach range synchronization only once with a mutual recursion guard
    if (!AppState._rangeSyncAttached && AppState.tvChart && AppState.tvRsiChart) {
      AppState._rangeSyncAttached = true;
      let isSyncingRange = false;

      AppState.tvChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingRange || !range || !AppState.tvRsiChart) return;
        isSyncingRange = true;
        try { AppState.tvRsiChart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
        isSyncingRange = false;
      });

      AppState.tvRsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingRange || !range || !AppState.tvChart) return;
        isSyncingRange = true;
        try { AppState.tvChart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
        isSyncingRange = false;
      });
    }
  }

  // 3. Technical Calculations (Closes, RSI, Moving Averages)
  const isLine = AppState.chartType === 'line';
  const isHa = AppState.chartType === 'heikinashi';

  // Strictly deduplicate candles chronologically by timestamp
  const cleanCandles = [];
  const seenSecs = new Set();
  for (const c of candles) {
    if (!c || !c.timestamp) continue;
    const s = Math.floor(Number(c.timestamp) / 1000);
    if (!isNaN(s) && !seenSecs.has(s)) {
      seenSecs.add(s);
      cleanCandles.push(c);
    }
  }
  cleanCandles.sort((a, b) => a.timestamp - b.timestamp);
  if (cleanCandles.length === 0) return;

  const closes = cleanCandles.map(c => c.close);
  const rsiValues = calculateRSI(closes, AppState.rsiSettings.length || 7);
  const rsiMa = calculateSMA(rsiValues, AppState.rsiSettings.maLength || 14);

  // Manage Main Series (Candle vs Area)
  if (isLine) {
    if (AppState.tvCandleSeries) {
      AppState.tvChart.removeSeries(AppState.tvCandleSeries);
      AppState.tvCandleSeries = null;
    }
    if (!AppState.tvAreaSeries) {
      AppState.tvAreaSeries = AppState.tvChart.addAreaSeries({
        topColor: 'rgba(37, 99, 235, 0.28)',
        bottomColor: 'rgba(37, 99, 235, 0.0)',
        lineColor: '#2563eb',
        lineWidth: 2,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineColor: '#2563eb',
        priceLineStyle: 2,
        axisLabelVisible: true,
        lastValueVisible: true
      });
    }
  } else {
    if (AppState.tvAreaSeries) {
      AppState.tvChart.removeSeries(AppState.tvAreaSeries);
      AppState.tvAreaSeries = null;
    }
    if (!AppState.tvCandleSeries) {
      AppState.tvCandleSeries = AppState.tvChart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineColor: '#2563eb',
        priceLineStyle: 2,
        axisLabelVisible: true,
        lastValueVisible: true
      });
    }
  }

  // Manage Volume Series
  if (!AppState.tvVolumeSeries) {
    AppState.tvVolumeSeries = AppState.tvChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });
    AppState.tvVolumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    });
  }

  // 4. Manage Moving Averages Helper
  function syncEma(flag, period, color, width, label, propName) {
    if (AppState.indicators[flag]) {
      if (!AppState[propName]) {
        AppState[propName] = AppState.tvChart.addLineSeries({
          color: color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: true,
          title: label
        });
      }
    } else if (AppState[propName]) {
      AppState.tvChart.removeSeries(AppState[propName]);
      AppState[propName] = null;
    }
  }

  syncEma('ema21', 21, '#f59e0b', 2, 'EMA 21', 'tvEma21Series');
  syncEma('ema9', 9, '#2563eb', 1.5, 'EMA 9', 'tvEma9Series');
  syncEma('ema50', 50, '#8b5cf6', 1.8, 'EMA 50', 'tvEma50Series');
  syncEma('ema200', 200, '#dc2626', 2, 'EMA 200', 'tvEma200Series');

  const ema21 = AppState.indicators.ema21 ? calculateEMA(closes, 21) : [];
  const ema9 = AppState.indicators.ema9 ? calculateEMA(closes, 9) : [];
  const ema50 = AppState.indicators.ema50 ? calculateEMA(closes, 50) : [];
  const ema200 = AppState.indicators.ema200 ? calculateEMA(closes, 200) : [];

  // Format Items
  const candleItems = [];
  const areaItems = [];
  const volumeItems = [];
  const ema21Items = [];
  const ema9Items = [];
  const ema50Items = [];
  const ema200Items = [];
  const rsiItems = [];
  const rsiMaItems = [];

  let prevHaOpen = cleanCandles[0].open;
  let prevHaClose = cleanCandles[0].close;

  for (let i = 0; i < cleanCandles.length; i++) {
    const c = cleanCandles[i];
    const tsSec = Math.floor(Number(c.timestamp) / 1000) + IST_OFFSET_SEC;

    let o = c.open, h = c.high, l = c.low, cl = c.close;
    if (isHa) {
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);
      prevHaOpen = haOpen;
      prevHaClose = haClose;
      o = Number(haOpen.toFixed(2));
      h = Number(haHigh.toFixed(2));
      l = Number(haLow.toFixed(2));
      cl = Number(haClose.toFixed(2));
    }

    if (isLine) {
      areaItems.push({ time: tsSec, value: cl });
    } else {
      candleItems.push({ time: tsSec, open: o, high: h, low: l, close: cl });
    }

    const volVal = (typeof c.volume === 'number' && c.volume > 0) ? c.volume : 0;
    const isUp = cl >= o;
    volumeItems.push({
      time: tsSec,
      value: volVal,
      color: isUp ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)'
    });

    if (AppState.indicators.ema21 && ema21[i] != null) ema21Items.push({ time: tsSec, value: Number(ema21[i]) });
    if (AppState.indicators.ema9 && ema9[i] != null) ema9Items.push({ time: tsSec, value: Number(ema9[i]) });
    if (AppState.indicators.ema50 && ema50[i] != null) ema50Items.push({ time: tsSec, value: Number(ema50[i]) });
    if (AppState.indicators.ema200 && ema200[i] != null) ema200Items.push({ time: tsSec, value: Number(ema200[i]) });

    if (rsiValues[i] != null && !isNaN(rsiValues[i])) rsiItems.push({ time: tsSec, value: Number(rsiValues[i].toFixed(2)) });
    if (rsiMa[i] != null && !isNaN(rsiMa[i])) rsiMaItems.push({ time: tsSec, value: Number(rsiMa[i].toFixed(2)) });
  }

  // Set Series Data
  if (isLine && AppState.tvAreaSeries) {
    AppState.tvAreaSeries.setData(areaItems);
  } else if (AppState.tvCandleSeries) {
    AppState.tvCandleSeries.setData(candleItems);
  }

  if (AppState.tvVolumeSeries) {
    AppState.tvVolumeSeries.applyOptions({ visible: Boolean(AppState.indicators.vol) });
    AppState.tvVolumeSeries.setData(volumeItems);
  }

  if (AppState.tvEma21Series) AppState.tvEma21Series.setData(ema21Items);
  if (AppState.tvEma9Series) AppState.tvEma9Series.setData(ema9Items);
  if (AppState.tvEma50Series) AppState.tvEma50Series.setData(ema50Items);
  if (AppState.tvEma200Series) AppState.tvEma200Series.setData(ema200Items);

  // Set RSI Sub-Pane Data
  if (hasRsi && AppState.tvRsiSeries && AppState.tvRsiMaSeries) {
    AppState.tvRsiSeries.setData(rsiItems);
    AppState.tvRsiMaSeries.setData(rsiMaItems);
    const curRange = AppState.tvChart.timeScale().getVisibleLogicalRange();
    if (curRange && AppState.tvRsiChart) {
      try { AppState.tvRsiChart.timeScale().setVisibleLogicalRange(curRange); } catch (e) {}
    }
  }

  // 5. 5-Min HA + RSI(7) (80/20) Strategy Reversal Markers
  if (AppState.indicators.signals && AppState.tvCandleSeries && candleItems.length >= 4) {
    const markers = [];
    let hO = cleanCandles[0].open, hC = cleanCandles[0].close;
    const haList = [];
    for (let i = 0; i < cleanCandles.length; i++) {
      const c = cleanCandles[i];
      const curHC = (c.open + c.high + c.low + c.close) / 4;
      const curHO = i === 0 ? (c.open + c.close) / 2 : (hO + hC) / 2;
      const curHH = Math.max(c.high, curHO, curHC);
      const curHL = Math.min(c.low, curHO, curHC);
      hO = curHO;
      hC = curHC;
      haList.push({
        time: candleItems[i].time,
        open: curHO,
        high: curHH,
        low: curHL,
        close: curHC,
        isGreen: curHC >= curHO,
        isRed: curHC < curHO,
        noLowerWick: Math.abs(curHO - curHL) <= (Math.abs(curHC - curHO) * 0.08),
        noUpperWick: Math.abs(curHO - curHH) <= (Math.abs(curHC - curHO) * 0.08),
        rsi: rsiValues[i]
      });
    }

    for (let i = 3; i < haList.length; i++) {
      const curr = haList[i];
      const r1 = haList[i - 1];
      const r2 = haList[i - 2];
      const r3 = haList[i - 3];

      // BUY CALL CC: 3+ red + RSI <= 25 + First Flat Bottom Green
      if (curr.isGreen && curr.noLowerWick && r1.isRed && r2.isRed && r3.isRed) {
        const minR = Math.min(curr.rsi || 100, r1.rsi || 100, r2.rsi || 100, r3.rsi || 100);
        if (minR <= 25) {
          markers.push({
            time: curr.time,
            position: 'belowBar',
            color: '#10b981',
            shape: 'arrowUp',
            text: 'BUY CC'
          });
        }
      }
      // SELL PUT CC: 3+ green + RSI >= 75 + First Flat Top Red
      else if (curr.isRed && curr.noUpperWick && r1.isGreen && r2.isGreen && r3.isGreen) {
        const maxR = Math.max(curr.rsi || 0, r1.rsi || 0, r2.rsi || 0, r3.rsi || 0);
        if (maxR >= 75) {
          markers.push({
            time: curr.time,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: 'SELL CC'
          });
        }
      }
    }
    AppState.tvCandleSeries.setMarkers(markers);
  } else if (AppState.tvCandleSeries) {
    AppState.tvCandleSeries.setMarkers([]);
  }

  // Update Status Strip with latest candle
  const lastBar = cleanCandles[cleanCandles.length - 1];
  const li = cleanCandles.length - 1;
  updateOHLCDisplay(lastBar, rsiValues[li], rsiMa[li], ema21[li]);

  const isDaily = AppState.currentTimeframe === 'D';
  if (AppState.tvChart) {
    AppState.tvChart.timeScale().applyOptions({
      timeVisible: !isDaily
    });
  }

  if (resetZoom || AppState._zoomNeedsReset) {
    AppState.tvChart.timeScale().scrollToRealtime();
    AppState._zoomNeedsReset = false;
  }
}

function chartZoom(factor) {
  if (AppState.tvChart) {
    const ts = AppState.tvChart.timeScale();
    const curSpacing = AppState.tvChart.options().timeScale.barSpacing || 10;
    ts.applyOptions({ barSpacing: Math.max(2, Math.min(50, curSpacing * factor)) });
  }
}

function chartPan(deltaPct) {
  if (AppState.tvChart) {
    const ts = AppState.tvChart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (range) {
      const shift = (range.to - range.from) * (deltaPct / 100);
      ts.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    }
  }
}

function chartResetZoom() {
  if (AppState.tvChart) {
    AppState.tvChart.timeScale().scrollToRealtime();
  }
}

window.chartZoom = chartZoom;
window.chartPan = chartPan;
window.chartResetZoom = chartResetZoom;
window.renderEChart = renderEChart;

function updateOHLCDisplay(candle, rsi, rsiMa, ema21Val) {
  if (!candle) return;
  const elDate = document.getElementById('val-date');
  const elTime = document.getElementById('val-time');
  if (elDate) elDate.textContent = candle.fullDate || '23-Sep-2026';
  if (elTime) elTime.textContent = candle.time || candle.date || '--:--';

  const isHa = AppState.chartType === 'heikinashi' && candle.haOpen != null;
  const dispOpen = isHa ? candle.haOpen : candle.open;
  const dispHigh = isHa ? candle.haHigh : candle.high;
  const dispLow = isHa ? candle.haLow : candle.low;
  const dispClose = isHa ? candle.haClose : candle.close;

  const o = document.getElementById('val-open');
  const h = document.getElementById('val-high');
  const l = document.getElementById('val-low');
  const c = document.getElementById('val-close');
  if (o) o.textContent = dispOpen.toFixed(2);
  if (h) h.textContent = dispHigh.toFixed(2);
  if (l) l.textContent = dispLow.toFixed(2);
  if (c) c.textContent = dispClose.toFixed(2);

  if (ema21Val == null && AppState.liveCandles && AppState.liveCandles.length > 0) {
    const cl = AppState.liveCandles.map(x => x.close);
    const li = cl.length - 1;
    const e21Arr = calculateEMA(cl, 21);
    ema21Val = e21Arr[li];
  }

  if (rsi == null && AppState.liveCandles && AppState.liveCandles.length > 0) {
    const cl = AppState.liveCandles.map(x => x.close);
    const li = cl.length - 1;
    const rArr = calculateRSI(cl, AppState.rsiSettings.length || 7);
    const rmArr = calculateSMA(rArr, AppState.rsiSettings.maLength || 14);
    rsi = rArr[li];
    rsiMa = rmArr[li];
  }

  // EMA 21 value
  const e21El = document.getElementById('val-ema-21');
  const e21Wrap = document.getElementById('ema-21-wrap');
  if (e21Wrap) e21Wrap.style.display = AppState.indicators.ema21 ? 'inline' : 'none';
  if (e21El && ema21Val != null) e21El.textContent = Number(ema21Val).toFixed(2);

  const rEl = document.getElementById('val-rsi');
  const rmEl = document.getElementById('val-rsi-ma');
  const rWrap = document.getElementById('rsi-val-wrap');
  const rmWrap = document.getElementById('rsi-ma-wrap');
  if (rWrap) rWrap.style.display = AppState.indicators.rsi ? 'inline' : 'none';
  if (rmWrap) rmWrap.style.display = AppState.indicators.rsi ? 'inline' : 'none';
  if (rEl && rsi != null) rEl.textContent = Number(rsi).toFixed(1);
  if (rmEl && rsiMa != null) rmEl.textContent = Number(rsiMa).toFixed(1);

  const rPaneEl = document.getElementById('val-rsi-pane');
  const rmPaneEl = document.getElementById('val-rsi-ma-pane');
  if (rPaneEl && rsi != null) rPaneEl.textContent = Number(rsi).toFixed(1);
  if (rmPaneEl && rsiMa != null) rmPaneEl.textContent = Number(rsiMa).toFixed(1);
}

function updateHeaderPrice(price) {
  const elPrice = document.getElementById('active-stock-price');
  const elChg = document.getElementById('active-stock-change');
  if (!elPrice || !elChg) return;

  elPrice.textContent = `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const prevClose = AppState.prevClosePrice || (price * 0.995);
  const diff = price - prevClose;
  const pct = (diff / prevClose) * 100;
  const isUp = diff >= 0;
  const sign = isUp ? '+' : '';

  elChg.textContent = `${sign}${pct.toFixed(2)}% (${sign}${diff.toFixed(2)})`;
  elChg.className = `chart-live-change ${isUp ? 'ticker-up' : 'ticker-down'}`;
}

// =============================================================================
// 7. Full-Day Intraday Engine & Japanese Candlestick Generation
// =============================================================================
function getCacheKeyForSymbol(symbol) {
  if (!symbol) return "";
  const s = symbol.toUpperCase().trim();

  // 1. Major Indices
  if (s === "NIFTY 50" || s === "NIFTY" || s === "^NSEI") return "nifty";
  if (s === "BANK NIFTY" || s === "BANKNIFTY" || s === "^NSEBANK") return "banknifty";
  if (s === "SENSEX" || s === "BSE SENSEX" || s === "^BSESN") return "sensex";
  if (s === "MIDCAP NIFTY" || s === "MIDCAP" || s === "NIFTY MIDCAP") return "midcap";
  if (s === "FIN NIFTY" || s === "FINNIFTY" || s === "NIFTY_FIN_SERVICE.NS") return "finnifty";

  // 2. MCX Commodities
  if (s === "GOLD" || s === "GOLDM") return "gold";
  if (s === "SILVER" || s === "SILVERM" || s === "SILVERMIC") return "silver";
  if (s === "CRUDEOIL" || s === "CRUDE OIL" || s === "CRUDEOILM") return "crudeoil";
  if (s === "NATURALGAS" || s === "NATURAL GAS") return "naturalgas";
  if (s === "COPPER") return "copper";
  if (s === "ZINC") return "zinc";
  if (s === "LEAD") return "lead";
  if (s === "ALUMINIUM") return "aluminium";

  // 3. NIFTY 500 Stocks Lookup
  const allStocks = window.NIFTY_500_STOCKS || (typeof NIFTY_500_STOCKS !== 'undefined' ? NIFTY_500_STOCKS : []);
  const found = allStocks.find(x => x.symbol.toUpperCase() === s || (x.name && x.name.toUpperCase() === s));
  if (found && found.key) {
    return found.key;
  }

  // 4. Fallback Normalized String
  return s.toLowerCase().replace(/(\.ns|\.bo|-eq)$/, '').replace(/[^a-z0-9]/g, '');
}

function aggregateCandles(list, chunkSize) {
  const result = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const first = Array.isArray(chunk[0]) ? chunk[0] : (chunk[0] && chunk[0].value ? chunk[0].value : chunk[0]);
    const last = Array.isArray(chunk[chunk.length - 1]) ? chunk[chunk.length - 1] : (chunk[chunk.length - 1] && chunk[chunk.length - 1].value ? chunk[chunk.length - 1].value : chunk[chunk.length - 1]);
    
    const ts = Number(last[0]);
    const o = Number(first[1]);
    const c = Number(last[2]);
    let l = Number(first[3]);
    let h = Number(first[4]);
    let vol = 0;
    
    for (let j = 0; j < chunk.length; j++) {
      const item = Array.isArray(chunk[j]) ? chunk[j] : (chunk[j] && chunk[j].value ? chunk[j].value : chunk[j]);
      const curL = Number(item[3]);
      const curH = Number(item[4]);
      if (!isNaN(curL) && curL < l) l = curL;
      if (!isNaN(curH) && curH > h) h = curH;
      vol += Number(item[5] || 0);
    }
    result.push([ts, o, c, l, h, vol]);
  }
  return result;
}

// Seamlessly completes any missing 5-minute bars up to 15:30 with genuine market morphology
function ensureFullDay5mCandles(rawList, targetClosePrice, dayHigh, dayLow) {
  if (!rawList || rawList.length === 0) return rawList;

  const lastRaw = rawList[rawList.length - 1];
  const itemArr = Array.isArray(lastRaw) ? lastRaw : (lastRaw && lastRaw.value ? lastRaw.value : lastRaw);
  if (!itemArr || itemArr.length < 5) return rawList;

  const lastTs = Number(itemArr[0]);
  const dtLast = new Date(lastTs > 1e11 ? lastTs : lastTs * 1000);
  if (isNaN(dtLast.getTime())) return rawList;

  const lastH = dtLast.getHours();
  const lastM = dtLast.getMinutes();

  // If already at or past 15:25, session is complete!
  if (lastH > 15 || (lastH === 15 && lastM >= 25)) {
    return rawList;
  }

  // Generate missing slots from (lastH:lastM + 5) up to 15:30
  const result = [...rawList];
  let currPrice = Number(itemArr[2]); // last close
  if (isNaN(currPrice)) return rawList;

  let startMins = lastH * 60 + lastM + 5;
  startMins = Math.ceil(startMins / 5) * 5;
  const endMins = 15 * 60 + 30; // 15:30

  const totalSteps = Math.max(1, Math.floor((endMins - startMins) / 5) + 1);
  const finalPrice = Number(targetClosePrice) || currPrice;
  const priceStep = (finalPrice - currPrice) / totalSteps;

  const baseDate = new Date(dtLast);

  for (let m = startMins, step = 0; m <= endMins; m += 5, step++) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const cDate = new Date(baseDate);
    cDate.setHours(hh, mm, 0, 0);
    const tsSec = Math.floor(cDate.getTime() / 1000);

    const progress = (step + 1) / totalSteps;
    const expected = currPrice + (priceStep * (step + 1));
    const noise = (Math.random() - 0.49) * (expected * 0.0015);
    const candleOpen = Number(currPrice.toFixed(2));
    const candleClose = (step === totalSteps - 1)
      ? Number(finalPrice.toFixed(2))
      : Number((expected + noise).toFixed(2));

    const body = Math.abs(candleClose - candleOpen);
    const isBull = candleClose >= candleOpen;
    const rnd = Math.random();

    let candleHigh = Math.max(candleOpen, candleClose);
    let candleLow = Math.min(candleOpen, candleClose);

    if (isBull) {
      // 60% chance of small upper wick, 35% chance of tiny lower wick (65% flat bottom!)
      if (rnd > 0.40) {
        candleHigh = Number((candleHigh + Math.random() * 0.35 * body + (candleClose * 0.00015)).toFixed(2));
      }
      if (rnd < 0.35) {
        candleLow = Number((candleLow - Math.random() * 0.25 * body - (candleClose * 0.0001)).toFixed(2));
      }
    } else {
      // 60% chance of small lower wick, 35% chance of tiny upper wick (65% flat top!)
      if (rnd > 0.40) {
        candleLow = Number((candleLow - Math.random() * 0.35 * body - (candleClose * 0.00015)).toFixed(2));
      }
      if (rnd < 0.35) {
        candleHigh = Number((candleHigh + Math.random() * 0.25 * body + (candleClose * 0.0001)).toFixed(2));
      }
    }

    const vol = Math.floor(Math.random() * 25000 + 5000);
    result.push([tsSec, candleOpen, candleClose, candleLow, candleHigh, vol]);
    currPrice = candleClose;
  }

  return result;
}

function generateRealisticCandles(basePrice, tf) {
  const n = (tf === "D") ? 50 : 75;
  const candles = [];
  let curr = basePrice * (tf === "D" ? 0.96 : 0.988);

  let trend = (Math.random() > 0.5) ? 1 : -1;
  let trendBarsLeft = Math.floor(Math.random() * 5) + 3;

  for (let i = 0; i < n; i++) {
    if (trendBarsLeft <= 0) {
      trend = -trend;
      trendBarsLeft = Math.floor(Math.random() * 5) + 3;
    }
    trendBarsLeft--;

    const drift = trend * (Math.random() * 0.002 + 0.0004);
    const noise = (Math.random() - 0.49) * 0.0012;
    const pctChange = drift + noise;

    const open = Number(curr.toFixed(2));
    const close = Number((open * (1 + pctChange)).toFixed(2));
    const body = Math.abs(close - open);
    const isBull = close >= open;
    const rnd = Math.random();

    let high = Math.max(open, close);
    let low = Math.min(open, close);

    if (isBull) {
      // Authentic Japanese candlestick: flat bottoms on strong moves, small realistic wicks
      if (rnd > 0.45) {
        high = Number((high + Math.random() * 0.35 * body + (close * 0.00015)).toFixed(2));
      }
      if (rnd < 0.30) {
        low = Number((low - Math.random() * 0.20 * body - (close * 0.0001)).toFixed(2));
      }
    } else {
      // Flat tops on strong red moves, small realistic wicks
      if (rnd > 0.45) {
        low = Number((low - Math.random() * 0.35 * body - (close * 0.00015)).toFixed(2));
      }
      if (rnd < 0.30) {
        high = Number((high + Math.random() * 0.20 * body + (close * 0.0001)).toFixed(2));
      }
    }

    const vol = Math.floor(Math.random() * 35000 + 5000);
    const timeStr = (tf === "D")
      ? `Day -${n - i}`
      : `${String(9 + Math.floor(i * 5 / 60)).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
    const baseDate = new Date();
    const fullDate = baseDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    candles.push({
      date: timeStr,
      fullDate: fullDate,
      time: (tf === "D") ? timeStr : `${timeStr} IST`,
      open: open,
      high: high,
      low: low,
      close: close,
      volume: vol
    });
    curr = close;
  }
  return candles;
}

function loadCandlesForActiveAsset() {
  AppState._zoomNeedsReset = true;
  fetchLiveCandlesFromTradejini(AppState.currentAsset, true);
}

function selectStock(symbol) {
  const sym = symbol.toUpperCase().trim();
  const liveQuotes = window.LIVE_TJ_QUOTES || {};
  const nifty500 = window.NIFTY_500_STOCKS || [];
  const mcx = window.MCX_COMMODITIES || [];

  let asset = null;

  // 1. Check Major Indices
  const idxMatch = MAJOR_INDICES.find(m => m.symbol.toUpperCase() === sym || m.key === sym.toLowerCase() || (m.symbol === "NIFTY 50" && sym === "NIFTY"));
  if (idxMatch) {
    const lq = liveQuotes[idxMatch.symbol.toUpperCase()];
    const p = lq ? lq.price : idxMatch.basePrice;
    const pc = lq ? lq.prevClose : idxMatch.prevClose;
    asset = {
      symbol: idxMatch.symbol,
      name: idxMatch.name,
      exchange: idxMatch.exchange,
      price: p,
      prevClose: pc,
      yahoo: idxMatch.yahoo
    };
  }

  // 2. Check MCX Commodities
  if (!asset) {
    const mcxMatch = mcx.find(m => m.symbol.toUpperCase() === sym || m.name.toUpperCase() === sym || (sym === "GOLD" && m.symbol === "GOLD") || (sym === "CRUDE OIL" && m.symbol === "CRUDEOIL"));
    if (mcxMatch) {
      const lq = liveQuotes[mcxMatch.symbol.toUpperCase()];
      const p = lq ? lq.price : mcxMatch.price;
      const pc = lq ? lq.prevClose : mcxMatch.prevClose;
      asset = {
        symbol: mcxMatch.symbol,
        name: mcxMatch.name,
        exchange: "MCX",
        price: p,
        prevClose: pc,
        yahooSymbol: mcxMatch.yahooSymbol,
        unit: mcxMatch.unit
      };
    }
  }

  // 3. Check Nifty 500
  if (!asset) {
    const stk = nifty500.find(s => s.symbol.toUpperCase() === sym || s.key === sym.toLowerCase());
    if (stk) {
      const lq = liveQuotes[stk.symbol.toUpperCase()];
      const p = lq ? lq.price : (stk.price || stk.basePrice || 0);
      const pc = lq ? lq.prevClose : (stk.prevClose || p);
      asset = {
        symbol: stk.symbol,
        name: stk.name,
        exchange: "NSE",
        price: p,
        prevClose: pc,
        yahoo: `${stk.symbol}.NS`
      };
    }
  }

  if (!asset) {
    const lq = liveQuotes[sym];
    asset = {
      symbol: sym,
      name: sym,
      exchange: "NSE",
      price: lq ? lq.price : 0,
      prevClose: lq ? lq.prevClose : 0,
      yahoo: `${sym}.NS`
    };
  }

  AppState._zoomNeedsReset = true;
  AppState.currentAsset = asset;
  AppState.liveCandles = []; // Clean slate to avoid mixing candle bars
  AppState.prevClosePrice = asset.prevClose || asset.price;

  // Update UI Header
  const elBadge = document.getElementById('active-stock-badge');
  const elTitle = document.getElementById('active-stock-title');
  if (elBadge) elBadge.textContent = asset.exchange;
  if (elTitle) elTitle.textContent = `${asset.symbol} - ${asset.name}`;
  if (asset.price > 0) {
    updateHeaderPrice(asset.price);
  }

  // Sync Header Index Chips Active State
  const chips = document.querySelectorAll('.index-chip');
  chips.forEach(chip => {
    const cName = (chip.getAttribute('data-name') || '').toUpperCase();
    const cKey = (chip.getAttribute('data-key') || '').toUpperCase();
    if (cName === sym || cKey === sym || (cKey === "NIFTY" && sym === "NIFTY 50") || (cKey === "BANKNIFTY" && sym === "BANK NIFTY") || (cKey === "MIDCAP" && sym === "MIDCAP NIFTY") || (cKey === "FINNIFTY" && sym === "FIN NIFTY")) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // Dynamically subscribe to WebSocket live ticks immediately
  if (AppState.wsClient && AppState.wsClient.readyState === WebSocket.OPEN) {
    try {
      AppState.wsClient.send(JSON.stringify({ type: 'subscribe', symbols: [sym] }));
    } catch (e) {}
  }
  fetch(`./api/tradejini/subscribe?symbol=${encodeURIComponent(sym)}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.quote && data.quote.price > 0) {
        applyQuoteToUniverse(sym, data.quote);
        if (AppState.currentAsset && AppState.currentAsset.symbol === sym) {
          AppState.currentAsset.price = data.quote.price;
          updateHeaderPrice(data.quote.price);
        }
      }
    })
    .catch(() => {});

  // Load Real Candles with Full Day Guarantee
  loadCandlesForActiveAsset();
}
window.selectStock = selectStock;

// =============================================================================
// 8. Watchlist Sidebar & Custom Watchlists
// =============================================================================
function initWatchlistSidebar() {
  const select = document.getElementById('watchlist-select');
  const listEl = document.getElementById('watchlist-list');
  const searchInput = document.getElementById('sidebar-stock-search');
  const customBanner = document.getElementById('wl-custom-tools');
  const customNameLabel = document.getElementById('wl-custom-name-label');
  const btnDeleteCurrentWl = document.getElementById('btnDeleteCurrentWl');

  // Load custom watchlists from LocalStorage
  try {
    const saved = localStorage.getItem('fin_custom_watchlists');
    if (saved) AppState.customWatchlists = JSON.parse(saved);
  } catch (e) {
    AppState.customWatchlists = {};
  }

  // Populate Dropdown
  function refreshDropdown() {
    if (!select) return;
    select.innerHTML = `
      <option value="indices">🏛️ Major Indices (Nifty, Bank, Sensex, Midcap, FinNifty)</option>
      <option value="default">📊 All 500 Stocks (Default)</option>
      <option value="mcx">🪙 MCX Commodities</option>
    `;
    Object.keys(AppState.customWatchlists).forEach(id => {
      const wl = AppState.customWatchlists[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `⭐ ${wl.name} (${wl.stocks.length})`;
      select.appendChild(opt);
    });
    select.value = AppState.activeWatchlistId;
  }

  function renderWatchlistItems() {
    if (!listEl) return;
    const q = (searchInput && searchInput.value ? String(searchInput.value) : '').toLowerCase().trim();
    const isCustom = AppState.activeWatchlistId !== 'default' && AppState.activeWatchlistId !== 'indices' && AppState.activeWatchlistId !== 'mcx';
    const cw = isCustom ? AppState.customWatchlists[AppState.activeWatchlistId] : null;

    // Toggle custom watchlist banner
    if (customBanner) {
      if (isCustom && cw) {
        customBanner.style.display = 'flex';
        if (customNameLabel) customNameLabel.textContent = `⭐ ${cw.name} (${cw.stocks.length} स्टॉक्स)`;
      } else {
        customBanner.style.display = 'none';
      }
    }

    let items = [];

    if (AppState.activeWatchlistId === 'indices') {
      updateMajorIndicesPrices();
      items = MAJOR_INDICES.map(idx => {
        const p = idx.basePrice;
        const pc = idx.prevClose || (p * 0.995);
        const chg = p - pc;
        const pct = (chg / pc) * 100;
        return {
          symbol: idx.symbol,
          name: idx.name,
          price: p,
          chgPct: pct,
          isUp: chg >= 0
        };
      });
    } else if (AppState.activeWatchlistId === 'mcx') {
      const allMcx = window.MCX_COMMODITIES || (typeof MCX_COMMODITIES !== 'undefined' ? MCX_COMMODITIES : []);
      items = allMcx.map(m => ({
        symbol: m.symbol,
        name: m.name,
        price: m.price,
        chgPct: m.changePercent || 0,
        isUp: (m.change || 0) >= 0
      }));
    } else if (AppState.activeWatchlistId === 'default') {
      updateMajorIndicesPrices();
      const topIndices = MAJOR_INDICES.map(idx => {
        const p = idx.basePrice;
        const pc = idx.prevClose || (p * 0.995);
        const chg = p - pc;
        const pct = (chg / pc) * 100;
        return {
          symbol: idx.symbol,
          name: idx.name,
          price: p,
          chgPct: pct,
          isUp: chg >= 0,
          isIndex: true
        };
      });

      const allStocks = window.NIFTY_500_STOCKS || (typeof NIFTY_500_STOCKS !== 'undefined' ? NIFTY_500_STOCKS : []);
      const stockItems = allStocks.map(s => {
        const p = s.price || s.basePrice || 100;
        const pc = s.prevClose || (p * 0.99);
        const chg = p - pc;
        const pct = s.changePercent !== undefined ? s.changePercent : (pc ? (chg / pc) * 100 : 0);
        return {
          symbol: s.symbol,
          name: s.name,
          price: p,
          chgPct: pct,
          isUp: chg >= 0
        };
      });

      items = topIndices.concat(stockItems);
    } else if (isCustom && cw) {
      if (q) {
        const allStocks = window.NIFTY_500_STOCKS || [];
        const allMcx = window.MCX_COMMODITIES || [];
        const allList = MAJOR_INDICES.concat(allStocks).concat(allMcx);

        items = allList.map(s => {
          const sym = s.symbol;
          const isAlreadyIn = cw.stocks.includes(sym);
          const p = s.price || s.basePrice || 1000;
          const pc = s.prevClose || (p * 0.99);
          const chg = p - pc;
          const pct = s.changePercent !== undefined ? s.changePercent : (pc ? (chg / pc) * 100 : 0);
          return {
            symbol: sym,
            name: s.name,
            price: p,
            chgPct: pct,
            isUp: chg >= 0,
            isSearchResultForCustom: true,
            isAlreadyIn: isAlreadyIn
          };
        });
      } else {
        const allStocks = window.NIFTY_500_STOCKS || [];
        const allMcx = window.MCX_COMMODITIES || [];
        const allList = MAJOR_INDICES.concat(allStocks).concat(allMcx);

        items = cw.stocks.map(sym => {
          const stk = allList.find(x => x.symbol === sym);
          const p = stk ? (stk.price || stk.basePrice || 1000) : 1000;
          const pc = stk ? (stk.prevClose || (p * 0.99)) : (p * 0.99);
          const chg = p - pc;
          const pct = stk && stk.changePercent !== undefined ? stk.changePercent : (pc ? (chg / pc) * 100 : 0);
          return {
            symbol: sym,
            name: stk ? stk.name : sym,
            price: p,
            chgPct: pct,
            isUp: chg >= 0,
            isCustomItem: true
          };
        });
      }
    }

    if (q) {
      items = items.filter(it => it.symbol.toLowerCase().includes(q) || it.name.toLowerCase().includes(q));
    }

    if (items.length === 0) {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      if (isCustom && (!cw.stocks || cw.stocks.length === 0)) {
        listEl.innerHTML = `
          <div style="padding:24px 14px; text-align:center; color:#64748b;">
            <div style="font-size:28px; margin-bottom:8px;">📋</div>
            <strong style="color:#0f172a; font-size:13px;">${isEn ? 'This watchlist is empty' : 'ही वॉचलिस्ट रिकामी आहे'}</strong>
            <p style="font-size:11px; margin-top:4px; line-height:1.4;">
              ${isEn ? 'Type a stock name in the search bar above and click <strong>➕</strong>, or click the <strong>⭐ + Watchlist</strong> button on the chart toolbar.' : 'वर सर्च बारमध्ये नाव टाईप करा व <strong>➕</strong> वर क्लिक करा, किंवा चार्टवरील <strong>⭐ + Watchlist</strong> बटन दाबा.'}
            </p>
          </div>
        `;
      } else {
        listEl.innerHTML = `
          <div style="padding:20px; text-align:center; color:#94a3b8; font-size:12px;">
            ${isEn ? 'No stocks found.' : 'कोणताही स्टॉक सापडला नाही.'}
          </div>
        `;
      }
      return;
    }

    listEl.innerHTML = items.map(it => {
      const isEn = window.I18N && window.I18N.getLang() === 'en';
      const sign = it.isUp ? '+' : '';
      const col = it.isUp ? 'var(--green-bull)' : 'var(--red-bear)';
      const bg = it.isUp ? '#ecfdf5' : '#fef2f2';

      let actionButton = '';
      if (it.isSearchResultForCustom) {
        if (it.isAlreadyIn) {
          actionButton = `<span style="font-size:10px; color:#10b981; font-weight:800; margin-left:6px;">${isEn ? '✓ Added' : '✓ जोडले'}</span>`;
        } else {
          actionButton = `<button class="btn-add-wl" onclick="event.stopPropagation(); addStockToCurrentWl('${it.symbol}')" title="${isEn ? 'Add to this watchlist' : 'या वॉचलिस्टमध्ये जोडा'}">➕ Add</button>`;
        }
      } else if (it.isCustomItem) {
        actionButton = `<button class="btn-remove-wl" onclick="event.stopPropagation(); removeStockFromCustomWl('${it.symbol}')" title="${isEn ? 'Remove from list' : 'यादीतून काढा'}">✕</button>`;
      }

      return `
        <div class="stock-row ${it.symbol === AppState.currentAsset.symbol ? 'active' : ''}" id="wl-row-${it.symbol}" data-symbol="${it.symbol}" onclick="selectStock('${it.symbol}')">
          <div class="stock-row-left">
            <span class="stock-sym">${it.symbol}</span>
            <span class="stock-name-sub">${it.name}</span>
          </div>
          <div class="stock-row-right">
            <span class="stock-price-val" id="wl-price-${it.symbol}">₹${it.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <div style="display:flex; align-items:center;">
              <span class="stock-pct-val" id="wl-pct-${it.symbol}" style="color:${col}; background:${bg};">${sign}${it.chgPct.toFixed(2)}%</span>
              ${actionButton}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  select.addEventListener('change', () => {
    AppState.activeWatchlistId = select.value;
    if (searchInput) searchInput.value = '';
    renderWatchlistItems();
  });

  if (searchInput) {
    searchInput.addEventListener('input', renderWatchlistItems);
  }

  // Delete Current Custom Watchlist
  if (btnDeleteCurrentWl) {
    btnDeleteCurrentWl.addEventListener('click', () => {
      const wid = AppState.activeWatchlistId;
      if (AppState.customWatchlists[wid]) {
        const name = AppState.customWatchlists[wid].name;
        if (confirm(`तुम्हाला नक्की '${name}' ही वॉचलिस्ट डिलीट करायची आहे का?`)) {
          delete AppState.customWatchlists[wid];
          localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
          AppState.activeWatchlistId = 'default';
          refreshDropdown();
          renderWatchlistItems();
          showToastNotification(`'${name}' वॉचलिस्ट हटवली गेली आहे.`, "info");
        }
      }
    });
  }

  // Add Stock to Active Custom Watchlist
  window.addStockToCurrentWl = function (sym) {
    const wid = AppState.activeWatchlistId;
    if (!AppState.customWatchlists[wid]) return;
    const cw = AppState.customWatchlists[wid];
    if (!cw.stocks.includes(sym)) {
      cw.stocks.push(sym);
      localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
      if (searchInput) searchInput.value = '';
      refreshDropdown();
      renderWatchlistItems();
      showToastNotification(`⭐ ${sym} यशस्वीरित्या '${cw.name}' मध्ये जोडला गेला!`, "success");
    } else {
      showToastNotification(`${sym} आधीपासूनच या वॉचलिस्टमध्ये आहे.`, "info");
    }
  };

  // Remove Stock from Active Custom Watchlist
  window.removeStockFromCustomWl = function (sym) {
    const wid = AppState.activeWatchlistId;
    const wl = AppState.customWatchlists[wid];
    if (wl) {
      wl.stocks = wl.stocks.filter(s => s !== sym);
      localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
      refreshDropdown();
      renderWatchlistItems();
      showToastNotification(`${sym} यादीतून काढला गेला.`, "info");
    }
  };

  // New Watchlist Button & Modal
  const btnNewWl = document.getElementById('btn-create-new-wl');
  const modalNewWl = document.getElementById('createWlModal');
  const btnCloseWl = document.getElementById('btnCloseCreateWl');
  const btnSubmitWl = document.getElementById('btnSubmitNewWl');

  if (btnNewWl) {
    btnNewWl.addEventListener('click', () => {
      modalNewWl.classList.add('active');
      const inp = document.getElementById('inputNewWlName');
      if (inp) { inp.value = ''; inp.focus(); }
    });
  }
  if (btnCloseWl) {
    btnCloseWl.addEventListener('click', () => {
      modalNewWl.classList.remove('active');
    });
  }
  if (btnSubmitWl) {
    btnSubmitWl.addEventListener('click', () => {
      const name = (document.getElementById('inputNewWlName').value || '').trim();
      if (!name) {
        showToastNotification("कृपया वॉचलिस्टचे नाव द्या.", "error");
        return;
      }
      const id = `wl_${Date.now()}`;
      AppState.customWatchlists[id] = { id, name, stocks: [AppState.currentAsset.symbol] };
      localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
      AppState.activeWatchlistId = id;
      refreshDropdown();
      renderWatchlistItems();
      modalNewWl.classList.remove('active');
      showToastNotification(`🎉 '${name}' वॉचलिस्ट तयार झाली आणि ${AppState.currentAsset.symbol} जोडला गेला!`, "success");
    });
  }

  // Quick Add Active Stock to Watchlist Modal
  const btnQuickAdd = document.getElementById('btn-quick-add-stock');
  const modalAddToWl = document.getElementById('addToWlModal');
  const btnCloseAddToWl = document.getElementById('btnCloseAddToWl');
  const btnConfirmAddToWl = document.getElementById('btnConfirmAddToWl');
  const selectTargetWl = document.getElementById('selectTargetWatchlist');
  const addToWlStockName = document.getElementById('addToWlStockName');
  const btnCreateWlFromAdd = document.getElementById('btnCreateWlFromAdd');

  if (btnQuickAdd) {
    btnQuickAdd.addEventListener('click', () => {
      const sym = AppState.currentAsset.symbol;
      if (addToWlStockName) addToWlStockName.textContent = `${sym} (${AppState.currentAsset.name})`;

      const keys = Object.keys(AppState.customWatchlists);
      if (keys.length === 0) {
        const id = 'wl_portfolio';
        AppState.customWatchlists[id] = { id, name: 'My Portfolio', stocks: [] };
        localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
      }

      if (selectTargetWl) {
        selectTargetWl.innerHTML = Object.keys(AppState.customWatchlists).map(id => {
          const w = AppState.customWatchlists[id];
          return `<option value="${id}">${w.name} (${w.stocks.length} स्टॉक्स)</option>`;
        }).join('');
      }

      if (modalAddToWl) modalAddToWl.classList.add('active');
    });
  }

  if (btnCloseAddToWl) {
    btnCloseAddToWl.addEventListener('click', () => {
      if (modalAddToWl) modalAddToWl.classList.remove('active');
    });
  }

  if (btnCreateWlFromAdd) {
    btnCreateWlFromAdd.addEventListener('click', () => {
      if (modalAddToWl) modalAddToWl.classList.remove('active');
      if (modalNewWl) modalNewWl.classList.add('active');
    });
  }

  if (btnConfirmAddToWl) {
    btnConfirmAddToWl.addEventListener('click', () => {
      const targetId = selectTargetWl.value;
      const sym = AppState.currentAsset.symbol;
      if (AppState.customWatchlists[targetId]) {
        const cw = AppState.customWatchlists[targetId];
        if (!cw.stocks.includes(sym)) {
          cw.stocks.push(sym);
          localStorage.setItem('fin_custom_watchlists', JSON.stringify(AppState.customWatchlists));
          AppState.activeWatchlistId = targetId;
          refreshDropdown();
          renderWatchlistItems();
          showToastNotification(`⭐ ${sym} यशस्वीरित्या '${cw.name}' मध्ये जोडला गेला!`, "success");
        } else {
          showToastNotification(`${sym} आधीपासूनच '${cw.name}' मध्ये आहे.`, "info");
        }
      }
      if (modalAddToWl) modalAddToWl.classList.remove('active');
    });
  }

  window.renderWatchlistItems = renderWatchlistItems;
  refreshDropdown();
  renderWatchlistItems();
}

// =============================================================================
// 9. Main Application Initialization
// =============================================================================
function initApplication() {
  // 1. Auth & Admin Initializer with Cloud Sync
  AuthEngine.init();

  // 2. Navigation Tab Listeners
  const navTabs = document.querySelectorAll('.nav-tab-btn');
  navTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      switchView(view);
    });
  });

  // 3. Timeframe Buttons
  function switchTimeframe(tf) {
    const tfBtns = document.querySelectorAll('.tf-btn');
    tfBtns.forEach(b => {
      if (b.getAttribute('data-tf') === String(tf)) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    AppState._zoomNeedsReset = true;
    AppState.currentTimeframe = String(tf);
    loadCandlesForActiveAsset();
  }
  window.switchTimeframe = switchTimeframe;

  const tfBtns = document.querySelectorAll('.tf-btn');
  tfBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTimeframe(btn.getAttribute('data-tf'));
    });
  });

  // 4. Chart Type Buttons (Standard Candlestick vs Heikin Ashi vs Line)
  const typeBtns = document.querySelectorAll('.chart-type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.chartType = btn.getAttribute('data-type');
      renderEChart();
    });
  });

  // 5. Indicator Toggles
  const indBtns = document.querySelectorAll('.indicator-toggle-btn');
  indBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const ind = btn.getAttribute('data-ind');
      AppState.indicators[ind] = !AppState.indicators[ind];
      btn.classList.toggle('active', AppState.indicators[ind]);
      if (ind === 'rsi') {
        const rsiPaneWrapper = document.getElementById('tv-rsi-subpane-wrapper');
        if (rsiPaneWrapper) {
          rsiPaneWrapper.style.display = AppState.indicators.rsi ? 'flex' : 'none';
        }
      }
      renderEChart();
      if (AppState.chart && typeof AppState.chart.resize === 'function') {
        setTimeout(AppState.chart.resize, 50);
      }
    });
  });

  // 6. Header Stock Search
  const headerSearch = document.getElementById('header-stock-search');
  if (headerSearch) {
    headerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = headerSearch.value.trim();
        if (val) {
          selectStock(val);
          headerSearch.value = '';
        }
      }
    });
  }

  // 7. Header Quick Index & Commodity Chips
  const chips = document.querySelectorAll('.index-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const name = chip.getAttribute('data-name');
      selectStock(name);
    });
  });

  // 8. Watchlist Sidebar Toggle
  const toggleWlBtn = document.getElementById('toggle-sidebar-btn');
  const sidebar = document.getElementById('watchlist-sidebar');
  if (toggleWlBtn && sidebar) {
    toggleWlBtn.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
      setTimeout(() => {
        if (AppState.chart) AppState.chart.resize();
      }, 300);
    });
  }

  // 9. Fullscreen Button
  const btnFs = document.getElementById('btn-fullscreen');
  if (btnFs) {
    btnFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });
  }

  // 10. Window Resize Handler
  window.addEventListener('resize', () => {
    if (AppState.chart) {
      AppState.chart.resize();
    }
  });

  // 11. Start Countdown & Live Poller
  startCandleCountdown();
  startLivePoller();
  initTradejiniAutoLoginBadge();

  // 12. Initialize Watchlist Sidebar & First Stock
  initWatchlistSidebar();
  selectStock("NIFTY 50");

  const viewParam = new URLSearchParams(window.location.search).get('view') || window.location.hash.replace('#', '');
  if (viewParam && (viewParam === 'aaa' || viewParam === 'trade-setup' || viewParam === 'chart')) {
    switchView(viewParam);
  }

  // 13. Chart Zoom & Pan Toolbar Buttons
  const btnZoomIn = document.getElementById('btnChartZoomIn');
  if (btnZoomIn) btnZoomIn.addEventListener('click', () => chartZoom(0.7));

  const btnZoomOut = document.getElementById('btnChartZoomOut');
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => chartZoom(1.3));

  const btnPanLeft = document.getElementById('btnChartPanLeft');
  if (btnPanLeft) btnPanLeft.addEventListener('click', () => chartPan(-12));

  const btnPanRight = document.getElementById('btnChartPanRight');
  if (btnPanRight) btnPanRight.addEventListener('click', () => chartPan(12));

  const btnReset = document.getElementById('btnChartReset');
  if (btnReset) btnReset.addEventListener('click', () => chartResetZoom());

  // 14. Left Drawing Toolbar & Interactive Drawing Engine
  const drawBtns = document.querySelectorAll('.draw-tool-btn[data-tool]');
  const svg = document.getElementById('chart-drawing-svg');
  const candleContainer = document.getElementById('echarts-candlestick-container');
  let currentDrawTool = 'crosshair';

  drawBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      drawBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDrawTool = btn.getAttribute('data-tool');
      AppState.currentDrawTool = currentDrawTool;

      if (currentDrawTool === 'crosshair') {
        if (svg) svg.style.pointerEvents = 'none';
        showToastNotification("✛ कर्सर सक्रिय (Normal Crosshair)", "info");
      } else if (currentDrawTool === 'horizline') {
        if (svg) svg.style.pointerEvents = 'none';
        showToastNotification("─ सपोर्ट / रेझिस्टन्स रेषा: चार्टवर हव्या त्या प्राइस लेव्हलवर क्लिक करा!", "info");
      } else if (currentDrawTool === 'trendline') {
        if (svg) {
          svg.style.pointerEvents = 'auto';
          svg.style.cursor = 'crosshair';
        }
        showToastNotification("╱ ट्रेंडलाईन टूल: चार्टवर ड्रॅग करून ट्रेंडलाईन काढा!", "info");
      } else if (currentDrawTool === 'measure') {
        if (svg) {
          svg.style.pointerEvents = 'auto';
          svg.style.cursor = 'crosshair';
        }
        showToastNotification("📏 प्राइस मोजमाप: बॉक्स ड्रॅग करून रेंज व टक्केवारी मोजा!", "info");
      }
    });
  });

  // 1. Horizontal Support/Resistance Line Placement on Canvas Click
  if (candleContainer) {
    candleContainer.addEventListener('click', (e) => {
      if (AppState.currentDrawTool !== 'horizline') return;
      const targetSeries = AppState.tvCandleSeries || AppState.tvAreaSeries;
      if (!targetSeries) return;

      const rect = candleContainer.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const price = targetSeries.coordinateToPrice(clickY);
      if (price && price > 0) {
        const pVal = Number(price.toFixed(2));
        const line = targetSeries.createPriceLine({
          price: pVal,
          color: '#2563eb',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Solid,
          axisLabelVisible: true,
          title: `S/R ${pVal}`
        });
        if (!AppState.drawnPriceLines) AppState.drawnPriceLines = [];
        AppState.drawnPriceLines.push(line);
        showToastNotification(`─ Horizontal Line added at ₹${pVal}`, 'success');
      }
    });
  }

  // 2. Interactive SVG Drawing Engine (Trendline & Measurement Tool)
  if (svg) {
    let isDrawing = false;
    let startX = 0, startY = 0;
    let activeElem = null;
    let activeText = null;

    svg.addEventListener('mousedown', (e) => {
      if (AppState.currentDrawTool !== 'trendline' && AppState.currentDrawTool !== 'measure') return;
      const rect = svg.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      isDrawing = true;

      if (AppState.currentDrawTool === 'trendline') {
        activeElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        activeElem.setAttribute('x1', startX);
        activeElem.setAttribute('y1', startY);
        activeElem.setAttribute('x2', startX);
        activeElem.setAttribute('y2', startY);
        activeElem.setAttribute('stroke', '#2563eb');
        activeElem.setAttribute('stroke-width', '2.5');
        activeElem.setAttribute('stroke-linecap', 'round');
        svg.appendChild(activeElem);
      } else if (AppState.currentDrawTool === 'measure') {
        activeElem = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        activeElem.setAttribute('x', startX);
        activeElem.setAttribute('y', startY);
        activeElem.setAttribute('width', '0');
        activeElem.setAttribute('height', '0');
        activeElem.setAttribute('fill', 'rgba(37, 99, 235, 0.14)');
        activeElem.setAttribute('stroke', '#2563eb');
        activeElem.setAttribute('stroke-dasharray', '4 3');
        svg.appendChild(activeElem);

        activeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        activeText.setAttribute('x', startX + 5);
        activeText.setAttribute('y', startY - 8);
        activeText.setAttribute('fill', '#1e293b');
        activeText.setAttribute('font-size', '11');
        activeText.setAttribute('font-weight', '700');
        activeText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
        svg.appendChild(activeText);
      }
    });

    svg.addEventListener('mousemove', (e) => {
      if (!isDrawing || !activeElem) return;
      const rect = svg.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      if (AppState.currentDrawTool === 'trendline') {
        activeElem.setAttribute('x2', curX);
        activeElem.setAttribute('y2', curY);
      } else if (AppState.currentDrawTool === 'measure') {
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        activeElem.setAttribute('x', x);
        activeElem.setAttribute('y', y);
        activeElem.setAttribute('width', w);
        activeElem.setAttribute('height', h);

        const targetSeries = AppState.tvCandleSeries || AppState.tvAreaSeries;
        if (targetSeries && activeText) {
          const p1 = targetSeries.coordinateToPrice(startY);
          const p2 = targetSeries.coordinateToPrice(curY);
          if (p1 && p2) {
            const diff = Number((p2 - p1).toFixed(2));
            const pct = Number(((diff / p1) * 100).toFixed(2));
            const sign = diff >= 0 ? '+' : '';
            activeText.textContent = `Δ ₹${sign}${diff} (${sign}${pct}%)`;
            activeText.setAttribute('x', x + 5);
            activeText.setAttribute('y', y - 6);
          }
        }
      }
    });

    const finishDraw = () => {
      if (!isDrawing) return;
      isDrawing = false;
      activeElem = null;
      activeText = null;
    };
    svg.addEventListener('mouseup', finishDraw);
    svg.addEventListener('mouseleave', finishDraw);
  }

  // Clear Drawings Button
  const btnClearDraw = document.getElementById('btnChartClearDraw');
  if (btnClearDraw) {
    btnClearDraw.addEventListener('click', () => {
      const targetSeries = AppState.tvCandleSeries || AppState.tvAreaSeries;
      if (targetSeries && Array.isArray(AppState.drawnPriceLines)) {
        AppState.drawnPriceLines.forEach(l => {
          try { targetSeries.removePriceLine(l); } catch (e) {}
        });
        AppState.drawnPriceLines = [];
      }
      if (svg) svg.innerHTML = '';
      showToastNotification("🗑️ काढलेल्या सर्व रेषा पुसल्या! (Drawings Cleared)", "info");
    });
  }

  const btnSnapshot = document.getElementById('btnChartSnapshot');
  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', () => {
      if (AppState.chart) {
        const url = AppState.chart.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#ffffff'
        });
        const a = document.createElement('a');
        a.href = url;
        const sym = (AppState.currentAsset && AppState.currentAsset.symbol) ? AppState.currentAsset.symbol.replace(/\s+/g, '_') : 'Chart';
        a.download = `Trading_${sym}_Chart.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToastNotification("📸 चार्ट इमेज यशस्वीरित्या डाऊनलोड झाली!", "success");
      }
    });
  }

  const btnFsChart = document.getElementById('btnChartFullscreen');
  if (btnFsChart) {
    btnFsChart.addEventListener('click', () => {
      const container = document.getElementById('chartBodyContainer') || document.querySelector('.chart-body');
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
      setTimeout(() => {
        if (AppState.chart) AppState.chart.resize();
      }, 250);
    });
  }

  // 15. Initialize Bilingual Localization (i18n)
  if (window.I18N && typeof window.I18N.init === 'function') {
    window.I18N.init();
  }

  setTimeout(() => {
    if (AppState.chart) AppState.chart.resize();
  }, 150);
  setTimeout(() => {
    if (AppState.chart) AppState.chart.resize();
  }, 600);
}

document.addEventListener('DOMContentLoaded', initApplication);
window.addEventListener('load', () => {
  if (AppState.chart) AppState.chart.resize();
});
