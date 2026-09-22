import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
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
  // High-Concurrency Socket.IO configuration with shared stream pool
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling']
  });

  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Static assets caching header for production/dist performance
  app.use((req, res, next) => {
    if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Server-side High-Reliability TTS Proxy with Native Microsoft Edge & Google Support
  app.get('/api/tts', async (req, res) => {
    try {
      const text = (req.query.text as string || '').trim();
      const engine = (req.query.engine as string || 'google_standard').trim();

      if (!text) {
        return res.status(400).send('Missing text parameter');
      }

      // Truncate to 180 chars for clean chunk speech
      const shortText = text.length > 180 ? text.substring(0, 180) : text;
      const encoded = encodeURIComponent(shortText);

      let audioBuffer: Buffer | null = null;

      // 1. Try Microsoft Edge Neural Voices
      if (engine.startsWith('ms_')) {
        let msVoiceName = 'vi-VN-HoaiMyNeural';
        if (engine === 'ms_namminh') msVoiceName = 'vi-VN-NamMinhNeural';
        if (engine === 'ms_an') msVoiceName = 'vi-VN-HoaiMyNeural';

        try {
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${msVoiceName}'><prosody pitch='0Hz' rate='0%'>${shortText}</prosody></voice></speak>`;
          const msRes = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?trustedclienttoken=6A5AA1D4EA5E4071A406830501861937', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
            },
            body: ssml
          });

          if (msRes.ok) {
            const ab = await msRes.arrayBuffer();
            if (ab.byteLength > 200) {
              audioBuffer = Buffer.from(ab);
            }
          }
        } catch (msErr) {
          console.warn('[MS Edge TTS Fetch Error]:', msErr);
        }
      }

      // 2. Fallback or direct fetch for Google Translate TTS
      if (!audioBuffer) {
        let ttsUrls: string[] = [];

        if (engine === 'google_fast') {
          ttsUrls = [
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=vi&client=gtx`,
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=vi&client=tw-ob`
          ];
        } else {
          ttsUrls = [
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=vi&client=tw-ob`,
            `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=vi&client=gtx`
          ];
        }

        for (const url of ttsUrls) {
          try {
            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://translate.google.com/'
              }
            });

            if (response.ok) {
              const ab = await response.arrayBuffer();
              if (ab.byteLength > 100) {
                audioBuffer = Buffer.from(ab);
                break;
              }
            }
          } catch (fetchErr) {
            console.warn(`[TTS Proxy] Fetch failed for ${url}:`, fetchErr);
          }
        }
      }

      if (!audioBuffer) {
        return res.status(502).send('Unable to generate TTS audio.');
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(audioBuffer);
    } catch (err: any) {
      console.error('[TTS API Error]:', err);
      return res.status(500).send('TTS Server Error');
    }
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
          savedTikTokIds: user.savedTikTokIds,
          autoStartSystem: user.autoStartSystem || false
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
        savedTikTokIds: user.savedTikTokIds,
        autoStartSystem: user.autoStartSystem || false
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

  // 5. Update Profile, Auto-Start Settings & Change Password
  app.post('/api/user/profile', authMiddleware, (req: any, res) => {
    try {
      const { displayName, currentPassword, newPassword, autoStartSystem } = req.body || {};
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

      // Update Auto-Start setting if provided
      if (typeof autoStartSystem === 'boolean') {
        user.autoStartSystem = autoStartSystem;
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
          savedTikTokIds: user.savedTikTokIds,
          autoStartSystem: user.autoStartSystem || false
        }
      });
    } catch (err: any) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật thông tin.' });
    }
  });

  // 6. Delete User Account from Server
  app.post('/api/user/delete-account', authMiddleware, (req: any, res) => {
    try {
      const { confirmPassword } = req.body || {};
      const users = getUsers();
      const uIndex = users.findIndex(u => u.username.toLowerCase() === req.user.username.toLowerCase());

      if (uIndex === -1) {
        return res.status(404).json({ error: 'Tài khoản không tồn tại.' });
      }

      const user = users[uIndex];

      // Verify Password before deletion
      if (!confirmPassword) {
        return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại để xác nhận xóa dữ liệu khỏi server.' });
      }

      const hash = hashPassword(confirmPassword, user.salt);
      if (hash !== user.passwordHash) {
        return res.status(400).json({ error: 'Mật khẩu xác nhận không chính xác.' });
      }

      // If Admin, ensure not deleting the last active admin
      if (user.role === 'admin') {
        const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
        if (activeAdmins.length <= 1) {
          return res.status(400).json({ error: 'Không thể xóa tài khoản Admin duy nhất của ứng dụng!' });
        }
      }

      // Delete user from database
      users.splice(uIndex, 1);
      saveUsers(users);

      res.json({
        success: true,
        message: 'Tài khoản và dữ liệu cá nhân đã được xóa hoàn toàn khỏi server TikTok XV.'
      });
    } catch (err: any) {
      console.error('Delete account error:', err);
      res.status(500).json({ error: 'Lỗi hệ thống khi xóa ứng dụng/dữ liệu khỏi server.' });
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

  // Shared TikTok Live Stream Pool for High Multi-User Concurrency
  interface SharedTikTokStream {
    connection: TikTokLiveConnection;
    subscribers: Set<string>;
    connectedRoomId?: string;
    isConnecting: boolean;
  }

  const sharedStreams = new Map<string, SharedTikTokStream>();
  const socketCurrentRoom = new Map<string, string>();

  const leaveRoom = (socketId: string) => {
    const currentRoom = socketCurrentRoom.get(socketId);
    if (!currentRoom) return;

    socketCurrentRoom.delete(socketId);
    const stream = sharedStreams.get(currentRoom);

    if (stream) {
      stream.subscribers.delete(socketId);
      console.log(`[StreamPool] Socket ${socketId} left room @${currentRoom}. Remaining subscribers: ${stream.subscribers.size}`);

      if (stream.subscribers.size === 0) {
        console.log(`[StreamPool] Tearing down inactive TikTok connection for @${currentRoom}`);
        try {
          stream.connection.disconnect();
        } catch (e) {
          console.error(`Error disconnecting TikTok stream for @${currentRoom}:`, e);
        }
        sharedStreams.delete(currentRoom);
      }
    }
  };

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('setUniqueId', async (uniqueId: string) => {
      leaveRoom(socket.id);

      const cleanUsername = (uniqueId || '').replace(/^@/, '').replace(/\s+/g, '').trim().toLowerCase();
      if (!cleanUsername) {
        socket.emit('tiktok_error', 'Vui lòng nhập TikTok Unique ID hợp lệ.');
        return;
      }

      socketCurrentRoom.set(socket.id, cleanUsername);
      socket.join(`room_${cleanUsername}`);

      let stream = sharedStreams.get(cleanUsername);

      if (stream) {
        stream.subscribers.add(socket.id);
        console.log(`[StreamPool] Reusing existing TikTok connection for @${cleanUsername} (Total listeners: ${stream.subscribers.size})`);

        if (stream.connectedRoomId) {
          socket.emit('connected', {
            roomId: stream.connectedRoomId,
            uniqueId: cleanUsername
          });
        }
        return;
      }

      console.log(`[StreamPool] Initializing new shared TikTok connection for @${cleanUsername}`);
      const tiktokConnection = new TikTokLiveConnection(cleanUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: false
      });

      stream = {
        connection: tiktokConnection,
        subscribers: new Set([socket.id]),
        isConnecting: true
      };
      sharedStreams.set(cleanUsername, stream);

      const recentServerEvents = new Map<string, number>();
      const isDuplicateServerEvent = (key: string, ttlMs: number = 30000): boolean => {
        const now = Date.now();
        const lastTime = recentServerEvents.get(key);
        if (lastTime && (now - lastTime) < ttlMs) {
          return true;
        }
        recentServerEvents.set(key, now);
        if (recentServerEvents.size > 300) {
          for (const [k, time] of recentServerEvents.entries()) {
            if (now - time > 60000) recentServerEvents.delete(k);
          }
        }
        return false;
      };

      tiktokConnection.on('chat' as any, (data: any) => {
        const user = extractUserInfo(data);
        const commentContent = (data.comment || data.text || data.content || '').trim();
        const eventKey = `chat:${user.uniqueId.toLowerCase()}:${commentContent.toLowerCase()}`;

        // Deduplicate identical comments from same user within 30 seconds
        if (isDuplicateServerEvent(eventKey, 30000)) {
          console.log(`[Server Deduplicate 30s] Ignoring duplicate chat from @${user.uniqueId}: "${commentContent}"`);
          return;
        }

        io.to(`room_${cleanUsername}`).emit('chat', {
          nickname: user.nickname,
          uniqueId: user.uniqueId,
          comment: commentContent,
          profilePictureUrl: user.profilePictureUrl
        });
      });

      tiktokConnection.on('gift' as any, (data: any) => {
        const user = extractUserInfo(data);
        const giftName = data.giftName || data.giftDetails?.giftName || data.describe || 'Quà tặng';
        const giftCount = data.repeatCount || data.count || 1;
        const diamondCount = data.diamondCount || 0;
        const giftPictureUrl = data.giftPictureUrl || data.giftDetails?.giftImage?.urlList?.[0] || '';

        io.to(`room_${cleanUsername}`).emit('gift', {
          nickname: user.nickname,
          uniqueId: user.uniqueId,
          profilePictureUrl: user.profilePictureUrl,
          giftName,
          giftCount,
          diamondCount,
          giftPictureUrl
        });
      });

      tiktokConnection.on('like' as any, (data: any) => {
        const user = extractUserInfo(data);
        const likeCount = data.likeCount || 1;
        const totalLikes = data.totalLikes || 0;

        io.to(`room_${cleanUsername}`).emit('like', {
          nickname: user.nickname,
          uniqueId: user.uniqueId,
          profilePictureUrl: user.profilePictureUrl,
          likeCount,
          totalLikes
        });
      });

      tiktokConnection.on('share' as any, (data: any) => {
        const user = extractUserInfo(data);
        io.to(`room_${cleanUsername}`).emit('share', {
          nickname: user.nickname,
          uniqueId: user.uniqueId,
          profilePictureUrl: user.profilePictureUrl
        });
      });

      tiktokConnection.on('follow' as any, (data: any) => {
        const user = extractUserInfo(data);
        const eventKey = `follow:${user.uniqueId.toLowerCase()}`;

        if (isDuplicateServerEvent(eventKey, 15000)) {
          return;
        }

        io.to(`room_${cleanUsername}`).emit('follow', {
          nickname: user.nickname,
          uniqueId: user.uniqueId,
          profilePictureUrl: user.profilePictureUrl
        });
      });

      tiktokConnection.on('social' as any, (data: any) => {
        const displayType = (data.displayType || '').toLowerCase();
        const label = (data.label || '').toLowerCase();
        const user = extractUserInfo(data);

        if (displayType.includes('follow') || label.includes('follow') || data.eventTypeName === 'follow') {
          const eventKey = `follow:${user.uniqueId.toLowerCase()}`;
          if (isDuplicateServerEvent(eventKey, 15000)) {
            return;
          }

          io.to(`room_${cleanUsername}`).emit('follow', {
            nickname: user.nickname,
            uniqueId: user.uniqueId,
            profilePictureUrl: user.profilePictureUrl
          });
        }
      });

      tiktokConnection.on('streamEnd' as any, () => {
        console.log(`[TikTok] Stream ended for @${cleanUsername}`);
        io.to(`room_${cleanUsername}`).emit('streamEnd');
        const s = sharedStreams.get(cleanUsername);
        if (s) {
          try { s.connection.disconnect(); } catch {}
          sharedStreams.delete(cleanUsername);
        }
      });

      tiktokConnection.on('disconnected' as any, () => {
        console.log(`[TikTok] Disconnected from @${cleanUsername}`);
        io.to(`room_${cleanUsername}`).emit('disconnected');
      });

      tiktokConnection.on('error' as any, (err: any) => {
        console.error(`[TikTok Error] @${cleanUsername}:`, err);
        const rawErrStr = typeof err === 'string' ? err : (err?.message || err?.info || JSON.stringify(err) || '');
        
        if (rawErrStr.includes('Failed to fetch room gifts') || rawErrStr.includes('fetchWebcastSignatureFromEulerRoute') || rawErrStr.includes('SignatureMissingTokensError')) {
          return;
        }

        const errMsg = formatTikTokErrorMessage(err, cleanUsername);
        io.to(`room_${cleanUsername}`).emit('tiktok_error', errMsg);
      });

      try {
        const stateData = await tiktokConnection.connect();
        console.log(`[TikTok Connected] Shared Room ID: ${stateData.roomId} for @${cleanUsername}`);
        if (stream) {
          stream.connectedRoomId = stateData.roomId;
          stream.isConnecting = false;
        }

        io.to(`room_${cleanUsername}`).emit('connected', {
          roomId: stateData.roomId,
          uniqueId: cleanUsername
        });
      } catch (err: any) {
        console.error(`[TikTok Connect Exception] @${cleanUsername}:`, err);
        const errMsg = formatTikTokErrorMessage(err, cleanUsername);
        io.to(`room_${cleanUsername}`).emit('tiktok_error', errMsg);
        
        try { tiktokConnection.disconnect(); } catch {}
        sharedStreams.delete(cleanUsername);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      leaveRoom(socket.id);
    });
  });

  // OBS Studio & TikTok Live Studio Overlay routes
  app.get(['/overlay', '/overlay.html'], (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    const filePath = isProd
      ? path.join(process.cwd(), 'dist', 'overlay.html')
      : path.join(process.cwd(), 'overlay.html');
    res.sendFile(filePath);
  });

  // Standalone Streamer Soundboard Pop-up Window
  app.get(['/soundboard', '/soundboard.html'], (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    const filePath = isProd
      ? path.join(process.cwd(), 'dist', 'soundboard.html')
      : path.join(process.cwd(), 'soundboard.html');
    res.sendFile(filePath);
  });

  // Soundboard audio static files and API catalog
  const publicSoundsPath = path.join(process.cwd(), 'public', 'sounds');
  app.use('/sounds', express.static(publicSoundsPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.opus') || filePath.endsWith('.ogg')) {
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }));

  app.get('/api/sounds', (req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'public', 'sounds.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        return res.send(data);
      }
      // Fallback if sounds.json is missing
      const files = fs.existsSync(publicSoundsPath) ? fs.readdirSync(publicSoundsPath) : [];
      const soundItems = files.filter(f => f.endsWith('.opus')).map(f => ({
        id: f.replace('.opus', ''),
        title: f.replace('.opus', ''),
        cat: 'meme',
        catLabel: 'Hiệu ứng',
        file: '/sounds/' + f,
        tags: []
      }));
      res.json({ categories: { all: 'Tất Cả' }, sounds: soundItems });
    } catch (e: any) {
      console.error('[Soundboard API Error]:', e);
      res.status(500).json({ error: 'Failed to retrieve sounds' });
    }
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
