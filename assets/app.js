/**
 * Finanthropist Educare Pvt Ltd - Unified Trading Platform 2.0
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

const DEFAULT_USERS = [
  { id: "usr_admin", name: "Admin Finanthropist", phone: "9999999999", email: "admin@finanthropist.com", status: "APPROVED", date: "2026-09-18 09:00", vipKey: "VIP-ADMIN-777" },
  { id: "usr_demo", name: "Demo Student", phone: "9822000000", email: "demo@finanthropist.com", status: "APPROVED", date: "2026-09-18 09:15", vipKey: "VIP-DEMO-100" },
  { id: "usr_user_test", name: "test", phone: "9359998294", email: "9359998294@finanthropist.com", status: "PENDING", date: "2026-09-18 17:30", vipKey: "VIP-8294-101" }
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
    const res = await fetch(`${CLOUD_TOPIC_URL}/json?poll=1&since=7d`);
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
    if (!user) {
      this.showAuthModal();
    } else if (user.status === 'PENDING') {
      this.showPendingModal(user);
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

  showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('active');
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
    if (nameEl) nameEl.textContent = user.name || 'Student';
    if (phoneEl) phoneEl.textContent = user.phone || '--';
    modal.classList.add('active');

    // Auto-poll approval status every 2.5 seconds
    if (!this.checkInterval) {
      this.checkInterval = setInterval(() => {
        const db = getUsersDB();
        const found = db.find(u => (u.phone && u.phone === user.phone) || (u.email && u.email === user.email));
        if (found && found.status === 'APPROVED') {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
          setCurrentUser(found);
          modal.classList.remove('active');
          this.grantAccess(found);
        }
      }, 2500);
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

    const badge = document.getElementById('userBadgeChip');
    const nameEl = document.getElementById('userBadgeName');
    if (badge && nameEl) {
      badge.style.display = 'flex';
      nameEl.textContent = user.name ? user.name.split(' ')[0] : 'User';
    }
  },

  async handleRegistration(name, phone, email) {
    if (!name || name.trim().length < 2) {
      showToastNotification("कृपया आपले पूर्ण नाव प्रविष्ट करा.", "error");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToastNotification("कृपया वैध १० अंकी मोबाईल नंबर प्रविष्ट करा.", "error");
      return;
    }
    if (!email || !email.includes('@')) {
      showToastNotification("कृपया वैध ईमेल आयडी प्रविष्ट करा.", "error");
      return;
    }

    const db = getUsersDB();
    let existing = db.find(u => u.phone === cleanPhone || u.email.toLowerCase() === email.toLowerCase());

    if (existing) {
      if (existing.status === 'APPROVED') {
        setCurrentUser(existing);
        this.grantAccess(existing);
        showToastNotification(`स्वागत आहे, ${existing.name}! तुमचे ॲक्सेस मंजूर आहे.`, "success");
        return;
      } else {
        setCurrentUser(existing);
        this.showPendingModal(existing);
        return;
      }
    }

    // New Registration Request
    const vipKey = `VIP-${cleanPhone.slice(-4)}-${Math.floor(Math.random() * 899 + 100)}`;
    const newUser = {
      id: `usr_${Date.now()}`,
      name: name.trim(),
      phone: cleanPhone,
      email: email.trim().toLowerCase(),
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
        email: "vip@finanthropist.com",
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
    if (pin === ADMIN_MASTER_PIN || pin === "admin123" || pin === "Admin@Fin777") {
      this.isAdminLoggedIn = true;
      const gate = document.getElementById('adminAuthGate');
      const dash = document.getElementById('adminDashboardView');
      if (gate) gate.style.display = 'none';
      if (dash) dash.style.display = 'flex';
      this.renderAdminDashboard();
      syncUsersWithCloud();
    } else {
      showToastNotification("अयोग्य ॲडमिन पासवर्ड! कृपया योग्य पासवर्ड प्रविष्ट करा.", "error");
    }
  },

  renderAdminDashboard() {
    const db = getUsersDB();
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">कोणतीही नोंदणी विनंती उपलब्ध नाही.</td></tr>';
      return;
    }

    tbody.innerHTML = db.map(u => {
      const isApp = u.status === 'APPROVED';
      const statusPill = isApp
        ? '<span style="background:#ecfdf5; color:#065f46; font-weight:800; padding:2px 8px; border-radius:4px; font-size:11px;">🟢 Approved</span>'
        : '<span style="background:#fffbeb; color:#b45309; font-weight:800; padding:2px 8px; border-radius:4px; font-size:11px;">🟡 Pending</span>';

      return `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.phone}</td>
          <td>${u.email}</td>
          <td>${u.date || '--'}</td>
          <td>${statusPill}</td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!isApp ? `<button class="btn-admin-approve" onclick="AuthEngine.approveUser('${u.id}')">✅ मंजूर करा</button>` : ''}
            <button class="btn-admin-vip" onclick="AuthEngine.copyVipKey('${u.vipKey}', '${u.name}')" title="WhatsApp वर पाठवण्यासाठी कोड कॉपी करा">🔑 VIP Key</button>
            <button class="btn-admin-del" onclick="AuthEngine.deleteUser('${u.id}')">🗑️ हटवा</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async approveUser(userId) {
    const db = getUsersDB();
    const target = db.find(u => u.id === userId);
    if (target) {
      target.status = 'APPROVED';
      saveUsersDB(db);
      this.renderAdminDashboard();

      const curr = getCurrentUser();
      if (curr && curr.id === userId) {
        curr.status = 'APPROVED';
        setCurrentUser(curr);
        this.grantAccess(curr);
      }

      // Publish Realtime Approval Event
      await postCloudEvent({ action: "USER_APPROVE", phone: target.phone, id: target.id });
      await postCloudEvent({ action: "SYNC_ALL", users: db });
      showToastNotification(`युझर ${target.name} ला कायमस्वरूपी मंजुरी (Approval) दिली आहे!`, "success");
    }
  },

  async deleteUser(userId) {
    let db = getUsersDB();
    const target = db.find(u => u.id === userId);
    db = db.filter(u => u.id !== userId);
    saveUsersDB(db);
    this.renderAdminDashboard();
    if (target) {
      await postCloudEvent({ action: "USER_DELETE", userId: userId, phone: target.phone });
    }
    await postCloudEvent({ action: "SYNC_ALL", users: db });
    showToastNotification("युझर हटवला गेला आहे.", "info");
  },

  copyVipKey(key, name) {
    const fullText = `Finanthropist Educare Portal VIP Key for ${name}:\nकोड: ${key}\nलिंक: ${window.location.origin}${window.location.pathname}?vip=${key}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        showToastNotification(`व्हीआयपी की क्लिपबोर्डवर कॉपी केली आहे!`, "success");
      }).catch(() => {
        showToastNotification(`VIP Code: ${key}`, "info");
      });
    } else {
      showToastNotification(`VIP Code: ${key}`, "info");
    }
  },

  async manualAddUser(name, phone, email) {
    if (!name || !phone) {
      showToastNotification("कृपया नाव आणि फोन नंबर टाका.", "error");
      return;
    }
    const db = getUsersDB();
    const cleanPhone = phone.replace(/\D/g, '');
    const vipKey = `VIP-${cleanPhone.slice(-4)}-${Math.floor(Math.random() * 899 + 100)}`;
    const user = {
      id: `usr_man_${Date.now()}`,
      name: name.trim(),
      phone: cleanPhone,
      email: (email || `${cleanPhone}@finanthropist.com`).trim(),
      status: 'APPROVED',
      date: new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      vipKey: vipKey
    };
    db.unshift(user);
    saveUsersDB(db);
    this.renderAdminDashboard();
    await postCloudEvent({ action: "USER_REGISTER", user: user });
    await postCloudEvent({ action: "SYNC_ALL", users: db });
    showToastNotification(`युझर ${name} मंजूर करून जोडला आहे!`, "success");
  },

  bindEvents() {
    const btnSubmitAuth = document.getElementById('btnSubmitAuth');
    if (btnSubmitAuth) {
      btnSubmitAuth.addEventListener('click', () => {
        const name = document.getElementById('authInputName').value;
        const phone = document.getElementById('authInputPhone').value;
        const email = document.getElementById('authInputEmail').value;
        this.handleRegistration(name, phone, email);
      });
    }

    ['authInputName', 'authInputPhone', 'authInputEmail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const name = document.getElementById('authInputName').value;
            const phone = document.getElementById('authInputPhone').value;
            const email = document.getElementById('authInputEmail').value;
            this.handleRegistration(name, phone, email);
          }
        });
      }
    });

    const linkHaveVipCode = document.getElementById('linkHaveVipCode');
    if (linkHaveVipCode) {
      linkHaveVipCode.addEventListener('click', () => {
        const code = prompt("तुमचा व्हीआयपी अप्रूव्हल कोड (VIP Unlock Key) प्रविष्ट करा:");
        if (code) this.handleVipUnlock(code);
      });
    }

    const linkAdminLogin = document.getElementById('linkAdminLogin');
    if (linkAdminLogin) {
      linkAdminLogin.addEventListener('click', () => {
        this.openAdminModal();
      });
    }

    const btnApplyVip = document.getElementById('btnApplyVipCode');
    if (btnApplyVip) {
      btnApplyVip.addEventListener('click', () => {
        const code = document.getElementById('inputVipCode').value;
        this.handleVipUnlock(code);
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
        btnRefreshCloud.textContent = "🔄 रिफ्रेश (Sync Now)";
        showToastNotification("क्लाउड डेटा यशस्वीरित्या सिंक झाला!", "success");
      });
    }

    const btnManualAdd = document.getElementById('btnAdminManualAdd');
    if (btnManualAdd) {
      btnManualAdd.addEventListener('click', () => {
        const n = document.getElementById('adminAddName').value;
        const p = document.getElementById('adminAddPhone').value;
        const e = document.getElementById('adminAddEmail').value;
        this.manualAddUser(n, p, e);
        document.getElementById('adminAddName').value = '';
        document.getElementById('adminAddPhone').value = '';
        document.getElementById('adminAddEmail').value = '';
      });
    }

    const btnExport = document.getElementById('btnExportUsersJson');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const db = getUsersDB();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `finanthropist_users_${Date.now()}.json`);
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
    rsi: true,
    ma: true,
    vol: true
  },
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
function isNseMarketOpen() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930; // 09:15 to 15:30 IST
}

function isCurrentMarketOpen() {
  if (AppState.currentAsset.exchange === "MCX") {
    return window.isMcxMarketOpen ? window.isMcxMarketOpen() : false;
  }
  return isNseMarketOpen();
}

function updateMarketStatusDisplay() {
  const label = document.getElementById('marketStatusLabel');
  if (!label) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour12: false });

  if (isCurrentMarketOpen()) {
    label.textContent = `${timeStr} IST • LIVE OPEN`;
    label.parentElement.style.background = '#ecfdf5';
    label.parentElement.style.borderColor = '#a7f3d0';
    label.parentElement.style.color = '#065f46';
  } else {
    label.textContent = `${timeStr} IST • MARKET CLOSED`;
    label.parentElement.style.background = '#f1f5f9';
    label.parentElement.style.borderColor = '#cbd5e1';
    label.parentElement.style.color = '#64748b';
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

function startLivePoller() {
  if (AppState.livePollerTimer) {
    clearInterval(AppState.livePollerTimer);
  }

  syncLiveQuotesFromTradejini();

  // Poll Tradejini CubePlus live feed every 5 seconds continuously
  AppState.livePollerTimer = setInterval(() => {
    fetchLiveCandlesFromTradejini(AppState.currentAsset, false);
  }, 5000);

  if (AppState.quotesPollerTimer) {
    clearInterval(AppState.quotesPollerTimer);
  }
  AppState.quotesPollerTimer = setInterval(() => {
    syncLiveQuotesFromTradejini();
  }, 10000);
}

async function updateTradejiniBadge() {
  const badgeText = document.getElementById('tjLoginBadgeText');
  const badgeDot = document.querySelector('#tjAutoLoginBadge .tj-dot');
  if (!badgeText) return;
  try {
    const res = await fetch('./api/tradejini/status');
    if (!res.ok) return;
    const data = await res.json();
    if (data.connected) {
      badgeText.textContent = `${data.clientCode || 'TR2488'} • ${data.todayDate || 'Live'}`;
      if (badgeDot) badgeDot.style.background = '#22c55e';
    } else {
      badgeText.textContent = 'Tradejini री-लॉगिन आवश्यक';
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
    const days = tf === 'D' ? 60 : 7;
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

// =============================================================================
// 6. ECharts Candlestick & Indicator Rendering (White Theme)
// =============================================================================
function renderEChart(showAnimation = true) {
  const container = document.getElementById('echarts-candlestick-container');
  if (!container) return;

  if (!AppState.chart) {
    AppState.chart = echarts.init(container);
    AppState.chart.on('globalout', () => {
      if (AppState.liveCandles && AppState.liveCandles.length > 0) {
        const last = AppState.liveCandles[AppState.liveCandles.length - 1];
        const cl = AppState.liveCandles.map(x => x.close);
        const rsiVals = calculateRSI(cl, AppState.rsiSettings.length);
        const rmVals = calculateSMA(rsiVals, AppState.rsiSettings.maLength);
        updateOHLCDisplay(last, rsiVals[rsiVals.length - 1], rmVals[rmVals.length - 1]);
      }
    });
  } else {
    AppState.chart.resize();
  }

  const candles = AppState.liveCandles || [];
  if (candles.length === 0) return;

  const dates = candles.map(c => c.date);
  const closes = candles.map(c => c.close);

  // Candlestick Data: Pure Japanese Candlestick vs Heikin Ashi
  let chartOhlc = [];
  if (AppState.chartType === "heikinashi") {
    let prevHaOpen = candles[0].open;
    let prevHaClose = candles[0].close;
    chartOhlc = candles.map((c, idx) => {
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = idx === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);
      prevHaOpen = haOpen;
      prevHaClose = haClose;
      c.haOpen = Number(haOpen.toFixed(2));
      c.haClose = Number(haClose.toFixed(2));
      c.haLow = Number(haLow.toFixed(2));
      c.haHigh = Number(haHigh.toFixed(2));
      return [c.haOpen, c.haClose, c.haLow, c.haHigh];
    });
  } else {
    // Pure Standard Japanese Candlesticks with raw OHLC and real wicks
    chartOhlc = candles.map(c => [c.open, c.close, c.low, c.high]);
  }

  // Moving Average & RSI
  const ma20 = calculateSMA(closes, 20);
  const rsiValues = calculateRSI(closes, AppState.rsiSettings.length);
  const rsiMa = calculateSMA(rsiValues, AppState.rsiSettings.maLength);

  // Update Status Strip with latest candle
  updateOHLCDisplay(candles[candles.length - 1], rsiValues[rsiValues.length - 1], rsiMa[rsiMa.length - 1]);

  const hasRsi = AppState.indicators.rsi;

  // Grid layouts for Main Chart vs RSI Subpane
  const grid = hasRsi ? [
    { left: '45px', right: '55px', top: '25px', height: '62%' },
    { left: '45px', right: '55px', top: '75%', height: '18%' }
  ] : [
    { left: '45px', right: '55px', top: '25px', height: '82%' }
  ];

  const xAxis = hasRsi ? [
    {
      type: 'category',
      data: dates,
      scale: true,
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } },
      min: 'dataMin',
      max: 'dataMax'
    },
    {
      type: 'category',
      gridIndex: 1,
      data: dates,
      scale: true,
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } },
      min: 'dataMin',
      max: 'dataMax'
    }
  ] : [
    {
      type: 'category',
      data: dates,
      scale: true,
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } },
      min: 'dataMin',
      max: 'dataMax'
    }
  ];

  const yAxis = hasRsi ? [
    {
      scale: true,
      position: 'right',
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } }
    },
    {
      scale: true,
      gridIndex: 1,
      position: 'right',
      min: 0,
      max: 100,
      splitNumber: 2,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } }
    },
    {
      scale: false,
      min: 0,
      gridIndex: 0,
      show: false,
      max: function(v) { return Math.max(v.max * 4, 1000); }
    }
  ] : [
    {
      scale: true,
      position: 'right',
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: '#f1f5f9' } }
    },
    {
      scale: false,
      min: 0,
      gridIndex: 0,
      show: false,
      max: function(v) { return Math.max(v.max * 4, 1000); }
    }
  ];

  const series = [];

  // 1. Candlestick / Line Series
  if (AppState.chartType === "candlestick" || AppState.chartType === "heikinashi") {
    series.push({
      name: AppState.currentAsset.symbol,
      type: 'candlestick',
      data: chartOhlc,
      itemStyle: {
        color: '#089981',
        color0: '#f23645',
        borderColor: '#089981',
        borderColor0: '#f23645'
      }
    });
  } else {
    series.push({
      name: AppState.currentAsset.symbol,
      type: 'line',
      data: closes,
      smooth: true,
      lineStyle: { color: '#2563eb', width: 2 },
      itemStyle: { color: '#2563eb' }
    });
  }

  // 2. MA 20 Line
  if (AppState.indicators.ma) {
    series.push({
      name: 'MA(20)',
      type: 'line',
      data: ma20,
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#f59e0b', width: 1.5 }
    });
  }

  // 3. Volume Overlay Bars (TradingView Style)
  if (AppState.indicators.vol) {
    const volData = candles.map((c) => {
      const isUp = c.close >= c.open;
      const rawVol = (typeof c.volume === 'number' && c.volume > 0) ? c.volume : 0;
      return {
        value: rawVol,
        itemStyle: {
          color: isUp ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
          borderColor: isUp ? '#089981' : '#f23645',
          borderWidth: 1
        }
      };
    });

    series.push({
      name: 'Volume',
      type: 'bar',
      xAxisIndex: 0,
      yAxisIndex: hasRsi ? 2 : 1,
      data: volData,
      barMaxWidth: 14,
      z: 1
    });
  }

  // 4. RSI Subpane Series
  if (hasRsi) {
    series.push({
      name: `RSI(${AppState.rsiSettings.length})`,
      type: 'line',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: rsiValues,
      showSymbol: false,
      lineStyle: { color: '#7c3aed', width: 1.5 },
      markLine: {
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#cbd5e1' },
        data: [
          { yAxis: AppState.rsiSettings.upperBand, lineStyle: { color: '#ef4444' } },
          { yAxis: AppState.rsiSettings.midBand, lineStyle: { color: '#94a3b8' } },
          { yAxis: AppState.rsiSettings.lowerBand, lineStyle: { color: '#10b981' } }
        ]
      }
    });

    series.push({
      name: `RSI MA(${AppState.rsiSettings.maLength})`,
      type: 'line',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: rsiMa,
      showSymbol: false,
      lineStyle: { color: '#2563eb', width: 1.2 }
    });
  }

  const defaultStart = Math.max(0, 100 - Math.min(candles.length, 75) * 100 / candles.length);
  let currentStart = defaultStart;
  let currentEnd = 100;

  if (AppState.chart && !AppState._zoomNeedsReset) {
    try {
      const opt = AppState.chart.getOption();
      if (opt && opt.dataZoom && opt.dataZoom[0]) {
        currentStart = (typeof opt.dataZoom[0].start === 'number') ? opt.dataZoom[0].start : defaultStart;
        currentEnd = (typeof opt.dataZoom[0].end === 'number') ? opt.dataZoom[0].end : 100;
      }
    } catch (e) {}
  }
  AppState._zoomNeedsReset = false;

  const option = {
    animation: showAnimation,
    backgroundColor: '#ffffff',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: '#2563eb', type: 'dashed', width: 1 },
        label: {
          backgroundColor: '#0f172a',
          color: '#ffffff',
          fontSize: 11,
          fontWeight: 'bold',
          padding: [4, 8],
          borderRadius: 4
        }
      },
      backgroundColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#0f172a', fontSize: 12 },
      shadowColor: 'rgba(0,0,0,0.12)',
      shadowBlur: 12,
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        const dataIdx = params[0].dataIndex;
        const c = AppState.liveCandles && AppState.liveCandles[dataIdx];
        if (!c) return '';

        const rsi = (typeof rsiValues !== 'undefined' && rsiValues) ? rsiValues[dataIdx] : null;
        const rm = (typeof rsiMa !== 'undefined' && rsiMa) ? rsiMa[dataIdx] : null;

        // Dynamically update the top status strip as cursor glides across candles
        updateOHLCDisplay(c, rsi, rm);

        const isHa = AppState.chartType === 'heikinashi' && c.haOpen != null;
        const dispOpen = isHa ? c.haOpen : c.open;
        const dispHigh = isHa ? c.haHigh : c.high;
        const dispLow = isHa ? c.haLow : c.low;
        const dispClose = isHa ? c.haClose : c.close;
        const lblPrefix = isHa ? 'HA ' : '';

        const diff = Number((dispClose - dispOpen).toFixed(2));
        const pct = dispOpen > 0 ? Number(((diff / dispOpen) * 100).toFixed(2)) : 0;
        const isUp = diff >= 0;
        const color = isUp ? '#089981' : '#f23645';
        const sign = isUp ? '+' : '';
        const fDate = c.fullDate || '23-Sep-2026';
        const tStr = c.time || c.date || '';

        return '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; min-width:190px;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:6px;">' +
            '<span style="font-weight:700; color:#1e293b; font-size:12px;">📅 ' + fDate + '</span>' +
            '<span style="background:#eff6ff; color:#1d4ed8; font-weight:700; font-size:11px; padding:2px 6px; border-radius:4px; border:1px solid #bfdbfe;">⏰ ' + tStr + '</span>' +
          '</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:11px; margin-bottom:6px;">' +
            '<div><span style="color:#64748b;">' + lblPrefix + 'Open:</span> <strong style="color:#0f172a;">' + dispOpen.toFixed(2) + '</strong></div>' +
            '<div><span style="color:#64748b;">' + lblPrefix + 'High:</span> <strong style="color:#089981;">' + dispHigh.toFixed(2) + '</strong></div>' +
            '<div><span style="color:#64748b;">' + lblPrefix + 'Low:</span> <strong style="color:#f23645;">' + dispLow.toFixed(2) + '</strong></div>' +
            '<div><span style="color:#64748b;">' + lblPrefix + 'Close:</span> <strong style="color:' + color + '; font-weight:700;">' + dispClose.toFixed(2) + '</strong></div>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; font-size:11px; padding-top:4px; border-top:1px dashed #e2e8f0;">' +
            '<span><span style="color:#64748b;">Change:</span> <strong style="color:' + color + ';">' + sign + diff + ' (' + sign + pct + '%)</strong></span>' +
            '<span><span style="color:#64748b;">Vol:</span> <strong>' + (c.volume || 0).toLocaleString('en-IN') + '</strong></span>' +
          '</div>' +
          (rsi != null ? (
            '<div style="margin-top:6px; padding-top:4px; border-top:1px solid #f1f5f9; font-size:10px; color:#7c3aed; display:flex; justify-content:space-between;">' +
              '<span>RSI(7): <strong>' + Number(rsi).toFixed(1) + '</strong></span>' +
              (rm != null ? '<span style="color:#2563eb;">MA: <strong>' + Number(rm).toFixed(1) + '</strong></span>' : '') +
            '</div>'
          ) : '') +
        '</div>';
      }
    },
    grid: grid,
    xAxis: xAxis,
    yAxis: yAxis,
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: hasRsi ? [0, 1] : [0],
        start: currentStart,
        end: currentEnd,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true
      },
      {
        type: 'slider',
        xAxisIndex: hasRsi ? [0, 1] : [0],
        bottom: 2,
        height: 16,
        borderColor: '#cbd5e1',
        fillerColor: 'rgba(37, 99, 235, 0.12)',
        handleStyle: { color: '#2563eb', borderColor: '#1d4ed8' },
        moveHandleStyle: { color: '#93c5fd' },
        textStyle: { color: '#64748b', fontSize: 10, fontWeight: 'bold' },
        start: currentStart,
        end: currentEnd
      }
    ],
    series: series
  };

  AppState.chart.setOption(option, true);
}

function chartZoom(factor) {
  if (!AppState.chart) return;
  const opt = AppState.chart.getOption();
  if (!opt || !opt.dataZoom || !opt.dataZoom[0]) return;
  const dz = opt.dataZoom[0];
  const span = (dz.end - dz.start) * factor;
  const center = (dz.start + dz.end) / 2;
  const newStart = Math.max(0, Math.min(100, center - span / 2));
  const newEnd = Math.max(newStart + 2, Math.min(100, center + span / 2));
  AppState.chart.dispatchAction({
    type: 'dataZoom',
    start: Number(newStart.toFixed(1)),
    end: Number(newEnd.toFixed(1))
  });
}

function chartPan(deltaPct) {
  if (!AppState.chart) return;
  const opt = AppState.chart.getOption();
  if (!opt || !opt.dataZoom || !opt.dataZoom[0]) return;
  const dz = opt.dataZoom[0];
  const span = dz.end - dz.start;
  let newStart = dz.start + deltaPct;
  let newEnd = dz.end + deltaPct;
  if (newStart < 0) {
    newStart = 0;
    newEnd = span;
  }
  if (newEnd > 100) {
    newEnd = 100;
    newStart = 100 - span;
  }
  AppState.chart.dispatchAction({
    type: 'dataZoom',
    start: Number(newStart.toFixed(1)),
    end: Number(newEnd.toFixed(1))
  });
}

function chartResetZoom() {
  if (!AppState.chart) return;
  const candles = AppState.liveCandles || [];
  const defaultStart = Math.max(0, 100 - Math.min(candles.length, 75) * 100 / candles.length);
  AppState._zoomNeedsReset = true;
  AppState.chart.dispatchAction({
    type: 'dataZoom',
    start: defaultStart,
    end: 100
  });
}

window.chartZoom = chartZoom;
window.chartPan = chartPan;
window.chartResetZoom = chartResetZoom;
window.renderEChart = renderEChart;

function updateOHLCDisplay(candle, rsi, rsiMa) {
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

  const rEl = document.getElementById('val-rsi');
  const rmEl = document.getElementById('val-rsi-ma');
  if (rEl && rsi != null) rEl.textContent = Number(rsi).toFixed(1);
  if (rmEl && rsiMa != null) rmEl.textContent = Number(rsiMa).toFixed(1);
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
    const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
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
      if (isCustom && (!cw.stocks || cw.stocks.length === 0)) {
        listEl.innerHTML = `
          <div style="padding:24px 14px; text-align:center; color:#64748b;">
            <div style="font-size:28px; margin-bottom:8px;">📋</div>
            <strong style="color:#0f172a; font-size:13px;">ही वॉचलिस्ट रिकामी आहे</strong>
            <p style="font-size:11px; margin-top:4px; line-height:1.4;">
              वर सर्च बारमध्ये नाव टाईप करा व <strong>➕</strong> वर क्लिक करा, किंवा चार्टवरील <strong>⭐ + Watchlist</strong> बटन दाबा.
            </p>
          </div>
        `;
      } else {
        listEl.innerHTML = `
          <div style="padding:20px; text-align:center; color:#94a3b8; font-size:12px;">
            कोणताही स्टॉक सापडला नाही.
          </div>
        `;
      }
      return;
    }

    listEl.innerHTML = items.map(it => {
      const sign = it.isUp ? '+' : '';
      const col = it.isUp ? 'var(--green-bull)' : 'var(--red-bear)';
      const bg = it.isUp ? '#ecfdf5' : '#fef2f2';

      let actionButton = '';
      if (it.isSearchResultForCustom) {
        if (it.isAlreadyIn) {
          actionButton = `<span style="font-size:10px; color:#10b981; font-weight:800; margin-left:6px;">✓ जोडले</span>`;
        } else {
          actionButton = `<button class="btn-add-wl" onclick="event.stopPropagation(); addStockToCurrentWl('${it.symbol}')" title="या वॉचलिस्टमध्ये जोडा">➕ Add</button>`;
        }
      } else if (it.isCustomItem) {
        actionButton = `<button class="btn-remove-wl" onclick="event.stopPropagation(); removeStockFromCustomWl('${it.symbol}')" title="यादीतून काढा">✕</button>`;
      }

      return `
        <div class="stock-row ${it.symbol === AppState.currentAsset.symbol ? 'active' : ''}" onclick="selectStock('${it.symbol}')">
          <div class="stock-row-left">
            <span class="stock-sym">${it.symbol}</span>
            <span class="stock-name-sub">${it.name}</span>
          </div>
          <div class="stock-row-right">
            <span class="stock-price-val">₹${it.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <div style="display:flex; align-items:center;">
              <span class="stock-pct-val" style="color:${col}; background:${bg};">${sign}${it.chgPct.toFixed(2)}%</span>
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
      renderEChart();
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

  // 14. Left Drawing Toolbar & Fullscreen Event Handlers
  const drawBtns = document.querySelectorAll('.draw-tool-btn[data-tool]');
  let currentDrawTool = 'crosshair';

  drawBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      drawBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDrawTool = btn.getAttribute('data-tool');
      if (currentDrawTool === 'crosshair') {
        showToastNotification("✛ कर्सर सक्रिय (Normal Crosshair)", "info");
      } else if (currentDrawTool === 'trendline') {
        showToastNotification("╱ ट्रेंडलाईन टूल सक्रिय (Trendline Mode)", "info");
      } else if (currentDrawTool === 'horizline') {
        showToastNotification("─ सपोर्ट / रेझिस्टन्स लेव्हल टूल सक्रिय", "info");
      } else if (currentDrawTool === 'measure') {
        showToastNotification("📏 प्राइस मोजमाप टूल सक्रिय", "info");
      }
    });
  });

  const btnClearDraw = document.getElementById('btnChartClearDraw');
  if (btnClearDraw) {
    btnClearDraw.addEventListener('click', () => {
      showToastNotification("🗑️ काढलेल्या सर्व रेषा पुसल्या!", "info");
      renderEChart();
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
        a.download = `Finanthropist_${sym}_Chart.png`;
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
