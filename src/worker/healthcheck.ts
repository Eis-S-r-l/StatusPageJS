import { closeDb } from "@/db/client";
import { isWorkerHealthy } from "@/modules/operations/config";
import { readWorkerHeartbeat } from "@/modules/operations/heartbeat";

readWorkerHeartbeat().then((heartbeat) => {
  if (!isWorkerHealthy(heartbeat)) process.exitCode = 1;
}).catch(() => { process.exitCode = 1; }).finally(closeDb);
