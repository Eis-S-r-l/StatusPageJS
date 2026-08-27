"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import styles from "./admin.module.css";

/** Reusable modal wrapper for action-state admin forms. */
export function DialogForm({ button, title, children }: { button: string; title: string; children: (close: () => void) => ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [formKey, setFormKey] = useState(0);
  const [open, setOpen] = useState(false);
  const close = () => { setOpen(false); setFormKey((current) => current + 1); };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return <><button type="button" className={styles.secondaryButton} onClick={() => setOpen(true)}>{button}</button><dialog ref={dialog} className={styles.modal} aria-labelledby={titleId} onCancel={close}><div className={styles.modalCard}><div className={styles.modalHeader}><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close" onClick={close}>×</button></div><div key={formKey}>{children(close)}</div></div></dialog></>;
}
