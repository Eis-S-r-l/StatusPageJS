export const HEARTBEAT_INTERVAL_MS = 30_000;
export const WORKER_STALE_MS = 2 * 60_000;
export const DAILY_REFRESH_MS = 24 * 60 * 60_000;
export const JOB_LEASE_MS = 15 * 60_000;
export const MAX_NOTIFICATION_ATTEMPTS = 8;

export function positiveEnvironmentNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function activeUptimeRefreshMs(): number {
  return positiveEnvironmentNumber("UPTIME_ACTIVE_REFRESH_MS", 60_000);
}

export function isWorkerHealthy(lastSeenAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() <= WORKER_STALE_MS);
}
