"use client";

import { useActionState, useEffect } from "react";

import { archiveEntity, createCategory, createService, editCategory, editService } from "@/modules/admin/actions";
import { INITIAL_SERVICE_ADMIN_ACTION_STATE, type ServiceAdminActionState } from "@/modules/admin/service-validation";

import { DialogForm } from "./_dialog-form";
import { ConfirmDelete } from "./_confirm-delete";
import { LocalDateTimeField } from "./_event-fields";
import { AutoSlugFields } from "./_slug-fields";
import styles from "./admin.module.css";

type CategoryItem = { id: string; slug: string; nameEn: string; nameIt: string; displayOrder: number };
type ServiceItem = { id: string; categoryId: string; slug: string; nameEn: string; nameIt: string; descriptionEn: string; descriptionIt: string; monitoringStartedAt: string; displayOrder: number };

function stateValue(state: ServiceAdminActionState, key: string, fallback = "") {
  const value = state.values?.[key];
  return typeof value === "string" ? value : fallback;
}

function FormStatus({ state }: { state: ServiceAdminActionState }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "error" ? styles.inlineError : styles.inlineSuccess} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function CategoryForm({ item, onSuccess }: { item?: CategoryItem; onSuccess: () => void }) {
  const action = item ? editCategory : createCategory;
  const [state, formAction, pending] = useActionState(action, INITIAL_SERVICE_ADMIN_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess(); }, [onSuccess, state.status, state.submissionId]);
  return <form action={formAction} className={styles.form}>
    {item && <input type="hidden" name="id" value={item.id} />}
    <AutoSlugFields sourceLabel="English name" sourceName="nameEn" sourceDefaultValue={stateValue(state, "nameEn", item?.nameEn)} slugDefaultValue={stateValue(state, "slug", item?.slug)} slugPlaceholder="platform" />
    <label className={styles.field}>Italian name<input name="nameIt" required defaultValue={stateValue(state, "nameIt", item?.nameIt)} /></label>
    <label className={styles.field}>Display order<input name="displayOrder" type="number" min="0" required defaultValue={stateValue(state, "displayOrder", String(item?.displayOrder ?? 0))} /></label>
    <FormStatus state={state} />
    <button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Saving…" : item ? "Save category" : "Create category"}</button>
  </form>;
}

function ServiceForm({ item, categories, onSuccess }: { item?: ServiceItem; categories: CategoryItem[]; onSuccess: () => void }) {
  const action = item ? editService : createService;
  const [state, formAction, pending] = useActionState(action, INITIAL_SERVICE_ADMIN_ACTION_STATE);
  useEffect(() => { if (state.status === "success") onSuccess(); }, [onSuccess, state.status, state.submissionId]);
  return <form action={formAction} className={styles.form}>
    {item && <input type="hidden" name="id" value={item.id} />}
    <label className={styles.field}>Category<select name="categoryId" required defaultValue={stateValue(state, "categoryId", item?.categoryId)}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn}</option>)}</select></label>
    <label className={styles.field}>Display order<input name="displayOrder" type="number" min="0" required defaultValue={stateValue(state, "displayOrder", String(item?.displayOrder ?? 0))} /></label>
    <AutoSlugFields sourceLabel="English name" sourceName="nameEn" sourceDefaultValue={stateValue(state, "nameEn", item?.nameEn)} slugDefaultValue={stateValue(state, "slug", item?.slug)} slugPlaceholder="customer-portal" />
    <label className={styles.field}>Italian name<input name="nameIt" required defaultValue={stateValue(state, "nameIt", item?.nameIt)} /></label>
    <label className={styles.field}>English description<textarea name="descriptionEn" defaultValue={stateValue(state, "descriptionEn", item?.descriptionEn)} /></label>
    <label className={styles.field}>Italian description<textarea name="descriptionIt" defaultValue={stateValue(state, "descriptionIt", item?.descriptionIt)} /></label>
    <LocalDateTimeField label="Monitoring started" name="monitoringStartedAt" required defaultValue={stateValue(state, "monitoringStartedAt", item?.monitoringStartedAt)} />
    <FormStatus state={state} />
    <button className={`${styles.button} ${styles.full}`} disabled={pending}>{pending ? "Saving…" : item ? "Save service" : "Create service"}</button>
  </form>;
}

function DeleteButton({ id, type, name }: { id: string; type: "category" | "service"; name: string }) {
  const message = type === "category"
    ? "This category and every service in it will be removed from the admin and public dashboards."
    : "This service will be removed from the admin and public dashboards.";
  return <ConfirmDelete deleteAction={archiveEntity} fields={[{ name: "id", value: id }, { name: "type", value: type }]} subject={name} message={message} />;
}

export function ServiceAdmin({ categories, services }: { categories: CategoryItem[]; services: ServiceItem[] }) {
  return <>
    <section className={styles.panel}><div className={styles.panelTitle}><h2>Categories</h2><DialogForm button="Add category" title="Add category">{(close) => <CategoryForm onSuccess={close} />}</DialogForm></div>
      {categories.length ? <div className={styles.list}>{categories.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.nameEn}</strong><small>{item.nameIt} · {item.slug} · Order {item.displayOrder}</small></div><div className={styles.rowActions}><DialogForm button="Edit" title={`Edit ${item.nameEn}`}>{(close) => <CategoryForm item={item} onSuccess={close} />}</DialogForm><DeleteButton id={item.id} type="category" name={item.nameEn} /></div></div>)}</div> : <div className={styles.empty}>No categories yet.</div>}
    </section>
    <section className={styles.panel}><div className={styles.panelTitle}><h2>Services</h2><DialogForm button="Add service" title="Add service">{(close) => <ServiceForm categories={categories} onSuccess={close} />}</DialogForm></div>
      {services.length ? <div className={styles.serviceGroups}>{categories.map((category) => { const categoryServices = services.filter((service) => service.categoryId === category.id); return categoryServices.length ? <section className={styles.serviceGroup} key={category.id}><h3>{category.nameEn}</h3><div className={styles.list}>{categoryServices.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.nameEn}</strong><small>{item.nameIt} · {item.slug} · Order {item.displayOrder}</small></div><div className={styles.rowActions}><DialogForm button="Edit" title={`Edit ${item.nameEn}`}>{(close) => <ServiceForm item={item} categories={categories} onSuccess={close} />}</DialogForm><DeleteButton id={item.id} type="service" name={item.nameEn} /></div></div>)}</div></section> : null; })}</div> : <div className={styles.empty}>No services yet.</div>}
    </section>
  </>;
}
