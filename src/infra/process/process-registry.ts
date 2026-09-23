const SIGKILL_GRACE_MS = 250;

/**
 * Tracks live child process trees so application shutdown can terminate them.
 * Kill callbacks should already implement SIGTERM followed by SIGKILL grace.
 */
export class ProcessRegistry {
  private readonly killers = new Map<number, () => void>();

  register(pid: number, killTree: () => void): void {
    this.killers.set(pid, killTree);
  }

  unregister(pid: number): void {
    this.killers.delete(pid);
  }

  get pids(): number[] {
    return [...this.killers.keys()];
  }

  get size(): number {
    return this.killers.size;
  }

  /**
   * Sends SIGTERM (via each registered killer) and waits for SIGKILL grace.
   */
  killAll(): Promise<void> {
    const killers = [...this.killers.values()];
    this.killers.clear();
    for (const killTree of killers) {
      try {
        killTree();
      } catch {
        // Process may already have exited.
      }
    }
    return new Promise((resolve) => {
      setTimeout(resolve, SIGKILL_GRACE_MS + 50).unref();
    });
  }
}

export const processRegistry = new ProcessRegistry();
