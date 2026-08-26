import { pathToFileURL } from "node:url";

import { closeDb } from "@/db/client";
import { processNotificationBatch, recoverStaleNotificationJobs } from "@/modules/notifications/processor";

import { refreshActiveUptime, refreshDailyUptime } from "./uptime-refresh";

const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export async function runWorker(signal?: AbortSignal) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run the worker");
  const pollMs = numberFromEnv("WORKER_POLL_INTERVAL_MS", 5_000);
  const activeRefreshMs = numberFromEnv("UPTIME_ACTIVE_REFRESH_MS", 60_000);
  let nextActiveRefresh = 0;
  let nextDailyRefresh = 0;
  await recoverStaleNotificationJobs();

  while (!signal?.aborted) {
    const now = Date.now();
    try {
      await processNotificationBatch();
      if (now >= nextActiveRefresh) {
        await refreshActiveUptime();
        nextActiveRefresh = now + activeRefreshMs;
      }
      if (now >= nextDailyRefresh) {
        await refreshDailyUptime();
        nextDailyRefresh = now + 24 * 60 * 60_000;
      }
    } catch (error) {
      console.error("Worker cycle failed", error instanceof Error ? error.message : error);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, pollMs);
      signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  runWorker(controller.signal).finally(closeDb).catch((error) => { console.error(error); process.exitCode = 1; });
}
