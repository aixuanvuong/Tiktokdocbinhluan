import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { TikTokLiveConnection } from 'tiktok-live-connector';

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
