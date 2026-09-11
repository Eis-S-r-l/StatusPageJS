import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/operations/heartbeat", () => ({ readWorkerHeartbeat: vi.fn() }));
import { readWorkerHeartbeat } from "@/modules/operations/heartbeat";
import { GET } from "./route";

beforeEach(() => vi.resetAllMocks());

describe("operational health endpoint", () => {
  it("reports a recent heartbeat without exposing operational details", async () => {
    vi.mocked(readWorkerHeartbeat).mockResolvedValue(new Date());
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
  it.each([null, new Date(0)])("returns 503 for a missing or stale heartbeat: %s", async (heartbeat) => {
    vi.mocked(readWorkerHeartbeat).mockResolvedValue(heartbeat);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded" });
  });
  it("returns a generic failure when the database cannot be reached", async () => {
    vi.mocked(readWorkerHeartbeat).mockRejectedValue(new Error("private connection details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
