export type RefreshState = "current" | "refreshing" | "unavailable";
export const PUBLIC_REFRESH_MS = 30_000;
export const PUBLIC_REFRESH_TIMEOUT_MS = 15_000;

/** Tracks actual server renders: starting a refresh alone is not success. */
export class PublicRefreshController {
  private state: RefreshState = "current";
  private listeners = new Set<() => void>();
  private interval: ReturnType<typeof setInterval> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private serverVersion: string;

  constructor(private options: { renderedAt: string; refresh: () => void; visible: () => boolean; online: () => boolean }) {
    this.serverVersion = options.renderedAt;
  }

  getSnapshot = () => this.state;
  getServerSnapshot = (): RefreshState => "current";
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private setState(state: RefreshState) {
    if (this.state === state) return;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  start() {
    this.interval = setInterval(this.refresh, PUBLIC_REFRESH_MS);
    if (!this.options.online()) this.offline();
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.timeout);
    this.inFlight = false;
  }

  acknowledge(renderedAt: string) {
    if (renderedAt === this.serverVersion) return;
    this.serverVersion = renderedAt;
    clearTimeout(this.timeout);
    this.inFlight = false;
    this.setState(this.options.online() ? "current" : "unavailable");
  }

  offline = () => {
    clearTimeout(this.timeout);
    this.inFlight = false;
    this.setState("unavailable");
  };

  refresh = () => {
    if (!this.options.visible() || this.inFlight) return;
    if (!this.options.online()) return this.offline();
    this.inFlight = true;
    // Keep a failure visible until a new server render actually arrives.
    if (this.state !== "unavailable") this.setState("refreshing");
    this.timeout = setTimeout(() => {
      this.inFlight = false;
      this.setState("unavailable");
    }, PUBLIC_REFRESH_TIMEOUT_MS);
    try {
      this.options.refresh();
    } catch {
      this.offline();
    }
  };
}
