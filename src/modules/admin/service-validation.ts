import { z } from "zod";

export const adminSlug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");
export const adminRequiredText = z.string().trim().min(1, "This field is required").max(500);
export const displayOrder = z.coerce.number().int().min(0, "Display order must be zero or greater").default(0);

export const utcMonitoringStartedAt = z.string().min(1, "Monitoring start is required").transform((value, context) => {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    context.addIssue({ code: "custom", message: "The browser timezone is missing. Choose the date again." });
    return z.NEVER;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    context.addIssue({ code: "custom", message: "Invalid monitoring start" });
    return z.NEVER;
  }
  return parsed;
});

export const categoryInputSchema = z.object({
  slug: adminSlug,
  nameEn: adminRequiredText,
  nameIt: adminRequiredText,
  displayOrder,
});

export const serviceInputSchema = z.object({
  categoryId: z.string().uuid("Select a valid category"),
  slug: adminSlug,
  nameEn: adminRequiredText,
  nameIt: adminRequiredText,
  descriptionEn: z.string().trim().max(5000),
  descriptionIt: z.string().trim().max(5000),
  monitoringStartedAt: utcMonitoringStartedAt,
  displayOrder,
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;

export type ServiceAdminActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  values?: Record<string, string | string[]>;
  submissionId?: string;
};

export const INITIAL_SERVICE_ADMIN_ACTION_STATE: ServiceAdminActionState = { status: "idle" };

export function categoryAuditPayload(input: CategoryInput) {
  return {
    slug: input.slug,
    nameEn: input.nameEn,
    nameIt: input.nameIt,
    displayOrder: input.displayOrder,
  };
}

export function serviceAuditPayload(input: ServiceInput) {
  return {
    categoryId: input.categoryId,
    slug: input.slug,
    nameEn: input.nameEn,
    nameIt: input.nameIt,
    descriptionEn: input.descriptionEn,
    descriptionIt: input.descriptionIt,
    monitoringStartedAt: input.monitoringStartedAt.toISOString(),
    displayOrder: input.displayOrder,
  };
}

export function monitoringStartChanged(current: Date, next: Date): boolean {
  return current.getTime() !== next.getTime();
}

/** Keeps service rows grouped by the already ordered category list, then by order and name. */
export function sortServicesForManagement<T extends { categoryId: string; displayOrder: number; nameEn: string }>(categories: readonly { id: string }[], services: readonly T[]): T[] {
  const categoryPosition = new Map(categories.map((category, index) => [category.id, index]));
  return [...services].sort((left, right) =>
    (categoryPosition.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER) - (categoryPosition.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER)
    || left.displayOrder - right.displayOrder
    || left.nameEn.localeCompare(right.nameEn),
  );
}
