import styles from "./admin.module.css";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return <header className={styles.header}><div><h1>{title}</h1><p>{description}</p></div></header>;
}

export function Notice({ error, saved }: { error?: string; saved?: string }) {
  if (error) return <p className={styles.alert} role="alert">{error}</p>;
  if (saved) return <p className={styles.success}>Changes saved successfully.</p>;
  return null;
}

export function Unavailable({ message }: { message: string }) { return <div className={styles.empty}>{message}</div>; }
