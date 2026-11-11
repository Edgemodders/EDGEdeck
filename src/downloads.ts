// Downloads from Nexus: one at a time by default, with the speed in the notification.
//
// Nexus caps a free account's speed (3 MB/s, 1.5 MB/s with an ad blocker; Premium has no cap), and
// the cap is the account's, not each file's: two files at once share it (measured 2026-11-08 on a
// free account: two files at 0.52 and 0.74 MB/s, 1.26 MB/s together). Downloading them one after
// another gets the first one into the library sooner and the last one no later.

/** The speed over the last few seconds, in bytes per second. */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];

  constructor(private readonly windowMs = 5000, private readonly now: () => number = Date.now) {}

  /** Records how many bytes have arrived so far. */
  add(received: number): void {
    const t = this.now();
    this.samples.push({ t, bytes: received });
    while (this.samples.length > 2 && t - this.samples[1].t >= this.windowMs) this.samples.shift();
  }

  /** Bytes per second over the window; 0 until the samples span half a second. */
  get bytesPerSecond(): number {
    const first = this.samples[0], last = this.samples[this.samples.length - 1];
    if (!first || last.t - first.t < 500) return 0;
    return ((last.bytes - first.bytes) * 1000) / (last.t - first.t);
  }
}

const MB = 1048576;

/** "12 of 70 MB · 1.4 MB/s · 41 s left"; no speed while there is none to show. */
export function progressText(received: number, total: number, bytesPerSecond: number): string {
  const size = total ? `${mb(received)} of ${mb(total)} MB` : `${mb(received)} MB`;
  if (bytesPerSecond <= 0) return size;
  const speed = `${bytesPerSecond >= MB ? (bytesPerSecond / MB).toFixed(1) + " MB/s" : Math.round(bytesPerSecond / 1024) + " KB/s"}`;
  if (!total || received >= total) return `${size} · ${speed}`;
  return `${size} · ${speed} · ${timeLeft((total - received) / bytesPerSecond)} left`;
}

function mb(bytes: number): string {
  return bytes < 10 * MB ? (bytes / MB).toFixed(1) : String(Math.round(bytes / MB));
}

function timeLeft(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** A download the player cancelled, waiting or under way: not an error to show. */
export class DownloadCancelled extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelled";
  }
}

/**
 * How many Nexus downloads run at once: one for a free account, whose speed cap is the whole
 * account's, no limit (0) for Premium, which has none. An account not known yet counts as free.
 */
export function downloadsAtOnce(premium: boolean | undefined): number {
  return premium ? 0 : 1;
}

/**
 * Runs at most `limit()` jobs at once, in the order they came; the others wait. `limit()` is read
 * each time a job starts or ends, so a changed setting applies from the next one. 0 or less: no limit.
 */
export class DownloadQueue {
  private running = 0;
  private waiting: { go: () => void; tell?: (ahead: number) => void }[] = [];

  constructor(private readonly limit: () => number) {}

  /** How many jobs wait for a turn. */
  get queued(): number {
    return this.waiting.length;
  }

  /**
   * Runs `job` when its turn comes. While it waits, `onWait` hears how many jobs are ahead of it.
   * `signal` cancels it: while it waits, it leaves the queue and the run rejects with DownloadCancelled;
   * once it runs, the job itself has to stop on the signal.
   */
  async run<T>(job: () => Promise<T>, onWait?: (ahead: number) => void, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new DownloadCancelled();
    if (this.full()) {
      // The job that ends hands its slot over: pump() counts this one as running before go().
      await new Promise<void>((go, fail) => {
        const entry = { go: () => { signal?.removeEventListener("abort", leave); go(); }, tell: onWait };
        const leave = () => {
          const i = this.waiting.indexOf(entry);
          if (i < 0) return;
          this.waiting.splice(i, 1);
          this.waiting.forEach((w, k) => w.tell?.(this.running + k));
          fail(new DownloadCancelled());
        };
        signal?.addEventListener("abort", leave, { once: true });
        this.waiting.push(entry);
        onWait?.(this.running + this.waiting.length - 1);
      });
    } else this.running++;
    try {
      return await job();
    } finally {
      this.running--;
      this.pump();
    }
  }

  private full(): boolean {
    const n = this.limit();
    return n > 0 && this.running >= n;
  }

  private pump(): void {
    while (this.waiting.length && !this.full()) {
      this.running++;
      this.waiting.shift()!.go();
    }
    this.waiting.forEach((w, i) => w.tell?.(this.running + i));
  }
}
