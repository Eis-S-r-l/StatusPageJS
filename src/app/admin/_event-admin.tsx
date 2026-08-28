"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { archiveEvent, createIncident, createMaintenance, editIncident, editMaintenance, updateIncident, updateMaintenance } from "@/modules/admin/actions";
import { INITIAL_EVENT_ACTION_STATE, type EventActionState } from "@/modules/admin/event-validation";
import { LocalDateTimeField, RichTextField } from "./_event-fields";
import { DialogForm } from "./_dialog-form";
import { AutoSlugFields } from "./_slug-fields";
import styles from "./admin.module.css";

type ServiceOption = { id: string; nameEn: string };
type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type IncidentItem = {
  id: string; slug: string; titleEn: string; titleIt: string; descriptionEn: string; descriptionIt: string;
  status: IncidentStatus; startedAt: string; resolvedAt: string | null; isPublished: boolean;
  serviceIds: string[]; uptimeServiceIds: string[]; updates: { id: string }[];
};
type MaintenanceItem = {
  id: string; slug: string; titleEn: string; titleIt: string; descriptionEn: string; descriptionIt: string;
  status: MaintenanceStatus; scheduledStartAt: string; scheduledEndAt: string; actualStartAt: string | null; actualEndAt: string | null;
  isPublished: boolean; serviceIds: string[]; uptimeServiceIds: string[]; updates: { id: string }[];
};

function stateValue(state: EventActionState, key: string, fallback = "") {
  const value = state.values?.[key];
  return typeof value === "string" ? value : fallback;
}

function stateValues(state: EventActionState, key: string, fallback: string[]) {
  const value = state.values?.[key];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : fallback;
}

function FormStatus({ state }: { state: EventActionState }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "error" ? styles.inlineError : styles.inlineSuccess} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function ServiceFields({ services, selected, uptimeSelected, defaultAffectsUptime = false }: { services: ServiceOption[]; selected: string[]; uptimeSelected: string[]; defaultAffectsUptime?: boolean }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(selected));
  const [uptimeIds, setUptimeIds] = useState(() => new Set(uptimeSelected));
  const toggleService = (serviceId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(serviceId); else next.delete(serviceId);
      return next;
    });
    setUptimeIds((current) => {
      const next = new Set(current);
      if (!checked) next.delete(serviceId);
      else if (defaultAffectsUptime) next.add(serviceId);
      return next;
    });
  };
  const toggleUptime = (serviceId: string, checked: boolean) => setUptimeIds((current) => {
    const next = new Set(current);
    if (checked) next.add(serviceId); else next.delete(serviceId);
    return next;
  });

  return <fieldset className={`${styles.field} ${styles.full}`}>
    <legend>Affected services</legend>
    <span className={styles.fieldHint}>Choose each affected service and whether this event counts as downtime for that service.</span>
    <div className={styles.serviceChecks}>{services.map((service) => {
      const isSelected = selectedIds.has(service.id);
      return <div className={styles.serviceCheck} data-selected={isSelected || undefined} key={service.id}>
        <label className={styles.serviceName}><input type="checkbox" name="serviceIds" value={service.id} checked={isSelected} onChange={(event) => toggleService(service.id, event.target.checked)} /><span>{service.nameEn}</span></label>
        <label className={styles.downtimeChoice}><input type="checkbox" name="uptimeServiceIds" value={service.id} checked={isSelected && uptimeIds.has(service.id)} disabled={!isSelected} aria-label={`Count ${service.nameEn} as downtime`} onChange={(event) => toggleUptime(service.id, event.target.checked)} /><span>Downtime</span></label>
      </div>;
    })}</div>
  </fieldset>;
}

function IncidentForm({ item, services, onSuccess }: { item?: IncidentItem; services: ServiceOption[]; onSuccess?: () => void }) {
  const action = item ? editIncident : createIncident;
  const [state, formAction, pending] = useActionState(action, INITIAL_EVENT_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess?.(); }, [onSuccess, state.submissionId, state.status]);
  const selected = stateValues(state, "serviceIds", item?.serviceIds ?? []);
  const uptimeSelected = stateValues(state, "uptimeServiceIds", item?.uptimeServiceIds ?? []);
  return <form action={formAction} className={styles.form}>
    {item && <input type="hidden" name="id" value={item.id} />}
    <AutoSlugFields sourceLabel="English title" sourceName="titleEn" sourceDefaultValue={stateValue(state, "titleEn", item?.titleEn)} slugDefaultValue={stateValue(state, "slug", item?.slug)} slugPlaceholder="api-connectivity-issue" />
    <label className={styles.field}>Status{item?.isPublished && <input type="hidden" name="status" value={item.status} />}<select name={item?.isPublished ? undefined : "status"} disabled={item?.isPublished} defaultValue={stateValue(state, "status", item?.status ?? "investigating")}><option value="investigating">Investigating</option><option value="identified">Identified</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select>{item?.isPublished && <span className={styles.fieldHint}>Use Add update to change the public status and notify subscribers.</span>}</label>
    <label className={styles.field}>Italian title<input name="titleIt" required defaultValue={stateValue(state, "titleIt", item?.titleIt)} /></label>
    <RichTextField label="English description" name="descriptionEn" defaultValue={stateValue(state, "descriptionEn", item?.descriptionEn)} />
    <RichTextField label="Italian description" name="descriptionIt" defaultValue={stateValue(state, "descriptionIt", item?.descriptionIt)} />
    <LocalDateTimeField label="Started at" name="startedAt" required defaultValue={stateValue(state, "startedAt", item?.startedAt)} />
    <LocalDateTimeField label="Resolved at (optional)" name="resolvedAt" defaultValue={stateValue(state, "resolvedAt", item?.resolvedAt ?? "")} />
    <ServiceFields services={services} selected={selected} uptimeSelected={uptimeSelected} defaultAffectsUptime />
    {!item?.isPublished && <><label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="publish" defaultChecked={stateValue(state, "publish") === "on"} />Publish now</label><label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="notifySubscribers" defaultChecked={state.values ? stateValue(state, "notifySubscribers") === "on" : true} />Notify subscribers when publishing</label></>}
    <FormStatus state={state} /><button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Saving…" : item ? "Save incident" : "Create incident"}</button>
  </form>;
}

function IncidentUpdateForm({ item, onSuccess }: { item: IncidentItem; onSuccess?: () => void }) {
  const [state, formAction, pending] = useActionState(updateIncident, INITIAL_EVENT_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess?.(); }, [onSuccess, state.submissionId, state.status]);
  return <form action={formAction} className={styles.form}>
    <input type="hidden" name="id" value={item.id} />
    <label className={styles.field}>New status<select name="status" defaultValue={stateValue(state, "status", item.status)}><option value="investigating">Investigating</option><option value="identified">Identified</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></label>
    <LocalDateTimeField label="Update date and time" name="effectiveAt" required defaultValue={stateValue(state, "effectiveAt", new Date().toISOString())} />
    <LocalDateTimeField label="Resolved at (when resolving)" name="resolvedAt" defaultValue={stateValue(state, "resolvedAt", item.resolvedAt ?? "")} />
    <RichTextField label="English update" name="messageEn" required defaultValue={stateValue(state, "messageEn")} />
    <RichTextField label="Italian update" name="messageIt" required defaultValue={stateValue(state, "messageIt")} />
    {!item.isPublished && <label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="publish" defaultChecked={stateValue(state, "publish") === "on"} />Publish incident</label>}
    <label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="notifySubscribers" defaultChecked={state.values ? stateValue(state, "notifySubscribers") === "on" : true} />Notify subscribers</label>
    <FormStatus state={state} /><button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Publishing…" : "Add timeline update"}</button>
  </form>;
}

function LocalTime({ value }: { value: string }) {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  return <time dateTime={value}>{mounted ? new Date(value).toLocaleString() : value}</time>;
}

export function IncidentAdmin({ services, current, resolved }: { services: ServiceOption[]; current: IncidentItem[]; resolved: IncidentItem[] }) {
  return <>
    <div className={styles.pageActions}><DialogForm button="Add incident" title="Add incident">{(close) => <IncidentForm services={services} onSuccess={close} />}</DialogForm></div>
    <EventSection title="Current incidents" empty="No current incidents." items={current} render={(item) => <IncidentRow key={item.id} item={item} services={services} />} />
    <EventSection title="Resolved incidents" empty="No resolved incidents." items={resolved} render={(item) => <IncidentRow key={item.id} item={item} services={services} />} />
  </>;
}

function IncidentRow({ item, services }: { item: IncidentItem; services: ServiceOption[] }) {
  return <div className={`${styles.row} ${styles.eventRow}`}><div><strong>{item.titleEn}</strong><small>{item.status} · {item.isPublished ? "Published" : "Draft"} · <LocalTime value={item.startedAt} /> · {item.updates.length} updates</small></div><div className={styles.rowActions}>
    <DialogForm button="Edit" title={`Edit ${item.titleEn}`}>{(close) => <IncidentForm item={item} services={services} onSuccess={close} />}</DialogForm>
    <DialogForm button="Add update" title={`Update ${item.titleEn}`}>{(close) => <IncidentUpdateForm item={item} onSuccess={close} />}</DialogForm>
    <form action={archiveEvent}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="type" value="incident" /><button className={styles.dangerButton}>Archive</button></form>
  </div></div>;
}

function MaintenanceForm({ item, services, defaultAffectsUptime, onSuccess }: { item?: MaintenanceItem; services: ServiceOption[]; defaultAffectsUptime: boolean; onSuccess?: () => void }) {
  const action = item ? editMaintenance : createMaintenance;
  const [state, formAction, pending] = useActionState(action, INITIAL_EVENT_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess?.(); }, [onSuccess, state.submissionId, state.status]);
  const selected = stateValues(state, "serviceIds", item?.serviceIds ?? []);
  const uptimeSelected = stateValues(state, "uptimeServiceIds", item?.uptimeServiceIds ?? []);
  return <form action={formAction} className={styles.form}>
    {item && <input type="hidden" name="id" value={item.id} />}
    <AutoSlugFields sourceLabel="English title" sourceName="titleEn" sourceDefaultValue={stateValue(state, "titleEn", item?.titleEn)} slugDefaultValue={stateValue(state, "slug", item?.slug)} slugPlaceholder="database-capacity-upgrade" />
    <label className={styles.field}>Status{item?.isPublished && <input type="hidden" name="status" value={item.status} />}<select name={item?.isPublished ? undefined : "status"} disabled={item?.isPublished} defaultValue={stateValue(state, "status", item?.status ?? "scheduled")}><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>{item?.isPublished && <span className={styles.fieldHint}>Use Update status to change the public status and notify subscribers.</span>}</label>
    <label className={styles.field}>Italian title<input name="titleIt" required defaultValue={stateValue(state, "titleIt", item?.titleIt)} /></label>
    <RichTextField label="English description" name="descriptionEn" defaultValue={stateValue(state, "descriptionEn", item?.descriptionEn)} /><RichTextField label="Italian description" name="descriptionIt" defaultValue={stateValue(state, "descriptionIt", item?.descriptionIt)} />
    <LocalDateTimeField label="Scheduled start" name="scheduledStartAt" required defaultValue={stateValue(state, "scheduledStartAt", item?.scheduledStartAt)} /><LocalDateTimeField label="Scheduled end" name="scheduledEndAt" required defaultValue={stateValue(state, "scheduledEndAt", item?.scheduledEndAt)} />
    <LocalDateTimeField label="Actual start (optional)" name="actualStartAt" defaultValue={stateValue(state, "actualStartAt", item?.actualStartAt ?? "")} /><LocalDateTimeField label="Actual end (optional)" name="actualEndAt" defaultValue={stateValue(state, "actualEndAt", item?.actualEndAt ?? "")} />
    <ServiceFields services={services} selected={selected} uptimeSelected={uptimeSelected} defaultAffectsUptime={defaultAffectsUptime} />
    {!item?.isPublished && <><label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="publish" defaultChecked={stateValue(state, "publish") === "on"} />Publish now</label><label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="notifySubscribers" defaultChecked={state.values ? stateValue(state, "notifySubscribers") === "on" : true} />Notify subscribers when publishing</label></>}
    <FormStatus state={state} /><button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Saving…" : item ? "Save maintenance" : "Create maintenance"}</button>
  </form>;
}

function MaintenanceUpdateForm({ item, onSuccess }: { item: MaintenanceItem; onSuccess?: () => void }) {
  const [state, formAction, pending] = useActionState(updateMaintenance, INITIAL_EVENT_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess?.(); }, [onSuccess, state.submissionId, state.status]);
  return <form action={formAction} className={styles.form}><input type="hidden" name="id" value={item.id} />
    <label className={styles.field}>Status<select name="status" defaultValue={stateValue(state, "status", item.status)}><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
    <LocalDateTimeField label="Update date and time" name="effectiveAt" required defaultValue={stateValue(state, "effectiveAt", new Date().toISOString())} />
    <LocalDateTimeField label="Actual start" name="actualStartAt" defaultValue={stateValue(state, "actualStartAt", item.actualStartAt ?? "")} /><LocalDateTimeField label="Actual end" name="actualEndAt" defaultValue={stateValue(state, "actualEndAt", item.actualEndAt ?? "")} />
    <RichTextField label="English update" name="messageEn" required defaultValue={stateValue(state, "messageEn")} />
    <RichTextField label="Italian update" name="messageIt" required defaultValue={stateValue(state, "messageIt")} />
    {!item.isPublished && <label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="publish" defaultChecked={stateValue(state, "publish") === "on"} />Publish maintenance</label>}
    <label className={`${styles.check} ${styles.full}`}><input type="checkbox" name="notifySubscribers" defaultChecked={state.values ? stateValue(state, "notifySubscribers") === "on" : true} />Notify subscribers</label>
    <FormStatus state={state} /><button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Saving…" : "Update status"}</button>
  </form>;
}

export function MaintenanceAdmin({ services, current, past, defaultAffectsUptime }: { services: ServiceOption[]; current: MaintenanceItem[]; past: MaintenanceItem[]; defaultAffectsUptime: boolean }) {
  return <><div className={styles.pageActions}><DialogForm button="Add maintenance" title="Add maintenance">{(close) => <MaintenanceForm services={services} defaultAffectsUptime={defaultAffectsUptime} onSuccess={close} />}</DialogForm></div>
    <EventSection title="Current and upcoming" empty="No current or upcoming maintenance." items={current} render={(item) => <MaintenanceRow key={item.id} item={item} services={services} defaultAffectsUptime={defaultAffectsUptime} />} />
    <EventSection title="Past maintenance" empty="No past maintenance." items={past} render={(item) => <MaintenanceRow key={item.id} item={item} services={services} defaultAffectsUptime={defaultAffectsUptime} />} />
  </>;
}

function MaintenanceRow({ item, services, defaultAffectsUptime }: { item: MaintenanceItem; services: ServiceOption[]; defaultAffectsUptime: boolean }) {
  return <div className={`${styles.row} ${styles.eventRow}`}><div><strong>{item.titleEn}</strong><small>{item.status} · {item.isPublished ? "Published" : "Draft"} · <LocalTime value={item.scheduledStartAt} /> · {item.updates.length} updates</small></div><div className={styles.rowActions}>
    <DialogForm button="Edit" title={`Edit ${item.titleEn}`}>{(close) => <MaintenanceForm item={item} services={services} defaultAffectsUptime={defaultAffectsUptime} onSuccess={close} />}</DialogForm>
    <DialogForm button="Update status" title={`Update ${item.titleEn}`}>{(close) => <MaintenanceUpdateForm item={item} onSuccess={close} />}</DialogForm>
    <form action={archiveEvent}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="type" value="maintenance" /><button className={styles.dangerButton}>Archive</button></form>
  </div></div>;
}

function EventSection<T>({ title, empty, items, render }: { title: string; empty: string; items: T[]; render: (item: T) => React.ReactNode }) {
  return <section className={styles.panel}><h2>{title}</h2>{items.length ? <div className={styles.list}>{items.map(render)}</div> : <div className={styles.empty}>{empty}</div>}</section>;
}
