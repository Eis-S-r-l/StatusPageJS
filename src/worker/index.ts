import { pathToFileURL } from "node:url";

import { closeDb } from "@/db/client";
import { processNotificationBatch, recoverStaleNotificationJobs } from "@/modules/notifications/processor";
import { activeUptimeRefreshMs, DAILY_REFRESH_MS, HEARTBEAT_INTERVAL_MS, positiveEnvironmentNumber } from "@/modules/operations/config";
import { recordWorkerHeartbeat } from "@/modules/operations/heartbeat";

import { refreshActiveUptime, refreshDailyUptime } from "./uptime-refresh";

function waitForNextRun(intervalMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, intervalMs);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

async function repeatTask(name: string, intervalMs: number, task: () => Promise<unknown>, signal?: AbortSignal) {
  while (!signal?.aborted) {
    try {
      await task();
    } catch (error) {
      console.error(`${name} failed`, error instanceof Error ? error.message : error);
    }
    if (signal?.aborted) return;
    await waitForNextRun(intervalMs, signal);
  }
}

export async function runWorker(signal?: AbortSignal) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run the worker");
  let nextDailyRefresh = 0;
  // Slow or failing notification providers must not delay uptime calculations
  // or the heartbeat. Each task has one loop, so it never overlaps itself.
  await Promise.all([
    repeatTask("Notification cycle", positiveEnvironmentNumber("WORKER_POLL_INTERVAL_MS", 5_000), async () => {
      await recoverStaleNotificationJobs();
      await processNotificationBatch();
    }, signal),
    repeatTask("Uptime refresh", activeUptimeRefreshMs(), async () => {
      if (Date.now() >= nextDailyRefresh) {
        await refreshDailyUptime();
        nextDailyRefresh = Date.now() + DAILY_REFRESH_MS;
      } else {
        await refreshActiveUptime();
      }
    }, signal),
    repeatTask("Worker heartbeat", HEARTBEAT_INTERVAL_MS, recordWorkerHeartbeat, signal),
  ]);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  runWorker(controller.signal).finally(closeDb).catch((error) => { console.error(error); process.exitCode = 1; });
}
