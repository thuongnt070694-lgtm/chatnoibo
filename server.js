/**
 * MÁY CHỦ CHAT NỘI BỘ THỜI GIAN THỰC (REAL-TIME SERVER V2)
 * Hỗ trợ:
 * 1. Đăng ký & Đăng nhập người dùng (Lưu trữ tài khoản)
 * 2. Cập nhật hồ sơ (đổi tên, avatar)
 * 3. Danh sách người dùng online / offline thời gian thực
 * 4. Gửi nhận tin nhắn, hình ảnh, tài liệu
 * 5. Tín hiệu cuộc gọi thoại & video (Call Signaling)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3888;
const DB_FILE = path.join(__dirname, 'accounts_db.json');

// Khởi tạo cơ sở dữ liệu tài khoản
let accounts = [];
try {
  if (fs.existsSync(DB_FILE)) {
    accounts = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  }
} catch (e) {
  console.error("Lỗi đọc cơ sở dữ liệu:", e);
  accounts = [];
}

function saveAccounts() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (e) {
    console.error("Lỗi lưu accounts_db.json:", e);
  }
}

// Khởi tạo thư mục tải lên tệp tin và tin nhắn thoại (uploads)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.error("Lỗi tạo thư mục uploads:", e);
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Khởi tạo cơ sở dữ liệu phòng chat nhóm chung
const GROUP_DB_FILE = path.join(__dirname, 'group_db.json');
let groupInfo = {
  id: "grp_all",
  name: "Nhóm Chat Chung Nội Bộ",
  title: "Phòng Họp Chung",
  dept: "Tất cả thành viên",
  avatar: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80",
  leader: "thuongnt",
  deputies: [],
  members: ["thuongnt", "thuong", "thuongnt2", "dienne"],
  mutedUsers: [],
  onlyAdminsCanChat: false
};

try {
  if (fs.existsSync(GROUP_DB_FILE)) {
    const savedGroup = JSON.parse(fs.readFileSync(GROUP_DB_FILE, 'utf-8'));
    groupInfo = Object.assign(groupInfo, savedGroup);
  }
} catch (e) {
  console.error("Lỗi đọc group_db.json:", e);
}

// Đảm bảo cấu trúc các trường hợp lệ - Nhóm nội bộ chỉ ai được thêm mới được vào nhóm
if (!Array.isArray(groupInfo.members)) {
  groupInfo.members = ["thuongnt", "thuong", "thuongnt2", "dienne"];
}
if (!groupInfo.leader && accounts.length > 0) {
  groupInfo.leader = accounts[0].username;
}
if (groupInfo.leader && !groupInfo.members.includes(groupInfo.leader)) {
  groupInfo.members.unshift(groupInfo.leader);
}
// Đảm bảo các mảng hỗ trợ hợp lệ

if (!Array.isArray(groupInfo.deputies)) groupInfo.deputies = [];
if (!Array.isArray(groupInfo.mutedUsers)) groupInfo.mutedUsers = [];
if (typeof groupInfo.onlyAdminsCanChat !== 'boolean') groupInfo.onlyAdminsCanChat = false;
saveGroupInfo();

function saveGroupInfo() {
  try {
    fs.writeFileSync(GROUP_DB_FILE, JSON.stringify(groupInfo, null, 2), 'utf-8');
  } catch (e) {
    console.error("Lỗi lưu group_db.json:", e);
  }
}

function getEnrichedGroupInfo() {
  if (!Array.isArray(groupInfo.members)) {
    groupInfo.members = [];
  }
  if (!groupInfo.leader && accounts.length > 0) {
    groupInfo.leader = accounts[0].username;
  }
  if (!Array.isArray(groupInfo.deputies)) groupInfo.deputies = [];
  if (!Array.isArray(groupInfo.mutedUsers)) groupInfo.mutedUsers = [];

  const onlineSet = new Set(clients.map(c => c.username));

  const memberDetails = groupInfo.members.map(u => {
    const acc = accounts.find(a => a.username === u);
    let role = "member";
    if (u === groupInfo.leader) role = "leader";
    else if (groupInfo.deputies.includes(u)) role = "deputy";

    return {
      username: u,
      fullName: acc ? acc.fullName : u,
      dept: acc ? acc.dept : "Nội bộ",
      avatar: acc ? acc.avatar : `https://api.dicebear.com/7.x/bottts/svg?seed=${u}`,
      role: role,
      isOnline: onlineSet.has(u),
      isMuted: groupInfo.mutedUsers.includes(u)
    };
  });

  return {
    id: groupInfo.id || "grp_all",
    name: groupInfo.name || "Nhóm Chat Chung Nội Bộ",
    title: groupInfo.title || "Phòng Họp Chung",
    dept: groupInfo.dept || "Tất cả thành viên",
    avatar: groupInfo.avatar || "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80",
    leader: groupInfo.leader,
    deputies: groupInfo.deputies,
    members: groupInfo.members,
    mutedUsers: groupInfo.mutedUsers,
    onlyAdminsCanChat: !!groupInfo.onlyAdminsCanChat,
    pinnedMessage: groupInfo.pinnedMessage || null,
    memberDetails: memberDetails
  };
}

// Lưu trữ các client SSE đang kết nối
let clients = []; // Array of { id, username, res }

// Gửi heartbeat định kỳ 15 giây để duy trì kết nối SSE trên Render / Nginx / Proxy không bị timeout
setInterval(() => {
  clients.forEach(c => {
    try {
      c.res.write(': ping\n\n');
    } catch (e) {}
  });
}, 15000);

// Khởi tạo cơ sở dữ liệu tin nhắn lâu dài
const MESSAGES_DB_FILE = path.join(__dirname, 'messages_db.json');
let messagesHistory = [];
try {
  if (fs.existsSync(MESSAGES_DB_FILE)) {
    messagesHistory = JSON.parse(fs.readFileSync(MESSAGES_DB_FILE, 'utf-8'));
    if (!Array.isArray(messagesHistory)) messagesHistory = [];
  }
} catch (e) {
  console.error("Lỗi đọc messages_db.json:", e);
  messagesHistory = [];
}

function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_DB_FILE, JSON.stringify(messagesHistory, null, 2), 'utf-8');
  } catch (e) {
    console.error("Lỗi lưu messages_db.json:", e);
  }
}

function addMessage(msg) {
  messagesHistory.push(msg);
  if (messagesHistory.length > 3000) messagesHistory.shift();
  saveMessages();
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function broadcastEvent(eventType, data) {
  const payload = `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
  const padded = payload + ':' + ' '.repeat(2048) + '\n\n';
  clients.forEach(c => {
    try {
      c.res.write(padded);
      if (typeof c.res.flush === 'function') c.res.flush();
    } catch (err) {
      // client disconnected
    }
  });
}

function sendToUser(targetUsername, eventType, data) {
  const payload = `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
  const padded = payload + ':' + ' '.repeat(2048) + '\n\n';
  const targetLower = (targetUsername || '').toLowerCase().trim();
  clients.filter(c => (c.username || '').toLowerCase().trim() === targetLower).forEach(c => {
    try {
      c.res.write(padded);
      if (typeof c.res.flush === 'function') c.res.flush();
    } catch (e) {}
  });
}

// Heartbeat ping định kỳ 15 giây để giữ kết nối SSE và ngăn Cloudflare đóng ngắt kết nối
setInterval(() => {
  const pingPayload = ': ping\n\n';
  clients.forEach(c => {
    try {
      c.res.write(pingPayload);
      if (typeof c.res.flush === 'function') c.res.flush();
    } catch (e) {}
  });
}, 15000);

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 0. ENDPOINT HEALTH CHECK / PING (Hỗ trợ client tự động dò tìm máy chủ hoạt động)
  if (pathname === '/api/ping' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'EasyChat', timestamp: Date.now() }));
    return;
  }

  // 1. ENDPOINT SERVER-SENT EVENTS (SSE)
  if (pathname === '/api/events') {
    const username = (url.searchParams.get('username') || '').toLowerCase().trim();
    const clientId = 'c_' + Math.random().toString(36).substring(2, 9);

    if (req.socket && typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const clientObj = { id: clientId, username, res };
    clients.push(clientObj);

    // Gửi ngay 4KB comment padding để Cloudflare Tunnel chuyển tiếp SSE tức thì không bị giữ buffer
    res.write(':' + ' '.repeat(4096) + '\n\n');
    res.write(': connected\n\n');
    if (typeof res.flush === 'function') res.flush();

    // Gửi thông báo danh sách online mới
    broadcastEvent('users_online_update', getOnlineUsers());

    req.on('close', () => {
      clients = clients.filter(c => c.id !== clientId);
      broadcastEvent('users_online_update', getOnlineUsers());
    });
    return;
  }

  // 2. ĐĂNG KÝ TÀI KHOẢN MỚI
  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const username = (data.username || '').trim().toLowerCase();
      const password = (data.password || '').trim();
      const fullName = (data.fullName || '').trim() || username;
      const dept = (data.dept || 'Phòng Nội Bộ').trim();
      const avatar = data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tên tài khoản và mật khẩu không được để trống' }));
        return;
      }

      if (accounts.some(acc => acc.username === username)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tên tài khoản này đã được sử dụng. Vui lòng chọn tên khác!' }));
        return;
      }

      const newAccount = {
        id: 'acc_' + Date.now(),
        username,
        password,
        fullName,
        dept,
        avatar,
        role: 'Thành viên nội bộ',
        createdAt: new Date().toISOString()
      };

      accounts.push(newAccount);
      saveAccounts();

      broadcastEvent('new_user_registered', {
        username: newAccount.username,
        fullName: newAccount.fullName,
        dept: newAccount.dept,
        avatar: newAccount.avatar
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        user: {
          id: newAccount.id,
          username: newAccount.username,
          fullName: newAccount.fullName,
          dept: newAccount.dept,
          avatar: newAccount.avatar,
          role: newAccount.role
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi xử lý đăng ký' }));
    }
    return;
  }

  // 3. ĐĂNG NHẬP
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const username = (data.username || '').trim().toLowerCase();
      const password = (data.password || '').trim();

      const user = accounts.find(acc => acc.username === username && acc.password === password);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          dept: user.dept,
          avatar: user.avatar,
          role: user.role
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi đăng nhập' }));
    }
    return;
  }

  // 4. LẤY TẤT CẢ TÀI KHOẢN & TRẠNG THÁI ONLINE
  if (pathname === '/api/users' && req.method === 'GET') {
    const onlineSet = new Set(clients.map(c => (c.username || '').toLowerCase().trim()));
    const allUsersMap = new Map();

    accounts.forEach(acc => {
      const u = (acc.username || '').toLowerCase().trim();
      if (u) {
        allUsersMap.set(u, {
          id: acc.id || ('acc_' + u),
          username: u,
          fullName: acc.fullName || u,
          dept: acc.dept || 'Phòng Nội Bộ',
          avatar: acc.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u}`,
          role: acc.role || 'Thành viên nội bộ',
          isOnline: onlineSet.has(u)
        });
      }
    });

    clients.forEach(c => {
      const u = (c.username || '').toLowerCase().trim();
      if (u && !allUsersMap.has(u)) {
        allUsersMap.set(u, {
          id: 'acc_' + u,
          username: u,
          fullName: u.charAt(0).toUpperCase() + u.slice(1),
          dept: 'Phòng Nội Bộ',
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${u}`,
          role: 'Thành viên nội bộ',
          isOnline: true
        });
      }
    });

    messagesHistory.forEach(m => {
      [m.senderUsername, m.targetUsername].forEach(u => {
        const clean = (u || '').toLowerCase().trim();
        if (clean && clean !== 'system' && !allUsersMap.has(clean)) {
          allUsersMap.set(clean, {
            id: 'acc_' + clean,
            username: clean,
            fullName: clean.charAt(0).toUpperCase() + clean.slice(1),
            dept: 'Phòng Nội Bộ',
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${clean}`,
            role: 'Thành viên nội bộ',
            isOnline: onlineSet.has(clean)
          });
        }
      });
    });

    const userList = Array.from(allUsersMap.values());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ users: userList, group: getEnrichedGroupInfo() }));
    return;
  }

  // 4.1 LẤY THÔNG TIN PHÒNG CHAT NHÓM
  if (pathname === '/api/group' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ group: getEnrichedGroupInfo() }));
    return;
  }

  // 4.2 CẬP NHẬT ẢNH HOẶC TÊN NHÓM
  if (pathname === '/api/group/update' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      if (data.avatar) groupInfo.avatar = data.avatar;
      if (data.name) groupInfo.name = data.name.trim();

      saveGroupInfo();
      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi cập nhật thông tin nhóm' }));
    }
    return;
  }

  // 4.3 THÊM THÀNH VIÊN VÀO NHÓM
  if (pathname === '/api/group/add-member' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const username = (data.username || '').trim().toLowerCase();

      if (!username) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Thiếu tên tài khoản cần thêm' }));
        return;
      }

      if (!groupInfo.members.includes(username)) {
        groupInfo.members.push(username);
        saveGroupInfo();

        const enriched = getEnrichedGroupInfo();
        broadcastEvent('group_updated', enriched);

        const addedAcc = accounts.find(a => a.username === username);
        const reqAcc = accounts.find(a => a.username === requester);
        const sysMsg = {
          id: 'sys_' + Date.now(),
          sender: 'system',
          senderUsername: 'system',
          senderName: 'Hệ thống',
          isGroup: true,
          type: 'system',
          text: `🔔 ${reqAcc ? reqAcc.fullName : requester} đã thêm ${addedAcc ? addedAcc.fullName : username} vào nhóm.`,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        };
        addMessage(sysMsg);
        broadcastEvent('new_message', sysMsg);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: getEnrichedGroupInfo() }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi thêm thành viên' }));
    }
    return;
  }

  // 4.4 XÓA THÀNH VIÊN KHỎI NHÓM
  if (pathname === '/api/group/remove-member' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const username = (data.username || '').trim().toLowerCase();

      if (username === groupInfo.leader) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Không thể xóa Trưởng nhóm!' }));
        return;
      }

      const isLeader = (requester === groupInfo.leader);
      const isDeputy = groupInfo.deputies.includes(requester);
      const isTargetDeputy = groupInfo.deputies.includes(username);

      if (!isLeader && !isDeputy) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền xóa thành viên!' }));
        return;
      }

      if (isDeputy && isTargetDeputy) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Phó nhóm không thể xóa Phó nhóm khác!' }));
        return;
      }

      groupInfo.members = groupInfo.members.filter(u => u !== username);
      groupInfo.deputies = groupInfo.deputies.filter(u => u !== username);
      groupInfo.mutedUsers = groupInfo.mutedUsers.filter(u => u !== username);
      saveGroupInfo();

      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      const removedAcc = accounts.find(a => a.username === username);
      const reqAcc = accounts.find(a => a.username === requester);
      const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        senderUsername: 'system',
        senderName: 'Hệ thống',
        isGroup: true,
        type: 'system',
        text: `🚪 ${reqAcc ? reqAcc.fullName : requester} đã xóa ${removedAcc ? removedAcc.fullName : username} khỏi nhóm.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      addMessage(sysMsg);
      broadcastEvent('new_message', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi xóa thành viên' }));
    }
    return;
  }

  // 4.5 CHUYỂN GIAO QUYỀN TRƯỞNG NHÓM
  if (pathname === '/api/group/transfer-leader' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const newLeader = (data.newLeader || '').trim().toLowerCase();

      if (requester !== groupInfo.leader) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm hiện tại mới có quyền chuyển giao Trưởng nhóm!' }));
        return;
      }

      if (!groupInfo.members.includes(newLeader)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Người nhận phải là thành viên trong nhóm!' }));
        return;
      }

      groupInfo.leader = newLeader;
      groupInfo.deputies = groupInfo.deputies.filter(u => u !== newLeader);
      if (!groupInfo.deputies.includes(requester)) {
        groupInfo.deputies.push(requester); // Trưởng nhóm cũ thành Phó nhóm
      }
      saveGroupInfo();

      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      const oldLeadAcc = accounts.find(a => a.username === requester);
      const newLeadAcc = accounts.find(a => a.username === newLeader);
      const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        senderUsername: 'system',
        senderName: 'Hệ thống',
        isGroup: true,
        type: 'system',
        text: `👑 ${oldLeadAcc ? oldLeadAcc.fullName : requester} đã chuyển giao quyền Trưởng nhóm cho ${newLeadAcc ? newLeadAcc.fullName : newLeader}.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      addMessage(sysMsg);
      broadcastEvent('new_message', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi chuyển giao quyền trưởng nhóm' }));
    }
    return;
  }

  // 4.6 BỔ NHIỆM HOẶC HỦY PHÓ NHÓM
  if (pathname === '/api/group/set-deputy' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const username = (data.username || '').trim().toLowerCase();
      const isDeputy = !!data.isDeputy;

      if (requester !== groupInfo.leader) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm mới có quyền bổ nhiệm hoặc hủy quyền Phó nhóm!' }));
        return;
      }

      if (username === groupInfo.leader) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Trưởng nhóm không thể làm Phó nhóm của chính mình!' }));
        return;
      }

      if (isDeputy) {
        if (!groupInfo.deputies.includes(username)) groupInfo.deputies.push(username);
      } else {
        groupInfo.deputies = groupInfo.deputies.filter(u => u !== username);
      }
      saveGroupInfo();

      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      const leadAcc = accounts.find(a => a.username === requester);
      const targetAcc = accounts.find(a => a.username === username);
      const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        senderUsername: 'system',
        senderName: 'Hệ thống',
        isGroup: true,
        type: 'system',
        text: isDeputy
          ? `⭐ ${leadAcc ? leadAcc.fullName : requester} đã bổ nhiệm ${targetAcc ? targetAcc.fullName : username} làm Phó nhóm.`
          : `ℹ️ ${leadAcc ? leadAcc.fullName : requester} đã hủy quyền Phó nhóm của ${targetAcc ? targetAcc.fullName : username}.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      addMessage(sysMsg);
      broadcastEvent('new_message', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi cập nhật phó nhóm' }));
    }
    return;
  }

  // 4.7 CẤM CHAT HOẶC GỠ CẤM CHAT THÀNH VIÊN
  if (pathname === '/api/group/mute-member' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const username = (data.username || '').trim().toLowerCase();
      const isMuted = !!data.isMuted;

      const isLeader = (requester === groupInfo.leader);
      const isDeputy = groupInfo.deputies.includes(requester);
      const isTargetLeader = (username === groupInfo.leader);
      const isTargetDeputy = groupInfo.deputies.includes(username);

      if (!isLeader && !isDeputy) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền cấm chat thành viên!' }));
        return;
      }

      if (isTargetLeader) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Không thể cấm chat Trưởng nhóm!' }));
        return;
      }

      if (isDeputy && isTargetDeputy) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Phó nhóm không thể cấm chat Phó nhóm khác!' }));
        return;
      }

      if (isMuted) {
        if (!groupInfo.mutedUsers.includes(username)) groupInfo.mutedUsers.push(username);
      } else {
        groupInfo.mutedUsers = groupInfo.mutedUsers.filter(u => u !== username);
      }
      saveGroupInfo();

      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      const reqAcc = accounts.find(a => a.username === requester);
      const targetAcc = accounts.find(a => a.username === username);
      const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        senderUsername: 'system',
        senderName: 'Hệ thống',
        isGroup: true,
        type: 'system',
        text: isMuted
          ? `🔇 ${reqAcc ? reqAcc.fullName : requester} đã cấm chat đối với ${targetAcc ? targetAcc.fullName : username}.`
          : `🔊 ${reqAcc ? reqAcc.fullName : requester} đã gỡ cấm chat cho ${targetAcc ? targetAcc.fullName : username}.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      addMessage(sysMsg);
      broadcastEvent('new_message', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi thay đổi trạng thái cấm chat' }));
    }
    return;
  }

  // 4.8 BẬT/TẮT CHẾ ĐỘ CHỈ TRƯỞNG & PHÓ NHÓM ĐƯỢC CHAT
  if (pathname === '/api/group/set-chat-mode' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').trim().toLowerCase();
      const onlyAdmins = !!data.onlyAdminsCanChat;

      const isLeader = (requester === groupInfo.leader);
      const isDeputy = groupInfo.deputies.includes(requester);

      if (!isLeader && !isDeputy) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm hoặc Phó nhóm mới có quyền đổi chế độ chat!' }));
        return;
      }

      groupInfo.onlyAdminsCanChat = onlyAdmins;
      saveGroupInfo();

      const enriched = getEnrichedGroupInfo();
      broadcastEvent('group_updated', enriched);

      const reqAcc = accounts.find(a => a.username === requester);
      const sysMsg = {
        id: 'sys_' + Date.now(),
        sender: 'system',
        senderUsername: 'system',
        senderName: 'Hệ thống',
        isGroup: true,
        type: 'system',
        text: onlyAdmins
          ? `🔒 ${reqAcc ? reqAcc.fullName : requester} đã BẬT chế độ "Chỉ Trưởng & Phó nhóm được gửi tin nhắn".`
          : `🔓 ${reqAcc ? reqAcc.fullName : requester} đã MỞ chế độ chat cho toàn bộ thành viên trong nhóm.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      addMessage(sysMsg);
      broadcastEvent('new_message', sysMsg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', group: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi đổi chế độ chat nhóm' }));
    }
    return;
  }

  // 5. CẬP NHẬT HỒ SƠ NGƯỜI DÙNG (ĐỔI TÊN, AVATAR, MẬT KHẨU)
  if (pathname === '/api/update-profile' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const username = (data.username || '').trim().toLowerCase();
      let user = accounts.find(acc => acc.username === username);

      if (!user) {
        // Tự động tạo mới tài khoản nếu chưa có trong database
        user = {
          id: 'acc_' + Date.now(),
          username: username || 'user_' + Date.now(),
          fullName: data.fullName || 'Người dùng',
          dept: data.dept || 'Phòng Nội Bộ',
          avatar: data.avatar || '',
          role: 'Thành viên nội bộ',
          createdAt: new Date().toISOString()
        };
        accounts.push(user);
      }

      if (data.fullName) user.fullName = data.fullName.trim();
      if (data.dept) user.dept = data.dept.trim();
      if (data.avatar) user.avatar = data.avatar;
      if (data.newPassword) user.password = data.newPassword.trim();

      saveAccounts();

      broadcastEvent('profile_updated', {
        username: user.username,
        fullName: user.fullName,
        dept: user.dept,
        avatar: user.avatar
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          dept: user.dept,
          avatar: user.avatar,
          role: user.role
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi cập nhật hồ sơ' }));
    }
    return;
  }

  // 6. GỬI TIN NHẮN
  if (pathname === '/api/send' && req.method === 'POST') {
    try {
      const msgData = await parseJsonBody(req);

      if (!msgData.id) {
        msgData.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      }
      if (!msgData.time) {
        const now = new Date();
        msgData.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
      if (!msgData.targetUsername && msgData.targetId) {
        msgData.targetUsername = msgData.targetId.replace(/^u_/, '');
      }

      // Kiểm tra quyền gửi tin nhắn trong nhóm
      if (msgData.isGroup) {
        const sender = (msgData.senderUsername || '').toLowerCase().trim();
        // Kiểm tra xem người gửi có phải là thành viên của nhóm không
        const isMember = Array.isArray(groupInfo.members) && groupInfo.members.map(m => (m || '').toLowerCase().trim()).includes(sender);
        if (!isMember) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Bạn chưa được thêm vào Nhóm nội bộ này!' }));
          return;
        }

        // 1. Kiểm tra có bị cấm chat cá nhân không
        if (groupInfo.mutedUsers && groupInfo.mutedUsers.includes(sender)) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Bạn đã bị cấm chat trong nhóm này bởi Trưởng/Phó nhóm!' }));
          return;
        }

        // 2. Kiểm tra chế độ chỉ Trưởng & Phó nhóm được chat
        if (groupInfo.onlyAdminsCanChat) {
          const isLeader = (sender === groupInfo.leader);
          const isDeputy = groupInfo.deputies && groupInfo.deputies.includes(sender);
          if (!isLeader && !isDeputy) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Chỉ Trưởng nhóm và Phó nhóm mới có quyền gửi tin nhắn lúc này!' }));
            return;
          }
        }
      }

      addMessage(msgData);

      // Phát realtime tới đúng đối tượng:
      if (msgData.isGroup) {
        // Nhóm nội bộ: chỉ phát cho các thành viên trong nhóm
        const groupMemberSet = new Set((groupInfo.members || []).map(m => (m || '').toLowerCase().trim()));
        const payload = `data: ${JSON.stringify({ type: 'new_message', data: msgData })}\n\n`;
        const padded = payload + ':' + ' '.repeat(2048) + '\n\n';
        clients.forEach(c => {
          if (c.username && groupMemberSet.has((c.username || '').toLowerCase().trim())) {
            try { 
              c.res.write(padded);
              if (typeof c.res.flush === 'function') c.res.flush();
            } catch (err) {}
          }
        });
      } else {
        // Tin nhắn riêng 1-1: chỉ phát cho người gửi và người nhận
        const s = (msgData.senderUsername || '').toLowerCase().trim();
        const t = (msgData.targetUsername || (msgData.targetId ? msgData.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();
        const payload = `data: ${JSON.stringify({ type: 'new_message', data: msgData })}\n\n`;
        const padded = payload + ':' + ' '.repeat(2048) + '\n\n';
        clients.forEach(c => {
          const u = (c.username || '').toLowerCase().trim();
          if (u === s || u === t) {
            try { 
              c.res.write(padded);
              if (typeof c.res.flush === 'function') c.res.flush();
            } catch (err) {}
          }
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: msgData }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Dữ liệu không hợp lệ' }));
    }
    return;
  }

  // 6.1 LẤY TOÀN BỘ LỊCH SỬ TIN NHẮN (THEO USERNAME)
  if (pathname === '/api/messages' && req.method === 'GET') {
    const username = (url.searchParams.get('username') || '').toLowerCase().trim();
    const isGroupMember = Array.isArray(groupInfo.members) && groupInfo.members.map(m => (m || '').toLowerCase().trim()).includes(username);

    const userMessages = messagesHistory.filter(m => {
      if (m.isGroup) {
        // Chỉ trả về tin nhắn nhóm nếu tài khoản này là thành viên nhóm
        return isGroupMember;
      }
      const s = (m.senderUsername || '').toLowerCase().trim();
      const t = (m.targetUsername || (m.targetId ? m.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();
      return (s === username || t === username);
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ messages: userMessages }));
    return;
  }

  // 6.1.1 ĐỒNG BỘ TIN NHẮN TỪ CLIENT (PHÒNG TRƯỜNG HỢP SERVER RESTART)
  if (pathname === '/api/messages/sync' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const incomingMsgs = Array.isArray(data.messages) ? data.messages : [];
      let addedCount = 0;
      incomingMsgs.forEach(m => {
        if (m && m.id && !messagesHistory.some(existing => existing.id === m.id)) {
          messagesHistory.push(m);
          addedCount++;
        }
      });
      if (addedCount > 0) {
        if (messagesHistory.length > 5000) {
          messagesHistory = messagesHistory.slice(-5000);
        }
        saveMessages();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', addedCount }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi đồng bộ' }));
    }
    return;
  }

  // 6.1.2 THẢ CẢM XÚC (REACTION) VÀO TIN NHẮN
  if (pathname === '/api/message/react' && req.method === 'POST') {
    try {
      const { messageId, emoji, username, fullName } = await parseJsonBody(req);
      if (!messageId || !emoji || !username) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Thiếu thông tin biểu cảm' }));
        return;
      }

      const targetMsg = messagesHistory.find(m => m.id === messageId);
      if (!targetMsg) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Không tìm thấy tin nhắn' }));
        return;
      }

      if (!targetMsg.reactions || typeof targetMsg.reactions !== 'object') {
        targetMsg.reactions = {};
      }

      const uname = (username || '').toLowerCase().trim();
      const userDisplayName = fullName || uname;

      // Chuẩn hóa reactions: mỗi user chỉ giữ 1 biểu cảm cho 1 tin nhắn
      let alreadyHadThisEmoji = false;
      Object.keys(targetMsg.reactions).forEach(e => {
        if (!Array.isArray(targetMsg.reactions[e])) return;
        const exists = targetMsg.reactions[e].some(u => (typeof u === 'string' ? u : (u.username || '')).toLowerCase() === uname);
        if (exists) {
          if (e === emoji) {
            alreadyHadThisEmoji = true;
          }
          // Gỡ bỏ biểu cảm cũ
          targetMsg.reactions[e] = targetMsg.reactions[e].filter(u => (typeof u === 'string' ? u : (u.username || '')).toLowerCase() !== uname);
          if (targetMsg.reactions[e].length === 0) {
            delete targetMsg.reactions[e];
          }
        }
      });

      // Nếu trước đó chưa thả emoji này -> thêm mới
      if (!alreadyHadThisEmoji) {
        if (!Array.isArray(targetMsg.reactions[emoji])) {
          targetMsg.reactions[emoji] = [];
        }
        targetMsg.reactions[emoji].push({ username: uname, fullName: userDisplayName });
      }

      saveMessages();

      const reactPayload = {
        messageId: targetMsg.id,
        reactions: targetMsg.reactions,
        isGroup: !!targetMsg.isGroup,
        targetUsername: targetMsg.targetUsername,
        senderUsername: targetMsg.senderUsername,
        targetId: targetMsg.targetId
      };

      // Phát realtime qua SSE tới các client liên quan
      if (targetMsg.isGroup) {
        const groupMemberSet = new Set((groupInfo.members || []).map(m => (m || '').toLowerCase().trim()));
        const payloadStr = `data: ${JSON.stringify({ type: 'message_reaction', data: reactPayload })}\n\n`;
        clients.forEach(c => {
          if (c.username && groupMemberSet.has((c.username || '').toLowerCase().trim())) {
            try { c.res.write(payloadStr); } catch (err) {}
          }
        });
      } else {
        const s = (targetMsg.senderUsername || '').toLowerCase().trim();
        const t = (targetMsg.targetUsername || (targetMsg.targetId ? targetMsg.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();
        const payloadStr = `data: ${JSON.stringify({ type: 'message_reaction', data: reactPayload })}\n\n`;
        clients.forEach(c => {
          const u = (c.username || '').toLowerCase().trim();
          if (u === s || u === t) {
            try { c.res.write(payloadStr); } catch (err) {}
          }
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', reactions: targetMsg.reactions }));
    } catch (err) {
      console.error("Lỗi react tin nhắn:", err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi máy chủ' }));
    }
    return;
  }

  // 6.1.3 GHIM HOẶC BỎ GHIM TIN NHẮN (PIN / UNPIN MESSAGE)
  if (pathname === '/api/message/pin' && req.method === 'POST') {
    try {
      const { messageId, isGroup, targetUsername, requester } = await parseJsonBody(req);
      if (!requester) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Thiếu thông tin người yêu cầu' }));
        return;
      }

      const reqUser = (requester || '').toLowerCase().trim();
      const targetUser = (targetUsername || '').toLowerCase().trim();

      const targetMsg = messageId ? messagesHistory.find(m => m.id === messageId) : null;
      let isNowPinned = false;

      messagesHistory.forEach(m => {
        let inThisConv = false;
        if (isGroup && m.isGroup) {
          inThisConv = true;
        } else if (!isGroup && !m.isGroup) {
          const s = (m.senderUsername || '').toLowerCase().trim();
          const t = (m.targetUsername || (m.targetId ? m.targetId.replace(/^u_/, '') : '') || '').toLowerCase().trim();
          const isBetween = (s === reqUser && t === targetUser) || (s === targetUser && t === reqUser);
          if (isBetween) inThisConv = true;
        }

        if (inThisConv) {
          if (targetMsg && m.id === targetMsg.id) {
            m.isPinned = !m.isPinned;
            isNowPinned = !!m.isPinned;
          } else {
            m.isPinned = false;
          }
        }
      });

      if (isGroup) {
        groupInfo.pinnedMessage = isNowPinned && targetMsg ? {
          id: targetMsg.id,
          senderName: targetMsg.senderName || targetMsg.senderUsername,
          text: targetMsg.text || targetMsg.caption || targetMsg.fileName || "Tin nhắn",
          time: targetMsg.time || "",
          type: targetMsg.type || "text",
          pinnedBy: reqUser
        } : null;
        saveGroupInfo();
      }

      saveMessages();

      const pinPayload = {
        pinnedMessageId: isNowPinned && targetMsg ? targetMsg.id : null,
        pinnedMessage: isNowPinned && targetMsg ? targetMsg : null,
        isGroup: !!isGroup,
        targetUsername: targetUser,
        requester: reqUser
      };

      if (isGroup) {
        const groupMemberSet = new Set((groupInfo.members || []).map(m => (m || '').toLowerCase().trim()));
        const payloadStr = `data: ${JSON.stringify({ type: 'message_pin', data: pinPayload })}\n\n`;
        clients.forEach(c => {
          if (c.username && groupMemberSet.has((c.username || '').toLowerCase().trim())) {
            try { c.res.write(payloadStr); } catch (err) {}
          }
        });
      } else {
        const payloadStr = `data: ${JSON.stringify({ type: 'message_pin', data: pinPayload })}\n\n`;
        clients.forEach(c => {
          const u = (c.username || '').toLowerCase().trim();
          if (u === reqUser || u === targetUser) {
            try { c.res.write(payloadStr); } catch (err) {}
          }
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', isPinned: isNowPinned, pinnedMessageId: isNowPinned && targetMsg ? targetMsg.id : null }));
    } catch (err) {
      console.error("Lỗi ghim tin nhắn:", err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi máy chủ' }));
    }
    return;
  }

  // 6.2 XÓA LỊCH SỬ TIN NHẮN CUỘC TRÒ CHUYỆN
  if (pathname === '/api/messages/clear' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const requester = (data.requester || '').toLowerCase().trim();
      const targetUser = (data.targetUsername || '').toLowerCase().trim();
      const isGroup = !!data.isGroup;

      if (isGroup) {
        const isLeader = (requester === groupInfo.leader);
        const isDeputy = groupInfo.deputies && groupInfo.deputies.includes(requester);
        if (isLeader || isDeputy) {
          messagesHistory = messagesHistory.filter(m => !m.isGroup);
          saveMessages();
          broadcastEvent('messages_cleared', { targetId: 'grp_all', isGroup: true });
        }
      } else if (targetUser) {
        messagesHistory = messagesHistory.filter(m => {
          if (m.isGroup) return true;
          const s = (m.senderUsername || '').toLowerCase().trim();
          const t = (m.targetUsername || '').toLowerCase().trim();
          const isBetween = (s === requester && t === targetUser) || (s === targetUser && t === requester);
          return !isBetween;
        });
        saveMessages();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi xóa tin nhắn' }));
    }
    return;
  }

  // 7. TÍN HIỆU CUỘC GỌI THOẠI & VIDEO (CALL SIGNALING)
  if (pathname === '/api/call-signal' && req.method === 'POST') {
    try {
      const signalData = await parseJsonBody(req);
      let targetUser = (signalData.to || '').toLowerCase().trim();
      const fromUser = (signalData.from || '').toLowerCase().trim();

      // Nếu targetUser là Họ Tên, tìm ra username chính xác
      const matchedAcc = accounts.find(a => (a.username || '').toLowerCase() === targetUser || (a.fullName || '').toLowerCase() === targetUser);
      if (matchedAcc) {
        targetUser = matchedAcc.username.toLowerCase();
      }

      const payload = `data: ${JSON.stringify({ type: 'call_signal', data: signalData })}\n\n`;

      let sentCount = 0;
      clients.forEach(c => {
        if (!c.res) return;
        const clientUser = (c.username || '').toLowerCase().trim();
        if (clientUser && clientUser === fromUser) return; // Không gửi lại chính người gửi

        if (targetUser) {
          if (clientUser === targetUser) {
            try {
              c.res.write(payload);
              sentCount++;
            } catch (e) {}
          }
        } else {
          try {
            c.res.write(payload);
            sentCount++;
          } catch (e) {}
        }
      });

      // Nếu chưa gửi được tới ai (có thể client đích danh chưa gắn username trên SSE), phát tới tất cả các client khác
      if (sentCount === 0) {
        clients.forEach(c => {
          if (!c.res) return;
          const clientUser = (c.username || '').toLowerCase().trim();
          if (clientUser && clientUser === fromUser) return;
          try { c.res.write(payload); } catch (e) {}
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'sent' }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi tín hiệu cuộc gọi' }));
    }
    return;
  }

  // 7.1 TẢI TỆP TIN & GHI ÂM THOẠI LÊN THƯ MỤC UPLOADS (STREAMING NHỊ PHÂN)
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      let rawFilename = req.headers['x-filename'] || url.searchParams.get('filename') || '';
      try {
        rawFilename = decodeURIComponent(rawFilename);
      } catch (e) {}

      if (!rawFilename) {
        rawFilename = 'file_' + Date.now();
      }

      const ext = path.extname(rawFilename) || '';
      const baseName = path.basename(rawFilename, ext).replace(/[^a-zA-Z0-9_\-\u00C0-\u1EF9\s]/g, '_').trim();
      const safeFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${baseName || 'upload'}${ext}`;
      const destPath = path.join(UPLOADS_DIR, safeFilename);

      const writeStream = fs.createWriteStream(destPath);
      req.pipe(writeStream);

      writeStream.on('finish', () => {
        try {
          const stats = fs.statSync(destPath);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            status: 'ok',
            fileUrl: `/uploads/${encodeURIComponent(safeFilename)}`,
            fileName: rawFilename,
            fileSize: formatFileSize(stats.size),
            sizeBytes: stats.size,
            ext: ext.replace('.', '').toLowerCase()
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Lỗi lấy thông tin tệp' }));
        }
      });

      writeStream.on('error', (err) => {
        console.error("Lỗi ghi tệp upload:", err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Lỗi lưu tệp lên máy chủ' }));
      });
    } catch (err) {
      console.error("Lỗi upload:", err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Lỗi xử lý tải tệp' }));
    }
    return;
  }

  // 7.2 TÍN HIỆU ĐANG SOẠN TIN NHẮN (TYPING INDICATOR)
  if (pathname === '/api/typing' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const from = (data.from || '').toLowerCase().trim();
      const fromName = data.fromName || from;
      const targetUsername = (data.targetUsername || '').toLowerCase().trim();
      const isGroup = !!data.isGroup;
      const isTyping = !!data.isTyping;

      const payload = {
        from: from,
        fromName: fromName,
        targetUsername: targetUsername,
        isGroup: isGroup,
        isTyping: isTyping
      };

      if (isGroup) {
        // Gửi tới các thành viên trong nhóm trừ người gửi
        const groupMemberSet = new Set((groupInfo.members || []).map(m => (m || '').toLowerCase().trim()));
        const ssePayload = `data: ${JSON.stringify({ type: 'user_typing', data: payload })}\n\n`;
        clients.forEach(c => {
          const u = (c.username || '').toLowerCase().trim();
          if (u && u !== from && groupMemberSet.has(u)) {
            try { c.res.write(ssePayload); } catch (e) {}
          }
        });
      } else if (targetUsername) {
        // Gửi trực tiếp tới người nhận 1-1
        const ssePayload = `data: ${JSON.stringify({ type: 'user_typing', data: payload })}\n\n`;
        clients.filter(c => (c.username || '').toLowerCase().trim() === targetUsername).forEach(c => {
          try { c.res.write(ssePayload); } catch (e) {}
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lỗi tín hiệu đang soạn tin' }));
    }
    return;
  }

  // 8. PHỤC VỤ STATIC FILES & CÁC TỆP ĐƯỢC TẢI LÊN (UPLOADS STREAMING)
  let cleanPath = pathname;
  try {
    cleanPath = decodeURIComponent(pathname);
  } catch (e) {}

  // Kiểm tra an toàn chống path traversal
  const normalizedPath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
  const isRoot = normalizedPath === '/' || normalizedPath === '\\' || normalizedPath === '.' || !normalizedPath;
  let filePath = path.join(__dirname, isRoot ? 'index.html' : normalizedPath);

  // Đảm bảo không truy cập ra ngoài thư mục dự án
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.txt': 'text/plain; charset=utf-8'
  };

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const contentType = contentTypes[ext] || 'application/octet-stream';
    const range = req.headers.range;

    // Hỗ trợ Range Request cho audio/video seeking trên trình duyệt
    if (range && (contentType.startsWith('audio/') || contentType.startsWith('video/'))) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fileStream.pipe(res);
      return;
    }

    // Stream trực tiếp file cho client (nhẹ RAM, tải mượt mà các file hàng chục MB)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': filePath.includes('uploads') ? 'public, max-age=86400' : 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function getOnlineUsers() {
  return Array.from(new Set(clients.map(c => c.username).filter(Boolean)));
}

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log('========================================================');
  console.log('🚀 MÁY CHỦ CHAT NỘI BỘ V2 ĐÃ SẴN SÀNG!');
  console.log('========================================================');
  console.log(`💻 Trên máy của bạn:       http://localhost:${PORT}`);
  console.log(`👥 Cho bạn bè cùng Wi-Fi:  http://${localIp}:${PORT}`);
  console.log('========================================================');
  console.log('Tài khoản đã lưu: ' + accounts.length + ' người dùng.');
});
