"use client";

export function ConfirmDelete({ action, id, className }: { action: (formData: FormData) => void | Promise<void>; id: string; className: string }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Permanently delete this subscriber and all queued notification jobs?")) event.preventDefault(); }}><input type="hidden" name="id" value={id} /><button className={className} type="submit">Delete permanently</button></form>;
}
