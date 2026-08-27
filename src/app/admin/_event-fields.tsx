"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
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
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
      TextStyle,
      FontSize,
      TableKit.configure({ table: { resizable: false } }),
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
      <select
        aria-label="Text style"
        value={editor?.isActive("heading", { level: 2 }) ? "2" : editor?.isActive("heading", { level: 3 }) ? "3" : editor?.isActive("heading", { level: 4 }) ? "4" : "p"}
        onChange={(event) => {
          const level = event.currentTarget.value;
          if (level === "p") editor?.chain().focus().setParagraph().run();
          else editor?.chain().focus().setHeading({ level: Number(level) as 2 | 3 | 4 }).run();
        }}
      >
        <option value="p">Paragraph</option><option value="2">Title</option><option value="3">Subtitle</option><option value="4">Small title</option>
      </select>
      <select
        aria-label="Text size"
        value={editor?.getAttributes("textStyle").fontSize ?? ""}
        onChange={(event) => event.currentTarget.value ? editor?.chain().focus().setFontSize(event.currentTarget.value).run() : editor?.chain().focus().unsetFontSize().run()}
      >
        <option value="">Default size</option><option value="13px">Small</option><option value="16px">Medium</option><option value="20px">Large</option><option value="24px">Extra large</option>
      </select>
      <button type="button" aria-pressed={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
      <button type="button" aria-pressed={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
      <button type="button" aria-pressed={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
      <button type="button" aria-pressed={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
      <button type="button" aria-pressed={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
      <button type="button" aria-pressed={editor?.isActive("link")} onClick={toggleLink}>Link</button>
      <span className={styles.toolbarDivider} aria-hidden="true" />
      <button type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Table</button>
      <button type="button" disabled={!editor?.isActive("table")} onClick={() => editor?.chain().focus().addRowAfter().run()}>+ Row</button>
      <button type="button" disabled={!editor?.isActive("table")} onClick={() => editor?.chain().focus().deleteRow().run()}>− Row</button>
      <button type="button" disabled={!editor?.isActive("table")} onClick={() => editor?.chain().focus().addColumnAfter().run()}>+ Column</button>
      <button type="button" disabled={!editor?.isActive("table")} onClick={() => editor?.chain().focus().deleteColumn().run()}>− Column</button>
      <button type="button" disabled={!editor?.isActive("table")} onClick={() => editor?.chain().focus().deleteTable().run()}>Remove table</button>
    </div>
    <EditorContent editor={editor} />
    <input type="hidden" name={name} value={value} required={required} />
  </div>;
}
