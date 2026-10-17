/**
 * HỆ THỐNG CHAT NỘI BỘ V2 - CLIENT SCRIPT
 * Tính năng chính:
 * 1. Đăng ký & Đăng nhập người dùng (Tên & Mật khẩu)
 * 2. Đổi tên, avatar, mật khẩu của người dùng
 * 3. Tự động đồng bộ danh bạ đồng nghiệp từ Server
 * 4. Tính năng Gọi thoại & Gọi video HOẠT ĐỘNG THỰC TẾ (Camera, Mic & Web Audio)
 */

// ==========================================
// 1. BIẾN TRẠNG THÁI TOÀN CỤC (STATE)
// ==========================================
let currentUser = null; // { id, username, fullName, dept, avatar, role }
let internalUsers = []; // Danh sách đồng nghiệp & nhóm chat
let currentUserId = null;
let currentFilter = "all";
let pendingAttachment = null;
let tempNewAvatarData = null;
let allSystemUsers = []; // Tất cả người dùng trong công ty
let currentGroupData = null; // Dữ liệu phân quyền và thành viên nhóm chat chung
let replyingToMessage = null; // Tin nhắn đang được trích dẫn để trả lời (Reply/Quote)

// Quản lý Cuộc Gọi (WebRTC + MediaDevices + Audio)
let activeCall = {
  active: false,
  connected: false,
  partner: null,
  isVideo: false,
  stream: null,
  pc: null,
  pendingCandidates: [],
  timerInterval: null,
  seconds: 0,
  audioCtx: null,
  ringOscillator: null,
  ringGain: null
};

// ==========================================
// 2. KHỞI CHẠY ỨNG DỤNG KHI TẢI TRANG
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  setupAdminSettingsEvents();
  setupAvatarCropperEvents();
  setupGroupManagementEvents();
  setupAuthEvents();
  setupCallingEvents();

  // Kiểm tra phiên đăng nhập đã lưu
  checkExistingSession();

  // Lắng nghe sự kiện người dùng quay lại tab chat để tự động đánh dấu đã đọc
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible' && currentUserId) {
      const activeUser = internalUsers.find(u => u.id === currentUserId);
      if (activeUser && activeUser.unreadCount > 0) {
        activeUser.unreadCount = 0;
        setLastReadTime(activeUser.id, Date.now());
        renderUserList();
        updateGlobalUnreadBadge();
      }
      clearTabTitleAlert();
    }
  });

  window.addEventListener("focus", () => {
    if (currentUserId) {
      const activeUser = internalUsers.find(u => u.id === currentUserId);
      if (activeUser && activeUser.unreadCount > 0) {
        activeUser.unreadCount = 0;
        setLastReadTime(activeUser.id, Date.now());
        renderUserList();
        updateGlobalUnreadBadge();
      }
      clearTabTitleAlert();
    }
  });

  // Tự động xin quyền hiển thị thông báo màn hình khi người dùng chạm vào trang
  document.addEventListener("click", () => {
    requestNotificationPermission();
  }, { once: true });

  // Khóa cứng viewport trên di động, ngăn chặn trình duyệt cuộn lệch trang làm khuất Header
  if (window.visualViewport) {
    const handleViewportChange = () => {
      const container = document.querySelector('.chat-app-container');
      if (container && window.innerWidth <= 768) {
        container.style.height = `${window.visualViewport.height}px`;
      }
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    };
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
  }

  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  });
});

// ==========================================
// 3. XÁC THỰC: ĐĂNG NHẬP & ĐĂNG KÝ
// ==========================================
function checkExistingSession() {
  const savedUserJson = localStorage.getItem("chatexcel_session_user_v2");
  if (savedUserJson) {
    try {
      currentUser = JSON.parse(savedUserJson);
      onLoginSuccess(currentUser, false);
      return;
    } catch (e) {
      localStorage.removeItem("chatexcel_session_user_v2");
    }
  }

  // Nếu chưa đăng nhập, hiển thị Auth Modal
  showAuthModal();
}

function showAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "flex";
}

function hideAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "none";
}

function setupAuthEvents() {
  const tabLogin = document.getElementById("tabBtnLogin");
  const tabRegister = document.getElementById("tabBtnRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const btnLogout = document.getElementById("btnLogout");

  // Chuyển Tab Đăng Nhập / Đăng Ký
  tabLogin?.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
  });

  tabRegister?.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.style.display = "flex";
    loginForm.style.display = "none";
  });

  // Xử lý gửi Form Đăng Nhập
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername")?.value.trim().toLowerCase();
    const password = document.getElementById("loginPassword")?.value.trim();

    if (!username || !password) return;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(`❌ ${data.error || "Đăng nhập thất bại"}`);
        return;
      }

      onLoginSuccess(data.user, true);
    } catch (err) {
      // Hỗ trợ chế độ offline / fallback
      const localUsers = JSON.parse(localStorage.getItem("chatexcel_offline_users") || "[]");
      const found = localUsers.find(u => u.username === username && u.password === password);
      if (found) {
        onLoginSuccess(found, true);
      } else {
        showToast("❌ Không thể kết nối máy chủ hoặc sai tài khoản.");
      }
    }
  });

  // Xử lý gửi Form Đăng Ký
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("regUsername")?.value.trim().toLowerCase();
    const fullName = document.getElementById("regFullName")?.value.trim();
    const dept = document.getElementById("regDept")?.value.trim() || "Phòng Nội Bộ";
    const password = document.getElementById("regPassword")?.value.trim();

    if (!username || !password || !fullName) return;

    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, fullName, dept, password, avatar })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(`❌ ${data.error || "Đăng ký thất bại"}`);
        return;
      }

      showToast("🎉 Đăng ký thành công!");
      onLoginSuccess(data.user, true);
    } catch (err) {
      // Offline fallback
      const newUser = { id: 'u_' + Date.now(), username, fullName, dept, password, avatar, role: "Thành viên" };
      const localUsers = JSON.parse(localStorage.getItem("chatexcel_offline_users") || "[]");
      localUsers.push(newUser);
      localStorage.setItem("chatexcel_offline_users", JSON.stringify(localUsers));
      onLoginSuccess(newUser, true);
    }
  });

  // Đăng xuất
  btnLogout?.addEventListener("click", () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất tài khoản?")) {
      localStorage.removeItem("chatexcel_session_user_v2");
      currentUser = null;
      window.location.reload();
    }
  });
}

function onLoginSuccess(user, notify = true) {
  currentUser = user;
  localStorage.setItem("chatexcel_session_user_v2", JSON.stringify(user));
  hideAuthModal();
  renderCurrentUserUI();

  if (notify) {
    showToast(`👋 Chào mừng ${user.fullName} đã đăng nhập!`);
  }

  // Tải danh bạ đồng nghiệp & kết nối thời gian thực (lần đầu khởi động)
  loadUsersAndSync(true);
}

function renderCurrentUserUI() {
  if (!currentUser) return;
  const avatarImg = document.getElementById("myAvatar");
  const nameEl = document.getElementById("myName");
  const roleEl = document.getElementById("myRole");

  if (avatarImg) avatarImg.src = currentUser.avatar;
  if (nameEl) nameEl.innerText = currentUser.fullName;
  if (roleEl) roleEl.innerHTML = `<i class="fa-solid fa-id-badge"></i> ${escapeHtml(currentUser.dept || "Nội bộ")}`;
}

// ==========================================
// 4. TẢI DANH BẠ ĐỒNG NGHIỆP & LỊCH SỬ TIN NHẮN TỪ MÁY CHỦ
// ==========================================

// Quản lý mốc thời gian đọc tin nhắn và thông báo chưa đọc
function getLastReadTime(convId) {
  if (!convId || !currentUser) return 0;
  const key = `chatexcel_read_${(currentUser.username || '').toLowerCase()}_${convId}`;
  const val = localStorage.getItem(key);
  return val ? parseInt(val, 10) : 0;
}

function setLastReadTime(convId, timestamp = Date.now()) {
  if (!convId || !currentUser) return;
  const key = `chatexcel_read_${(currentUser.username || '').toLowerCase()}_${convId}`;
  localStorage.setItem(key, String(timestamp));
}

function getMessageTimestamp(msg) {
  if (!msg) return 0;
  if (msg.timestamp && typeof msg.timestamp === 'number') return msg.timestamp;
  if (msg.createdAt) {
    const t = new Date(msg.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (msg.id && typeof msg.id === 'string') {
    const match = msg.id.match(/^msg_(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

// 1. Âm thanh chuông báo có tin nhắn mới nhẹ nhàng (Web Audio API)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(783.99, now); // Nốt Sol
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.12); // Nốt Đô cao

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    setTimeout(() => {
      try { ctx.close(); } catch (e) {}
    }, 400);
  } catch (e) {}
}

// 2. Nhấp nháy tiêu đề Tab trình duyệt khi có tin nhắn chưa đọc
let tabTitleInterval = null;
const originalDocTitle = "Hệ Thống Chat Nội Bộ - Enterprise Internal Chat";

function triggerTabTitleAlert(senderName) {
  const totalUnread = internalUsers.reduce((sum, u) => sum + (u.unreadCount || 0), 0);
  if (totalUnread <= 0) {
    clearTabTitleAlert();
    return;
  }

  if (tabTitleInterval) clearInterval(tabTitleInterval);

  let toggle = false;
  tabTitleInterval = setInterval(() => {
    if (document.visibilityState === 'visible' && !internalUsers.some(u => u.unreadCount > 0)) {
      clearTabTitleAlert();
      return;
    }
    document.title = toggle
      ? `(${totalUnread}) 📩 Tin nhắn mới từ ${senderName || 'đồng nghiệp'}!`
      : `🔔 (${totalUnread} tin chưa đọc) - Chat Nội Bộ`;
    toggle = !toggle;
  }, 1400);
}

function clearTabTitleAlert() {
  if (tabTitleInterval) {
    clearInterval(tabTitleInterval);
    tabTitleInterval = null;
  }
  const totalUnread = internalUsers.reduce((sum, u) => sum + (u.unreadCount || 0), 0);
  if (totalUnread > 0) {
    document.title = `(${totalUnread}) 📩 Chat Nội Bộ`;
  } else {
    document.title = originalDocTitle;
  }
}

// 3. Cập nhật huy hiệu đỏ tổng số tin chưa đọc trên nút Menu Trái
function updateGlobalUnreadBadge() {
  const totalUnread = internalUsers.reduce((sum, u) => sum + (u.unreadCount || 0), 0);
  const badgeEl = document.getElementById("menuUnreadBadge");
  if (badgeEl) {
    if (totalUnread > 0) {
      badgeEl.innerText = totalUnread > 99 ? "99+" : totalUnread;
      badgeEl.style.display = "inline-flex";
    } else {
      badgeEl.style.display = "none";
    }
  }
}

// 4. Thông báo màn hình Desktop Notification
function requestNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) {}
}

function showDesktopNotification(senderName, text) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted" && document.visibilityState !== "visible") {
      const notif = new Notification(`💬 ${senderName}`, {
        body: text || "Đã gửi cho bạn một tin nhắn mới",
        icon: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(senderName)}`,
        tag: "chatexcel-msg",
        renotify: true
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      setTimeout(() => notif.close(), 6000);
    }
  } catch (e) {}
}

function getMsgCacheKey() {
  return currentUser ? ("chatexcel_cached_msgs_" + (currentUser.username || "").toLowerCase().trim()) : null;
}

function saveLocalMessage(msg) {
  const cacheKey = getMsgCacheKey();
  if (!cacheKey || !msg) return;
  try {
    const raw = localStorage.getItem(cacheKey);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    if (!list.some(m => m.id === msg.id)) {
      list.push(msg);
      if (list.length > 3000) list.shift();
      localStorage.setItem(cacheKey, JSON.stringify(list));
    }
  } catch (e) {}
}

function clearLocalMessages(targetUsername, isGroup) {
  const cacheKey = getMsgCacheKey();
  if (!cacheKey) return;
  try {
    const raw = localStorage.getItem(cacheKey);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;

    if (isGroup) {
      list = list.filter(m => !m.isGroup);
    } else if (targetUsername) {
      const myUser = (currentUser.username || '').toLowerCase().trim();
      const target = (targetUsername || '').toLowerCase().trim();
      list = list.filter(m => {
        if (m.isGroup) return true;
        const s = (m.senderUsername || '').toLowerCase().trim();
        const t = (m.targetUsername || '').toLowerCase().trim();
        const isBetween = (s === myUser && t === target) || (s === target && t === myUser);
        return !isBetween;
      });
    }
    localStorage.setItem(cacheKey, JSON.stringify(list));
  } catch (e) {}
}

function mergeMessages(listA, listB) {
  const map = new Map();
  (listA || []).forEach(m => {
    if (m && m.id) map.set(m.id, m);
  });
  (listB || []).forEach(m => {
    if (m && m.id) map.set(m.id, m);
  });
  return Array.from(map.values());
}

function hydrateMessagesIntoConversations(msgs) {
  if (!Array.isArray(msgs) || !currentUser) return;
  if (msgs.length === 0) return; // Không bao giờ xóa hội thoại nếu danh sách nạp rỗng
  const myUsername = (currentUser.username || '').toLowerCase().trim();

  const currentTotal = internalUsers.reduce((sum, u) => sum + (u.messages ? u.messages.length : 0), 0);
  if (msgs.length === currentTotal) {
    if (msgs.length === 0) return; // Cả hai đều không có tin nhắn mới, không cần làm gì
    const lastIncoming = msgs[msgs.length - 1];
    const allCurrentMsgs = internalUsers.flatMap(u => u.messages || []);
    const currentLast = allCurrentMsgs.length > 0 ? allCurrentMsgs[allCurrentMsgs.length - 1] : null;
    if (lastIncoming && currentLast && lastIncoming.id === currentLast.id) {
      return; // Tin nhắn không thay đổi, tránh giật màn hình
    }
  }

  // Reset mảng tin nhắn của từng hội thoại để nạp chính xác theo thời gian
  internalUsers.forEach(u => {
    u.messages = [];
    u.sharedImages = [];
    u.sharedFiles = [];
    u.sharedLinks = [];
  });

  msgs.forEach(m => {
    let targetConv = null;

    if (m.isGroup) {
      targetConv = internalUsers.find(u => u.isGroup);
    } else {
      const s = (m.senderUsername || '').toLowerCase().trim();
      const t = (m.targetUsername || (m.targetId ? m.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();
      let partner = "";
      if (s === myUsername) partner = t;
      else if (t === myUsername) partner = s;

      if (partner) {
        targetConv = internalUsers.find(u => (u.username || '').toLowerCase().trim() === partner);
        if (!targetConv) {
          const partnerAcc = allSystemUsers.find(a => (a.username || '').toLowerCase().trim() === partner);
          targetConv = {
            id: "u_" + partner,
            username: partner,
            name: (partnerAcc ? partnerAcc.fullName : (s === partner ? m.senderName : null)) || partner,
            title: (partnerAcc ? partnerAcc.role : "Thành viên nội bộ"),
            dept: (partnerAcc ? partnerAcc.dept : "Phòng Ban"),
            avatar: (partnerAcc ? partnerAcc.avatar : `https://api.dicebear.com/7.x/bottts/svg?seed=${partner}`),
            status: (partnerAcc && partnerAcc.isOnline) ? "online" : "offline",
            statusText: (partnerAcc && partnerAcc.isOnline) ? "Đang trực tuyến" : "Ngoại tuyến",
            empId: "NV-" + partner.toUpperCase(),
            email: partner + "@chatexcel.lan",
            ipAddress: "Mạng LAN",
            loginTime: "Hôm nay",
            device: "Web Browser",
            unreadCount: 0,
            isGroup: false,
            messages: [],
            sharedImages: [],
            sharedFiles: [],
            sharedLinks: []
          };
          internalUsers.push(targetConv);
        }
      }
    }

    if (!targetConv) return;

    const isMe = Boolean(m.senderUsername && m.senderUsername.toLowerCase().trim() === myUsername);
    let senderType = isMe ? 'me' : 'them';
    if (m.type === 'system') senderType = 'system';

    const formattedMsg = {
      id: m.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      timestamp: m.timestamp || getMessageTimestamp(m) || Date.now(),
      sender: senderType,
      senderName: isMe ? currentUser.fullName : (m.senderName || targetConv.name || targetConv.username),
      senderUsername: m.senderUsername || (isMe ? currentUser.username : targetConv.username),
      type: m.type || 'text',
      text: m.text || '',
      fileName: m.fileName,
      fileSize: m.fileSize,
      fileExt: m.fileExt,
      fileUrl: m.fileUrl,
      imageUrl: m.imageUrl,
      caption: m.caption,
      audioUrl: m.audioUrl,
      duration: m.duration,
      durationText: m.durationText,
      time: m.time || '',
      status: m.status || 'seen',
      replyTo: m.replyTo || null,
      reactions: (m.reactions && typeof m.reactions === 'object') ? m.reactions : {},
      isPinned: !!m.isPinned
    };

    targetConv.messages.push(formattedMsg);

    // Cột phải: Ảnh chia sẻ
    if (formattedMsg.type === 'image' && formattedMsg.imageUrl) {
      targetConv.sharedImages.unshift({
        id: 'img_' + formattedMsg.id,
        url: formattedMsg.imageUrl,
        title: formattedMsg.caption || formattedMsg.fileName || 'Hình ảnh',
        date: formattedMsg.time || 'Gần đây'
      });
    } else if (formattedMsg.type === 'file' && (formattedMsg.fileName || formattedMsg.fileUrl)) {
      targetConv.sharedFiles.unshift({
        id: 'file_' + formattedMsg.id,
        name: formattedMsg.fileName || 'Tệp đính kèm',
        size: formattedMsg.fileSize || '',
        ext: formattedMsg.fileExt || getExtCategory((formattedMsg.fileName || '').split('.').pop().toLowerCase()),
        url: formattedMsg.fileUrl || '#',
        date: formattedMsg.time || 'Gần đây'
      });
    } else if ((formattedMsg.type === 'voice' || formattedMsg.type === 'audio') && formattedMsg.audioUrl) {
      targetConv.sharedFiles.unshift({
        id: 'voice_' + formattedMsg.id,
        name: formattedMsg.fileName || `Ghi âm (${formattedMsg.durationText || formatVoiceDuration(formattedMsg.duration || 0)})`,
        size: formattedMsg.fileSize || 'Tin thoại',
        ext: 'mp3',
        url: formattedMsg.audioUrl,
        date: formattedMsg.time || 'Gần đây'
      });
    }

    // Cột phải: Liên kết URL
    if (formattedMsg.type === 'text' && formattedMsg.text) {
      const urlMatches = formattedMsg.text.match(/(https?:\/\/[^\s]+)/g);
      if (urlMatches) {
        urlMatches.forEach(url => {
          targetConv.sharedLinks.unshift({ id: 'link_' + formattedMsg.id, title: url, url: url });
        });
      }
    }
  });

  // Cập nhật số tin nhắn chưa đọc cho từng cuộc trò chuyện
  internalUsers.forEach(u => {
    if (u.id === currentUserId && document.visibilityState === 'visible') {
      u.unreadCount = 0;
      setLastReadTime(u.id, Date.now());
    } else {
      const lastRead = getLastReadTime(u.id);
      if (lastRead === 0) {
        setLastReadTime(u.id, Date.now());
        u.unreadCount = 0;
      } else {
        u.unreadCount = u.messages.filter(m => m.sender !== 'me' && (m.timestamp || getMessageTimestamp(m)) > lastRead).length;
      }
    }
  });

  // Cập nhật giao diện nếu đang mở cuộc trò chuyện
  if (currentUserId) {
    const activeUser = internalUsers.find(u => u.id === currentUserId);
    if (activeUser) {
      renderMessages(activeUser);
      renderRightPanelDetails(activeUser);
    }
  }
  renderUserList();
  updateGlobalUnreadBadge();
  const totalUnread = internalUsers.reduce((sum, u) => sum + (u.unreadCount || 0), 0);
  if (totalUnread > 0) {
    triggerTabTitleAlert();
  }
}

async function loadMessagesHistory() {
  if (!currentUser) return;
  const cacheKey = getMsgCacheKey();
  let localMsgs = [];

  // 1. Tải ngay từ LocalStorage để người dùng thấy tin nhắn ngay lập tức (0ms)
  if (cacheKey) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        localMsgs = JSON.parse(cached);
        if (Array.isArray(localMsgs) && localMsgs.length > 0) {
          hydrateMessagesIntoConversations(localMsgs);
        }
      }
    } catch (e) {}
  }

  // 2. Tải toàn bộ lịch sử chính thức từ Server qua /api/messages
  try {
    const res = await fetch(`/api/messages?username=${encodeURIComponent(currentUser.username)}`);
    if (res.ok) {
      const data = await res.json();
      const serverMsgs = Array.isArray(data.messages) ? data.messages : [];
      
      // Hợp nhất cả hai nguồn: không bao giờ để tin nhắn bị mất khi server trống
      const merged = mergeMessages(localMsgs, serverMsgs);
      if (cacheKey) {
        localStorage.setItem(cacheKey, JSON.stringify(merged));
      }
      hydrateMessagesIntoConversations(merged);

      // Nếu client có tin nhắn mà server chưa có (ví dụ server vừa khởi động lại), đồng bộ ngược lên server
      const missingOnServer = (localMsgs || []).filter(lm => !serverMsgs.some(sm => sm.id === lm.id));
      if (missingOnServer.length > 0) {
        fetch("/api/messages/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: missingOnServer })
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Chưa thể đồng bộ tin nhắn từ máy chủ, vẫn dùng tin nhắn đã lưu trên máy:", err);
  }
}

async function loadUsersAndSync(isInitial = false) {
  try {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      allSystemUsers = data.users || [];
      if (data.group) {
        currentGroupData = data.group;
      }
      buildUserListFromAccounts(data.users || [], data.group);
      await loadMessagesHistory();
    }
  } catch (err) {
    console.log("Chạy chế độ độc lập (offline)");
    await loadMessagesHistory();
  }

  // Chỉ kết nối Server-Sent Events lần đầu, tránh vòng lặp reconnect gây nhấp nháy menu
  if (isInitial || !currentEventSource) {
    initRealtimeSSE();
  }
}

function buildUserListFromAccounts(allAccounts, serverGroup) {
  // Lưu lại tin nhắn và dữ liệu hiện tại của các cuộc trò chuyện trước khi cập nhật
  const existingMap = new Map();
  internalUsers.forEach(u => {
    existingMap.set(u.id, u);
    if (u.username) existingMap.set(u.username, u);
  });

  // Lọc bỏ chính tài khoản của mình ra khỏi danh bạ người chat
  const otherUsers = allAccounts.filter(acc => acc.username !== currentUser?.username);

  const groupInfo = serverGroup || currentGroupData;
  const groupName = groupInfo?.name || "Nhóm Chat Chung Nội Bộ";
  const groupAvatar = groupInfo?.avatar || "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80";

  // Bảo lưu tin nhắn nhóm nếu đã có từ trước
  const existingGroup = existingMap.get("grp_all");

  // Chỉ thành viên được Trưởng/Phó nhóm thêm mới thấy Nhóm Chat Chung trong danh bạ
  const myUsername = (currentUser?.username || '').toLowerCase().trim();
  const isMember = Array.isArray(groupInfo?.members) && groupInfo.members.some(u => (u || '').toLowerCase().trim() === myUsername);

  internalUsers = [];

  if (isMember) {
    // Tạo phòng chat nhóm chung
    const groupChat = {
      id: "grp_all",
      name: groupName,
      title: "Phòng Họp Chung",
      dept: "Tất cả thành viên",
      avatar: groupAvatar,
      status: "online",
      statusText: "Phòng trao đổi công việc chung",
      empId: "GRP-ALL",
      email: "all@chatexcel.lan",
      ipAddress: "Mạng LAN",
      loginTime: "Hoạt động",
      device: "Kênh chung",
      unreadCount: existingGroup ? existingGroup.unreadCount : 0,
      isGroup: true,
      messages: existingGroup ? existingGroup.messages : [],
      sharedImages: existingGroup ? existingGroup.sharedImages : [],
      sharedFiles: existingGroup ? existingGroup.sharedFiles : [],
      sharedLinks: existingGroup ? existingGroup.sharedLinks : []
    };
    internalUsers.push(groupChat);
  }

  otherUsers.forEach(acc => {
    const existing = existingMap.get("u_" + acc.username) || existingMap.get(acc.username);
    internalUsers.push({
      id: "u_" + acc.username,
      username: acc.username,
      name: acc.fullName,
      title: acc.role || "Thành viên nội bộ",
      dept: acc.dept || "Phòng Ban",
      avatar: acc.avatar,
      status: acc.isOnline ? "online" : "offline",
      statusText: acc.isOnline ? "Đang trực tuyến • Sẵn sàng gọi & chat" : "Ngoại tuyến",
      empId: "NV-" + (acc.username.toUpperCase()),
      email: acc.username + "@chatexcel.lan",
      ipAddress: "10.10.0.xxx",
      loginTime: "Hôm nay",
      device: "Web Browser",
      unreadCount: existing ? existing.unreadCount : 0,
      isGroup: false,
      messages: existing ? existing.messages : [],
      sharedImages: existing ? existing.sharedImages : [],
      sharedFiles: existing ? existing.sharedFiles : [],
      sharedLinks: existing ? existing.sharedLinks : []
    });
  });

  // Giữ lại tất cả các cuộc trò chuyện riêng 1-1 đã mở trước đó để không bị mất
  existingMap.forEach((u, key) => {
    if (!u.isGroup && u.username && !internalUsers.some(item => (item.username || '').toLowerCase() === u.username.toLowerCase())) {
      internalUsers.push(u);
    }
  });

  renderUserList();

  // Ưu tiên cao nhất: Giữ nguyên cuộc trò chuyện mà người dùng đang mở chat
  let targetId = null;
  if (currentUserId && internalUsers.some(u => u.id === currentUserId)) {
    targetId = currentUserId;
  } else {
    const savedActiveConv = localStorage.getItem("chatexcel_last_active_conv");
    if (savedActiveConv && internalUsers.some(u => u.id === savedActiveConv)) {
      targetId = savedActiveConv;
    } else if (internalUsers.length > 0) {
      targetId = internalUsers[0].id;
    }
  }

  if (targetId && (!currentUserId || targetId !== currentUserId)) {
    selectUser(targetId);
  } else if (targetId && currentUserId === targetId) {
    document.querySelectorAll(".user-item-card").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-id") === targetId);
    });
  }
}

// ==========================================
// 5. CỘT TRÁI: HIỂN THỊ DANH SÁCH NGƯỜI CHAT
// ==========================================
function renderUserList() {
  const container = document.getElementById("userListContainer");
  if (!container) return;

  const searchQuery = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();

  const filteredUsers = internalUsers.filter(user => {
    if (currentFilter === "online" && user.status !== "online") return false;
    if (currentFilter === "groups" && !user.isGroup) return false;

    if (searchQuery) {
      const matchName = user.name.toLowerCase().includes(searchQuery);
      const matchDept = user.dept.toLowerCase().includes(searchQuery);
      return matchName || matchDept;
    }
    return true;
  });

  if (filteredUsers.length === 0) {
    let emptyMsg = "Chưa có đồng nghiệp nào khác";
    let emptyIcon = "fa-users-slash";
    if (currentFilter === "groups") {
      emptyMsg = "Bạn chưa tham gia nhóm chat nào";
      emptyIcon = "fa-people-group";
    } else if (currentFilter === "online") {
      emptyMsg = "Hiện không có ai trực tuyến";
      emptyIcon = "fa-user-clock";
    }
    const emptyHtml = `
      <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
        <i class="fa-solid ${emptyIcon}" style="font-size: 28px; margin-bottom: 8px;"></i>
        <p style="font-size: 13px;">${emptyMsg}</p>
      </div>
    `;
    if (container.dataset.renderedCache !== emptyHtml) {
      container.dataset.renderedCache = emptyHtml;
      container.innerHTML = emptyHtml;
    }
    updateLiveStats();
    return;
  }

  const newHtml = filteredUsers.map(user => {
    const lastMsg = user.messages[user.messages.length - 1];
    let lastMsgText = user.isGroup ? "Nhóm chat chung" : "Sẵn sàng nhắn tin & gọi";
    let lastMsgTime = "";

    if (lastMsg) {
      lastMsgTime = lastMsg.time || "";
      if (lastMsg.type === "image") {
        lastMsgText = "📷 [Hình ảnh]";
      } else if (lastMsg.type === "file") {
        lastMsgText = `📎 [Tệp: ${lastMsg.fileName}]`;
      } else if (lastMsg.type === "voice" || lastMsg.type === "audio") {
        lastMsgText = `🎙️ [Tin nhắn thoại: ${lastMsg.durationText || 'Âm thanh'}]`;
      } else {
        lastMsgText = lastMsg.text || "";
      }
    }

    const isActive = user.id === currentUserId ? "active" : "";
    const hasUnread = (user.unreadCount || 0) > 0;
    const unreadClass = hasUnread ? "has-unread" : "";
    const unreadBadgeText = (user.unreadCount > 99) ? "99+" : user.unreadCount;
    const unreadBadge = hasUnread ? `<span class="user-card-badge">${unreadBadgeText}</span>` : "";
    const unreadDot = hasUnread ? `<span class="avatar-unread-dot"></span>` : "";

    return `
      <div class="user-item-card ${isActive} ${unreadClass}" onclick="selectUser('${user.id}')" data-id="${user.id}">
        <div class="user-card-avatar">
          <img src="${user.avatar}" alt="${user.name}" class="avatar-img">
          <span class="status-indicator status-${user.status}"></span>
          ${unreadDot}
        </div>
        <div class="user-card-info">
          <div class="user-card-top">
            <span class="user-card-name">${escapeHtml(user.name)}</span>
            <span class="user-card-time ${hasUnread ? 'unread-time' : ''}">${lastMsgTime}</span>
          </div>
          <div class="user-card-sub">
            <span class="user-card-msg ${hasUnread ? 'unread-msg' : ''}">${escapeHtml(lastMsgText)}</span>
            ${unreadBadge}
          </div>
          <div>
            <span class="user-card-dept-tag"><i class="fa-solid fa-briefcase"></i> ${escapeHtml(user.dept)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Chỉ ghi đè DOM khi nội dung thực sự thay đổi -> hoàn toàn không bị chớp giật hay nhấp nháy!
  if (container.dataset.renderedCache === newHtml) {
    updateLiveStats();
    updateGlobalUnreadBadge();
    return;
  }

  container.dataset.renderedCache = newHtml;
  container.innerHTML = newHtml;

  updateLiveStats();
  updateGlobalUnreadBadge();
}

function updateLiveStats() {
  const onlineCount = internalUsers.filter(u => u.status === "online").length;
  const totalCount = internalUsers.length;
  const groupsCount = internalUsers.filter(u => u.isGroup).length;

  document.getElementById("onlineCount") && (document.getElementById("onlineCount").innerText = onlineCount);
  document.getElementById("totalCount") && (document.getElementById("totalCount").innerText = totalCount);
  document.getElementById("countAll") && (document.getElementById("countAll").innerText = totalCount);
  document.getElementById("countOnlineTab") && (document.getElementById("countOnlineTab").innerText = onlineCount);
  document.getElementById("countGroups") && (document.getElementById("countGroups").innerText = groupsCount);
}

// ==========================================
// 6. CHỌN CUỘC TRÒ CHUYỆN & CẬP NHẬT GIAO DIỆN
// ==========================================
window.openDirectChat = function(username) {
  if (!username || !currentUser) return;
  const targetUserClean = (username || '').toLowerCase().trim();
  if (targetUserClean === (currentUser.username || '').toLowerCase().trim()) return;

  const targetId = 'u_' + targetUserClean;
  let targetUser = internalUsers.find(u => u.id === targetId || (u.username || '').toLowerCase().trim() === targetUserClean);
  if (!targetUser) {
    const acc = allSystemUsers.find(a => (a.username || '').toLowerCase().trim() === targetUserClean);
    if (acc) {
      targetUser = {
        id: "u_" + acc.username,
        username: acc.username,
        name: acc.fullName,
        title: acc.role || "Thành viên nội bộ",
        dept: acc.dept || "Phòng Ban",
        avatar: acc.avatar,
        status: acc.isOnline ? "online" : "offline",
        statusText: acc.isOnline ? "Đang trực tuyến • Sẵn sàng gọi & chat" : "Ngoại tuyến",
        empId: "NV-" + (acc.username.toUpperCase()),
        email: acc.username + "@chatexcel.lan",
        ipAddress: "10.10.0.xxx",
        loginTime: "Hôm nay",
        device: "Web Browser",
        unreadCount: 0,
        isGroup: false,
        messages: [],
        sharedImages: [],
        sharedFiles: [],
        sharedLinks: []
      };
      internalUsers.push(targetUser);
      renderUserList();
    }
  }
  if (targetUser) {
    selectUser(targetUser.id);
  }
};

function selectUser(userId) {
  const user = internalUsers.find(u => u.id === userId);
  if (!user) return;

  currentUserId = userId;
  user.unreadCount = 0;
  setLastReadTime(userId, Date.now());
  updateGlobalUnreadBadge();
  clearTabTitleAlert();
  try {
    localStorage.setItem("chatexcel_last_active_conv", userId);
  } catch (e) {}

  // Tự động đóng Drawer danh bạ trên mobile khi người dùng chạm chọn một người chat
  if (window.innerWidth <= 768) {
    document.getElementById("panelLeft")?.classList.remove("open");
    document.getElementById("mobileBackdrop")?.classList.remove("active");
    document.getElementById("btnToggleLeftMenu")?.classList.remove("active-toggle");
  }

  document.querySelectorAll(".user-item-card").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-id") === userId);
  });

  renderMiddleChatHeader(user);
  renderMessages(user);
  renderRightPanelDetails(user);
  renderUserList();

  if (user.isGroup) {
    renderGroupMembers();
    renderGroupAdminControls();
    checkGroupChatLockStatus();
  } else {
    const grpMemSec = document.getElementById("groupMembersSection");
    const grpAdmSec = document.getElementById("groupAdminSection");
    const infoSec = document.getElementById("infoAccordionSection");
    if (grpMemSec) grpMemSec.style.display = "none";
    if (grpAdmSec) grpAdmSec.style.display = "none";
    if (infoSec) infoSec.style.display = "block";

    const lockedBanner = document.getElementById("chatLockedBanner");
    const inputBar = document.querySelector(".chat-input-bar");
    if (lockedBanner) lockedBanner.style.display = "none";
    if (inputBar) inputBar.classList.remove("is-locked");
    const msgInput = document.getElementById("messageInput");
    if (msgInput) {
      msgInput.disabled = false;
      msgInput.placeholder = "Nhập văn bản...";
    }
  }

  if (window.innerWidth > 768) {
    setTimeout(() => {
      document.getElementById("messageInput")?.focus({ preventScroll: true });
    }, 100);
  } else {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }
}

function renderMiddleChatHeader(user) {
  const avatar = document.getElementById("currentChatAvatar");
  const name = document.getElementById("currentChatName");
  const dept = document.getElementById("currentChatDept");
  const dot = document.getElementById("currentChatStatusDot");
  const statusText = document.getElementById("currentChatStatusText");
  const pinnedBanner = document.getElementById("pinnedBanner");

  if (avatar) avatar.src = user.avatar;
  if (name) name.innerText = user.name;
  if (dept) dept.innerText = user.dept;

  if (dot) dot.className = `status-indicator status-${user.status}`;
  if (statusText) {
    const isMobile = window.innerWidth <= 768;
    const shortText = user.status === "online" ? "Đang trực tuyến" : "Ngoại tuyến";
    statusText.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${isMobile ? shortText : user.statusText}`;
    statusText.style.color = user.status === "online" ? "var(--status-online)" : "var(--text-muted)";
  }

  if (pinnedBanner) {
    updatePinnedBannerDOM(user);
  }
}

function renderMessages(user) {
  const area = document.getElementById("messagesArea");
  if (!area) return;

  if (!user.messages || user.messages.length === 0) {
    area.innerHTML = `
      <div class="empty-conversation-screen">
        <div class="empty-icon-box">
          <i class="fa-regular fa-comment-dots"></i>
        </div>
        <h3 class="empty-title">Cuộc trò chuyện trống</h3>
        <p class="empty-desc">Chưa có tin nhắn nào với <strong>${escapeHtml(user.name)}</strong>.</p>
        <div class="empty-hint">
          <span><i class="fa-solid fa-keyboard"></i> Gõ tin nhắn bên dưới và nhấn Enter hoặc dùng tính năng Gọi bên trên</span>
        </div>
      </div>
    `;
    return;
  }

  let html = `<div class="date-divider"><span>Tin nhắn hội thoại</span></div>`;

  user.messages.forEach(msg => {
    if (msg.type === "system") {
      html += `
        <div class="system-message-row">
          <span class="system-message-pill">${escapeHtml(msg.text)}</span>
        </div>
      `;
      return;
    }

    const isMe = msg.sender === "me";
    let senderAvatar = isMe ? currentUser.avatar : (user.avatar || "");
    if (!isMe && user.isGroup && msg.senderUsername) {
      const senderAcc = allSystemUsers.find(a => (a.username || '').toLowerCase() === (msg.senderUsername || '').toLowerCase());
      if (senderAcc && senderAcc.avatar) {
        senderAvatar = senderAcc.avatar;
      }
    }

    let contentHtml = "";

    if (msg.type === "image") {
      contentHtml = `
        <div class="msg-image-wrap" onclick="openLightbox('${msg.imageUrl}', '${escapeHtml(msg.caption || "Hình ảnh")}')">
          <img src="${msg.imageUrl}" alt="${escapeHtml(msg.caption || "Hình ảnh")}">
        </div>
        ${msg.caption ? `<div style="font-size: 12.5px; margin-top: 6px;">${escapeHtml(msg.caption)}</div>` : ""}
      `;
    } else if (msg.type === "file") {
      const fileIconClass = getFileIconClass(msg.fileExt);
      contentHtml = `
        <div class="msg-file-card">
          <i class="${fileIconClass} msg-file-icon"></i>
          <div class="msg-file-info">
            <span class="msg-file-name" title="${msg.fileName}">${escapeHtml(msg.fileName)}</span>
            <span class="msg-file-size">${msg.fileSize || "Tệp đính kèm"}</span>
          </div>
          <a href="${msg.fileUrl || '#'}" download="${msg.fileName}" class="msg-file-download-btn">
            <i class="fa-solid fa-arrow-down-to-bracket"></i>
          </a>
        </div>
      `;
    } else if (msg.type === "voice" || msg.type === "audio") {
      const durationText = msg.durationText || formatVoiceDuration(msg.duration || 0);
      contentHtml = `
        <div class="msg-voice-player" id="voice_player_${msg.id}">
          <button class="voice-play-btn" id="voice_btn_${msg.id}" onclick="toggleVoicePlayback('${msg.id}', '${msg.audioUrl || ''}')" title="Phát tin nhắn thoại">
            <i class="fa-solid fa-play"></i>
          </button>
          <div class="voice-waveform-wrap">
            <div class="voice-progress-track" id="voice_track_${msg.id}" onclick="seekVoicePlayback(event, '${msg.id}')" title="Nhấp để tua âm thanh">
              <div class="voice-progress-fill" id="voice_fill_${msg.id}"></div>
            </div>
            <div class="voice-info-row">
              <span class="voice-time" id="voice_time_${msg.id}">0:00 / ${durationText}</span>
              <a href="${msg.audioUrl || '#'}" download="tin_nhan_thoai_${msg.id}.webm" class="voice-download-link" title="Tải đoạn ghi âm về máy">
                <i class="fa-solid fa-arrow-down-to-bracket"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    } else {
      contentHtml = `<div class="msg-text">${formatMessageText(msg.text)}</div>`;
    }

    const senderHeader = (!isMe && user.isGroup && msg.senderName)
      ? `<span class="msg-sender-name">${escapeHtml(msg.senderName)}</span>`
      : "";

    // Trích dẫn tin nhắn trả lời (Quoted Reply)
    let replyQuoteHtml = "";
    if (msg.replyTo) {
      const rSender = escapeHtml(msg.replyTo.senderName || msg.replyTo.senderUsername || "Tin nhắn");
      let rSnippet = msg.replyTo.text || "";
      if (!rSnippet) {
        if (msg.replyTo.type === "image") rSnippet = "📷 [Hình ảnh]";
        else if (msg.replyTo.type === "file") rSnippet = "📎 [Tệp tin]";
        else if (msg.replyTo.type === "voice" || msg.replyTo.type === "audio") rSnippet = "🎤 [Tin nhắn thoại]";
      }
      replyQuoteHtml = `
        <div class="msg-reply-quote" onclick="jumpToMessage('${msg.replyTo.id}')" title="Nhấp để xem tin nhắn gốc">
          <div class="reply-quote-bar"></div>
          <div class="reply-quote-content">
            <span class="reply-quote-sender"><i class="fa-solid fa-reply"></i> ${rSender}</span>
            <span class="reply-quote-text">${escapeHtml(rSnippet)}</span>
          </div>
        </div>
      `;
    }

    const reactionsHtml = renderReactionsHtml(msg.reactions, msg.id);

    html += `
      <div class="message-row ${isMe ? 'sent' : 'received'}" id="msg_row_${msg.id}" data-id="${msg.id}">
        <img src="${senderAvatar}" alt="Avatar" class="msg-sender-avatar">
        <div class="msg-bubble-wrap">
          ${senderHeader}
          <div class="msg-bubble">
            ${msg.isPinned ? '<div class="pinned-badge"><i class="fa-solid fa-thumbtack"></i> Đã ghim</div>' : ''}
            ${replyQuoteHtml}
            ${contentHtml}
            <div class="msg-meta">
              <span>${msg.time || "Vừa xong"}</span>
              ${isMe ? '<i class="fa-solid fa-check seen-check"></i>' : ''}
            </div>
          </div>
          ${reactionsHtml}
        </div>
        <!-- Thanh nút thao tác khi rê chuột: Thả cảm xúc & Trả lời & Ghim & Đọc thoại -->
        <div class="msg-actions-toolbar">
          <div class="reaction-btn-wrapper">
            <button class="msg-action-btn" title="Thả biểu cảm" onclick="toggleReactionPicker(event, '${msg.id}')">
              <i class="fa-regular fa-face-smile"></i>
            </button>
            <div class="msg-reaction-picker" id="reaction_picker_${msg.id}">
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '👍')">👍</span>
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '❤️')">❤️</span>
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '😂')">😂</span>
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '😮')">😮</span>
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '😢')">😢</span>
              <span class="react-opt" onclick="reactToMessage(event, '${msg.id}', '😡')">😡</span>
            </div>
          </div>
          <button class="msg-action-btn" title="Trả lời tin nhắn này" onclick="startReplyMessage('${msg.id}')">
            <i class="fa-solid fa-reply"></i>
          </button>
          <button class="msg-action-btn ${msg.isPinned ? 'active-pin' : ''}" title="${msg.isPinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn lên đầu'}" onclick="togglePinMessage('${msg.id}')">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
        </div>
      </div>
    `;
  });

  area.innerHTML = html;
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const area = document.getElementById("messagesArea");
  if (area) area.scrollTop = area.scrollHeight;
}

// ==========================================
// TÍNH NĂNG CẢM XÚC (REACTION) & TRẢ LỜI TIN NHẮN (REPLY)
// ==========================================

function renderReactionsHtml(reactions, msgId) {
  if (!reactions || typeof reactions !== "object") return "";
  const emojis = Object.keys(reactions).filter(e => Array.isArray(reactions[e]) && reactions[e].length > 0);
  if (emojis.length === 0) return "";

  const myUsername = (currentUser?.username || '').toLowerCase();

  let html = `<div class="msg-reactions-bar" id="reactions_bar_${msgId}">`;
  emojis.forEach(emoji => {
    const userList = reactions[emoji];
    const count = userList.length;
    const hasMyReaction = userList.some(u => (typeof u === 'string' ? u : (u.username || '')).toLowerCase() === myUsername);
    
    const names = userList.map(u => {
      if (typeof u === 'object' && u.fullName) return u.fullName;
      const uname = typeof u === 'string' ? u : (u.username || '');
      const acc = allSystemUsers.find(a => (a.username || '').toLowerCase() === uname.toLowerCase());
      return acc ? acc.fullName : uname;
    }).join(", ");

    html += `
      <button class="msg-reaction-pill ${hasMyReaction ? 'active' : ''}" 
              onclick="reactToMessage(event, '${msgId}', '${emoji}')" 
              title="${names ? escapeHtml(names) : ''}">
        <span class="reaction-emoji">${emoji}</span>
        <span class="reaction-count">${count}</span>
      </button>
    `;
  });
  html += `</div>`;
  return html;
}

function toggleReactionPicker(e, msgId) {
  if (e) e.stopPropagation();
  document.querySelectorAll(".msg-reaction-picker.show").forEach(p => {
    if (p.id !== "reaction_picker_" + msgId) p.classList.remove("show");
  });
  const picker = document.getElementById("reaction_picker_" + msgId);
  if (picker) {
    picker.classList.toggle("show");
  }
}

async function reactToMessage(e, msgId, emoji) {
  if (e) e.stopPropagation();
  const picker = document.getElementById("reaction_picker_" + msgId);
  if (picker) picker.classList.remove("show");

  if (!currentUser) return;

  let targetMsg = null;
  for (const u of internalUsers) {
    if (u.messages) {
      targetMsg = u.messages.find(m => m.id === msgId);
      if (targetMsg) break;
    }
  }

  if (targetMsg) {
    if (!targetMsg.reactions || typeof targetMsg.reactions !== "object") {
      targetMsg.reactions = {};
    }
    const myUname = (currentUser.username || "").toLowerCase().trim();
    const myFullName = currentUser.fullName || myUname;

    let alreadyHad = false;
    Object.keys(targetMsg.reactions).forEach(em => {
      if (!Array.isArray(targetMsg.reactions[em])) return;
      const exists = targetMsg.reactions[em].some(u => (typeof u === "string" ? u : (u.username || "")).toLowerCase() === myUname);
      if (exists) {
        if (em === emoji) alreadyHad = true;
        targetMsg.reactions[em] = targetMsg.reactions[em].filter(u => (typeof u === "string" ? u : (u.username || "")).toLowerCase() !== myUname);
        if (targetMsg.reactions[em].length === 0) delete targetMsg.reactions[em];
      }
    });

    if (!alreadyHad) {
      if (!Array.isArray(targetMsg.reactions[emoji])) {
        targetMsg.reactions[emoji] = [];
      }
      targetMsg.reactions[emoji].push({ username: myUname, fullName: myFullName });
    }

    updateMessageReactionsDOM(msgId, targetMsg.reactions);
    updateLocalMessageReactions(msgId, targetMsg.reactions);
  }

  try {
    const res = await fetch("/api/message/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: msgId,
        emoji: emoji,
        username: currentUser.username,
        fullName: currentUser.fullName
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.reactions && targetMsg) {
        targetMsg.reactions = data.reactions;
        updateMessageReactionsDOM(msgId, targetMsg.reactions);
        updateLocalMessageReactions(msgId, targetMsg.reactions);
      }
    }
  } catch (err) {
    console.error("Lỗi gửi biểu cảm:", err);
  }
}

function updateMessageReactionsDOM(msgId, reactions) {
  const row = document.getElementById("msg_row_" + msgId);
  if (!row) return;

  const bubbleWrap = row.querySelector(".msg-bubble-wrap");
  if (!bubbleWrap) return;

  let existingBar = row.querySelector(".msg-reactions-bar");
  const newHtml = renderReactionsHtml(reactions, msgId);

  if (!newHtml) {
    if (existingBar) existingBar.remove();
    return;
  }

  if (existingBar) {
    const temp = document.createElement("div");
    temp.innerHTML = newHtml;
    existingBar.replaceWith(temp.firstElementChild);
  } else {
    bubbleWrap.insertAdjacentHTML("beforeend", newHtml);
  }
}

function updateLocalMessageReactions(msgId, reactions) {
  const cacheKey = getMsgCacheKey();
  if (!cacheKey || !msgId) return;
  try {
    const raw = localStorage.getItem(cacheKey);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    const idx = list.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      list[idx].reactions = reactions;
      localStorage.setItem(cacheKey, JSON.stringify(list));
    }
  } catch (e) {}
}

function startReplyMessage(msgId) {
  let foundMsg = null;
  for (const u of internalUsers) {
    if (u.messages) {
      foundMsg = u.messages.find(m => m.id === msgId);
      if (foundMsg) break;
    }
  }
  if (!foundMsg) return;

  let snippet = "";
  if (foundMsg.type === "image") {
    snippet = foundMsg.caption ? `📷 [Hình ảnh] ${foundMsg.caption}` : "📷 [Hình ảnh]";
  } else if (foundMsg.type === "file") {
    snippet = `📎 [Tệp tin] ${foundMsg.fileName || "Tệp đính kèm"}`;
  } else if (foundMsg.type === "voice" || foundMsg.type === "audio") {
    snippet = "🎤 [Tin nhắn thoại]";
  } else {
    snippet = foundMsg.text || "";
  }
  if (snippet.length > 90) snippet = snippet.substring(0, 87) + "...";

  let senderDisplayName = "Tin nhắn";
  if (foundMsg.sender === "me") {
    senderDisplayName = "Chính bạn";
  } else if (foundMsg.senderName) {
    senderDisplayName = foundMsg.senderName;
  } else if (foundMsg.senderUsername) {
    senderDisplayName = foundMsg.senderUsername;
  }

  replyingToMessage = {
    id: foundMsg.id,
    senderName: senderDisplayName,
    senderUsername: foundMsg.senderUsername,
    text: snippet,
    type: foundMsg.type
  };

  const replyBar = document.getElementById("replyPreviewBar");
  const replySender = document.getElementById("replyPreviewSender");
  const replyText = document.getElementById("replyPreviewText");

  if (replyBar && replySender && replyText) {
    replySender.innerText = `Đang trả lời ${replyingToMessage.senderName}`;
    replyText.innerText = replyingToMessage.text;
    replyBar.style.display = "flex";
  }

  const msgInput = document.getElementById("messageInput");
  if (msgInput) {
    msgInput.focus();
  }
}

function cancelReply() {
  replyingToMessage = null;
  const replyBar = document.getElementById("replyPreviewBar");
  if (replyBar) replyBar.style.display = "none";
}

function jumpToMessage(msgId) {
  const el = document.getElementById("msg_row_" + msgId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-flash');
    setTimeout(() => {
      el.classList.remove('highlight-flash');
    }, 1800);
  } else {
    showToast("ℹ️ Tin nhắn gốc ở xa hoặc đã quá cũ trong cuộc hội thoại.");
  }
}

// ==========================================
// TÍNH NĂNG GHIM TIN NHẮN (PIN MESSAGE)
// ==========================================

function updatePinnedBannerDOM(user) {
  const banner = document.getElementById("pinnedBanner");
  const senderEl = document.getElementById("pinnedSender");
  const textEl = document.getElementById("pinnedText");
  const bannerContent = document.getElementById("pinnedBannerContent");
  if (!banner || !senderEl || !textEl) return;

  if (!user || !user.messages || user.messages.length === 0) {
    banner.style.display = "none";
    if (bannerContent) bannerContent.removeAttribute("data-msg-id");
    return;
  }

  const pinnedMsg = user.messages.find(m => m.isPinned);
  if (!pinnedMsg) {
    banner.style.display = "none";
    if (bannerContent) bannerContent.removeAttribute("data-msg-id");
    return;
  }

  banner.style.display = "flex";
  senderEl.innerText = (pinnedMsg.senderName || pinnedMsg.senderUsername || "Tin nhắn") + ": ";

  let snippet = pinnedMsg.text || "";
  if (!snippet) {
    if (pinnedMsg.type === "image") snippet = "📷 [Hình ảnh] " + (pinnedMsg.caption || "");
    else if (pinnedMsg.type === "file") snippet = "📎 [Tệp tin] " + (pinnedMsg.fileName || "");
    else if (pinnedMsg.type === "voice" || pinnedMsg.type === "audio") snippet = "🎤 [Tin nhắn thoại]";
  }
  textEl.innerText = snippet || "Tin nhắn quan trọng";

  if (bannerContent) {
    bannerContent.setAttribute("data-msg-id", pinnedMsg.id);
  }
}

async function togglePinMessage(msgId) {
  if (!currentUserId || !currentUser) return;
  const user = internalUsers.find(u => u.id === currentUserId);
  if (!user || !user.messages) return;

  const targetMsg = user.messages.find(m => m.id === msgId);
  if (!targetMsg) return;

  const willBePinned = !targetMsg.isPinned;

  // Cập nhật trạng thái tức thì trên client
  user.messages.forEach(m => {
    if (m.id === msgId) {
      m.isPinned = willBePinned;
    } else if (willBePinned) {
      m.isPinned = false; // Mỗi cuộc trò chuyện chỉ ghim 1 tin nhắn tại 1 thời điểm
    }
  });

  updatePinnedBannerDOM(user);
  renderMessages(user);
  showToast(willBePinned ? "📌 Đã ghim tin nhắn lên đầu cuộc trò chuyện!" : "Đã bỏ ghim tin nhắn.");

  try {
    const res = await fetch("/api/message/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: msgId,
        isGroup: !!user.isGroup,
        targetUsername: user.username || (currentUserId ? currentUserId.replace(/^u_/, '') : ''),
        requester: currentUser.username
      })
    });
    if (!res.ok) {
      console.warn("Máy chủ báo lỗi khi ghim tin nhắn");
    }
  } catch (err) {
    console.error("Lỗi gửi yêu cầu ghim tin nhắn:", err);
  }
}

async function unpinMessage() {
  if (!currentUserId || !currentUser) return;
  const user = internalUsers.find(u => u.id === currentUserId);
  if (!user || !user.messages) return;

  const pinnedMsg = user.messages.find(m => m.isPinned);
  if (!pinnedMsg) {
    updatePinnedBannerDOM(user);
    return;
  }

  const prevMsgId = pinnedMsg.id;
  pinnedMsg.isPinned = false;
  updatePinnedBannerDOM(user);
  renderMessages(user);
  showToast("Đã bỏ ghim tin nhắn.");

  try {
    await fetch("/api/message/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: prevMsgId,
        isGroup: !!user.isGroup,
        targetUsername: user.username || (currentUserId ? currentUserId.replace(/^u_/, '') : ''),
        requester: currentUser.username
      })
    });
  } catch (err) {
    console.error("Lỗi khi bỏ ghim tin nhắn:", err);
  }
}

// ==========================================
// SOẠN TIN BẰNG GIỌNG NÓI (SPEECH-TO-TEXT / VOICE DICTATION)
// ==========================================

let voiceDictationInstance = null;
let isDictating = false;
let dictationBaseText = "";

function toggleVoiceDictation() {
  if (isDictating) {
    stopVoiceDictation();
  } else {
    startVoiceDictation();
  }
}

function startVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("⚠️ Trình duyệt của bạn chưa hỗ trợ nhận diện giọng nói tiếng Việt (hãy dùng Chrome hoặc Edge).");
    return;
  }

  const msgInput = document.getElementById("messageInput");
  const dictationBar = document.getElementById("voiceDictationBar");
  const btnDictation = document.getElementById("btnVoiceDictation");
  const statusText = document.getElementById("dictationStatusText");

  try {
    voiceDictationInstance = new SpeechRecognition();
    voiceDictationInstance.lang = 'vi-VN';
    voiceDictationInstance.continuous = true;
    voiceDictationInstance.interimResults = true;

    dictationBaseText = msgInput ? msgInput.value : "";
    if (dictationBaseText && !dictationBaseText.endsWith(" ")) {
      dictationBaseText += " ";
    }

    voiceDictationInstance.onstart = () => {
      isDictating = true;
      if (dictationBar) dictationBar.style.display = "flex";
      if (btnDictation) btnDictation.classList.add("active-listening");
      if (statusText) statusText.innerText = "Đang lắng nghe tiếng Việt... Hãy nói nội dung tin nhắn";
    };

    voiceDictationInstance.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          interimTranscript += item[0].transcript;
        }
      }

      if (msgInput) {
        if (finalTranscript) {
          dictationBaseText += finalTranscript.trim() + " ";
          msgInput.value = dictationBaseText;
        } else if (interimTranscript) {
          msgInput.value = dictationBaseText + interimTranscript;
        }
        autoResizeTextarea(msgInput);
      }
    };

    voiceDictationInstance.onerror = (event) => {
      console.warn("Lỗi nhận diện giọng nói:", event.error);
      if (event.error === 'not-allowed') {
        showToast("⚠️ Vui lòng cấp quyền Micro trên trình duyệt để soạn tin bằng giọng nói!");
        stopVoiceDictation();
      } else if (event.error !== 'no-speech') {
        stopVoiceDictation();
      }
    };

    voiceDictationInstance.onend = () => {
      if (isDictating) {
        try {
          voiceDictationInstance.start();
        } catch (e) {
          stopVoiceDictation();
        }
      } else {
        stopVoiceDictation();
      }
    };

    voiceDictationInstance.start();
  } catch (err) {
    console.error("Không thể khởi động SpeechRecognition:", err);
    showToast("⚠️ Không thể khởi động nhận diện giọng nói: " + err.message);
    stopVoiceDictation();
  }
}

function stopVoiceDictation() {
  isDictating = false;
  if (voiceDictationInstance) {
    try {
      voiceDictationInstance.stop();
    } catch (e) {}
    voiceDictationInstance = null;
  }

  const dictationBar = document.getElementById("voiceDictationBar");
  const btnDictation = document.getElementById("btnVoiceDictation");
  if (dictationBar) dictationBar.style.display = "none";
  if (btnDictation) btnDictation.classList.remove("active-listening");

  const msgInput = document.getElementById("messageInput");
  if (msgInput) {
    msgInput.focus();
    autoResizeTextarea(msgInput);
  }
}

// ==========================================
// 7. CỘT PHẢI: CHI TIẾT TỆP & ẢNH
// ==========================================
function renderRightPanelDetails(user) {
  const rAvatar = document.getElementById("rightProfileAvatar");
  const rName = document.getElementById("rightProfileName");
  const rTitle = document.getElementById("rightProfileTitle");
  const rDept = document.getElementById("rightProfileDept");
  const rDot = document.getElementById("rightProfileStatusDot");

  if (rAvatar) rAvatar.src = user.avatar;
  if (rName) rName.innerText = user.name;
  if (rTitle) rTitle.innerText = user.title;
  if (rDept) rDept.innerText = user.dept;
  if (rDot) rDot.className = `status-indicator status-${user.status}`;

  const empId = document.getElementById("infoEmpId");
  const email = document.getElementById("infoEmail");
  const ip = document.getElementById("infoIpAddress");
  const login = document.getElementById("infoLoginTime");
  const dev = document.getElementById("infoDevice");

  if (empId) empId.innerText = user.empId;
  if (email) email.innerText = user.email;
  if (ip) ip.innerText = user.ipAddress;
  if (login) login.innerText = user.loginTime;
  if (dev) dev.innerText = user.device;

  // Điều khiển giao diện giữa Nhóm chat và Chat cá nhân
  const grpMemSec = document.getElementById("groupMembersSection");
  const grpAdmSec = document.getElementById("groupAdminSection");
  const infoSec = document.getElementById("infoAccordionSection");
  const cardAvatarWrap = document.getElementById("cardAvatarWrapper");
  const btnGroupAvatarBadge = document.getElementById("btnGroupAvatarBadge");
  const btnQuickMail = document.getElementById("btnQuickMail");
  const btnQuickGroupAvatar = document.getElementById("btnQuickGroupAvatar");

  if (user.isGroup) {
    if (grpMemSec) grpMemSec.style.display = "block";
    if (infoSec) infoSec.style.display = "none";
    if (cardAvatarWrap) {
      cardAvatarWrap.classList.add("is-group-avatar");
      cardAvatarWrap.title = "Nhấn để đổi ảnh đại diện nhóm";
    }
    if (btnGroupAvatarBadge) btnGroupAvatarBadge.style.display = "flex";
    if (btnQuickMail) btnQuickMail.style.display = "none";
    if (btnQuickGroupAvatar) btnQuickGroupAvatar.style.display = "flex";

    renderGroupMembers();
    renderGroupAdminControls();
    checkGroupChatLockStatus();
  } else {
    if (grpMemSec) grpMemSec.style.display = "none";
    if (grpAdmSec) grpAdmSec.style.display = "none";
    if (infoSec) infoSec.style.display = "block";
    if (cardAvatarWrap) {
      cardAvatarWrap.classList.remove("is-group-avatar");
      cardAvatarWrap.title = user.name;
    }
    if (btnGroupAvatarBadge) btnGroupAvatarBadge.style.display = "none";
    if (btnQuickMail) btnQuickMail.style.display = "flex";
    if (btnQuickGroupAvatar) btnQuickGroupAvatar.style.display = "none";

    const lockedBanner = document.getElementById("chatLockedBanner");
    const inputBar = document.querySelector(".chat-input-bar");
    if (lockedBanner) lockedBanner.style.display = "none";
    if (inputBar) inputBar.classList.remove("is-locked");
    const msgInput = document.getElementById("messageInput");
    if (msgInput) {
      msgInput.disabled = false;
      msgInput.placeholder = "Nhập văn bản...";
    }
  }

  renderSharedMedia(user);
  renderSharedFiles(user);
  renderSharedLinks(user);
}

function renderSharedMedia(user) {
  const grid = document.getElementById("sharedImagesGrid");
  const countEl = document.getElementById("countImages");
  const images = user.sharedImages || [];

  if (countEl) countEl.innerText = images.length;
  if (!grid) return;

  if (images.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: span 3; text-align: center; padding: 24px 8px; color: var(--text-muted); font-size: 12.5px;">
        <i class="fa-regular fa-images" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        Chưa có hình ảnh nào được gửi.
      </div>
    `;
    return;
  }

  grid.innerHTML = images.map(img => `
    <div class="media-grid-item" onclick="openLightbox('${img.url}', '${escapeHtml(img.title)}')">
      <img src="${img.url}" alt="${escapeHtml(img.title)}">
      <div class="hover-overlay"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
    </div>
  `).join("");
}

function renderSharedFiles(user) {
  const list = document.getElementById("sharedFilesList");
  const countEl = document.getElementById("countFiles");
  const files = user.sharedFiles || [];

  if (countEl) countEl.innerText = files.length;
  if (!list) return;

  if (files.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 24px 8px; color: var(--text-muted); font-size: 12.5px;">
        <i class="fa-regular fa-folder-open" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        Chưa có tệp tài liệu nào được gửi.
      </div>
    `;
    return;
  }

  list.innerHTML = files.map(file => {
    const iconClass = getFileIconClass(file.ext);
    return `
      <div class="file-list-item">
        <i class="${iconClass} file-type-icon"></i>
        <div class="file-item-meta">
          <span class="file-item-name" title="${file.name}">${escapeHtml(file.name)}</span>
          <span class="file-item-details">${file.size} • ${file.date}</span>
        </div>
        <a href="${file.url || '#'}" download="${file.name}" class="btn-download-file" title="Tải xuống">
          <i class="fa-solid fa-download"></i>
        </a>
      </div>
    `;
  }).join("");
}

function renderSharedLinks(user) {
  const list = document.getElementById("sharedLinksList");
  const countEl = document.getElementById("countLinks");
  const links = user.sharedLinks || [];

  if (countEl) countEl.innerText = links.length;
  if (!list) return;

  if (links.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 24px 8px; color: var(--text-muted); font-size: 12.5px;">
        <i class="fa-solid fa-link" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        Chưa có liên kết nào.
      </div>
    `;
    return;
  }

  list.innerHTML = links.map(link => `
    <a href="${link.url}" target="_blank" class="link-list-item">
      <i class="fa-solid fa-arrow-up-right-from-square link-icon"></i>
      <div class="link-content">
        <div class="link-title">${escapeHtml(link.title)}</div>
        <div class="link-url">${escapeHtml(link.url)}</div>
      </div>
    </a>
  `).join("");
}

// ==========================================
// 7.5 CÁC HÀM TIỆN ÍCH TẢI TỆP, GHI ÂM THOẠI & TYPING INDICATOR
// ==========================================

// 1. TẢI TỆP LÊN MÁY CHỦ (STREAMING UPLOAD VỚI PROGRESS)
function uploadFileToServer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error("Lỗi tải tệp: HTTP " + xhr.status));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi mạng khi tải tệp lên máy chủ"));
    xhr.send(file);
  });
}

function showUploadProgress(title, percent) {
  const banner = document.getElementById("uploadProgressBanner");
  const titleEl = document.getElementById("uploadProgressTitle");
  const fillEl = document.getElementById("uploadProgressFill");
  const percentEl = document.getElementById("uploadProgressPercent");

  if (banner && titleEl && fillEl && percentEl) {
    titleEl.innerText = title;
    fillEl.style.width = percent + "%";
    percentEl.innerText = percent + "%";
    banner.style.display = "flex";
  }
}

function hideUploadProgress() {
  const banner = document.getElementById("uploadProgressBanner");
  if (banner) banner.style.display = "none";
}

// 2. TÍN HIỆU ĐANG SOẠN TIN NHẮN (TYPING INDICATOR)
let typingDebounceTimer = null;
let isCurrentlyTyping = false;

function sendTypingSignal(isTyping) {
  if (!currentUserId || !currentUser) return;
  const user = internalUsers.find(u => u.id === currentUserId);
  if (!user) return;

  fetch("/api/typing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: currentUser.username,
      fromName: currentUser.fullName,
      targetUsername: user.username || (currentUserId ? currentUserId.replace(/^u_/, '') : ''),
      isGroup: !!user.isGroup,
      isTyping: isTyping
    })
  }).catch(() => {});
}

function handleTypingInput() {
  const input = document.getElementById("messageInput");
  const hasText = input && input.value.trim().length > 0;

  if (hasText) {
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      sendTypingSignal(true);
    }
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(() => {
      isCurrentlyTyping = false;
      sendTypingSignal(false);
    }, 2800);
  } else {
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      clearTimeout(typingDebounceTimer);
      sendTypingSignal(false);
    }
  }
}

// 3. PHÁT TIN NHẮN THOẠI (VOICE MEMO PLAYER)
let currentPlayingVoice = {
  id: null,
  audio: null
};

function formatVoiceDuration(totalSec) {
  if (!totalSec || isNaN(totalSec)) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toggleVoicePlayback(msgId, audioUrl) {
  if (!audioUrl) return;

  // Nếu đang phát chính audio này
  if (currentPlayingVoice.id === msgId && currentPlayingVoice.audio) {
    if (!currentPlayingVoice.audio.paused) {
      currentPlayingVoice.audio.pause();
      updateVoiceBtnIcon(msgId, false);
    } else {
      currentPlayingVoice.audio.play();
      updateVoiceBtnIcon(msgId, true);
    }
    return;
  }

  // Nếu đang phát một audio khác -> dừng lại trước
  if (currentPlayingVoice.audio) {
    currentPlayingVoice.audio.pause();
    if (currentPlayingVoice.id) {
      updateVoiceBtnIcon(currentPlayingVoice.id, false);
      resetVoiceProgress(currentPlayingVoice.id);
    }
    currentPlayingVoice.audio = null;
    currentPlayingVoice.id = null;
  }

  const audio = new Audio(audioUrl);
  currentPlayingVoice.id = msgId;
  currentPlayingVoice.audio = audio;

  const fill = document.getElementById(`voice_fill_${msgId}`);
  const timeEl = document.getElementById(`voice_time_${msgId}`);

  updateVoiceBtnIcon(msgId, true);

  audio.ontimeupdate = () => {
    if (audio.duration && !isNaN(audio.duration)) {
      const pct = (audio.currentTime / audio.duration) * 100;
      if (fill) fill.style.width = pct + "%";
      if (timeEl) {
        timeEl.innerText = `${formatVoiceDuration(audio.currentTime)} / ${formatVoiceDuration(audio.duration)}`;
      }
    }
  };

  audio.onended = () => {
    updateVoiceBtnIcon(msgId, false);
    resetVoiceProgress(msgId);
    currentPlayingVoice.id = null;
    currentPlayingVoice.audio = null;
  };

  audio.onerror = () => {
    updateVoiceBtnIcon(msgId, false);
    showToast("⚠️ Không thể phát tệp âm thanh này.");
    currentPlayingVoice.id = null;
    currentPlayingVoice.audio = null;
  };

  audio.play().catch(e => {
    console.warn("Lỗi phát audio:", e);
    updateVoiceBtnIcon(msgId, false);
  });
}

function updateVoiceBtnIcon(msgId, isPlaying) {
  const btn = document.getElementById(`voice_btn_${msgId}`);
  if (btn) {
    btn.classList.toggle("playing", isPlaying);
    btn.innerHTML = isPlaying
      ? '<i class="fa-solid fa-pause"></i>'
      : '<i class="fa-solid fa-play"></i>';
  }
}

function resetVoiceProgress(msgId) {
  const fill = document.getElementById(`voice_fill_${msgId}`);
  if (fill) fill.style.width = "0%";
}

function seekVoicePlayback(event, msgId) {
  if (currentPlayingVoice.id === msgId && currentPlayingVoice.audio && currentPlayingVoice.audio.duration) {
    const track = document.getElementById(`voice_track_${msgId}`);
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    currentPlayingVoice.audio.currentTime = pct * currentPlayingVoice.audio.duration;
  }
}

window.toggleVoicePlayback = toggleVoicePlayback;
window.seekVoicePlayback = seekVoicePlayback;

// 4. GHI ÂM GIỌNG NÓI TRỰC TIẾP (VOICE MEMO RECORDER)
let mediaRecorderInstance = null;
let recordingStream = null;
let recordingTimerInterval = null;
let recordingSeconds = 0;
let recordedAudioChunks = [];

async function startVoiceRecording() {
  if (!currentUserId || !currentUser) {
    showToast("Vui lòng chọn người nhận trước khi ghi âm!");
    return;
  }

  // Kiểm tra quyền cấm chat nếu là nhóm
  const user = internalUsers.find(u => u.id === currentUserId);
  if (user && user.isGroup) {
    if (currentGroupData?.mutedUsers?.includes(currentUser.username)) {
      showToast("❌ Bạn đang bị cấm chat trong nhóm này bởi Trưởng/Phó nhóm!");
      return;
    }
    if (currentGroupData?.onlyAdminsCanChat) {
      const myRole = getMyGroupRole();
      if (myRole === "member") {
        showToast("🔒 Chỉ Trưởng nhóm và Phó nhóm mới có quyền gửi tin nhắn lúc này!");
        return;
      }
    }
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Trình duyệt không hỗ trợ thu âm microphone.");
      return;
    }

    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let options = {};
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options = { mimeType: 'audio/webm;codecs=opus' };
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      options = { mimeType: 'audio/ogg;codecs=opus' };
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options = { mimeType: 'audio/webm' };
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      options = { mimeType: 'audio/mp4' };
    }

    mediaRecorderInstance = new MediaRecorder(recordingStream, options);
    recordedAudioChunks = [];

    mediaRecorderInstance.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedAudioChunks.push(e.data);
      }
    };

    mediaRecorderInstance.start(200);

    const recBar = document.getElementById("voiceRecorderBar");
    const actionsLeft = document.getElementById("inputActionsLeft");
    const msgWrapper = document.getElementById("messageInputWrapper");
    const actionsRight = document.getElementById("inputActionsRight");

    if (recBar) recBar.style.display = "flex";
    if (actionsLeft) actionsLeft.style.display = "none";
    if (msgWrapper) msgWrapper.style.display = "none";
    if (actionsRight) actionsRight.style.display = "none";

    recordingSeconds = 0;
    const timerEl = document.getElementById("recordingTimer");
    if (timerEl) timerEl.innerText = "00:00";

    clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
      recordingSeconds++;
      const m = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
      const s = String(recordingSeconds % 60).padStart(2, '0');
      if (timerEl) timerEl.innerText = `${m}:${s}`;
    }, 1000);

  } catch (err) {
    console.error("Lỗi cấp quyền microphone:", err);
    showToast("⚠️ Vui lòng cấp quyền Microphone trên trình duyệt để ghi âm!");
    cleanupVoiceRecordingUI();
  }
}

function cleanupVoiceRecordingUI() {
  clearInterval(recordingTimerInterval);
  recordingSeconds = 0;

  if (recordingStream) {
    recordingStream.getTracks().forEach(t => t.stop());
    recordingStream = null;
  }
  mediaRecorderInstance = null;
  recordedAudioChunks = [];

  const recBar = document.getElementById("voiceRecorderBar");
  const actionsLeft = document.getElementById("inputActionsLeft");
  const msgWrapper = document.getElementById("messageInputWrapper");
  const actionsRight = document.getElementById("inputActionsRight");

  if (recBar) recBar.style.display = "none";
  if (actionsLeft) actionsLeft.style.display = "flex";
  if (msgWrapper) msgWrapper.style.display = "flex";
  if (actionsRight) actionsRight.style.display = "flex";
}

function cancelVoiceRecording() {
  if (mediaRecorderInstance && mediaRecorderInstance.state !== 'inactive') {
    mediaRecorderInstance.onstop = null;
    mediaRecorderInstance.stop();
  }
  cleanupVoiceRecordingUI();
  showToast("Đã hủy bản ghi âm");
}

async function sendVoiceRecording() {
  if (!mediaRecorderInstance) return;

  const durationSec = recordingSeconds;
  if (durationSec < 1) {
    showToast("Bản ghi âm quá ngắn (< 1 giây)");
    cancelVoiceRecording();
    return;
  }

  const mimeType = mediaRecorderInstance.mimeType || 'audio/webm';
  const extension = mimeType.includes('ogg') ? '.ogg' : (mimeType.includes('mp4') ? '.mp4' : '.webm');

  mediaRecorderInstance.onstop = async () => {
    try {
      const audioBlob = new Blob(recordedAudioChunks, { type: mimeType });
      const voiceFilename = `voice_${Date.now()}${extension}`;
      const voiceFile = new File([audioBlob], voiceFilename, { type: mimeType });

      showUploadProgress("Đang gửi tin nhắn thoại...", 20);
      const uploadResult = await uploadFileToServer(voiceFile, (pct) => {
        showUploadProgress(`Đang gửi tin nhắn thoại (${pct}%)...`, pct);
      });
      hideUploadProgress();

      if (!currentUserId || !currentUser) return;
      const user = internalUsers.find(u => u.id === currentUserId);
      if (!user) return;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const voiceMsg = {
        id: "msg_" + Date.now(),
        sender: "me",
        senderName: currentUser.fullName,
        senderUsername: currentUser.username,
        type: "voice",
        audioUrl: uploadResult.fileUrl,
        duration: durationSec,
        durationText: formatVoiceDuration(durationSec),
        fileName: voiceFilename,
        fileSize: uploadResult.fileSize,
        time: timeStr,
        status: "sent",
        reactions: {}
      };

      if (replyingToMessage) {
        voiceMsg.replyTo = {
          id: replyingToMessage.id,
          senderName: replyingToMessage.senderName,
          senderUsername: replyingToMessage.senderUsername,
          text: replyingToMessage.text,
          type: replyingToMessage.type
        };
        cancelReply();
      }

      user.messages.push(voiceMsg);
      user.unreadCount = 0;
      setLastReadTime(currentUserId, Date.now());

      renderMessages(user);
      renderUserList();

      const payloadMsg = {
        ...voiceMsg,
        targetId: currentUserId,
        targetUsername: user.username || (currentUserId ? currentUserId.replace(/^u_/, '') : ""),
        isGroup: !!user.isGroup
      };
      saveLocalMessage(payloadMsg);

      fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadMsg)
      }).catch(e => console.error("Lỗi gửi tin thoại:", e));

      showToast("🎙️ Đã gửi tin nhắn thoại!");
    } catch (err) {
      hideUploadProgress();
      console.error("Lỗi gửi tin nhắn thoại:", err);
      showToast("❌ Không thể gửi tin nhắn thoại. Vui lòng thử lại!");
    } finally {
      cleanupVoiceRecordingUI();
    }
  };

  if (mediaRecorderInstance.state !== 'inactive') {
    mediaRecorderInstance.stop();
  }
}

// ==========================================
// 8. GỬI TIN NHẮN (TEXT / TỆP TIN / HÌNH ẢNH)
// ==========================================
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input ? input.value.trim() : "";

  if (!text && !pendingAttachment) return;
  if (!currentUserId || !currentUser) return;

  const user = internalUsers.find(u => u.id === currentUserId);
  if (!user) return;

  // Dừng trạng thái gõ chữ khi gửi tin
  sendTypingSignal(false);
  isCurrentlyTyping = false;
  clearTimeout(typingDebounceTimer);

  // Kiểm tra quyền gửi tin nhắn trong nhóm
  if (user.isGroup) {
    if (currentGroupData?.mutedUsers?.includes(currentUser.username)) {
      showToast("❌ Bạn đang bị cấm chat trong nhóm này bởi Trưởng/Phó nhóm!");
      return;
    }
    if (currentGroupData?.onlyAdminsCanChat) {
      const myRole = getMyGroupRole();
      if (myRole === "member") {
        showToast("🔒 Chỉ Trưởng nhóm và Phó nhóm mới có quyền gửi tin nhắn lúc này!");
        return;
      }
    }
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let newMsg = null;

  if (pendingAttachment) {
    let uploadedUrl = pendingAttachment.url;
    let uploadedSize = pendingAttachment.size;

    // Nếu có file vật lý cần upload lên thư mục /uploads
    if (pendingAttachment.file) {
      try {
        showUploadProgress(`Đang tải lên: ${pendingAttachment.name}...`, 10);
        const uploadedData = await uploadFileToServer(pendingAttachment.file, (pct) => {
          showUploadProgress(`Đang tải lên (${pct}%): ${pendingAttachment.name}`, pct);
        });
        hideUploadProgress();
        if (uploadedData && uploadedData.fileUrl) {
          uploadedUrl = uploadedData.fileUrl;
          uploadedSize = uploadedData.fileSize || pendingAttachment.size;
        }
      } catch (uploadErr) {
        hideUploadProgress();
        console.error("Lỗi tải tệp lên thư mục uploads:", uploadErr);
        showToast("⚠️ Không thể tải tệp lên máy chủ. Đang chuyển sang chế độ dự phòng...");
      }
    }

    if (pendingAttachment.type === "image") {
      newMsg = {
        id: "msg_" + Date.now(),
        sender: "me",
        senderName: currentUser.fullName,
        senderUsername: currentUser.username,
        type: "image",
        imageUrl: uploadedUrl,
        caption: text || pendingAttachment.name,
        time: timeStr,
        status: "sent"
      };
      user.sharedImages.unshift({
        id: "img_" + Date.now(),
        url: uploadedUrl,
        title: pendingAttachment.name,
        date: "Vừa xong"
      });
    } else {
      newMsg = {
        id: "msg_" + Date.now(),
        sender: "me",
        senderName: currentUser.fullName,
        senderUsername: currentUser.username,
        type: "file",
        fileName: pendingAttachment.name,
        fileSize: uploadedSize,
        fileExt: pendingAttachment.ext,
        fileUrl: uploadedUrl,
        time: timeStr,
        status: "sent"
      };
      user.sharedFiles.unshift({
        id: "file_" + Date.now(),
        name: pendingAttachment.name,
        size: uploadedSize,
        ext: pendingAttachment.ext,
        url: uploadedUrl,
        date: "Vừa xong"
      });
    }
    clearAttachment();
  } else if (text) {
    newMsg = {
      id: "msg_" + Date.now(),
      sender: "me",
      senderName: currentUser.fullName,
      senderUsername: currentUser.username,
      type: "text",
      text: text,
      time: timeStr,
      status: "sent"
    };

    const urlMatches = text.match(/(https?:\/\/[^\s]+)/g);
    if (urlMatches) {
      urlMatches.forEach(url => {
        user.sharedLinks.unshift({ id: "link_" + Date.now(), title: url, url: url });
      });
    }
  }

  if (newMsg) {
    if (replyingToMessage) {
      newMsg.replyTo = {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        senderUsername: replyingToMessage.senderUsername,
        text: replyingToMessage.text,
        type: replyingToMessage.type
      };
      cancelReply();
    }
    newMsg.reactions = {};
  }

  user.messages.push(newMsg);

  if (input) {
    input.value = "";
    input.style.height = "auto";
  }

  user.unreadCount = 0;
  setLastReadTime(currentUserId, Date.now());
  clearTabTitleAlert();
  updateGlobalUnreadBadge();

  renderMessages(user);
  renderUserList();
  renderRightPanelDetails(user);

  const payloadMsg = {
    ...newMsg,
    targetId: currentUserId,
    targetUsername: user.username || (currentUserId ? currentUserId.replace(/^u_/, '') : ""),
    isGroup: !!user.isGroup
  };
  saveLocalMessage(payloadMsg);

  // Gửi qua Server API
  fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadMsg)
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(errData => {
        showToast("❌ " + (errData.error || "Gửi tin nhắn thất bại"));
        user.messages = user.messages.filter(m => m.id !== newMsg.id);
        renderMessages(user);
      });
    }
  })
  .catch(err => console.log("Lỗi gửi tin qua API:", err));
}

// ==========================================
// 8. QUẢN LÝ NHÓM: THÀNH VIÊN, PHÂN QUYỀN, CẤM CHAT & CÀI ĐẶT
// ==========================================

function getMyGroupRole() {
  if (!currentUser || !currentGroupData) return "member";
  if (currentGroupData.leader === currentUser.username) return "leader";
  if (Array.isArray(currentGroupData.deputies) && currentGroupData.deputies.includes(currentUser.username)) return "deputy";
  return "member";
}

function renderGroupMembers() {
  const listEl = document.getElementById("groupMembersList");
  const countEl = document.getElementById("groupMemberCount");
  const addBtn = document.getElementById("btnAddGroupMember");
  if (!listEl) return;

  const members = currentGroupData?.memberDetails || [];
  if (countEl) countEl.innerText = members.length;

  const myRole = getMyGroupRole();
  if (addBtn) {
    addBtn.style.display = (myRole === "leader" || myRole === "deputy") ? "flex" : "none";
  }

  if (members.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 12px;">Chưa có thành viên nào trong nhóm.</div>`;
    return;
  }

  // Sắp xếp: Trưởng nhóm -> Phó nhóm -> Thành viên thường
  const sorted = [...members].sort((a, b) => {
    const score = (r) => (r === "leader" ? 3 : r === "deputy" ? 2 : 1);
    return score(b.role) - score(a.role);
  });

  listEl.innerHTML = sorted.map(m => {
    const isMe = (m.username === currentUser?.username);
    let roleBadge = `<span class="role-badge member">Thành viên</span>`;
    if (m.role === "leader") {
      roleBadge = `<span class="role-badge leader"><i class="fa-solid fa-crown"></i> Trưởng nhóm</span>`;
    } else if (m.role === "deputy") {
      roleBadge = `<span class="role-badge deputy"><i class="fa-solid fa-star"></i> Phó nhóm</span>`;
    }

    const muteBadge = m.isMuted
      ? `<span class="role-badge muted" title="Đang bị cấm chat"><i class="fa-solid fa-volume-xmark"></i> Bị cấm</span>`
      : "";

    // Quyền thao tác lên thành viên này:
    // Trưởng nhóm quản lý được tất cả ngoại trừ chính mình
    // Phó nhóm chỉ quản lý được thành viên thường
    let canManage = false;
    if (!isMe) {
      if (myRole === "leader") {
        canManage = true;
      } else if (myRole === "deputy") {
        canManage = (m.role === "member");
      }
    }

    const directChatBtn = !isMe
      ? `<button class="btn-direct-chat" onclick="openDirectChat('${escapeHtml(m.username)}')" title="Nhắn tin riêng 1-1 với ${escapeHtml(m.fullName)}">
          <i class="fa-regular fa-comment-dots"></i>
        </button>`
      : "";

    const actionBtn = canManage
      ? `<button class="btn-member-action" onclick="openMemberActionPopover(event, '${escapeHtml(m.username)}')" title="Quản lý thành viên">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>`
      : "";

    return `
      <div class="group-member-item">
        <div class="member-left-col" ${!isMe ? `onclick="openDirectChat('${escapeHtml(m.username)}')" style="cursor: pointer;" title="Bấm để nhắn tin riêng với ${escapeHtml(m.fullName)}"` : ''}>
          <div class="member-avatar-wrap">
            <img src="${m.avatar}" alt="${escapeHtml(m.fullName)}" class="member-avatar-img">
            <span class="status-indicator status-${m.isOnline ? 'online' : 'offline'}"></span>
          </div>
          <div class="member-meta">
            <div class="member-name-row">
              <span class="member-name" title="${escapeHtml(m.fullName)}">${escapeHtml(m.fullName)} ${isMe ? '(Bạn)' : ''}</span>
              ${roleBadge}
              ${muteBadge}
            </div>
            <span class="member-sub-info">@${escapeHtml(m.username)} • ${escapeHtml(m.dept || 'Nội bộ')}</span>
          </div>
        </div>
        <div class="member-actions-col">
          ${directChatBtn}
          ${actionBtn}
        </div>
      </div>
    `;
  }).join("");
}

function renderGroupAdminControls() {
  const adminSec = document.getElementById("groupAdminSection");
  const switchChat = document.getElementById("switchOnlyAdminsChat");
  if (!adminSec) return;

  const myRole = getMyGroupRole();
  if (myRole === "leader" || myRole === "deputy") {
    adminSec.style.display = "block";
    if (switchChat) {
      switchChat.checked = !!currentGroupData?.onlyAdminsCanChat;
    }
  } else {
    adminSec.style.display = "none";
  }
}

function checkGroupChatLockStatus() {
  const banner = document.getElementById("chatLockedBanner");
  const bannerText = document.getElementById("chatLockedText");
  const bannerIcon = document.getElementById("chatLockedIcon");
  const inputBar = document.querySelector(".chat-input-bar");
  const msgInput = document.getElementById("messageInput");

  const activeUser = internalUsers.find(u => u.id === currentUserId);
  if (!activeUser || !activeUser.isGroup) {
    if (banner) banner.style.display = "none";
    if (inputBar) inputBar.classList.remove("is-locked");
    if (msgInput) {
      msgInput.disabled = false;
      msgInput.placeholder = "Nhập văn bản...";
    }
    return;
  }

  const isMuted = currentGroupData?.mutedUsers?.includes(currentUser.username);
  const isOnlyAdmins = !!currentGroupData?.onlyAdminsCanChat;
  const myRole = getMyGroupRole();

  if (isMuted) {
    if (banner) {
      banner.style.display = "flex";
      bannerText.innerText = "Bạn đã bị cấm chat trong nhóm này bởi Trưởng/Phó nhóm.";
      bannerIcon.className = "fa-solid fa-volume-xmark";
    }
    if (inputBar) inputBar.classList.add("is-locked");
    if (msgInput) {
      msgInput.disabled = true;
      msgInput.placeholder = "Bạn đang bị cấm gửi tin nhắn trong nhóm này.";
    }
  } else if (isOnlyAdmins && myRole === "member") {
    if (banner) {
      banner.style.display = "flex";
      bannerText.innerText = "Chỉ Trưởng nhóm và Phó nhóm mới có quyền gửi tin nhắn lúc này.";
      bannerIcon.className = "fa-solid fa-lock";
    }
    if (inputBar) inputBar.classList.add("is-locked");
    if (msgInput) {
      msgInput.disabled = true;
      msgInput.placeholder = "Chỉ Trưởng nhóm và Phó nhóm mới có thể gửi tin nhắn.";
    }
  } else {
    if (banner) banner.style.display = "none";
    if (inputBar) inputBar.classList.remove("is-locked");
    if (msgInput) {
      msgInput.disabled = false;
      msgInput.placeholder = "Nhập văn bản...";
    }
  }
}

let currentActionTargetUsername = null;

window.openMemberActionPopover = function(event, targetUsername) {
  event.stopPropagation();
  currentActionTargetUsername = targetUsername;

  const popover = document.getElementById("memberActionPopover");
  const targetMember = currentGroupData?.memberDetails?.find(m => m.username === targetUsername);
  if (!popover || !targetMember) return;

  const myRole = getMyGroupRole();

  const nameEl = document.getElementById("popoverMemberName");
  const roleEl = document.getElementById("popoverMemberRole");
  const actTransfer = document.getElementById("actTransferLeader");
  const actDeputy = document.getElementById("actToggleDeputy");
  const actDeputyText = document.getElementById("actDeputyText");
  const actMute = document.getElementById("actToggleMute");
  const actMuteText = document.getElementById("actMuteText");
  const actRemove = document.getElementById("actRemoveMember");

  if (nameEl) nameEl.innerText = targetMember.fullName;
  if (roleEl) {
    roleEl.innerText = targetMember.role === "leader" ? "Trưởng nhóm" : targetMember.role === "deputy" ? "Phó nhóm" : "Thành viên";
  }

  // 0. Nhắn tin riêng 1-1
  const actDirectChat = document.getElementById("actDirectChat");
  if (actDirectChat) {
    actDirectChat.style.display = (targetMember.username !== currentUser?.username) ? "flex" : "none";
  }

  // 1. Chuyển quyền Trưởng nhóm (chỉ Trưởng nhóm có quyền)
  if (actTransfer) {
    actTransfer.style.display = (myRole === "leader") ? "flex" : "none";
  }

  // 2. Bổ nhiệm / Hủy Phó nhóm (chỉ Trưởng nhóm có quyền)
  if (actDeputy) {
    if (myRole === "leader") {
      actDeputy.style.display = "flex";
      actDeputyText.innerText = targetMember.role === "deputy" ? "Hủy quyền Phó nhóm" : "Bổ nhiệm Phó nhóm";
    } else {
      actDeputy.style.display = "none";
    }
  }

  // 3. Cấm chat / Gỡ cấm chat
  if (actMute) {
    const canMute = (myRole === "leader") || (myRole === "deputy" && targetMember.role === "member");
    actMute.style.display = canMute ? "flex" : "none";
    actMuteText.innerText = targetMember.isMuted ? "Gỡ cấm chat" : "Cấm chat thành viên";
  }

  // 4. Xóa khỏi nhóm
  if (actRemove) {
    const canRemove = (myRole === "leader") || (myRole === "deputy" && targetMember.role === "member");
    actRemove.style.display = canRemove ? "flex" : "none";
  }

  // Vị trí hiển thị popover
  const rect = event.currentTarget.getBoundingClientRect();
  popover.style.display = "block";
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 250, rect.left - 180))}px`;
};

function closeMemberActionPopover() {
  const popover = document.getElementById("memberActionPopover");
  if (popover) popover.style.display = "none";
  currentActionTargetUsername = null;
}

function setupGroupManagementEvents() {
  const popover = document.getElementById("memberActionPopover");
  const actTransfer = document.getElementById("actTransferLeader");
  const actDeputy = document.getElementById("actToggleDeputy");
  const actMute = document.getElementById("actToggleMute");
  const actRemove = document.getElementById("actRemoveMember");
  const switchChat = document.getElementById("switchOnlyAdminsChat");

  // Đóng popover khi nhấn ra ngoài
  document.addEventListener("click", (e) => {
    if (popover && !popover.contains(e.target)) {
      closeMemberActionPopover();
    }
  });

  // Nhắn tin riêng 1-1
  const actDirectChat = document.getElementById("actDirectChat");
  actDirectChat?.addEventListener("click", () => {
    if (!currentActionTargetUsername) return;
    const targetUsername = currentActionTargetUsername;
    closeMemberActionPopover();
    openDirectChat(targetUsername);
  });

  // Chuyển quyền Trưởng nhóm
  actTransfer?.addEventListener("click", () => {
    if (!currentActionTargetUsername) return;
    const target = currentGroupData?.memberDetails?.find(m => m.username === currentActionTargetUsername);
    closeMemberActionPopover();
    if (!target) return;

    if (confirm(`Bạn có chắc chắn muốn chuyển quyền TRƯỞNG NHÓM cho "${target.fullName}" không?\n\nSau khi chuyển, bạn sẽ thành Phó nhóm.`)) {
      fetch("/api/group/transfer-leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester: currentUser.username, newLeader: target.username })
      })
      .then(res => res.json())
      .then(data => {
        showToast("👑 Đã chuyển giao quyền Trưởng nhóm thành công!");
      })
      .catch(err => showToast("Lỗi chuyển quyền trưởng nhóm!"));
    }
  });

  // Bổ nhiệm / Hủy Phó nhóm
  actDeputy?.addEventListener("click", () => {
    if (!currentActionTargetUsername) return;
    const target = currentGroupData?.memberDetails?.find(m => m.username === currentActionTargetUsername);
    closeMemberActionPopover();
    if (!target) return;

    const isDeputy = (target.role !== "deputy");
    fetch("/api/group/set-deputy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester: currentUser.username, username: target.username, isDeputy })
    })
    .then(res => res.json())
    .then(data => {
      showToast(isDeputy ? `⭐ Đã bổ nhiệm ${target.fullName} làm Phó nhóm!` : `ℹ️ Đã hủy quyền Phó nhóm của ${target.fullName}!`);
    })
    .catch(err => showToast("Lỗi thay đổi quyền phó nhóm!"));
  });

  // Cấm chat / Gỡ cấm chat
  actMute?.addEventListener("click", () => {
    if (!currentActionTargetUsername) return;
    const target = currentGroupData?.memberDetails?.find(m => m.username === currentActionTargetUsername);
    closeMemberActionPopover();
    if (!target) return;

    const isMuted = !target.isMuted;
    fetch("/api/group/mute-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester: currentUser.username, username: target.username, isMuted })
    })
    .then(res => res.json())
    .then(data => {
      showToast(isMuted ? `🔇 Đã cấm chat đối với ${target.fullName}!` : `🔊 Đã gỡ cấm chat cho ${target.fullName}!`);
    })
    .catch(err => showToast("Lỗi thao tác cấm chat!"));
  });

  // Xóa thành viên
  actRemove?.addEventListener("click", () => {
    if (!currentActionTargetUsername) return;
    const target = currentGroupData?.memberDetails?.find(m => m.username === currentActionTargetUsername);
    closeMemberActionPopover();
    if (!target) return;

    if (confirm(`Bạn có chắc chắn muốn xóa "${target.fullName}" khỏi nhóm chat không?`)) {
      fetch("/api/group/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester: currentUser.username, username: target.username })
      })
      .then(res => res.json())
      .then(data => {
        showToast(`🚪 Đã xóa ${target.fullName} khỏi nhóm!`);
      })
      .catch(err => showToast("Lỗi xóa thành viên!"));
    }
  });

  // Gạt nút bật/tắt chế độ Chỉ Trưởng & Phó nhóm chat
  switchChat?.addEventListener("change", function() {
    const onlyAdmins = this.checked;
    fetch("/api/group/set-chat-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester: currentUser.username, onlyAdminsCanChat: onlyAdmins })
    })
    .then(res => res.json())
    .then(data => {
      showToast(onlyAdmins ? "🔒 Đã BẬT chế độ chỉ Trưởng/Phó nhóm chat!" : "🔓 Đã MỞ chat cho toàn bộ thành viên!");
    })
    .catch(err => {
      this.checked = !onlyAdmins;
      showToast("Lỗi thay đổi chế độ chat nhóm!");
    });
  });

  setupAddMemberModal();
  setupRenameGroupModal();
  setupGroupAvatarUpload();
}

// Modal Thêm thành viên
function setupAddMemberModal() {
  const modal = document.getElementById("addMemberModal");
  const openBtn = document.getElementById("btnAddGroupMember");
  const closeBtn = document.getElementById("btnCloseAddMemberModal");
  const cancelBtn = document.getElementById("btnCancelAddMember");
  const searchInput = document.getElementById("searchAddMemberInput");
  const listEl = document.getElementById("addMemberList");

  function openModal() {
    if (!modal) return;
    modal.style.display = "flex";
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }
    renderCandidates();
  }

  function closeModal() {
    if (modal) modal.style.display = "none";
  }

  function renderCandidates(keyword = "") {
    if (!listEl) return;
    const currentMemberUsernames = currentGroupData?.members || [];
    const candidates = allSystemUsers.filter(u => {
      const notInGroup = !currentMemberUsernames.includes(u.username);
      if (!notInGroup) return false;
      if (!keyword) return true;
      const kw = keyword.toLowerCase();
      return (u.fullName || '').toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
    });

    if (candidates.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">Không còn đồng nghiệp nào khác chưa vào nhóm.</div>`;
      return;
    }

    listEl.innerHTML = candidates.map(c => `
      <div class="add-member-item">
        <div class="add-member-left">
          <img src="${c.avatar}" alt="${escapeHtml(c.fullName)}" class="add-member-avatar">
          <div>
            <div class="add-member-name">${escapeHtml(c.fullName)}</div>
            <div class="add-member-dept">@${escapeHtml(c.username)} • ${escapeHtml(c.dept || 'Nội bộ')}</div>
          </div>
        </div>
        <button class="btn-do-add" onclick="doAddMemberToGroup('${escapeHtml(c.username)}')">
          <i class="fa-solid fa-plus"></i> Thêm
        </button>
      </div>
    `).join("");
  }

  openBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  searchInput?.addEventListener("input", (e) => renderCandidates(e.target.value.trim()));
}

window.doAddMemberToGroup = function(username) {
  fetch("/api/group/add-member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requester: currentUser.username, username })
  })
  .then(res => res.json())
  .then(data => {
    showToast("✅ Đã thêm thành viên vào nhóm!");
    const modal = document.getElementById("addMemberModal");
    if (modal && modal.style.display !== "none") {
      const searchInput = document.getElementById("searchAddMemberInput");
      const currentMemberUsernames = currentGroupData?.members || [];
      const listEl = document.getElementById("addMemberList");
      const kw = searchInput?.value.trim().toLowerCase() || "";
      const candidates = allSystemUsers.filter(u => {
        if (currentMemberUsernames.includes(u.username)) return false;
        if (!kw) return true;
        return (u.fullName || '').toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
      });
      if (candidates.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">Không còn đồng nghiệp nào khác chưa vào nhóm.</div>`;
      } else {
        listEl.innerHTML = candidates.map(c => `
          <div class="add-member-item">
            <div class="add-member-left">
              <img src="${c.avatar}" alt="${escapeHtml(c.fullName)}" class="add-member-avatar">
              <div>
                <div class="add-member-name">${escapeHtml(c.fullName)}</div>
                <div class="add-member-dept">@${escapeHtml(c.username)} • ${escapeHtml(c.dept || 'Nội bộ')}</div>
              </div>
            </div>
            <button class="btn-do-add" onclick="doAddMemberToGroup('${escapeHtml(c.username)}')">
              <i class="fa-solid fa-plus"></i> Thêm
            </button>
          </div>
        `).join("");
      }
    }
  })
  .catch(err => showToast("Lỗi thêm thành viên!"));
};

// Modal Đổi tên nhóm
function setupRenameGroupModal() {
  const modal = document.getElementById("renameGroupModal");
  const openBtn = document.getElementById("btnRenameGroupAction");
  const closeBtn = document.getElementById("btnCloseRenameGroupModal");
  const cancelBtn = document.getElementById("btnCancelRenameGroup");
  const confirmBtn = document.getElementById("btnConfirmRenameGroup");
  const nameInput = document.getElementById("newGroupNameInput");

  openBtn?.addEventListener("click", () => {
    if (!modal) return;
    if (nameInput) nameInput.value = currentGroupData?.name || "Nhóm Chat Chung Nội Bộ";
    modal.style.display = "flex";
    if (nameInput) nameInput.focus();
  });

  function closeModal() {
    if (modal) modal.style.display = "none";
  }

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  confirmBtn?.addEventListener("click", () => {
    const newName = (nameInput?.value || "").trim();
    if (!newName) {
      showToast("Vui lòng nhập tên nhóm!");
      return;
    }
    fetch("/api/group/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    })
    .then(res => res.json())
    .then(data => {
      showToast("✅ Đã đổi tên nhóm thành công!");
      closeModal();
    })
    .catch(err => showToast("Lỗi cập nhật tên nhóm!"));
  });
}

// Đổi ảnh đại diện nhóm
function setupGroupAvatarUpload() {
  const fileInput = document.getElementById("groupAvatarFileInput");
  const badgeBtn = document.getElementById("btnGroupAvatarBadge");
  const avatarWrapper = document.getElementById("cardAvatarWrapper");
  const quickEditBtn = document.getElementById("btnQuickGroupAvatar");
  const changeAvatarActionBtn = document.getElementById("btnChangeAvatarGroupAction");

  function triggerFilePicker() {
    const activeUser = internalUsers.find(u => u.id === currentUserId);
    if (activeUser && activeUser.isGroup) {
      if (fileInput) fileInput.click();
    }
  }

  badgeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    triggerFilePicker();
  });

  avatarWrapper?.addEventListener("click", () => {
    triggerFilePicker();
  });

  quickEditBtn?.addEventListener("click", () => {
    triggerFilePicker();
  });

  changeAvatarActionBtn?.addEventListener("click", () => {
    triggerFilePicker();
  });

  // Nhấn vào avatar nhóm trên header giữa cũng đổi được
  const middleAvatarWrapper = document.querySelector(".recipient-avatar-wrapper");
  middleAvatarWrapper?.addEventListener("click", () => {
    const activeUser = internalUsers.find(u => u.id === currentUserId);
    if (activeUser && activeUser.isGroup) {
      if (fileInput) fileInput.click();
    }
  });

  fileInput?.addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;
    openAvatarCropper(file, "group");
    fileInput.value = "";
  });
}

// ==========================================
// BỘ CÔNG CỤ CẮT & CĂN CHỈNH KHUNG HÌNH AVATAR (AVATAR CROPPER)
// ==========================================

let cropState = {
  active: false,
  targetType: "user", // "user" hoặc "group"
  sourceImg: null,
  zoom: 1.0,
  minZoom: 0.6,
  maxZoom: 3.5,
  panX: 0,
  panY: 0,
  rotation: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  baseScale: 1.0,
  canvasSize: 340,
  cropDiameter: 250
};

function openAvatarCropper(imageSource, targetType = "user") {
  cropState.targetType = targetType;
  cropState.active = true;
  cropState.zoom = 1.0;
  cropState.panX = 0;
  cropState.panY = 0;
  cropState.rotation = 0;
  cropState.isDragging = false;

  const slider = document.getElementById("cropZoomSlider");
  if (slider) slider.value = "1";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    cropState.sourceImg = img;
    const modal = document.getElementById("avatarCropModal");
    if (modal) modal.style.display = "flex";
    initCropCanvas();
    drawCropCanvas();
  };
  img.onerror = () => {
    showToast("⚠️ Không thể tải hình ảnh để căn chỉnh.");
  };

  if (typeof imageSource === "string") {
    img.src = imageSource;
  } else if (imageSource instanceof File || imageSource instanceof Blob) {
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.readAsDataURL(imageSource);
  }
}

function closeAvatarCropper() {
  cropState.active = false;
  cropState.sourceImg = null;
  const modal = document.getElementById("avatarCropModal");
  if (modal) modal.style.display = "none";
}

function initCropCanvas() {
  const canvas = document.getElementById("cropCanvas");
  if (!canvas) return;
  canvas.width = cropState.canvasSize;
  canvas.height = cropState.canvasSize;
}

function drawCropCanvas() {
  const canvas = document.getElementById("cropCanvas");
  if (!canvas || !cropState.sourceImg) return;
  const ctx = canvas.getContext("2d");
  const img = cropState.sourceImg;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const center = cropState.canvasSize / 2;

  // Xử lý kích thước hiển thị khi xoay
  const isRotated90 = (cropState.rotation % 180 !== 0);
  const curW = isRotated90 ? img.naturalHeight : img.naturalWidth;
  const curH = isRotated90 ? img.naturalWidth : img.naturalHeight;

  // Base scale đảm bảo ảnh luôn phủ trọn khung tròn 250px mà KHÔNG BAO GIỜ bị méo tỉ lệ
  const minDim = Math.min(curW, curH);
  cropState.baseScale = cropState.cropDiameter / (minDim || 1);

  const currentScale = cropState.baseScale * cropState.zoom;

  ctx.save();
  ctx.translate(center + cropState.panX, center + cropState.panY);
  ctx.rotate((cropState.rotation * Math.PI) / 180);

  const drawW = img.naturalWidth * currentScale;
  const drawH = img.naturalHeight * currentScale;

  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function exportCroppedAvatar() {
  if (!cropState.sourceImg) return null;
  const img = cropState.sourceImg;

  const exportSize = 320; // Xuất ảnh vuông 320x320 px sắc nét cao
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = exportSize;
  exportCanvas.height = exportSize;
  const exportCtx = exportCanvas.getContext("2d");

  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";

  const exportCenter = exportSize / 2;
  const ratio = exportSize / cropState.cropDiameter;

  const currentScale = cropState.baseScale * cropState.zoom * ratio;

  exportCtx.save();
  exportCtx.translate(exportCenter + cropState.panX * ratio, exportCenter + cropState.panY * ratio);
  exportCtx.rotate((cropState.rotation * Math.PI) / 180);

  const drawW = img.naturalWidth * currentScale;
  const drawH = img.naturalHeight * currentScale;

  exportCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  exportCtx.restore();

  return exportCanvas.toDataURL("image/jpeg", 0.92);
}

function applyAvatarCrop() {
  const croppedDataUrl = exportCroppedAvatar();
  if (!croppedDataUrl) return;

  if (cropState.targetType === "user") {
    tempNewAvatarData = croppedDataUrl;
    const previewImg = document.getElementById("adminAvatarPreview");
    if (previewImg) previewImg.src = croppedDataUrl;
    showToast("✨ Đã căn chỉnh ảnh đại diện thành công!");
  } else if (cropState.targetType === "group") {
    const activeUser = internalUsers.find(u => u.id === currentUserId);
    if (activeUser && activeUser.isGroup) {
      activeUser.avatar = croppedDataUrl;
      const rAvatar = document.getElementById("rightProfileAvatar");
      if (rAvatar) rAvatar.src = croppedDataUrl;
      const headAvatar = document.getElementById("recipientAvatar");
      if (headAvatar) headAvatar.src = croppedDataUrl;
      renderUserList();

      fetch("/api/group/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: croppedDataUrl })
      })
      .then(res => res.json())
      .then(() => {
        showToast("✅ Đã cập nhật ảnh nhóm thành công!");
      })
      .catch(() => {
        showToast("Lỗi gửi ảnh nhóm lên server!");
      });
    }
  }

  closeAvatarCropper();
}

function setupAvatarCropperEvents() {
  const container = document.getElementById("cropViewportContainer");
  const zoomSlider = document.getElementById("cropZoomSlider");
  const btnZoomIn = document.getElementById("btnCropZoomIn");
  const btnZoomOut = document.getElementById("btnCropZoomOut");
  const btnRotate = document.getElementById("btnCropRotate");
  const btnReset = document.getElementById("btnCropReset");
  const btnApply = document.getElementById("btnApplyAvatarCrop");
  const btnCancel = document.getElementById("btnCancelAvatarCrop");
  const btnClose = document.getElementById("btnCloseAvatarCrop");

  // Đóng modal
  btnClose?.addEventListener("click", closeAvatarCropper);
  btnCancel?.addEventListener("click", closeAvatarCropper);
  document.getElementById("avatarCropModal")?.addEventListener("click", (e) => {
    if (e.target.id === "avatarCropModal") closeAvatarCropper();
  });

  // Áp dụng
  btnApply?.addEventListener("click", applyAvatarCrop);

  // Kéo rê chuột để căn chỉnh vị trí (Pan/Drag)
  if (container) {
    container.addEventListener("mousedown", (e) => {
      cropState.isDragging = true;
      cropState.dragStartX = e.clientX - cropState.panX;
      cropState.dragStartY = e.clientY - cropState.panY;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!cropState.isDragging) return;
      cropState.panX = e.clientX - cropState.dragStartX;
      cropState.panY = e.clientY - cropState.dragStartY;
      drawCropCanvas();
    });

    window.addEventListener("mouseup", () => {
      cropState.isDragging = false;
    });

    // Hỗ trợ cảm ứng trên điện thoại / tablet
    container.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        cropState.isDragging = true;
        cropState.dragStartX = e.touches[0].clientX - cropState.panX;
        cropState.dragStartY = e.touches[0].clientY - cropState.panY;
      }
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
      if (cropState.isDragging && e.touches.length === 1) {
        cropState.panX = e.touches[0].clientX - cropState.dragStartX;
        cropState.panY = e.touches[0].clientY - cropState.dragStartY;
        drawCropCanvas();
      }
    }, { passive: true });

    container.addEventListener("touchend", () => {
      cropState.isDragging = false;
    });

    // Lăn chuột để thu phóng (Wheel to Zoom)
    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      let newZoom = Math.max(cropState.minZoom, Math.min(cropState.maxZoom, cropState.zoom + delta));
      cropState.zoom = parseFloat(newZoom.toFixed(2));
      if (zoomSlider) zoomSlider.value = String(cropState.zoom);
      drawCropCanvas();
    }, { passive: false });
  }

  // Thanh trượt thu phóng
  if (zoomSlider) {
    zoomSlider.addEventListener("input", function() {
      cropState.zoom = parseFloat(this.value);
      drawCropCanvas();
    });
  }

  // Nút Phóng to (+)
  btnZoomIn?.addEventListener("click", () => {
    let newZoom = Math.min(cropState.maxZoom, cropState.zoom + 0.15);
    cropState.zoom = parseFloat(newZoom.toFixed(2));
    if (zoomSlider) zoomSlider.value = String(cropState.zoom);
    drawCropCanvas();
  });

  // Nút Thu nhỏ (-)
  btnZoomOut?.addEventListener("click", () => {
    let newZoom = Math.max(cropState.minZoom, cropState.zoom - 0.15);
    cropState.zoom = parseFloat(newZoom.toFixed(2));
    if (zoomSlider) zoomSlider.value = String(cropState.zoom);
    drawCropCanvas();
  });

  // Nút Xoay 90 độ
  btnCropRotate?.addEventListener("click", () => {
    cropState.rotation = (cropState.rotation + 90) % 360;
    drawCropCanvas();
  });

  // Nút Căn giữa lại
  btnCropReset?.addEventListener("click", () => {
    cropState.panX = 0;
    cropState.panY = 0;
    cropState.zoom = 1.0;
    cropState.rotation = 0;
    if (zoomSlider) zoomSlider.value = "1";
    drawCropCanvas();
  });
}

// ==========================================
// 9. CÀI ĐẶT NGƯỜI DÙNG: ĐỔI TÊN, AVATAR, MẬT KHẨU
// ==========================================
function setupAdminSettingsEvents() {
  const settingsBtn = document.getElementById("settingsBtn");
  const myAvatarWrapper = document.getElementById("myAvatarWrapper");
  const modal = document.getElementById("adminSettingsModal");
  const btnClose = document.getElementById("btnCloseSettingsModal");
  const btnCancel = document.getElementById("btnCancelSettings");
  const btnSave = document.getElementById("btnSaveSettings");

  const nameInput = document.getElementById("adminNameInput");
  const roleInput = document.getElementById("adminRoleInput");
  const passInput = document.getElementById("adminPasswordInput");
  const previewImg = document.getElementById("adminAvatarPreview");
  const fileInput = document.getElementById("adminAvatarFileInput");

  function openSettings() {
    if (!currentUser) return;
    tempNewAvatarData = currentUser.avatar;
    if (previewImg) previewImg.src = currentUser.avatar;
    if (nameInput) nameInput.value = currentUser.fullName;
    if (roleInput) roleInput.value = currentUser.dept || "";
    if (passInput) passInput.value = "";
    if (modal) modal.style.display = "flex";
  }

  function closeSettings() {
    if (modal) modal.style.display = "none";
    tempNewAvatarData = null;
  }

  settingsBtn?.addEventListener("click", openSettings);
  myAvatarWrapper?.addEventListener("click", openSettings);
  btnClose?.addEventListener("click", closeSettings);
  btnCancel?.addEventListener("click", closeSettings);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeSettings();
  });

  // Chọn ảnh avatar từ máy tính (mở bộ công cụ căn chỉnh & cắt khung hình)
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      openAvatarCropper(file, "user");
    }
    fileInput.value = "";
  });

  // Nút căn chỉnh khung hình ảnh hiện tại
  document.getElementById("btnAdjustAvatar")?.addEventListener("click", () => {
    const currentSrc = tempNewAvatarData || currentUser?.avatar;
    if (currentSrc) {
      openAvatarCropper(currentSrc, "user");
    } else {
      showToast("Vui lòng tải ảnh lên trước khi căn chỉnh!");
    }
  });

  // Lưu thông tin cập nhật hồ sơ & Avatar
  btnSave?.addEventListener("click", async () => {
    const newFullName = nameInput?.value.trim();
    const newDept = roleInput?.value.trim();
    const newPassword = passInput?.value.trim();

    if (!newFullName) {
      showToast("Vui lòng nhập họ và tên của bạn!");
      return;
    }

    if (!currentUser) {
      currentUser = {
        id: "u_" + Date.now(),
        username: "user_" + Date.now(),
        fullName: newFullName,
        dept: newDept || "Phòng Nội Bộ",
        avatar: tempNewAvatarData || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
      };
    }

    // 1. Cập nhật ngay lập tức vào giao diện và LocalStorage
    currentUser.fullName = newFullName;
    if (newDept) currentUser.dept = newDept;
    if (tempNewAvatarData) {
      currentUser.avatar = tempNewAvatarData;
    }
    localStorage.setItem("chatexcel_session_user_v2", JSON.stringify(currentUser));
    renderCurrentUserUI();
    closeSettings();
    showToast("✅ Đã lưu ảnh đại diện và hồ sơ thành công!");

    // 2. Gửi đồng bộ lên máy chủ Server
    try {
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.username,
          fullName: newFullName,
          dept: newDept,
          avatar: currentUser.avatar,
          newPassword: newPassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        currentUser = data.user;
        localStorage.setItem("chatexcel_session_user_v2", JSON.stringify(currentUser));
        renderCurrentUserUI();
      }
    } catch (err) {
      console.log("Đã lưu hồ sơ trên trình duyệt thành công:", err);
    }
  });
}

// ==========================================
// 10. TÍNH NĂNG GỌI THOẠI & GỌI VIDEO THỰC TẾ
// ==========================================
function setupCallingEvents() {
  const btnVoiceCall = document.getElementById("btnVoiceCall");
  const btnVideoCall = document.getElementById("btnVideoCall");
  const btnQuickCall = document.getElementById("btnQuickCall");
  const btnEndCall = document.getElementById("btnEndCall");
  const btnToggleMic = document.getElementById("btnToggleCallMic");
  const btnToggleCam = document.getElementById("btnToggleCallCam");

  const btnAccept = document.getElementById("btnAcceptIncomingCall");
  const btnReject = document.getElementById("btnRejectIncomingCall");

  // Nút gọi từ header chat
  btnVoiceCall?.addEventListener("click", () => {
    unlockAudioPlayback();
    startCall(false);
  });
  btnVideoCall?.addEventListener("click", () => {
    unlockAudioPlayback();
    startCall(true);
  });
  btnQuickCall?.addEventListener("click", () => {
    unlockAudioPlayback();
    startCall(false);
  });

  btnEndCall?.addEventListener("click", endCall);

  // Bật/Tắt Micro trong cuộc gọi
  btnToggleMic?.addEventListener("click", () => {
    if (activeCall.stream) {
      const audioTrack = activeCall.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        btnToggleMic.classList.toggle("muted", !audioTrack.enabled);
        btnToggleMic.innerHTML = audioTrack.enabled
          ? '<i class="fa-solid fa-microphone"></i>'
          : '<i class="fa-solid fa-microphone-slash"></i>';
        showToast(audioTrack.enabled ? "Đã bật micro" : "Đã tắt micro");
      }
    }
  });

  // Bật/Tắt Camera trong cuộc gọi
  btnToggleCam?.addEventListener("click", () => {
    if (activeCall.stream) {
      const videoTrack = activeCall.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        btnToggleCam.classList.toggle("muted", !videoTrack.enabled);
        btnToggleCam.innerHTML = videoTrack.enabled
          ? '<i class="fa-solid fa-video"></i>'
          : '<i class="fa-solid fa-video-slash"></i>';
        showToast(videoTrack.enabled ? "Đã bật camera" : "Đã tắt camera");
      }
    }
  });

  // Trả lời cuộc gọi đến
  btnAccept?.addEventListener("click", () => {
    unlockAudioPlayback();
    hideIncomingCallAlert();
    stopRingtone();
    if (activeCall.pendingSignal) {
      answerIncomingCall(activeCall.pendingSignal);
    }
  });

  // Từ chối cuộc gọi đến
  btnReject?.addEventListener("click", () => {
    hideIncomingCallAlert();
    stopRingtone();
    if (activeCall.pendingSignal) {
      sendCallSignal({
        type: 'reject',
        to: activeCall.pendingSignal.from,
        from: currentUser.username
      });
      activeCall.pendingSignal = null;
    }
    showToast("Đã từ chối cuộc gọi");
  });

  // Cho phép bấm bất kỳ đâu trong Modal gọi để đánh thức âm thanh nếu trình duyệt tạm hoãn
  document.getElementById("callModal")?.addEventListener("click", () => {
    unlockAudioPlayback();
  });
}

function unlockAudioPlayback() {
  try {
    const remoteAudio = document.getElementById("callRemoteAudio");
    if (remoteAudio) {
      remoteAudio.muted = false;
      remoteAudio.volume = 1.0;
      // Phát 1 buffer âm thanh câm WAV để cấp quyền autoplay vĩnh viễn trên Chrome/Safari/Mobile
      if (!remoteAudio.srcObject && !remoteAudio.src) {
        remoteAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        const p = remoteAudio.play();
        if (p !== undefined) {
          p.then(() => {
            remoteAudio.pause();
            remoteAudio.removeAttribute("src");
          }).catch(() => {});
        }
      } else {
        remoteAudio.play().catch(() => {});
      }
    }
  } catch (e) {}

  // Mở khóa Web Audio Context chạy song song
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!window.webrtcAudioCtx) {
        window.webrtcAudioCtx = new AudioCtx();
      }
      if (window.webrtcAudioCtx.state === 'suspended') {
        window.webrtcAudioCtx.resume().catch(() => {});
      }
    }
  } catch (e) {}
}

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:openrelay.metered.ca:80" },
    { urls: "stun:openrelay.metered.ca:443" }
  ],
  iceCandidatePoolSize: 10
};

// Tạo MediaStream âm thanh mô phỏng khi thiết bị không cắm microphone hoặc bị xung đột
function createVirtualAudioStream() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return new MediaStream();
    const ctx = new AudioCtx();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    gain.gain.setValueAtTime(0.005, ctx.currentTime);
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream;
  } catch (e) {
    return new MediaStream();
  }
}

// Hàm lấy quyền Mic và Camera an toàn, tự động fallback nếu bị xung đột
async function acquireMediaStream(isVideo) {
  let stream = null;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // 1. Thử lấy chuẩn đầy đủ với lọc tiếng vang/tiếng ồn
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: isVideo ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
      return stream;
    } catch (err1) {
      console.warn("Lỗi cấu hình mic nâng cao, chuyển sang cấu hình cơ bản:", err1);
    }

    // 2. Thử cấu hình audio: true cơ bản (tương thích 100% Android, iOS, Windows)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? true : false
      });
      return stream;
    } catch (err2) {
      console.warn("Lỗi cấu hình media cơ bản:", err2);
    }

    // 3. Nếu là cuộc gọi video nhưng camera bị lỗi/đang bận, cố gắng giữ mic để thoại
    if (isVideo) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        showToast("⚠️ Camera không khả dụng, đã chuyển sang cuộc gọi thoại.");
        return stream;
      } catch (err3) {}
    }
  }

  // 4. Nếu thiết bị hoàn toàn không cho phép truy cập micro
  showToast("⚠️ Vui lòng cấp quyền Micro trên trình duyệt để đối phương nghe được giọng bạn!");
  return createVirtualAudioStream();
}

function createPeerConnection(targetUsername) {
  if (activeCall.pc) {
    try { activeCall.pc.close(); } catch (e) {}
    activeCall.pc = null;
  }
  // Giữ lại các candidates đã nhận từ trước (nếu có)
  if (!activeCall.pendingCandidates) {
    activeCall.pendingCandidates = [];
  }

  const pc = new RTCPeerConnection(rtcConfig);
  activeCall.pc = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate && activeCall.active) {
      sendCallSignal({
        type: 'candidate',
        candidate: event.candidate,
        from: currentUser.username,
        to: targetUsername
      });
    }
  };

  pc.ontrack = (event) => {
    console.log("WebRTC ontrack received track:", event.track, "kind:", event.track.kind);
    let stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
    if (!stream) {
      if (!activeCall.remoteStream) {
        activeCall.remoteStream = new MediaStream();
      }
      activeCall.remoteStream.addTrack(event.track);
      stream = activeCall.remoteStream;
    } else {
      activeCall.remoteStream = stream;
    }
    attachRemoteStream(stream);
  };

  pc.onconnectionstatechange = () => {
    console.log("WebRTC Connection State:", pc.connectionState);
    const statusEl = document.getElementById("callStatusBadge");
    if (pc.connectionState === 'connected') {
      if (statusEl) statusEl.innerText = "Đã kết nối đàm thoại";
      connectCallSession();
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (statusEl) statusEl.innerText = "Mất kết nối đàm thoại";
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE Connection State:", pc.iceConnectionState);
    const statusEl = document.getElementById("callStatusBadge");
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      if (statusEl) statusEl.innerText = "Đã kết nối đàm thoại";
      connectCallSession();
    }
  };

  return pc;
}

function attachRemoteStream(remoteStream) {
  activeCall.remoteStream = remoteStream;

  // 1. Phát qua thẻ <audio> chuyên biệt cho tiếng thoại
  const remoteAudio = document.getElementById("callRemoteAudio");
  if (remoteAudio) {
    if (remoteAudio.srcObject !== remoteStream) {
      remoteAudio.srcObject = remoteStream;
    }
    remoteAudio.muted = false;
    remoteAudio.volume = 1.0;
    remoteAudio.setAttribute("playsinline", "");
    remoteAudio.setAttribute("autoplay", "");

    const p = remoteAudio.play();
    if (p !== undefined) {
      p.catch(e => {
        console.warn("Audio autoplay blocked by browser policy, trying Web Audio fallback:", e);
        try {
          if (window.webrtcAudioCtx && window.webrtcAudioCtx.state === 'running') {
            if (activeCall.webAudioSource) {
              try { activeCall.webAudioSource.disconnect(); } catch (err) {}
            }
            activeCall.webAudioSource = window.webrtcAudioCtx.createMediaStreamSource(remoteStream);
            activeCall.webAudioSource.connect(window.webrtcAudioCtx.destination);
          }
        } catch (err2) {
          console.warn("WebAudio fallback failed:", err2);
        }

        const unlock = () => {
          unlockAudioPlayback();
          remoteAudio.play().catch(() => {});
          document.removeEventListener("click", unlock);
          document.removeEventListener("touchstart", unlock);
        };
        document.addEventListener("click", unlock, { once: true });
        document.addEventListener("touchstart", unlock, { once: true });
      });
    }
  }

  // 2. Khung hình Video (nếu có video track)
  const remoteVideo = document.getElementById("callRemoteVideo");
  const avatarStage = document.getElementById("callAvatarStage");
  const localVideo = document.getElementById("callLocalVideo");

  const hasVideoTrack = remoteStream.getVideoTracks().length > 0;
  if (remoteVideo && hasVideoTrack) {
    if (remoteVideo.srcObject !== remoteStream) {
      remoteVideo.srcObject = remoteStream;
    }
    remoteVideo.muted = true; // Rất quan trọng: mute video element để không bị xung đột/chập tiếng với remoteAudio
    remoteVideo.setAttribute("playsinline", "");
    remoteVideo.style.display = "block";
    remoteVideo.play().catch(e => {});
    if (avatarStage) avatarStage.style.display = "none";
    if (localVideo) localVideo.classList.add("pip");
  } else {
    if (remoteVideo) {
      remoteVideo.style.display = "none";
      remoteVideo.srcObject = null;
    }
    if (avatarStage) avatarStage.style.display = "flex";
    if (localVideo) localVideo.classList.remove("pip");
  }
}

// Bắt đầu cuộc gọi đi
async function startCall(isVideo) {
  if (!currentUserId) {
    showToast("Vui lòng chọn một người để gọi!");
    return;
  }
  const partner = internalUsers.find(u => u.id === currentUserId);
  if (!partner || !partner.username) return;

  if (partner.isGroup) {
    showToast("Cuộc gọi nhóm sẽ có trong phiên bản tới.");
    return;
  }

  activeCall.active = true;
  activeCall.connected = false;
  activeCall.partner = partner;
  activeCall.isVideo = isVideo;

  openCallModal(partner, isVideo);
  playOutgoingRing();

  const targetUsername = (partner.username || '').toLowerCase().trim();
  const pc = createPeerConnection(targetUsername);

  // Mở mic / camera an toàn
  const stream = await acquireMediaStream(isVideo);
  activeCall.stream = stream;

  const localVideo = document.getElementById("callLocalVideo");
  const avatarStage = document.getElementById("callAvatarStage");

  if (isVideo && localVideo && stream.getVideoTracks().length > 0) {
    localVideo.srcObject = stream;
    localVideo.style.display = "block";
    if (avatarStage) avatarStage.style.display = "none";
  }

  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: !!isVideo
    });
    await pc.setLocalDescription(offer);

    sendCallSignal({
      type: 'invite',
      from: currentUser.username,
      fromName: currentUser.fullName,
      fromAvatar: currentUser.avatar,
      to: targetUsername,
      toName: partner.name,
      isVideo: isVideo,
      offer: offer
    });
  } catch (err) {
    console.error("Lỗi tạo SDP offer:", err);
  }

  if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
  activeCall.ringTimeout = setTimeout(() => {
    if (activeCall.active && !activeCall.connected) {
      endCall();
      showToast("Đối phương không trả lời cuộc gọi.");
    }
  }, 45000);
}

function openCallModal(partner, isVideo) {
  const modal = document.getElementById("callModal");
  const nameEl = document.getElementById("callPartnerName");
  const statusEl = document.getElementById("callStatusBadge");
  const avatarEl = document.getElementById("callPartnerAvatar");
  const timerEl = document.getElementById("callTimer");
  const waves = document.getElementById("callVoiceWaves");

  if (nameEl) nameEl.innerText = partner.name;
  if (statusEl) statusEl.innerText = isVideo ? "Đang gọi video..." : "Đang gọi thoại...";
  if (avatarEl) avatarEl.src = partner.avatar;
  if (timerEl) timerEl.innerText = "Đang kết nối...";
  if (waves) waves.style.display = "none";

  if (modal) modal.style.display = "flex";
}

function connectCallSession() {
  activeCall.connected = true;
  stopRingtone();

  const statusEl = document.getElementById("callStatusBadge");
  if (statusEl) statusEl.innerText = "Cuộc gọi đang kết nối";

  // Hiển thị sóng âm thanh đàm thoại
  const waves = document.getElementById("callVoiceWaves");
  if (waves) waves.style.display = "flex";

  // Bắt đầu đếm thời gian thoại
  activeCall.seconds = 0;
  clearInterval(activeCall.timerInterval);
  activeCall.timerInterval = setInterval(() => {
    activeCall.seconds++;
    const m = String(Math.floor(activeCall.seconds / 60)).padStart(2, '0');
    const s = String(activeCall.seconds % 60).padStart(2, '0');
    const timerEl = document.getElementById("callTimer");
    if (timerEl) timerEl.innerText = `${m}:${s}`;
  }, 1000);
}

// Kết thúc cuộc gọi
function endCall() {
  stopRingtone();
  if (activeCall.ringTimeout) {
    clearTimeout(activeCall.ringTimeout);
    activeCall.ringTimeout = null;
  }
  clearInterval(activeCall.timerInterval);

  if (activeCall.stream) {
    activeCall.stream.getTracks().forEach(t => t.stop());
    activeCall.stream = null;
  }

  if (activeCall.playbackAudioCtx) {
    try { activeCall.playbackAudioCtx.close(); } catch (e) {}
    activeCall.playbackAudioCtx = null;
  }

  if (activeCall.webAudioSource) {
    try { activeCall.webAudioSource.disconnect(); } catch (e) {}
    activeCall.webAudioSource = null;
  }

  if (activeCall.pc) {
    try { activeCall.pc.close(); } catch (e) {}
    activeCall.pc = null;
  }
  activeCall.pendingCandidates = [];
  activeCall.remoteStream = null;

  const waves = document.getElementById("callVoiceWaves");
  if (waves) waves.style.display = "none";

  const remoteAudio = document.getElementById("callRemoteAudio");
  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
  }

  const remoteVideo = document.getElementById("callRemoteVideo");
  if (remoteVideo) {
    remoteVideo.pause();
    remoteVideo.srcObject = null;
    remoteVideo.style.display = "none";
  }

  const localVideo = document.getElementById("callLocalVideo");
  if (localVideo) {
    localVideo.srcObject = null;
    localVideo.style.display = "none";
    localVideo.classList.remove("pip");
  }

  const avatarStage = document.getElementById("callAvatarStage");
  if (avatarStage) avatarStage.style.display = "flex";

  if (activeCall.partner && currentUser) {
    sendCallSignal({
      type: 'end',
      from: currentUser.username,
      to: activeCall.partner.username || activeCall.partner.name
    });
  }

  const modal = document.getElementById("callModal");
  if (modal) modal.style.display = "none";

  activeCall.active = false;
  activeCall.connected = false;
  activeCall.partner = null;
  showToast("Cuộc gọi đã kết thúc.");
}

// Xử lý cuộc gọi đến
function handleIncomingCall(signal) {
  activeCall.pendingSignal = signal;
  const alertBox = document.getElementById("incomingCallAlert");
  const avatar = document.getElementById("incomingAvatar");
  const name = document.getElementById("incomingName");
  const type = document.getElementById("incomingType");

  if (avatar) avatar.src = signal.fromAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.from}`;
  if (name) name.innerText = signal.fromName || signal.from;
  if (type) type.innerText = signal.isVideo ? "Cuộc gọi video đến..." : "Cuộc gọi thoại đến...";

  if (alertBox) alertBox.style.display = "flex";
  playIncomingRing();
}

function hideIncomingCallAlert() {
  const alertBox = document.getElementById("incomingCallAlert");
  if (alertBox) alertBox.style.display = "none";
}

async function answerIncomingCall(signal) {
  const callerUsername = (signal.from || '').toLowerCase().trim();
  const partnerUser = internalUsers.find(u => u.username && u.username.toLowerCase() === callerUsername) || {
    id: "u_" + callerUsername,
    name: signal.fromName || callerUsername,
    avatar: signal.fromAvatar,
    username: callerUsername
  };

  activeCall.active = true;
  activeCall.connected = false;
  activeCall.partner = partnerUser;
  activeCall.isVideo = !!signal.isVideo;

  openCallModal(partnerUser, !!signal.isVideo);

  const pc = createPeerConnection(callerUsername);

  // Mở mic / camera an toàn
  const stream = await acquireMediaStream(!!signal.isVideo);
  activeCall.stream = stream;

  const localVideo = document.getElementById("callLocalVideo");
  const avatarStage = document.getElementById("callAvatarStage");

  if (signal.isVideo && localVideo && stream.getVideoTracks().length > 0) {
    localVideo.srcObject = stream;
    localVideo.style.display = "block";
    if (avatarStage) avatarStage.style.display = "none";
  }

  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });

  try {
    if (signal.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));

      if (activeCall.pendingCandidates && activeCall.pendingCandidates.length > 0) {
        for (const cand of activeCall.pendingCandidates) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        activeCall.pendingCandidates = [];
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendCallSignal({
      type: 'answer',
      from: currentUser.username,
      fromName: currentUser.fullName,
      to: callerUsername,
      toName: signal.fromName || callerUsername,
      answer: answer
    });

    connectCallSession();
  } catch (err) {
    console.error("Lỗi tạo SDP answer:", err);
  }
}

// ==========================================
// 11. TẠO ÂM THANH CHUÔNG CUỘC GỌI (WEB AUDIO)
// ==========================================
function playOutgoingRing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    activeCall.audioCtx = ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime); // Nốt La 440Hz

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    // Hiệu ứng tút... tút...
    let isBeep = true;
    activeCall.ringInterval = setInterval(() => {
      if (gain.gain) {
        gain.gain.setValueAtTime(isBeep ? 0.08 : 0, ctx.currentTime);
        isBeep = !isBeep;
      }
    }, 800);
  } catch (e) {}
}

function playIncomingRing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    activeCall.audioCtx = ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // Nốt Đô

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    let toggle = true;
    activeCall.ringInterval = setInterval(() => {
      if (osc.frequency) {
        osc.frequency.setValueAtTime(toggle ? 659.25 : 523.25, ctx.currentTime);
        toggle = !toggle;
      }
    }, 400);
  } catch (e) {}
}

function stopRingtone() {
  if (activeCall.ringInterval) {
    clearInterval(activeCall.ringInterval);
    activeCall.ringInterval = null;
  }
  if (activeCall.audioCtx) {
    activeCall.audioCtx.close().catch(() => {});
    activeCall.audioCtx = null;
  }
}

function sendCallSignal(signal) {
  fetch("/api/call-signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signal)
  }).catch(() => {});
}

// ==========================================
// 12. KẾT NỐI REALTIME SSE VỚI SERVER
// ==========================================
let currentEventSource = null;

function initRealtimeSSE() {
  if (!window.location.protocol.startsWith("http") || !currentUser) return;

  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }

  // Hủy polling cũ nếu có
  if (window._msgSyncPolling) {
    clearInterval(window._msgSyncPolling);
    window._msgSyncPolling = null;
  }

  try {
    currentEventSource = new EventSource(`/api/events?username=${encodeURIComponent(currentUser.username)}`);

    currentEventSource.onerror = function() {
      if (currentEventSource) {
        try { currentEventSource.close(); } catch (e) {}
        currentEventSource = null;
      }
      setTimeout(initRealtimeSSE, 3000);
    };

    currentEventSource.onmessage = function(event) {
      try {
        if (!event.data || event.data.trim().startsWith(':')) return; // Bỏ qua heartbeat ping
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        // 1. Nhận tin nhắn mới
        if (type === "new_message") {
          const msg = data;
          if (!msg || !currentUser) return;

          const myUser = (currentUser.username || '').toLowerCase().trim();
          const senderUser = (msg.senderUsername || '').toLowerCase().trim();
          const targetUser = (msg.targetUsername || (msg.targetId ? msg.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();

          // Nếu là tin nhắn cá nhân 1-1: chỉ nhận nếu gửi tới mình hoặc do chính mình gửi
          if (!msg.isGroup) {
            if (targetUser !== myUser && senderUser !== myUser) {
              return; // Bỏ qua tin nhắn không thuộc về tài khoản này
            }
          }

          let targetConversation = null;
          if (msg.isGroup) {
            targetConversation = internalUsers.find(u => u.isGroup);
          } else {
            const partnerUser = (senderUser === myUser) ? targetUser : senderUser;
            targetConversation = internalUsers.find(u => (u.username || '').toLowerCase().trim() === partnerUser);
            if (!targetConversation && partnerUser) {
              const partnerAcc = allSystemUsers.find(a => (a.username || '').toLowerCase().trim() === partnerUser);
              targetConversation = {
                id: "u_" + partnerUser,
                username: partnerUser,
                name: (partnerAcc ? partnerAcc.fullName : (senderUser === partnerUser ? msg.senderName : partnerUser)),
                title: (partnerAcc ? partnerAcc.role : "Thành viên nội bộ"),
                dept: (partnerAcc ? partnerAcc.dept : "Phòng Ban"),
                avatar: (partnerAcc ? partnerAcc.avatar : `https://api.dicebear.com/7.x/bottts/svg?seed=${partnerUser}`),
                status: (partnerAcc && partnerAcc.isOnline) ? "online" : "offline",
                statusText: (partnerAcc && partnerAcc.isOnline) ? "Đang trực tuyến" : "Ngoại tuyến",
                empId: "NV-" + partnerUser.toUpperCase(),
                email: partnerUser + "@chatexcel.lan",
                ipAddress: "Mạng LAN",
                loginTime: "Hôm nay",
                device: "Web Browser",
                unreadCount: 0,
                isGroup: false,
                messages: [],
                sharedImages: [],
                sharedFiles: [],
                sharedLinks: []
              };
              internalUsers.push(targetConversation);
            }
          }

          if (targetConversation) {
            // Tránh trùng tin nhắn
            if (!targetConversation.messages.some(m => m.id === msg.id)) {
              const isMe = (senderUser === myUser);
              const newReceivedMsg = {
                id: msg.id || ('msg_' + Date.now()),
                sender: isMe ? 'me' : (msg.type === "system" ? "system" : "them"),
                senderName: isMe ? currentUser.fullName : (msg.senderName || targetConversation.name || targetConversation.username),
                senderUsername: msg.senderUsername,
                type: msg.type || "text",
                text: msg.text || "",
                fileName: msg.fileName,
                fileSize: msg.fileSize,
                fileExt: msg.fileExt,
                fileUrl: msg.fileUrl,
                imageUrl: msg.imageUrl,
                caption: msg.caption,
                audioUrl: msg.audioUrl,
                duration: msg.duration,
                durationText: msg.durationText,
                time: msg.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                status: "seen",
                replyTo: msg.replyTo || null,
                reactions: (msg.reactions && typeof msg.reactions === 'object') ? msg.reactions : {}
              };
              targetConversation.messages.push(newReceivedMsg);

              // Lưu vào bộ nhớ cục bộ nguyên vẹn không làm sai lệch người nhận
              saveLocalMessage(msg);

              if (msg.type === "image" && msg.imageUrl) {
                targetConversation.sharedImages.unshift({
                  id: "img_" + (msg.id || Date.now()),
                  url: msg.imageUrl,
                  title: msg.caption || "Hình ảnh",
                  date: msg.time || "Vừa xong"
                });
              } else if (msg.type === "file" && msg.fileName) {
                targetConversation.sharedFiles.unshift({
                  id: "file_" + (msg.id || Date.now()),
                  name: msg.fileName,
                  size: msg.fileSize,
                  ext: msg.fileExt,
                  url: msg.fileUrl,
                  date: msg.time || "Vừa xong"
                });
              } else if ((msg.type === "voice" || msg.type === "audio") && msg.audioUrl) {
                targetConversation.sharedFiles.unshift({
                  id: "voice_" + (msg.id || Date.now()),
                  name: msg.fileName || `Ghi âm (${msg.durationText || formatVoiceDuration(msg.duration || 0)})`,
                  size: msg.fileSize || "Tin thoại",
                  ext: "mp3",
                  url: msg.audioUrl,
                  date: msg.time || "Vừa xong"
                });
              }

              if (msg.type === "text" && msg.text) {
                const urlMatches = msg.text.match(/(https?:\/\/[^\s]+)/g);
                if (urlMatches) {
                  urlMatches.forEach(url => {
                    targetConversation.sharedLinks.unshift({ id: "link_" + msg.id, title: url, url: url });
                  });
                }
              }

              const isCurrentlyActive = (currentUserId === targetConversation.id) && (document.visibilityState === 'visible');

              if (isCurrentlyActive) {
                targetConversation.unreadCount = 0;
                setLastReadTime(targetConversation.id, Date.now());
                renderMessages(targetConversation);
                renderRightPanelDetails(targetConversation);
              } else {
                targetConversation.unreadCount = (targetConversation.unreadCount || 0) + 1;
                if (!isMe) {
                  playNotificationChime();
                  const notifText = msg.type === 'voice'
                    ? `[Tin nhắn thoại: ${msg.durationText || 'Âm thanh'}]`
                    : (newReceivedMsg.text || (newReceivedMsg.type === 'image' ? '[Hình ảnh]' : '[Tệp đính kèm]'));
                  showDesktopNotification(newReceivedMsg.senderName, notifText);
                  triggerTabTitleAlert(targetConversation.name || newReceivedMsg.senderName);
                }
              }
              renderUserList();
              updateGlobalUnreadBadge();
              if (!isMe) {
                showToast(msg.type === 'voice' ? `🎙️ Tin nhắn thoại mới từ ${msg.senderName}!` : `📩 Tin nhắn mới từ ${msg.senderName}!`);
              }
            }
          }
        }

        // 1.04 Xử lý biểu cảm phản ứng (Reactions)
        if (type === "message_reaction" && data) {
          const { messageId, reactions } = data;
          for (const u of internalUsers) {
            if (u.messages) {
              const m = u.messages.find(x => x.id === messageId);
              if (m) {
                m.reactions = reactions;
              }
            }
          }
          updateMessageReactionsDOM(messageId, reactions);
          updateLocalMessageReactions(messageId, reactions);
          return;
        }

        // 1.05 Sự kiện đang soạn tin nhắn (Typing Indicator)
        if (type === "user_typing" && data) {
          if (data.from === (currentUser ? currentUser.username : '')) return;

          const activeUser = internalUsers.find(u => u.id === currentUserId);
          if (activeUser) {
            let matchesCurrentChat = false;
            if (data.isGroup && activeUser.isGroup) {
              matchesCurrentChat = true;
            } else if (!data.isGroup && !activeUser.isGroup) {
              const senderClean = (data.from || '').toLowerCase().trim();
              const activeClean = (activeUser.username || '').toLowerCase().trim();
              if (senderClean === activeClean) {
                matchesCurrentChat = true;
              }
            }

            if (matchesCurrentChat) {
              const typingBar = document.getElementById("typingIndicator");
              const typingText = document.getElementById("typingText");
              if (typingBar && typingText) {
                if (data.isTyping) {
                  typingText.innerText = `${data.fromName || "Đối phương"} đang soạn tin...`;
                  typingBar.style.display = "flex";
                  scrollChatToBottom();

                  if (window.typingAutoClearTimeout) clearTimeout(window.typingAutoClearTimeout);
                  window.typingAutoClearTimeout = setTimeout(() => {
                    typingBar.style.display = "none";
                  }, 3800);
                } else {
                  typingBar.style.display = "none";
                  if (window.typingAutoClearTimeout) clearTimeout(window.typingAutoClearTimeout);
                }
              }
            }
          }
        }

        // 1.06 Sự kiện Ghim hoặc Bỏ ghim tin nhắn (Message Pin)
        if (type === "message_pin" && data) {
          const { pinnedMessageId, isGroup, targetUsername, requester } = data;

          for (const u of internalUsers) {
            let matchesConv = false;
            if (isGroup && u.isGroup) {
              matchesConv = true;
            } else if (!isGroup && !u.isGroup) {
              const myU = (currentUser?.username || '').toLowerCase().trim();
              const reqU = (requester || '').toLowerCase().trim();
              const tgtU = (targetUsername || '').toLowerCase().trim();
              const partnerU = (u.username || '').toLowerCase().trim();
              if ((partnerU === tgtU && myU === reqU) || (partnerU === reqU && myU === tgtU)) {
                matchesConv = true;
              }
            }
            if (matchesConv && u.messages) {
              u.messages.forEach(m => {
                m.isPinned = Boolean(pinnedMessageId && m.id === pinnedMessageId);
              });
            }
          }

          const activeUser = internalUsers.find(u => u.id === currentUserId);
          if (activeUser) {
            let isCurrent = false;
            if (isGroup && activeUser.isGroup) isCurrent = true;
            else if (!isGroup && !activeUser.isGroup) {
              const myU = (currentUser?.username || '').toLowerCase().trim();
              const reqU = (requester || '').toLowerCase().trim();
              const tgtU = (targetUsername || '').toLowerCase().trim();
              const partnerU = (activeUser.username || '').toLowerCase().trim();
              if ((partnerU === tgtU && myU === reqU) || (partnerU === reqU && myU === tgtU)) {
                isCurrent = true;
              }
            }
            if (isCurrent) {
              updatePinnedBannerDOM(activeUser);
              renderMessages(activeUser);
            }
          }
          return;
        }

        // 1.1 Sự kiện xóa tin nhắn
        if (type === "messages_cleared" && data) {
          if (data.isGroup) {
            const grp = internalUsers.find(u => u.isGroup);
            if (grp) {
              grp.messages = [];
              grp.sharedImages = [];
              grp.sharedFiles = [];
              grp.sharedLinks = [];
              if (currentUserId === grp.id) {
                renderMessages(grp);
                renderRightPanelDetails(grp);
              }
              renderUserList();
            }
            clearLocalMessages("", true);
          }
        }

        // 2. Tín hiệu cuộc gọi giữa các máy
        if (type === "call_signal" && data) {
          // Bỏ qua nếu là tín hiệu từ chính tài khoản của mình
          if (data.from === currentUser.username) return;

          const myUser = (currentUser.username || "").toLowerCase().trim();
          const myFullName = (currentUser.fullName || "").toLowerCase().trim();
          const targetTo = (data.to || "").toLowerCase().trim();
          const targetToName = (data.toName || "").toLowerCase().trim();

          // Kiểm tra xem cuộc gọi có phải gọi đến mình không
          const isForMe = !targetTo ||
            targetTo === myUser ||
            targetTo === myFullName ||
            targetToName === myFullName ||
            targetToName === myUser ||
            (targetTo && myFullName.includes(targetTo)) ||
            (myFullName && targetTo.includes(myFullName));

          if (isForMe) {
            if (data.type === "invite") {
              handleIncomingCall(data);
            } else if (data.type === "answer") {
              // Máy bên kia ĐÃ BẤM TRẢ LỜI -> Thiết lập WebRTC Remote Description & Bắt đầu đàm thoại!
              if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
              if (activeCall.pc && data.answer) {
                activeCall.pc.setRemoteDescription(new RTCSessionDescription(data.answer))
                  .then(() => {
                    if (activeCall.pendingCandidates && activeCall.pendingCandidates.length > 0) {
                      for (const cand of activeCall.pendingCandidates) {
                        try { activeCall.pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
                      }
                      activeCall.pendingCandidates = [];
                    }
                  })
                  .catch(e => console.error("Lỗi setRemoteDescription answer:", e));
              }
              connectCallSession();
              showToast(`✅ ${data.fromName || "Đối phương"} đã nhấc máy!`);
            } else if (data.type === "candidate" && data.candidate) {
              // Nhận ICE Candidate để thông mạng đàm thoại
              if (activeCall.pc && activeCall.pc.remoteDescription && activeCall.pc.remoteDescription.type) {
                activeCall.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
              } else {
                if (!activeCall.pendingCandidates) activeCall.pendingCandidates = [];
                activeCall.pendingCandidates.push(data.candidate);
              }
            } else if (data.type === "reject") {
              if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
              endCall();
              showToast(`❌ ${data.fromName || "Đối phương"} đã từ chối cuộc gọi.`);
            } else if (data.type === "end") {
              endCall();
            }
          }
        }

        // 3. Người dùng cập nhật online / offline (cập nhật nhẹ nhàng, không phá hủy danh bạ)
        if (type === "users_online_update" && Array.isArray(data)) {
          const onlineSet = new Set(data.map(u => (u || '').toLowerCase().trim()));
          let hasStatusChanged = false;

          internalUsers.forEach(u => {
            if (!u.isGroup && u.username) {
              const isOnline = onlineSet.has(u.username.toLowerCase().trim());
              const newStatus = isOnline ? "online" : "offline";
              if (u.status !== newStatus) {
                u.status = newStatus;
                u.statusText = isOnline ? "Đang trực tuyến" : "Ngoại tuyến";
                hasStatusChanged = true;
              }
            }
          });

          if (hasStatusChanged) {
            renderUserList();
            if (currentUserId) {
              const cur = internalUsers.find(u => u.id === currentUserId);
              if (cur) renderMiddleChatHeader(cur);
            }
          }
          updateLiveStats();
        }

        // 3.1 Có người mới đăng ký hoặc cập nhật thông tin hồ sơ
        if (type === "new_user_registered" || type === "profile_updated") {
          loadUsersAndSync(false); // false để không kết nối lại SSE, tránh lặp
        }

        // 4. Nhóm chat cập nhật thành viên, vai trò, quyền hạn hoặc avatar
        if (type === "group_updated" && data) {
          currentGroupData = data;
          const myUsername = currentUser ? currentUser.username : "";
          const isMemberNow = Array.isArray(data.members) && data.members.includes(myUsername);
          const hadGroup = internalUsers.some(u => u.isGroup);

          if (isMemberNow && !hadGroup) {
            // Người dùng vừa được Trưởng/Phó nhóm thêm vào nhóm!
            buildUserListFromAccounts(allSystemUsers, data);
            showToast("🎉 Bạn vừa được thêm vào Nhóm Chat Chung Nội Bộ!");
            return;
          } else if (!isMemberNow && hadGroup) {
            // Người dùng vừa bị xóa khỏi nhóm!
            internalUsers = internalUsers.filter(u => !u.isGroup);
            renderUserList();
            if (currentUserId === 'grp_all') {
              if (internalUsers.length > 0) {
                selectUser(internalUsers[0].id);
              } else {
                currentUserId = null;
              }
            }
            showToast("🚪 Bạn không còn là thành viên của Nhóm Chat Chung.");
            return;
          }

          const grp = internalUsers.find(u => u.isGroup);
          if (grp) {
            grp.name = data.name;
            grp.avatar = data.avatar;
          }
          renderUserList();
          if (currentUserId === 'grp_all' || (grp && currentUserId === grp.id)) {
            renderMiddleChatHeader(grp);
            renderRightPanelDetails(grp);
            renderGroupMembers();
            renderGroupAdminControls();
            checkGroupChatLockStatus();
          }
        }

      } catch (err) {
        console.error("Lỗi đọc gói tin realtime:", err);
      }
    };
  } catch (err) {
    console.log("Realtime không khả dụng:", err);
  }
}

// ==========================================
// 13. CÁC HÀM TIỆN ÍCH
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("chatexcel_theme") || "theme-light";
  document.body.className = savedTheme;
  const icon = document.querySelector("#themeToggleBtn i");
  if (icon) icon.className = savedTheme === "theme-dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";

  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("theme-dark");
    const newTheme = isDark ? "theme-light" : "theme-dark";
    document.body.className = newTheme;
    localStorage.setItem("chatexcel_theme", newTheme);
    if (icon) icon.className = newTheme === "theme-dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    showToast(newTheme === "theme-dark" ? "Giao diện Tối" : "Giao diện Sáng");
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const ext = file.name.split('.').pop().toLowerCase();
  const formattedSize = formatFileSize(file.size);

  const reader = new FileReader();
  reader.onload = (e) => {
    pendingAttachment = {
      file: file,
      type: isImage ? "image" : "file",
      url: e.target.result,
      name: file.name,
      size: formattedSize,
      ext: getExtCategory(ext)
    };
    showAttachmentPreview(pendingAttachment);
  };
  reader.readAsDataURL(file);
}

function showAttachmentPreview(att) {
  const bar = document.getElementById("attachmentPreviewBar");
  const thumb = document.getElementById("previewThumb");
  const nameEl = document.getElementById("previewFilename");
  const sizeEl = document.getElementById("previewFilesize");

  if (!bar || !thumb || !nameEl || !sizeEl) return;
  nameEl.innerText = att.name;
  sizeEl.innerText = att.size;

  if (att.type === "image") {
    thumb.innerHTML = `<img src="${att.url}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px;">`;
  } else {
    thumb.innerHTML = `<i class="${getFileIconClass(att.ext)}"></i>`;
  }
  bar.style.display = "block";
  document.getElementById("messageInput")?.focus();
}

function clearAttachment() {
  pendingAttachment = null;
  const bar = document.getElementById("attachmentPreviewBar");
  if (bar) bar.style.display = "none";
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
}

function getExtCategory(ext) {
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'word';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  return 'doc';
}

function getFileIconClass(category) {
  switch (category) {
    case 'excel': return 'fa-solid fa-file-excel file-icon-excel';
    case 'pdf': return 'fa-solid fa-file-pdf file-icon-pdf';
    case 'word': return 'fa-solid fa-file-word file-icon-word';
    case 'zip': return 'fa-solid fa-file-zipper file-icon-zip';
    default: return 'fa-solid fa-file-lines file-icon-doc';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function formatMessageText(text) {
  if (!text) return "";
  let escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  escaped = escaped.replace(urlRegex, url => `<a href="${url}" target="_blank" style="color: inherit; text-decoration: underline;">${url}</a>`);
  return escaped.replace(/\n/g, "<br>");
}

function openLightbox(url, caption) {
  const modal = document.getElementById("lightboxModal");
  const img = document.getElementById("lightboxImg");
  const cap = document.getElementById("lightboxCaption");
  const dwn = document.getElementById("lightboxDownloadBtn");

  if (modal && img) {
    img.src = url;
    if (cap) cap.innerText = caption || "Hình ảnh chia sẻ";
    if (dwn) {
      dwn.href = url;
      dwn.download = "anh_dinh_kem.jpg";
    }
    modal.style.display = "flex";
  }
}

function closeLightbox() {
  const modal = document.getElementById("lightboxModal");
  if (modal) {
    modal.style.display = "none";
    const img = document.getElementById("lightboxImg");
    if (img) img.src = "";
  }
}

function showToast(message) {
  const toast = document.getElementById("toastNotification");
  const msg = document.getElementById("toastMessage");
  if (toast && msg) {
    msg.innerText = message;
    toast.style.display = "flex";
    setTimeout(() => { toast.style.display = "none"; }, 2800);
  }
}

// Xử lý dán ảnh từ bộ nhớ tạm (Clipboard / Ảnh chụp màn hình qua Ctrl + V)
function handleClipboardPaste(e) {
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  // Nếu người dùng đang thao tác trong ô tìm kiếm hoặc modal thì không chặn
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.id === "searchInput" || activeEl.closest(".modal-overlay") || activeEl.closest(".lightbox-modal"))) {
    return;
  }

  const items = clipboardData.items;
  let imageFile = null;

  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          imageFile = blob;
          break;
        }
      }
    }
  }

  // Dự phòng kiểm tra clipboardData.files
  if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const f = clipboardData.files[i];
      if (f.type && f.type.startsWith("image/")) {
        imageFile = f;
        break;
      }
    }
  }

  // Nếu tìm thấy hình ảnh (ví dụ: vừa nhấn PrintScreen / Snipping Tool / Ctrl+V ảnh)
  if (imageFile) {
    e.preventDefault(); // Ngăn trình duyệt dán chuỗi nhị phân hoặc hành vi mặc định

    // Tạo tên file ý nghĩa kèm mốc thời gian
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    let ext = "png";
    if (imageFile.type === "image/jpeg") ext = "jpg";
    else if (imageFile.type === "image/webp") ext = "webp";

    const customName = `Screenshot_${dateStr}_${timeStr}.${ext}`;
    const normalizedFile = new File([imageFile], customName, { type: imageFile.type || "image/png" });
    const formattedSize = formatFileSize(normalizedFile.size);

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingAttachment = {
        file: normalizedFile,
        type: "image",
        url: event.target.result,
        name: customName,
        size: formattedSize,
        ext: ext
      };
      showAttachmentPreview(pendingAttachment);
      showToast("📷 Đã dán ảnh chụp màn hình! Nhấn Enter hoặc nút Gửi để gửi");

      const msgInput = document.getElementById("messageInput");
      if (msgInput) {
        msgInput.focus();
      }
    };
    reader.readAsDataURL(normalizedFile);
  }
}

function setupEventListeners() {
  const btnSend = document.getElementById("btnSendMessage");
  const input = document.getElementById("messageInput");

  if (btnSend) btnSend.addEventListener("click", sendMessage);

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = (this.scrollHeight) + "px";
      handleTypingInput();
    });

    // Bắt sự kiện Ctrl + V dán ảnh trực tiếp trong ô gõ tin nhắn
    input.addEventListener("paste", handleClipboardPaste);
  }

  // Bắt cả sự kiện Ctrl + V khi người dùng chụp ảnh xong bấm dán trong khung chat
  window.addEventListener("paste", (e) => {
    if (e.target !== input) {
      handleClipboardPaste(e);
    }
  });

  // Các nút điều khiển ghi âm giọng nói trực tiếp
  document.getElementById("btnVoiceMsg")?.addEventListener("click", startVoiceRecording);
  document.getElementById("btnCancelVoiceRecording")?.addEventListener("click", cancelVoiceRecording);
  document.getElementById("btnSendVoiceRecording")?.addEventListener("click", sendVoiceRecording);

  // Nhận diện giọng nói thành văn bản (Voice Dictation / Speech-to-Text)
  document.getElementById("btnVoiceDictation")?.addEventListener("click", toggleVoiceDictation);
  document.getElementById("btnStopDictation")?.addEventListener("click", stopVoiceDictation);

  // Thanh thông báo ghim tin nhắn (Pinned Message Banner)
  document.getElementById("pinnedBannerContent")?.addEventListener("click", () => {
    const bannerContent = document.getElementById("pinnedBannerContent");
    const msgId = bannerContent?.getAttribute("data-msg-id");
    if (msgId) {
      jumpToMessage(msgId);
    }
  });
  document.getElementById("btnClosePin")?.addEventListener("click", (e) => {
    e.stopPropagation();
    unpinMessage();
  });

  const fileInput = document.getElementById("fileInput");
  document.getElementById("btnAttachFile")?.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt";
      fileInput.click();
    }
  });

  document.getElementById("btnAttachImage")?.addEventListener("click", () => {
    if (fileInput) {
      fileInput.accept = "image/*";
      fileInput.click();
    }
  });

  if (fileInput) fileInput.addEventListener("change", handleFileSelect);
  document.getElementById("btnRemoveAttachment")?.addEventListener("click", clearAttachment);

  // Emoji picker
  const btnEmoji = document.getElementById("btnEmoji");
  const emojiPicker = document.getElementById("emojiPicker");
  if (btnEmoji && emojiPicker) {
    btnEmoji.addEventListener("click", (e) => {
      e.stopPropagation();
      emojiPicker.style.display = emojiPicker.style.display === "none" ? "grid" : "none";
    });

    document.querySelectorAll(".emoji-item").forEach(item => {
      item.addEventListener("click", () => {
        if (input) {
          input.value += item.innerText;
          input.focus();
        }
        emojiPicker.style.display = "none";
      });
    });

    document.addEventListener("click", (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== btnEmoji) {
        emojiPicker.style.display = "none";
      }
    });
  }

  // 1. Quản lý Bật/Tắt Cột Phải (Tự động thu gọn khi màn hình nhỏ, ô chat co nhỏ theo khi mở)
  const panelRight = document.getElementById("panelRight");
  const btnToggleRight = document.getElementById("btnToggleRightPanel");
  const btnCloseRight = document.getElementById("btnCloseRightPanel");
  const mobileBackdrop = document.getElementById("mobileBackdrop");
  const panelLeft = document.getElementById("panelLeft");
  const btnToggleLeft = document.getElementById("btnToggleLeftMenu");
  const btnCloseLeft = document.getElementById("btnCloseLeftPanel");

  // Khởi tạo trạng thái mặc định: nếu màn hình nhỏ (<= 1150px) thì mặc định ẩn cột phải
  if (window.innerWidth <= 1150) {
    panelRight?.classList.add("collapsed");
    btnToggleRight?.classList.remove("active-toggle");
  } else {
    panelRight?.classList.remove("collapsed");
    btnToggleRight?.classList.add("active-toggle");
  }

  // Lắng nghe khi người dùng co nhỏ cửa sổ trình duyệt
  let lastWinWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    const curWidth = window.innerWidth;
    if (curWidth <= 1150 && lastWinWidth > 1150) {
      // Khi thu nhỏ màn hình xuống <= 1150px, mặc định ẩn menu phải nếu không được người dùng ghim mở
      if (!panelRight?.dataset.userOpened) {
        panelRight?.classList.add("collapsed");
        btnToggleRight?.classList.remove("active-toggle");
      }
    } else if (curWidth > 1150 && lastWinWidth <= 1150) {
      panelRight?.classList.remove("collapsed");
      btnToggleRight?.classList.add("active-toggle");
    }
    lastWinWidth = curWidth;
  });

  btnToggleRight?.addEventListener("click", () => {
    const isCollapsed = panelRight?.classList.toggle("collapsed");
    btnToggleRight?.classList.toggle("active-toggle", !isCollapsed);

    if (!isCollapsed) {
      panelRight.dataset.userOpened = "true";
      // Khi mở menu phải trên màn hình hẹp (<= 880px), tự động thu gọn menu trái để nhường không gian cho ô chat co nhỏ theo
      if (window.innerWidth <= 880 && panelLeft && !panelLeft.classList.contains("collapsed")) {
        panelLeft.classList.add("collapsed");
        btnToggleLeft?.classList.remove("active-toggle");
      }
    } else {
      delete panelRight?.dataset.userOpened;
    }

    if (window.innerWidth <= 640) {
      if (!isCollapsed) {
        mobileBackdrop?.classList.add("active");
        panelLeft?.classList.remove("open");
        btnToggleLeft?.classList.remove("active-toggle");
      } else {
        mobileBackdrop?.classList.remove("active");
      }
    }
  });

  btnCloseRight?.addEventListener("click", () => {
    panelRight?.classList.add("collapsed");
    btnToggleRight?.classList.remove("active-toggle");
    delete panelRight?.dataset.userOpened;
    if (window.innerWidth <= 640) {
      mobileBackdrop?.classList.remove("active");
    }
  });

  // 2. Quản lý Bật/Tắt Cột Trái (Desktop: thu gọn | Mobile: trượt Drawer)
  function toggleLeftSidebar() {
    if (window.innerWidth <= 640) {
      const isOpen = panelLeft?.classList.toggle("open");
      if (isOpen) {
        mobileBackdrop?.classList.add("active");
        btnToggleLeft?.classList.add("active-toggle");
        panelRight?.classList.add("collapsed");
        btnToggleRight?.classList.remove("active-toggle");
      } else {
        mobileBackdrop?.classList.remove("active");
        btnToggleLeft?.classList.remove("active-toggle");
      }
    } else {
      const isCollapsed = panelLeft?.classList.toggle("collapsed");
      btnToggleLeft?.classList.toggle("active-toggle", !isCollapsed);
      try {
        localStorage.setItem("chatexcel_left_collapsed", isCollapsed ? "1" : "0");
      } catch (e) {}
    }
  }

  function closeLeftSidebar() {
    if (window.innerWidth <= 640) {
      panelLeft?.classList.remove("open");
      mobileBackdrop?.classList.remove("active");
      btnToggleLeft?.classList.remove("active-toggle");
    } else {
      panelLeft?.classList.add("collapsed");
      btnToggleLeft?.classList.remove("active-toggle");
      try {
        localStorage.setItem("chatexcel_left_collapsed", "1");
      } catch (e) {}
    }
  }

  btnToggleLeft?.addEventListener("click", toggleLeftSidebar);
  btnCloseLeft?.addEventListener("click", closeLeftSidebar);

  // Nhấn vào Backdrop trên mobile để đóng toàn bộ menu
  mobileBackdrop?.addEventListener("click", () => {
    panelLeft?.classList.remove("open");
    panelRight?.classList.add("collapsed");
    mobileBackdrop?.classList.remove("active");
    btnToggleLeft?.classList.remove("active-toggle");
    btnToggleRight?.classList.remove("active-toggle");
    delete panelRight?.dataset.userOpened;
  });

  // Phục hồi trạng thái Menu Trái trên Desktop từ LocalStorage
  if (window.innerWidth > 640) {
    try {
      const isLeftCollapsed = localStorage.getItem("chatexcel_left_collapsed") === "1";
      if (isLeftCollapsed) {
        panelLeft?.classList.add("collapsed");
        btnToggleLeft?.classList.remove("active-toggle");
      } else {
        panelLeft?.classList.remove("collapsed");
        btnToggleLeft?.classList.add("active-toggle");
      }
    } catch (e) {}
  }

  // Tabs cột phải
  document.querySelectorAll(".media-tab-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".media-tab-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      const tabType = this.getAttribute("data-tab");
      document.getElementById("tabContentImages").style.display = tabType === "images" ? "block" : "none";
      document.getElementById("tabContentFiles").style.display = tabType === "files" ? "block" : "none";
      document.getElementById("tabContentLinks").style.display = tabType === "links" ? "block" : "none";
    });
  });

  // Bộ lọc
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.getAttribute("data-filter");
      renderUserList();
    });
  });

  // Nút Cuộc trò chuyện mới
  document.getElementById("btnOpenNewChat")?.addEventListener("click", () => {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.focus();
      showToast("💬 Chọn một đồng nghiệp ở danh sách bên dưới để bắt đầu nhắn tin riêng!");
    }
  });

  // Tìm kiếm
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      if (clearSearchBtn) clearSearchBtn.style.display = this.value ? "block" : "none";
      renderUserList();
    });
  }
  if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener("click", function() {
      searchInput.value = "";
      this.style.display = "none";
      renderUserList();
      searchInput.focus();
    });
  }

  // Lightbox - Xem ảnh phóng to: đóng bằng chuột (nút X, overlay mờ, hoặc bấm ra ngoài ảnh)
  document.getElementById("lightboxOverlay")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxCloseBtn")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxModal")?.addEventListener("click", (e) => {
    if (e.target.id === "lightboxModal" || e.target.id === "lightboxOverlay") {
      closeLightbox();
    }
  });

  // Bàn phím Esc (Escape): đóng xem ảnh phóng to hoặc hủy trả lời
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      const cropModal = document.getElementById("avatarCropModal");
      if (cropModal && cropModal.style.display !== "none") {
        closeAvatarCropper();
        e.preventDefault();
        return;
      }
      const modal = document.getElementById("lightboxModal");
      if (modal && modal.style.display !== "none") {
        closeLightbox();
        e.preventDefault();
        return;
      }
      if (replyingToMessage) {
        cancelReply();
        e.preventDefault();
        return;
      }
      document.querySelectorAll(".msg-reaction-picker.show").forEach(p => p.classList.remove("show"));
    }
  });

  // Nút hủy trả lời tin nhắn
  document.getElementById("btnCancelReply")?.addEventListener("click", cancelReply);

  // Đóng bảng chọn cảm xúc khi bấm ra ngoài
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".reaction-btn-wrapper")) {
      document.querySelectorAll(".msg-reaction-picker.show").forEach(p => p.classList.remove("show"));
    }
  });

  // Xóa lịch sử tin nhắn
  document.getElementById("optClearChat")?.addEventListener("click", async () => {
    if (!currentUserId || !currentUser) return;
    const user = internalUsers.find(u => u.id === currentUserId);
    if (!user) return;

    if (user.isGroup) {
      const myRole = getMyGroupRole();
      if (myRole !== "leader" && myRole !== "deputy") {
        showToast("🔒 Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền xóa lịch sử chat của nhóm!");
        return;
      }
    }

    const confirmMsg = user.isGroup
      ? "Bạn có chắc chắn muốn xóa toàn bộ lịch sử tin nhắn của Nhóm Chat Chung?"
      : `Bạn có chắc chắn muốn xóa toàn bộ tin nhắn với ${user.name}?`;

    if (!confirm(confirmMsg)) return;

    try {
      await fetch("/api/messages/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester: currentUser.username,
          targetUsername: user.username || "",
          isGroup: !!user.isGroup
        })
      });

      user.messages = [];
      user.sharedImages = [];
      user.sharedFiles = [];
      user.sharedLinks = [];
      clearLocalMessages(user.username, !!user.isGroup);
      renderMessages(user);
      renderRightPanelDetails(user);
      renderUserList();
      showToast("🗑️ Đã xóa lịch sử tin nhắn thành công!");
    } catch (err) {
      user.messages = [];
      user.sharedImages = [];
      user.sharedFiles = [];
      user.sharedLinks = [];
      clearLocalMessages(user.username, !!user.isGroup);
      renderMessages(user);
      renderRightPanelDetails(user);
      renderUserList();
      showToast("🗑️ Đã xóa tin nhắn trên thiết bị!");
    }
  });

  // Xuất lịch sử tin nhắn (.TXT)
  document.getElementById("optExportHistory")?.addEventListener("click", () => {
    if (!currentUserId || !currentUser) return;
    const user = internalUsers.find(u => u.id === currentUserId);
    if (!user || !user.messages || user.messages.length === 0) {
      showToast("ℹ️ Chưa có tin nhắn nào để xuất!");
      return;
    }

    let textContent = `=== LỊCH SỬ TRÒ CHUYỆN: ${user.name} ===\r\n`;
    textContent += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\r\n`;
    textContent += `Tài khoản: ${currentUser.fullName} (@${currentUser.username})\r\n`;
    textContent += `==========================================\r\n\r\n`;

    user.messages.forEach(m => {
      const time = m.time || "";
      const sender = m.sender === "me" ? currentUser.fullName : (m.senderName || user.name);
      if (m.type === "system") {
        textContent += `[${time}] [HỆ THỐNG] ${m.text}\r\n`;
      } else if (m.type === "image") {
        textContent += `[${time}] ${sender}: [Hình ảnh: ${m.caption || 'Ảnh đính kèm'}]\r\n`;
      } else if (m.type === "file") {
        textContent += `[${time}] ${sender}: [Tệp tin: ${m.fileName} (${m.fileSize || ''})]\r\n`;
      } else {
        textContent += `[${time}] ${sender}: ${m.text}\r\n`;
      }
    });

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich_su_chat_${user.username || 'nhom'}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("📄 Đã xuất lịch sử tin nhắn thành công!");
  });

  // Tìm kiếm tin nhắn trong hội thoại
  document.getElementById("optSearchInChat")?.addEventListener("click", () => {
    const keyword = prompt("Nhập từ khóa cần tìm trong cuộc trò chuyện này:");
    if (!keyword) return;
    const user = internalUsers.find(u => u.id === currentUserId);
    if (!user) return;
    const kw = keyword.toLowerCase().trim();
    const matches = user.messages.filter(m => m.text && m.text.toLowerCase().includes(kw));
    if (matches.length === 0) {
      showToast(`Không tìm thấy tin nhắn nào chứa "${keyword}"`);
    } else {
      showToast(`🔍 Tìm thấy ${matches.length} tin nhắn phù hợp!`);
    }
  });

  // Ghim cuộc trò chuyện
  document.getElementById("optPinChat")?.addEventListener("click", () => {
    if (!currentUserId) return;
    const idx = internalUsers.findIndex(u => u.id === currentUserId);
    if (idx > -1) {
      const item = internalUsers.splice(idx, 1)[0];
      internalUsers.unshift(item);
      renderUserList();
      showToast(`📌 Đã ghim "${item.name}" lên đầu danh sách!`);
    }
  });
}
