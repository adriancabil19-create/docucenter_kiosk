import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

interface TransferFile {
  name: string;
  path: string;
  mimeType: string;
}

interface TransferSession {
  id: string;
  files: TransferFile[];
  expiresAt: Date;
}

interface ReceiveSession {
  id: string;
  files: TransferFile[];
  ready: boolean; // true once phone has submitted files
  expiresAt: Date;
}

class TransferSessionStore {
  private sessions: Map<string, TransferSession> = new Map();
  private receiveSessions: Map<string, ReceiveSession> = new Map();

  constructor() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // ── Download sessions (kiosk → phone) ────────────────────────────────────

  create(files: TransferFile[]): TransferSession {
    const session: TransferSession = {
      id: uuidv4(),
      files,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): TransferSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (new Date() > session.expiresAt) {
      this.deleteSession(id);
      return undefined;
    }
    return session;
  }

  // ── Receive sessions (phone → kiosk) ─────────────────────────────────────

  createReceive(): ReceiveSession {
    const session: ReceiveSession = {
      id: uuidv4(),
      files: [],
      ready: false,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    this.receiveSessions.set(session.id, session);
    return session;
  }

  getReceive(id: string): ReceiveSession | undefined {
    const session = this.receiveSessions.get(id);
    if (!session) return undefined;
    if (new Date() > session.expiresAt) {
      this.deleteReceiveSession(id);
      return undefined;
    }
    return session;
  }

  addFilesToReceive(id: string, files: TransferFile[]): boolean {
    const session = this.receiveSessions.get(id);
    if (!session) return false;
    session.files.push(...files);
    session.ready = true;
    return true;
  }

  deleteReceive(id: string): void {
    this.deleteReceiveSession(id);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  private deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    for (const file of session.files) {
      try { fs.unlinkSync(file.path); } catch { /* already gone */ }
    }
    this.sessions.delete(id);
  }

  private deleteReceiveSession(id: string): void {
    const session = this.receiveSessions.get(id);
    if (!session) return;
    for (const file of session.files) {
      try { fs.unlinkSync(file.path); } catch { /* already gone */ }
    }
    this.receiveSessions.delete(id);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) this.deleteSession(id);
    }
    for (const [id, session] of this.receiveSessions) {
      if (now > session.expiresAt) this.deleteReceiveSession(id);
    }
  }
}

export const transferStore = new TransferSessionStore();
