"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import styles from "./admin.module.css";

export function LocalDateTimeField({ label, name, defaultValue, required = false }: {
  label: string;
  name: string;
  defaultValue?: string | Date | null;
  required?: boolean;
}) {
  const toLocal = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };
  const ready = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const [changedLocalValue, setChangedLocalValue] = useState<string | null>(null);
  const defaultLocalValue = ready ? toLocal(defaultValue) : "";
  const localValue = changedLocalValue ?? defaultLocalValue;
  const utcValue = localValue ? new Date(localValue).toISOString() : "";
  const timezoneOffset = ready ? String(new Date().getTimezoneOffset()) : "";
  const timezoneName = ready ? Intl.DateTimeFormat().resolvedOptions().timeZone || "local" : "";
  const id = useId();

  return <label className={styles.field} htmlFor={id}>{label}
    <input
      id={id}
      type="datetime-local"
      value={localValue}
      required={required}
      disabled={!ready}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setChangedLocalValue(next);
      }}
    />
    <input type="hidden" name={name} value={utcValue} />
    <input type="hidden" name={`${name}TimezoneOffset`} value={timezoneOffset} />
    <input type="hidden" name={`${name}TimezoneName`} value={timezoneName} />
    <small className={styles.fieldHint}>{ready ? `Shown in your timezone (${timezoneName}); saved as UTC.` : "Detecting your browser timezone…"}</small>
  </label>;
}

export function RichTextField({ label, name, defaultValue = "", required = false }: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
    ],
    content: defaultValue,
    onUpdate: ({ editor: current }) => setValue(current.isEmpty ? "" : current.getHTML()),
    editorProps: { attributes: { id, class: styles.richEditor, role: "textbox", "aria-multiline": "true", "aria-label": label } },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== defaultValue) editor.commands.setContent(defaultValue);
  }, [defaultValue, editor]);

  const toggleLink = () => {
    if (!editor) return;
    if (editor.isActive("link")) return void editor.chain().focus().unsetLink().run();
    const href = window.prompt("Link URL (https://, http://, or mailto:)");
    if (href && /^(https?:\/\/|mailto:)/i.test(href)) editor.chain().focus().setLink({ href }).run();
  };

  return <div className={styles.richField}>
    <span className={styles.richLabel}>{label}</span>
    <div className={styles.richToolbar} role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" aria-pressed={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
      <button type="button" aria-pressed={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
      <button type="button" aria-pressed={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
      <button type="button" aria-pressed={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
      <button type="button" aria-pressed={editor?.isActive("link")} onClick={toggleLink}>Link</button>
    </div>
    <EditorContent editor={editor} />
    <input type="hidden" name={name} value={value} required={required} />
  </div>;
}
