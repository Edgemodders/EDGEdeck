// One at a time: work started again while it runs (a button pressed twice, the same Nexus link
// twice) is not started a second time. Two downloads of one file into one path, or two adds of one
// zip, would trip over each other (the owner saw two "Opening" notifications for one zip, 2026-11-10).

/** Something already running was started again: shown as a short notice, not an error. */
export class AlreadyUnderWay extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyUnderWay";
  }
}

/** Keys of the work under way. */
const underWay = new Set<string>();

export interface SingleOptions {
  /** True for a background call (a quiet daily check): it returns undefined without a notice. */
  // The key, notice and silent functions read the first few arguments only, so they are typed loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  silent?: (...args: any[]) => boolean;
  /** Keeps the key this long after the work returns (Run game returns before Windows lists the game). */
  holdMs?: number;
  /** Where to say that a second start was turned away. */
  log?: (line: string) => void;
}

/**
 * Wraps `fn` so it runs once at a time per key. Started again while it runs, it throws
 * AlreadyUnderWay with the notice `what`, unless `silent` says the call was a background one.
 */
export function single<A extends unknown[], R>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  key: string | ((...args: any[]) => string),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  what: string | ((...args: any[]) => string),
  fn: (...args: A) => Promise<R>,
  opts: SingleOptions = {},
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const k = typeof key === "function" ? key(...args) : key;
    if (underWay.has(k)) {
      const message = typeof what === "function" ? what(...args) : what;
      opts.log?.(`${message} Not starting it again.`);
      if (opts.silent?.(...args)) return undefined as R;
      throw new AlreadyUnderWay(message);
    }
    underWay.add(k);
    try {
      return await fn(...args);
    } finally {
      if (opts.holdMs) setTimeout(() => underWay.delete(k), opts.holdMs);
      else underWay.delete(k);
    }
  };
}
