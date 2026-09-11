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
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDbExists(): UserRecord[] {
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

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getUsers(): UserRecord[] {
  return ensureDbExists();
}

export function saveUsers(users: UserRecord[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

export function findUserByUsername(username: string): UserRecord | undefined {
  const users = getUsers();
  const target = username.toLowerCase().trim();
  return users.find(u => u.username.toLowerCase() === target);
}

export function findUserByToken(token: string): UserRecord | undefined {
  if (!token) return undefined;
  const users = getUsers();
  return users.find(u => u.token === token);
}
