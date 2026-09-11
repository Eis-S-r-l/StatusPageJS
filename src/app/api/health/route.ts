import { isWorkerHealthy } from "@/modules/operations/config";
import { readWorkerHeartbeat } from "@/modules/operations/heartbeat";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    const healthy = isWorkerHealthy(await readWorkerHeartbeat());
    return Response.json({ status: healthy ? "ok" : "degraded" }, { status: healthy ? 200 : 503, headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
