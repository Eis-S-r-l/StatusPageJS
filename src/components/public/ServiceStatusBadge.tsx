import { CircleCheck, CircleX, TriangleAlert, Wrench } from "lucide-react";
import type { ServiceState } from "@/modules/status/types";
import styles from "./ServiceStatusBadge.module.css";

const STATE_ICONS = {
  operational: CircleCheck,
  degraded: TriangleAlert,
  outage: CircleX,
  maintenance: Wrench,
} satisfies Record<ServiceState, typeof CircleCheck>;

interface ServiceStatusBadgeProps {
  state: ServiceState;
  label: string;
}

export function ServiceStatusBadge({ state, label }: ServiceStatusBadgeProps) {
  const Icon = STATE_ICONS[state];

  return (
    <span className={`${styles.badge} ${styles[state]}`}>
      <Icon className={styles.icon} aria-hidden="true" focusable="false" />
      <span>{label}</span>
    </span>
  );
}
