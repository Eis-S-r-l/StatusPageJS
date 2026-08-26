/**
 * An event edit can remove as well as add services. Both sides must be
 * recalculated so removed services do not retain stale downtime.
 */
export function affectedServiceUnion(
  previousServiceIds: readonly string[],
  nextServiceIds: readonly string[],
): string[] {
  return [...new Set([...previousServiceIds, ...nextServiceIds])];
}
