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

class TransferSessionStore {
  private sessions: Map<string, TransferSession> = new Map();

  constructor() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

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

  private deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    for (const file of session.files) {
      try { fs.unlinkSync(file.path); } catch { /* already gone */ }
    }
    this.sessions.delete(id);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) this.deleteSession(id);
    }
  }
}

export const transferStore = new TransferSessionStore();
