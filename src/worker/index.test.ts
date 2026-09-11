import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ closeDb: vi.fn() }));
vi.mock("@/modules/notifications/processor", () => ({ processNotificationBatch: vi.fn(), recoverStaleNotificationJobs: vi.fn() }));
vi.mock("@/modules/operations/heartbeat", () => ({ recordWorkerHeartbeat: vi.fn() }));
vi.mock("./uptime-refresh", () => ({ refreshActiveUptime: vi.fn(), refreshDailyUptime: vi.fn() }));

import { processNotificationBatch, recoverStaleNotificationJobs } from "@/modules/notifications/processor";
import { recordWorkerHeartbeat } from "@/modules/operations/heartbeat";
import { refreshActiveUptime, refreshDailyUptime } from "./uptime-refresh";
import { runWorker } from "./index";

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", "postgresql://unused");
  vi.stubEnv("WORKER_POLL_INTERVAL_MS", "5000");
  vi.stubEnv("UPTIME_ACTIVE_REFRESH_MS", "60000");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("worker scheduling", () => {
  it("keeps recovering jobs after a quick restart, including beyond the 15-minute lease", async () => {
    const controller = new AbortController();
    const running = runWorker(controller.signal);
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    expect(vi.mocked(recoverStaleNotificationJobs).mock.calls.length).toBeGreaterThan(190);
    expect(vi.mocked(processNotificationBatch).mock.calls.length).toBe(vi.mocked(recoverStaleNotificationJobs).mock.calls.length);
    expect(refreshDailyUptime).toHaveBeenCalledOnce();
    expect(refreshActiveUptime).toHaveBeenCalled();
    controller.abort();
    await running;
  });

  it("continues uptime and heartbeat updates while notification delivery is slow", async () => {
    let release!: () => void;
    vi.mocked(processNotificationBatch).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ processed: 0, sent: 0, failed: 0 }); }));
    const controller = new AbortController();
    const running = runWorker(controller.signal);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(processNotificationBatch).toHaveBeenCalledOnce();
    expect(refreshActiveUptime).toHaveBeenCalledTimes(2);
    expect(recordWorkerHeartbeat).toHaveBeenCalledTimes(5);
    controller.abort(); release();
    await running;
  });

  it("retries recovery failures and removes abort listeners after each sleep", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recoverStaleNotificationJobs).mockRejectedValueOnce(new Error("database temporarily unavailable"));
    const controller = new AbortController();
    const running = runWorker(controller.signal);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(processNotificationBatch).toHaveBeenCalled();
    expect(getEventListeners(controller.signal, "abort").length).toBeLessThanOrEqual(3);
    controller.abort(); await running;
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});
