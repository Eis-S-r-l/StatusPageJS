"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import styles from "./admin.module.css";

type HiddenField = { name: string; value: string };

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return <button className={styles.confirmDeleteButton} type="submit" disabled={pending}>{pending ? "Deleting…" : "Yes, delete"}</button>;
}

export function ConfirmDelete({
  deleteAction,
  fields,
  subject,
  message,
}: {
  deleteAction: (formData: FormData) => void | Promise<void>;
  fields: HiddenField[];
  subject: string;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const confirmationId = useId();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return <div className={styles.deleteControl} ref={control}>
    <button
      className={styles.dangerButton}
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open ? confirmationId : undefined}
      onClick={() => setOpen((current) => !current)}
    >Delete</button>
    {open && <div className={styles.deleteConfirmation} id={confirmationId} role="dialog" aria-label={`Confirm deletion of ${subject}`}>
      <strong>Delete {subject}?</strong>
      <p>{message}</p>
      <div className={styles.deleteConfirmationActions}>
        <button className={styles.cancelButton} type="button" onClick={() => setOpen(false)}>Cancel</button>
        <form action={deleteAction}>
          {fields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value} />)}
          <DeleteSubmitButton />
        </form>
      </div>
    </div>}
  </div>;
}
