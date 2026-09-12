import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UserRecord {
  username: string;       // User ID (min 5 alphanumeric/underscore chars)
  displayName: string;    // Display name
  passwordHash: string;   // Salted SHA256 password hash
  salt: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  savedTikTokIds: string[];
  createdAt: string;
  token?: string;
  autoStartSystem?: boolean; // Auto-start TikTok XV live connection on system launch
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// In-Memory Database Cache for High-Concurrency Non-Blocking Speed
let userCache: UserRecord[] | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let isSaving = false;
let pendingSave = false;

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function loadDbFromDisk(): UserRecord[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialUsers: UserRecord[] = [];
    fs.writeFileSync(DB_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const users: UserRecord[] = JSON.parse(raw);

    // Auto-create initial admin account if no admin exists
    const hasAdmin = users.some(u => u.role === 'admin');
    if (!hasAdmin) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword('admin123', salt);
      const defaultAdmin: UserRecord = {
        username: 'admin',
        displayName: 'Quản Trị Viên',
        passwordHash: hash,
        salt,
        role: 'admin',
        status: 'active',
        savedTikTokIds: [],
        createdAt: new Date().toISOString()
      };
      users.push(defaultAdmin);
      fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf-8');
    }

    return users;
  } catch (err) {
    console.error('Error reading db.json:', err);
    return [];
  }
}

function ensureCacheLoaded(): UserRecord[] {
  if (!userCache) {
    userCache = loadDbFromDisk();
  }
  return userCache;
}

/**
 * Asynchronous, non-blocking, debounced disk persistence.
 * Updates in-memory immediately, writes to disk asynchronously without blocking the event loop.
 */
async function flushToDiskAsync() {
  if (isSaving) {
    pendingSave = true;
    return;
  }

  if (!userCache) return;

  isSaving = true;
  pendingSave = false;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }
    const dataStr = JSON.stringify(userCache, null, 2);
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tempFile, dataStr, 'utf-8');
    await fs.promises.rename(tempFile, DB_FILE);
  } catch (err) {
    console.error('[DB] Asynchronous save error:', err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      flushToDiskAsync();
    }
  }
}

export function getUsers(): UserRecord[] {
  return ensureCacheLoaded();
}

export function saveUsers(users: UserRecord[]): void {
  userCache = users;
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  // Schedule async write within 50ms so rapid updates are batched cleanly
  saveDebounceTimer = setTimeout(() => {
    flushToDiskAsync();
  }, 50);
}

export function findUserByUsername(username: string): UserRecord | undefined {
  if (!username) return undefined;
  const users = getUsers();
  const target = username.toLowerCase().trim();
  return users.find(u => u.username.toLowerCase() === target);
}

export function findUserByToken(token: string): UserRecord | undefined {
  if (!token) return undefined;
  const users = getUsers();
  return users.find(u => u.token === token);
}
