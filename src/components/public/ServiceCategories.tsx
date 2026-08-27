"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  COLLAPSED_CATEGORIES_COOKIE,
  COLLAPSED_CATEGORIES_COOKIE_MAX_AGE,
  serializeCollapsedCategoryIds,
} from "./collapsed-categories-cookie";
import styles from "./public.module.css";

export type CategoryLabels = {
  expandCategory: string;
  collapseCategory: string;
};

export type ServiceCategoryContent = {
  id: string;
  name: string;
  content: ReactNode;
};

function persistCollapsedCategoryIds(ids: Set<string>) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COLLAPSED_CATEGORIES_COOKIE}=${encodeURIComponent(serializeCollapsedCategoryIds(ids))}; Path=/; Max-Age=${COLLAPSED_CATEGORIES_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function ServiceCategories({
  categoryContent,
  collapsedCategoryIds,
  labels,
}: {
  categoryContent: ServiceCategoryContent[];
  collapsedCategoryIds: string[];
  labels: CategoryLabels;
}) {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(collapsedCategoryIds));
  const toggleCategory = (categoryId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      persistCollapsedCategoryIds(next);
      return next;
    });
  };

  return categoryContent.map((category) => {
    const isCollapsed = collapsedIds.has(category.id);
    const panelId = `category-services-${category.id}`;
    return (
      <section className={styles.category} key={category.id}>
        <h3 className={styles.categoryHeading}>
          <button type="button" className={styles.categoryToggle} aria-expanded={!isCollapsed} aria-controls={panelId} onClick={() => toggleCategory(category.id)}>
            <span>{category.name}</span>
            <ChevronDown className={isCollapsed ? styles.categoryChevronCollapsed : styles.categoryChevron} aria-hidden="true" />
            <span className={styles.visuallyHidden}>{isCollapsed ? labels.expandCategory : labels.collapseCategory}</span>
          </button>
        </h3>
        <div id={panelId} hidden={isCollapsed}>{category.content}</div>
      </section>
    );
  });
}
