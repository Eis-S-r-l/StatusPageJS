"use client";

import { useRef, useState, type ReactNode } from "react";

import { slugify } from "@/modules/content/slug";

import styles from "./admin.module.css";

export function AutoSlugFields({
  sourceLabel,
  sourceName,
  sourceDefaultValue = "",
  slugDefaultValue = "",
  slugPlaceholder,
  afterSource,
  beforeSlug,
}: {
  sourceLabel: string;
  sourceName: "nameEn" | "titleEn";
  sourceDefaultValue?: string;
  slugDefaultValue?: string;
  slugPlaceholder?: string;
  afterSource?: ReactNode;
  beforeSlug?: ReactNode;
}) {
  const [source, setSource] = useState(sourceDefaultValue);
  const [slug, setSlug] = useState(slugDefaultValue || slugify(sourceDefaultValue));
  const followsSource = useRef(!slugDefaultValue);

  return <>
    <label className={styles.field}>{sourceLabel}
      <input
        name={sourceName}
        required
        value={source}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setSource(next);
          if (followsSource.current) setSlug(slugify(next));
        }}
      />
    </label>
    {afterSource}
    {beforeSlug}
    <label className={styles.field}>Slug
      <input
        name="slug"
        required
        value={slug}
        placeholder={slugPlaceholder}
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        maxLength={100}
        onChange={(event) => {
          followsSource.current = false;
          setSlug(event.currentTarget.value);
        }}
      />
      <small className={styles.fieldHint}>Generated from the English title; you can edit it.</small>
    </label>
  </>;
}
