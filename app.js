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

// Quản lý Cuộc Gọi (Web Audio + MediaDevices)
let activeCall = {
  active: false,
  partner: null,
  isVideo: false,
  stream: null,
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
  setupGroupManagementEvents();
  setupAuthEvents();
  setupCallingEvents();

  // Kiểm tra phiên đăng nhập đã lưu
  checkExistingSession();
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

  // Tải danh bạ đồng nghiệp & kết nối thời gian thực
  loadUsersAndSync();
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
// 4. TẢI DANH BẠ ĐỒNG NGHIỆP TỪ MÁY CHỦ
// ==========================================
async function loadUsersAndSync() {
  try {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      allSystemUsers = data.users || [];
      if (data.group) {
        currentGroupData = data.group;
      }
      buildUserListFromAccounts(data.users || [], data.group);
    }
  } catch (err) {
    console.log("Chạy chế độ độc lập (offline)");
  }

  // Kết nối Server-Sent Events với username của mình
  initRealtimeSSE();
}

function buildUserListFromAccounts(allAccounts, serverGroup) {
  // Lọc bỏ chính tài khoản của mình ra khỏi danh bạ người chat
  const otherUsers = allAccounts.filter(acc => acc.username !== currentUser?.username);

  const groupInfo = serverGroup || currentGroupData;
  const groupName = groupInfo?.name || "Nhóm Chat Chung Nội Bộ";
  const groupAvatar = groupInfo?.avatar || "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80";

  // Bảo lưu tin nhắn nhóm nếu đã có từ trước
  const existingGroup = internalUsers.find(u => u.isGroup);

  // Cách 2: Chỉ người dùng đã được thêm vào nhóm mới thấy và truy cập được Nhóm Chat Chung
  const isMember = groupInfo && Array.isArray(groupInfo.members) && groupInfo.members.includes(currentUser?.username);

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
    const existing = internalUsers.find(u => u.username === acc.username);
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

  renderUserList();
  if (!currentUserId && internalUsers.length > 0) {
    selectUser(internalUsers[0].id);
  } else if (currentUserId) {
    const activeUser = internalUsers.find(u => u.id === currentUserId);
    if (activeUser) {
      renderMiddleChatHeader(activeUser);
      renderRightPanelDetails(activeUser);
      if (activeUser.isGroup) {
        renderGroupMembers();
        renderGroupAdminControls();
        checkGroupChatLockStatus();
      }
    } else if (internalUsers.length > 0) {
      // Nếu phòng chat trước đó không còn (ví dụ vừa bị gỡ khỏi nhóm), chuyển sang người đầu tiên
      selectUser(internalUsers[0].id);
    }
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
    container.innerHTML = `
      <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
        <i class="fa-solid ${emptyIcon}" style="font-size: 28px; margin-bottom: 8px;"></i>
        <p style="font-size: 13px;">${emptyMsg}</p>
      </div>
    `;
    updateLiveStats();
    return;
  }

  container.innerHTML = filteredUsers.map(user => {
    const lastMsg = user.messages[user.messages.length - 1];
    let lastMsgText = user.isGroup ? "Nhóm chat chung" : "Sẵn sàng nhắn tin & gọi";
    let lastMsgTime = "";

    if (lastMsg) {
      lastMsgTime = lastMsg.time || "";
      if (lastMsg.type === "image") {
        lastMsgText = "📷 [Hình ảnh]";
      } else if (lastMsg.type === "file") {
        lastMsgText = `📎 [Tệp: ${lastMsg.fileName}]`;
      } else {
        lastMsgText = lastMsg.text || "";
      }
    }

    const isActive = user.id === currentUserId ? "active" : "";
    const unreadBadge = user.unreadCount > 0 ? `<span class="user-card-badge">${user.unreadCount}</span>` : "";

    return `
      <div class="user-item-card ${isActive}" onclick="selectUser('${user.id}')" data-id="${user.id}">
        <div class="user-card-avatar">
          <img src="${user.avatar}" alt="${user.name}" class="avatar-img">
          <span class="status-indicator status-${user.status}"></span>
        </div>
        <div class="user-card-info">
          <div class="user-card-top">
            <span class="user-card-name">${escapeHtml(user.name)}</span>
            <span class="user-card-time">${lastMsgTime}</span>
          </div>
          <div class="user-card-sub">
            <span class="user-card-msg">${escapeHtml(lastMsgText)}</span>
            ${unreadBadge}
          </div>
          <div>
            <span class="user-card-dept-tag"><i class="fa-solid fa-briefcase"></i> ${escapeHtml(user.dept)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  updateLiveStats();
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
function selectUser(userId) {
  const user = internalUsers.find(u => u.id === userId);
  if (!user) return;

  currentUserId = userId;
  user.unreadCount = 0;

  document.querySelectorAll(".user-item-card").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-id") === userId);
  });

  renderMiddleChatHeader(user);
  renderMessages(user);
  renderRightPanelDetails(user);

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
      msgInput.placeholder = "Nhập tin nhắn nội bộ... (Nhấn Enter để gửi, Shift+Enter xuống dòng)";
    }
  }

  setTimeout(() => {
    document.getElementById("messageInput")?.focus();
  }, 100);
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
    statusText.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${user.statusText}`;
    statusText.style.color = user.status === "online" ? "var(--status-online)" : "var(--text-muted)";
  }

  if (pinnedBanner) pinnedBanner.style.display = "none";
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
        <h3 class="empty-title">Cuộc trò chuyện trắng</h3>
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
    const senderAvatar = isMe ? currentUser.avatar : user.avatar;

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
    } else {
      contentHtml = `<div class="msg-text">${formatMessageText(msg.text)}</div>`;
    }

    const senderHeader = (!isMe && user.isGroup && msg.senderName)
      ? `<span class="msg-sender-name">${escapeHtml(msg.senderName)}</span>`
      : "";

    html += `
      <div class="message-row ${isMe ? 'sent' : 'received'}">
        <img src="${senderAvatar}" alt="Avatar" class="msg-sender-avatar">
        <div class="msg-bubble-wrap">
          ${senderHeader}
          <div class="msg-bubble">
            ${contentHtml}
            <div class="msg-meta">
              <span>${msg.time || "Vừa xong"}</span>
              ${isMe ? '<i class="fa-solid fa-check seen-check"></i>' : ''}
            </div>
          </div>
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
      msgInput.placeholder = "Nhập tin nhắn nội bộ... (Nhấn Enter để gửi, Shift+Enter xuống dòng)";
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
// 8. GỬI TIN NHẮN (TEXT / FILE / ẢNH)
// ==========================================
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input ? input.value.trim() : "";

  if (!text && !pendingAttachment) return;
  if (!currentUserId || !currentUser) return;

  const user = internalUsers.find(u => u.id === currentUserId);
  if (!user) return;

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
    if (pendingAttachment.type === "image") {
      newMsg = {
        id: "msg_" + Date.now(),
        sender: "me",
        senderName: currentUser.fullName,
        senderUsername: currentUser.username,
        type: "image",
        imageUrl: pendingAttachment.url,
        caption: text || pendingAttachment.name,
        time: timeStr,
        status: "sent"
      };
      user.sharedImages.unshift({
        id: "img_" + Date.now(),
        url: pendingAttachment.url,
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
        fileSize: pendingAttachment.size,
        fileExt: pendingAttachment.ext,
        fileUrl: pendingAttachment.url,
        time: timeStr,
        status: "sent"
      };
      user.sharedFiles.unshift({
        id: "file_" + Date.now(),
        name: pendingAttachment.name,
        size: pendingAttachment.size,
        ext: pendingAttachment.ext,
        url: pendingAttachment.url,
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

  user.messages.push(newMsg);

  if (input) {
    input.value = "";
    input.style.height = "auto";
  }

  renderMessages(user);
  renderUserList();
  renderRightPanelDetails(user);

  // Gửi qua Server API
  fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...newMsg,
      targetId: currentUserId,
      targetUsername: user.username || "",
      isGroup: user.isGroup
    })
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

    const actionBtn = canManage
      ? `<button class="btn-member-action" onclick="openMemberActionPopover(event, '${escapeHtml(m.username)}')" title="Quản lý thành viên">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>`
      : "";

    return `
      <div class="group-member-item">
        <div class="member-left-col">
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
        ${actionBtn}
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
      msgInput.placeholder = "Nhập tin nhắn nội bộ... (Nhấn Enter để gửi, Shift+Enter xuống dòng)";
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
      msgInput.placeholder = "Nhập tin nhắn nội bộ... (Nhấn Enter để gửi, Shift+Enter xuống dòng)";
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

    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        // Nén ảnh về 150x150 JPEG bằng Canvas
        const canvas = document.createElement("canvas");
        canvas.width = 150;
        canvas.height = 150;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 150, 150);
        const compressedData = canvas.toDataURL("image/jpeg", 0.85);

        // Gửi lên server
        fetch("/api/group/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar: compressedData })
        })
        .then(res => res.json())
        .then(data => {
          showToast("✅ Đã cập nhật ảnh đại diện nhóm thành công!");
        })
        .catch(err => {
          showToast("Lỗi gửi ảnh nhóm lên server!");
        });

        fileInput.value = "";
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
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

  // Chọn ảnh avatar từ máy tính (tự động nén tối ưu)
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 150;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          tempNewAvatarData = canvas.toDataURL("image/jpeg", 0.85);
          if (previewImg) previewImg.src = tempNewAvatarData;
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
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
  btnVoiceCall?.addEventListener("click", () => startCall(false));
  btnVideoCall?.addEventListener("click", () => startCall(true));
  btnQuickCall?.addEventListener("click", () => startCall(false));

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
}

// Bắt đầu cuộc gọi đi
async function startCall(isVideo) {
  if (!currentUserId) {
    showToast("Vui lòng chọn một người để gọi!");
    return;
  }
  const partner = internalUsers.find(u => u.id === currentUserId);
  if (!partner) return;

  if (partner.isGroup) {
    showToast("Cuộc gọi nhóm sẽ có trong phiên bản tới.");
    return;
  }

  activeCall.active = true;
  activeCall.partner = partner;
  activeCall.isVideo = isVideo;

  // Mở giao diện cuộc gọi ngay lập tức
  openCallModal(partner, isVideo);

  // Thử bật camera/mic nếu trình duyệt hỗ trợ (không bao giờ bắt máy ảo hay báo lỗi)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const constraints = {
        audio: true,
        video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeCall.stream = stream;

      const localVideo = document.getElementById("callLocalVideo");
      const avatarStage = document.getElementById("callAvatarStage");

      if (isVideo && localVideo) {
        localVideo.srcObject = stream;
        localVideo.style.display = "block";
        if (avatarStage) avatarStage.style.display = "none";
      }
    } catch (err) {
      // Không có camera hoặc đang truy cập qua IP thường: Tự động chạy chế độ thoại đàm thoại mượt mà
    }
  }

  // Phát tiếng chuông reo
  playOutgoingRing();

  // Gửi tín hiệu gọi qua máy chủ server (gửi cả username và họ tên đối phương)
  sendCallSignal({
    type: 'invite',
    from: currentUser.username,
    fromName: currentUser.fullName,
    fromAvatar: currentUser.avatar,
    to: partner.username || partner.name,
    toName: partner.name,
    isVideo: isVideo
  });

  // Đang chờ đối phương nhấc máy (tối đa 40 giây)
  if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
  activeCall.ringTimeout = setTimeout(() => {
    if (activeCall.active && !activeCall.connected) {
      endCall();
      showToast("Đối phương không trả lời cuộc gọi.");
    }
  }, 40000);
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

  const waves = document.getElementById("callVoiceWaves");
  if (waves) waves.style.display = "none";

  if (activeCall.partner && currentUser) {
    sendCallSignal({
      type: 'end',
      from: currentUser.username,
      to: activeCall.partner.username || activeCall.partner.name
    });
  }

  const modal = document.getElementById("callModal");
  if (modal) modal.style.display = "none";

  const localVideo = document.getElementById("callLocalVideo");
  if (localVideo) localVideo.srcObject = null;

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
  const partnerUser = internalUsers.find(u => u.username === signal.from) || {
    id: "u_" + signal.from,
    name: signal.fromName || signal.from,
    avatar: signal.fromAvatar,
    username: signal.from
  };

  activeCall.active = true;
  activeCall.partner = partnerUser;
  activeCall.isVideo = signal.isVideo;

  openCallModal(partnerUser, signal.isVideo);

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: signal.isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
      activeCall.stream = stream;
      const localVideo = document.getElementById("callLocalVideo");
      if (signal.isVideo && localVideo) {
        localVideo.srcObject = stream;
        localVideo.style.display = "block";
        document.getElementById("callAvatarStage").style.display = "none";
      }
    } catch (err) {}
  }

  sendCallSignal({
    type: 'answer',
    from: currentUser.username,
    fromName: currentUser.fullName,
    to: signal.from,
    toName: signal.fromName || signal.from
  });

  connectCallSession();
}

// ==========================================
// 11. TẠO ÂM THANH CHUÔNG CUỘC GỌI (WEB AUDIO)
// ==========================================
function playOutgoingRing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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

  try {
    currentEventSource = new EventSource(`/api/events?username=${encodeURIComponent(currentUser.username)}`);

    currentEventSource.onmessage = function(event) {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        // 1. Nhận tin nhắn mới
        if (type === "new_message") {
          const msg = data;
          if (msg.senderUsername === currentUser.username) return; // Bỏ qua tin chính mình

          let targetConversation = null;
          if (msg.isGroup) {
            targetConversation = internalUsers.find(u => u.isGroup);
          } else {
            targetConversation = internalUsers.find(u => u.username === msg.senderUsername);
          }

          if (targetConversation) {
            targetConversation.messages.push({
              id: msg.id,
              sender: "them",
              senderName: msg.senderName,
              type: msg.type,
              text: msg.text,
              fileName: msg.fileName,
              fileSize: msg.fileSize,
              fileExt: msg.fileExt,
              imageUrl: msg.imageUrl,
              caption: msg.caption,
              time: msg.time,
              status: "seen"
            });

            if (msg.type === "image" && msg.imageUrl) {
              targetConversation.sharedImages.unshift({
                id: "img_" + Date.now(),
                url: msg.imageUrl,
                title: msg.caption || "Hình ảnh",
                date: "Vừa xong"
              });
            } else if (msg.type === "file" && msg.fileName) {
              targetConversation.sharedFiles.unshift({
                id: "file_" + Date.now(),
                name: msg.fileName,
                size: msg.fileSize,
                ext: msg.fileExt,
                date: "Vừa xong"
              });
            }

            if (currentUserId === targetConversation.id) {
              renderMessages(targetConversation);
              renderRightPanelDetails(targetConversation);
            } else {
              targetConversation.unreadCount = (targetConversation.unreadCount || 0) + 1;
            }
            renderUserList();
            showToast(`📩 Tin nhắn mới từ ${msg.senderName}!`);
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
              // Máy bên kia ĐÃ BẤM TRẢ LỜI -> Máy gọi chính thức kết nối và bắt đầu đếm giây!
              if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
              connectCallSession();
              showToast(`✅ ${data.fromName || "Đối phương"} đã nhấc máy!`);
            } else if (data.type === "reject") {
              if (activeCall.ringTimeout) clearTimeout(activeCall.ringTimeout);
              endCall();
              showToast(`❌ ${data.fromName || "Đối phương"} đã từ chối cuộc gọi.`);
            } else if (data.type === "end") {
              endCall();
            }
          }
        }

        // 3. Người dùng mới đăng ký hoặc cập nhật online
        if (type === "new_user_registered" || type === "profile_updated" || type === "users_online_update") {
          loadUsersAndSync();
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
  document.getElementById("lightboxModal") && (document.getElementById("lightboxModal").style.display = "none");
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
    });
  }

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

  // Toggle Cột Phải
  document.getElementById("btnToggleRightPanel")?.addEventListener("click", () => {
    document.getElementById("panelRight")?.classList.toggle("collapsed");
    document.getElementById("btnToggleRightPanel")?.classList.toggle("active-toggle");
  });
  document.getElementById("btnCloseRightPanel")?.addEventListener("click", () => {
    document.getElementById("panelRight")?.classList.add("collapsed");
    document.getElementById("btnToggleRightPanel")?.classList.remove("active-toggle");
  });

  // Mobile menu
  document.getElementById("btnToggleLeftMenu")?.addEventListener("click", () => {
    document.getElementById("panelLeft")?.classList.toggle("open");
  });

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

  // Lightbox
  document.getElementById("lightboxOverlay")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxCloseBtn")?.addEventListener("click", closeLightbox);
}
