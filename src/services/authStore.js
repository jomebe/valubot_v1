import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FILE_PATH = path.join(__dirname, '../../riotAuth.json');
const ALGORITHM = 'aes-256-cbc';

// Get encryption key from process.env, hashing it to secure exactly 32 bytes
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY || process.env.DISCORD_TOKEN || 'fallback-encryption-key-for-valubot-v1';
  return crypto.createHash('sha256').update(String(envKey)).digest();
}

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length < 2) return '';
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// In-memory cache for fast lookups
let sessionsCache = null;

function loadAllSessions() {
  if (sessionsCache) return sessionsCache;
  try {
    if (fs.existsSync(FILE_PATH)) {
      const data = fs.readFileSync(FILE_PATH, 'utf8');
      sessionsCache = JSON.parse(data);
    } else {
      sessionsCache = {};
    }
  } catch (error) {
    console.error('Failed to load sessions from disk:', error);
    sessionsCache = {};
  }
  return sessionsCache;
}

function saveAllSessions(sessions) {
  try {
    sessionsCache = sessions;
    fs.writeFileSync(FILE_PATH, JSON.stringify(sessions, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save sessions to disk:', error);
    return false;
  }
}

export function saveUserSession(discordUserId, sessionData) {
  const sessions = loadAllSessions();
  
  // Encrypt sensitive tokens before saving
  const encryptedSession = {
    puuid: sessionData.puuid,
    playerName: sessionData.playerName || 'Unknown',
    region: sessionData.region || 'kr',
    expiresAt: sessionData.expiresAt,
    accessToken: encrypt(sessionData.accessToken),
    entitlementsToken: encrypt(sessionData.entitlementsToken)
  };
  
  sessions[discordUserId] = encryptedSession;
  return saveAllSessions(sessions);
}

export function getUserSession(discordUserId) {
  const sessions = loadAllSessions();
  const session = sessions[discordUserId];
  if (!session) return null;
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    deleteUserSession(discordUserId);
    return null;
  }
  
  // Decrypt tokens
  const decryptedAccessToken = decrypt(session.accessToken);
  const decryptedEntitlementsToken = decrypt(session.entitlementsToken);
  
  if (!decryptedAccessToken || !decryptedEntitlementsToken) {
    console.error('Failed to decrypt user session tokens.');
    return null;
  }
  
  return {
    puuid: session.puuid,
    playerName: session.playerName,
    region: session.region,
    expiresAt: session.expiresAt,
    accessToken: decryptedAccessToken,
    entitlementsToken: decryptedEntitlementsToken
  };
}

export function deleteUserSession(discordUserId) {
  const sessions = loadAllSessions();
  if (sessions[discordUserId]) {
    delete sessions[discordUserId];
    return saveAllSessions(sessions);
  }
  return false;
}
