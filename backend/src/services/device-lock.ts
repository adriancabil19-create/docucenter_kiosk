export class DeviceLock {
  private busy = false;
  private waiters: Array<() => void> = [];

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
      this.waiters.shift()?.();
    }
  }
}

export const scannerLock = new DeviceLock();