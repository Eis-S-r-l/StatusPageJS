import { z } from "zod";

const utcDate = z.string().min(1, "Date and time are required").transform((value, context) => {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    context.addIssue({ code: "custom", message: "The browser timezone is missing. Choose the date again." });
    return z.NEVER;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    context.addIssue({ code: "custom", message: "Invalid date and time" });
    return z.NEVER;
  }
  return parsed;
});

export const optionalUtcDate = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : value,
  utcDate.optional(),
);

export const requiredUtcDate = utcDate;

export function validateIncidentTiming(input: {
  status: "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: Date;
  resolvedAt?: Date;
}, now = new Date()): string | null {
  const latestActualTime = now.getTime() + 60_000;
  if (input.startedAt.getTime() > latestActualTime) return "Incidents cannot start in the future.";
  if (input.resolvedAt && input.resolvedAt.getTime() > latestActualTime) return "An incident resolution time cannot be in the future.";
  if (input.status === "resolved" && !input.resolvedAt) return "A resolved incident needs a resolution time.";
  if (input.status !== "resolved" && input.resolvedAt) return "Only a resolved incident can have a resolution time.";
  if (input.resolvedAt && input.resolvedAt < input.startedAt) return "Resolution time must be after the incident start.";
  return null;
}

export function validateMaintenanceTiming(input: {
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  actualStartAt?: Date;
  actualEndAt?: Date;
}, now = new Date()): string | null {
  const latestActualTime = now.getTime() + 60_000;
  if (input.scheduledEndAt < input.scheduledStartAt) return "Scheduled end must be after the start.";
  if (input.actualStartAt && input.actualStartAt.getTime() > latestActualTime) return "An actual maintenance start cannot be in the future.";
  if (input.actualEndAt && input.actualEndAt.getTime() > latestActualTime) return "An actual maintenance end cannot be in the future.";
  if (input.actualEndAt && (!input.actualStartAt || input.actualEndAt < input.actualStartAt)) return "Actual end must be after the actual start.";
  if (input.status === "in_progress" && !input.actualStartAt) return "In-progress maintenance needs an actual start time.";
  if (input.status === "completed" && (!input.actualStartAt || !input.actualEndAt)) return "Completed maintenance needs actual start and end times.";
  return null;
}

export type EventActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  values?: Record<string, string | string[]>;
  submissionId?: string;
};

export const INITIAL_EVENT_ACTION_STATE: EventActionState = { status: "idle" };

export function formValues(form: FormData): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    const existing = result[key];
    result[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}
