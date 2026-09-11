import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { TikTokLiveConnection } from 'tiktok-live-connector';
import {
  getUsers,
  saveUsers,
  findUserByUsername,
  findUserByToken,
  hashPassword,
  generateToken,
  UserRecord
} from './server/db.js';

function formatTikTokErrorMessage(err: any, cleanUsername: string): string {
  let rawMsg = '';
  if (typeof err === 'string') {
    rawMsg = err;
  } else if (err?.message) {
    rawMsg = err.message;
  } else if (err?.info) {
    rawMsg = err.info;
  } else if (err?.exception?.message) {
    rawMsg = err.exception.message;
  } else if (err?.exception) {
    rawMsg = String(err.exception);
  } else {
    try {
      rawMsg = JSON.stringify(err);
    } catch {
      rawMsg = String(err);
    }
  }

  const errLower = rawMsg.toLowerCase();

  if (
    errLower.includes('failed to retrieve room id') || 
    errLower.includes('invalidresponsecompositeerror') ||
    errLower.includes('live has ended') || 
    errLower.includes('is offline') ||
    errLower.includes('user offline')
  ) {
    return `Tài khoản @${cleanUsername} hiện KHÔNG ĐANG LIVESTREAM (Offline) hoặc ID nhập chưa đúng! Vui lòng kiểm tra lại xem kênh này có thực sự đang phát trực tiếp lúc này hay không.`;
  }

  if (errLower.includes('user not found') || errLower.includes('invalid unique id')) {
    return `Không tìm thấy tài khoản @${cleanUsername}! Vui lòng kiểm tra lại TikTok Unique ID (không phải tên hiển thị).`;
  }

  return `Lỗi kết nối TikTok Live: ${rawMsg}`;
}

function extractUserInfo(data: any) {
  const nickname = 
    data?.nickname || 
    data?.user?.nickname || 
    data?.userDetails?.nickname || 
    data?.uniqueId || 
    data?.user?.uniqueId || 
    data?.userDetails?.uniqueId || 
    'Người dùng';

  const uniqueId = 
    data?.uniqueId || 
    data?.user?.uniqueId || 
    data?.userDetails?.uniqueId || 
    '';

  const profilePictureUrl = 
    data?.profilePictureUrl || 
    data?.user?.profilePictureUrl || 
    data?.userDetails?.profilePictureUrl || 
    data?.user?.avatarThumb?.urlList?.[0] || 
    '';

  return { nickname, uniqueId, profilePictureUrl };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Authentication Middleware Helper
  const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' });
    }
    const user = findUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị quản trị viên khóa!' });
    }
    req.user = user;
    next();
  };

  // Admin Middleware Helper
  const adminMiddleware = (req: any, res: any, next: any) => {
    authMiddleware(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ có tài khoản Quản trị viên (Admin) mới có quyền truy cập.' });
      }
      next();
    });
  };

  // --- AUTH ROUTES ---

  // 1. Register User
  app.post('/api/auth/register', (req, res) => {
    try {
      const { username, displayName, password, confirmPassword } = req.body || {};

      const cleanUsername = (username || '').trim();
      const cleanDisplayName = (displayName || '').trim();

      // Validate Username (User ID): Must be at least 5 alphanumeric/underscore characters
      const usernameRegex = /^[a-zA-Z0-9_]{5,}$/;
      if (!cleanUsername || !usernameRegex.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Tên đăng nhập (User ID) phải chứa ít nhất 5 ký tự (chỉ gồm chữ cái, chữ số hoặc dấu gạch dưới, không có khoảng trắng).'
        });
      }

      if (!cleanDisplayName) {
        return res.status(400).json({ error: 'Vui lòng nhập Tên hiển thị.' });
      }

      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự.' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Nhập lại mật khẩu không khớp.' });
      }

      // Check existing username
      const existing = findUserByUsername(cleanUsername);
      if (existing) {
        return res.status(400).json({ error: `Tên đăng nhập "${cleanUsername}" đã tồn tại. Vui lòng chọn tên khác.` });
      }

      // Create new user
      const users = getUsers();
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);
      const token = generateToken();

      const newUser: UserRecord = {
        username: cleanUsername,
        displayName: cleanDisplayName,
        passwordHash: hash,
        salt,
        role: 'user',
        status: 'active',
        savedTikTokIds: [],
        createdAt: new Date().toISOString(),
        token
      };

      users.push(newUser);
      saveUsers(users);

      res.json({
        success: true,
        token,
        user: {
          username: newUser.username,
          displayName: newUser.displayName,
          role: newUser.role,
          status: newUser.status,
          savedTikTokIds: newUser.savedTikTokIds
        }
      });
    } catch (err: any) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Lỗi hệ thống khi đăng ký.' });
    }
  });

  // 2. Login User
  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      const cleanUsername = (username || '').trim();

      if (!cleanUsername || !password) {
        return res.status(400).json({ error: 'Vui lòng nhập Tên đăng nhập và Mật khẩu.' });
      }

      const user = findUserByUsername(cleanUsername);
      if (!user) {
        return res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
      }

      if (user.status === 'blocked') {
        return res.status(403).json({ error: 'Tài khoản này đã bị quản trị viên khóa. Vui lòng liên hệ Admin!' });
      }

      const hash = hashPassword(password, user.salt);
      if (hash !== user.passwordHash) {
        return res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
      }

      // Update token
      const token = generateToken();
      const users = getUsers();
      const uIndex = users.findIndex(u => u.username.toLowerCase() === user.username.toLowerCase());
      if (uIndex !== -1) {
        users[uIndex].token = token;
        saveUsers(users);
      }

      res.json({
        success: true,
        token,
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          savedTikTokIds: user.savedTikTokIds
        }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhập.' });
    }
  });

  // 3. Get Current User (Me)
  app.get('/api/auth/me', authMiddleware, (req: any, res) => {
    const user = req.user;
    res.json({
      success: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        savedTikTokIds: user.savedTikTokIds
      }
    });
  });

  // 4. Save or Remove TikTok ID in User's Private Space
  app.post('/api/user/saved-tiktok-ids', authMiddleware, (req: any, res) => {
    try {
      const { tiktokId, action } = req.body || {};
      const cleanId = (tiktokId || '').replace(/^@/, '').replace(/\s+/g, '').trim();

      if (!cleanId) {
        return res.status(400).json({ error: 'TikTok Unique ID không hợp lệ.' });
      }

      const users = getUsers();
      const uIndex = users.findIndex(u => u.username.toLowerCase() === req.user.username.toLowerCase());
      if (uIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy thông tin người dùng.' });
      }

      let currentSaved = users[uIndex].savedTikTokIds || [];

      if (action === 'add') {
        if (!currentSaved.some(id => id.toLowerCase() === cleanId.toLowerCase())) {
          currentSaved.push(cleanId);
        }
      } else if (action === 'remove') {
        currentSaved = currentSaved.filter(id => id.toLowerCase() !== cleanId.toLowerCase());
      }

      users[uIndex].savedTikTokIds = currentSaved;
      saveUsers(users);

      res.json({
        success: true,
        savedTikTokIds: currentSaved
      });
    } catch (err: any) {
      console.error('Saved TikTok IDs error:', err);
      res.status(500).json({ error: 'Lỗi hệ thống khi lưu TikTok ID.' });
    }
  });

  // 5. Update Profile & Change Password
  app.post('/api/user/profile', authMiddleware, (req: any, res) => {
    try {
      const { displayName, currentPassword, newPassword } = req.body || {};
      const users = getUsers();
      const uIndex = users.findIndex(u => u.username.toLowerCase() === req.user.username.toLowerCase());
      
      if (uIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      }

      const user = users[uIndex];

      // Update Display Name if provided
      if (displayName && typeof displayName === 'string') {
        const cleanName = displayName.trim();
        if (cleanName.length > 0) {
          user.displayName = cleanName;
        }
      }

      // Change Password if newPassword provided
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại để thay đổi mật khẩu mới.' });
        }

        const currentHash = hashPassword(currentPassword, user.salt);
        if (currentHash !== user.passwordHash) {
          return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
        }

        if (typeof newPassword !== 'string' || newPassword.length < 4) {
          return res.status(400).json({ error: 'Mật khẩu mới phải từ 4 ký tự trở lên.' });
        }

        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = hashPassword(newPassword, newSalt);
        user.salt = newSalt;
        user.passwordHash = newHash;
      }

      saveUsers(users);

      res.json({
        success: true,
        message: 'Cập nhật thông tin thành công!',
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          savedTikTokIds: user.savedTikTokIds
        }
      });
    } catch (err: any) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật thông tin.' });
    }
  });

  // --- ADMIN ROUTES ---

  // 1. Get all users (Admin only)
  app.get('/api/admin/users', adminMiddleware, (req, res) => {
    const users = getUsers().map(u => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      savedTikTokIds: u.savedTikTokIds || [],
      createdAt: u.createdAt
    }));
    res.json({ success: true, users });
  });

  // 2. Block/Unblock user (Admin only)
  app.post('/api/admin/users/status', adminMiddleware, (req: any, res) => {
    try {
      const { username, status } = req.body || {};
      if (!username || (status !== 'active' && status !== 'blocked')) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
      }

      if (username.toLowerCase() === req.user.username.toLowerCase()) {
        return res.status(400).json({ error: 'Bạn không thể tự khóa tài khoản Admin của chính mình!' });
      }

      const users = getUsers();
      const uIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
      if (uIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      }

      users[uIndex].status = status;
      // If blocked, clear session token to force logout
      if (status === 'blocked') {
        delete users[uIndex].token;
      }

      saveUsers(users);
      res.json({ success: true, username, status });
    } catch (err) {
      res.status(500).json({ error: 'Lỗi hệ thống khi đổi trạng thái.' });
    }
  });

  // 3. Delete user account (Admin only)
  app.delete('/api/admin/users/:username', adminMiddleware, (req: any, res) => {
    try {
      const username = req.params.username;
      if (!username) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
      }

      if (username.toLowerCase() === req.user.username.toLowerCase()) {
        return res.status(400).json({ error: 'Bạn không thể xóa tài khoản Admin của chính mình!' });
      }

      let users = getUsers();
      const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
      if (!exists) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng để xóa.' });
      }

      users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
      saveUsers(users);

      res.json({ success: true, message: `Đã xóa tài khoản "${username}".` });
    } catch (err) {
      res.status(500).json({ error: 'Lỗi hệ thống khi xóa người dùng.' });
    }
  });

  // Track active TikTok connections per socket
  const userConnections = new Map<string, TikTokLiveConnection>();

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    const disconnectTikTok = () => {
      const existingConn = userConnections.get(socket.id);
      if (existingConn) {
        try {
          existingConn.disconnect();
        } catch (e) {
          console.error('Error disconnecting TikTok stream:', e);
        }
        userConnections.delete(socket.id);
      }
    };

    socket.on('setUniqueId', async (uniqueId: string) => {
      disconnectTikTok();

      // Remove leading @, internal spaces, and trim
      const cleanUsername = (uniqueId || '').replace(/^@/, '').replace(/\s+/g, '').trim();
      if (!cleanUsername) {
        socket.emit('tiktok_error', 'Vui lòng nhập TikTok Unique ID hợp lệ.');
        return;
      }

      console.log(`[TikTok] Connecting socket ${socket.id} to user: ${cleanUsername}`);

      try {
        const tiktokConnection = new TikTokLiveConnection(cleanUsername, {
          processInitialData: false,
          enableExtendedGiftInfo: false
        });

        userConnections.set(socket.id, tiktokConnection);

        tiktokConnection.on('chat' as any, (data: any) => {
          const user = extractUserInfo(data);
          const commentContent = data.comment || data.text || data.content || '';
          console.log(`[TikTok Chat] ${user.nickname} (@${user.uniqueId}): ${commentContent}`);
          socket.emit('chat', {
            nickname: user.nickname,
            uniqueId: user.uniqueId,
            comment: commentContent,
            profilePictureUrl: user.profilePictureUrl
          });
        });

        tiktokConnection.on('follow' as any, (data: any) => {
          const user = extractUserInfo(data);
          console.log(`[TikTok Follow] ${user.nickname} (@${user.uniqueId})`);
          socket.emit('follow', {
            nickname: user.nickname,
            uniqueId: user.uniqueId,
            profilePictureUrl: user.profilePictureUrl
          });
        });

        tiktokConnection.on('social' as any, (data: any) => {
          const displayType = (data.displayType || '').toLowerCase();
          const label = (data.label || '').toLowerCase();
          const user = extractUserInfo(data);
          console.log(`[TikTok Social] ${user.nickname}: ${label || displayType}`);

          if (displayType.includes('follow') || label.includes('follow') || data.eventTypeName === 'follow') {
            socket.emit('follow', {
              nickname: user.nickname,
              uniqueId: user.uniqueId,
              profilePictureUrl: user.profilePictureUrl
            });
          }
        });

        tiktokConnection.on('streamEnd' as any, () => {
          console.log(`[TikTok] Stream ended for ${cleanUsername}`);
          socket.emit('streamEnd');
          disconnectTikTok();
        });

        tiktokConnection.on('disconnected' as any, () => {
          console.log(`[TikTok] Disconnected from ${cleanUsername}`);
          socket.emit('disconnected');
        });

        tiktokConnection.on('error' as any, (err: any) => {
          console.error(`[TikTok Error] ${cleanUsername}:`, err);
          const rawErrStr = typeof err === 'string' ? err : (err?.message || err?.info || JSON.stringify(err) || '');
          
          // Ignore non-fatal gift fetching or signature errors that do not affect chat or follow
          if (rawErrStr.includes('Failed to fetch room gifts') || rawErrStr.includes('fetchWebcastSignatureFromEulerRoute') || rawErrStr.includes('SignatureMissingTokensError')) {
            console.warn(`[TikTok Non-Fatal Gift Warning] @${cleanUsername}: ${rawErrStr}`);
            return;
          }

          const errMsg = formatTikTokErrorMessage(err, cleanUsername);
          socket.emit('tiktok_error', errMsg);
        });

        const stateData = await tiktokConnection.connect();
        console.log(`[TikTok Connected] Room ID: ${stateData.roomId} for @${cleanUsername}`);
        socket.emit('connected', {
          roomId: stateData.roomId,
          uniqueId: cleanUsername
        });

      } catch (err: any) {
        console.error(`[TikTok Connect Exception] @${cleanUsername}:`, err);
        const errMsg = formatTikTokErrorMessage(err, cleanUsername);
        socket.emit('tiktok_error', errMsg);
        disconnectTikTok();
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      disconnectTikTok();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TikTok Live Voice Reader Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
