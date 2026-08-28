"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { Locale } from "@/modules/i18n/config";
import type { ServiceState, UptimeDay } from "@/modules/status/types";

import styles from "./public.module.css";

type Labels = {
  history: string;
  noEvents: string;
  events: string;
  states: Record<ServiceState, string>;
};

function formatDay(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function UptimeHistory({
  serviceName,
  days,
  locale,
  labels,
}: {
  serviceName: string;
  days: UptimeDay[];
  locale: Locale;
  labels: Labels;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, ready: false });
  const anchors = useRef<Array<HTMLButtonElement | null>>([]);
  const popover = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();
  const activeDay = activeIndex === null ? null : days[activeIndex] ?? null;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActiveIndex(null), 120);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    if (activeIndex === null) return;
    const anchor = anchors.current[activeIndex];
    const panel = popover.current;
    if (!anchor || !panel) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(
      Math.max(12, anchorRect.left + anchorRect.width / 2 - panelRect.width / 2),
      window.innerWidth - panelRect.width - 12,
    );
    const above = anchorRect.top - panelRect.height - gap;
    const top = above >= 12 ? above : Math.min(window.innerHeight - panelRect.height - 12, anchorRect.bottom + gap);
    setPosition({ left, top: Math.max(12, top), ready: true });
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (activeIndex === null) return;
    updatePosition();
  }, [activeIndex, updatePosition]);

  useEffect(() => {
    if (activeIndex === null) return;
    const handleViewportChange = () => updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popover.current?.contains(target) || anchors.current[activeIndex]?.contains(target)) return;
      setActiveIndex(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
        anchors.current[activeIndex]?.focus();
      }
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, updatePosition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return <>
    <div className={styles.historyScroller}>
      <div
        className={styles.history}
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(4px, 1fr))`, minWidth: `${Math.max(days.length * 7, 0)}px` }}
        aria-label={`${serviceName}: ${labels.history}`}
      >
        {days.map((day, index) => {
          const formattedDate = formatDay(day.date, locale);
          const isActive = activeIndex === index;
          return <button
            className={`${styles.historyDay} ${styles[day.state]}`}
            type="button"
            key={day.date}
            ref={(element) => { anchors.current[index] = element; }}
            aria-label={`${formattedDate}: ${labels.states[day.state]}. ${day.events.length ? `${day.events.length} ${labels.events}` : labels.noEvents}`}
            aria-describedby={isActive ? popoverId : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") {
                cancelClose();
                setActiveIndex(index);
              }
            }}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") closeSoon(); }}
            onFocus={() => { cancelClose(); setActiveIndex(index); }}
            onBlur={closeSoon}
            onClick={() => { cancelClose(); setActiveIndex(index); }}
          />;
        })}
      </div>
    </div>
    {activeDay && typeof document !== "undefined" ? createPortal(
      <div
        id={popoverId}
        ref={popover}
        className={styles.historyPopover}
        role="tooltip"
        aria-label={formatDay(activeDay.date, locale)}
        style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}
        onPointerEnter={cancelClose}
        onPointerLeave={closeSoon}
      >
        <div className={styles.historyPopoverHeading}>
          <strong>{formatDay(activeDay.date, locale)}</strong>
          <span>{labels.states[activeDay.state]}</span>
        </div>
        {activeDay.events.length ? <>
          <p>{labels.events}</p>
          <ul>{activeDay.events.map((event) => <li key={`${event.kind}-${event.slug}`}>
            <i className={styles[event.impact]} aria-hidden="true" />
            <span>{event.title[locale]}</span>
          </li>)}</ul>
        </> : <p>{labels.noEvents}</p>}
      </div>,
      document.body,
    ) : null}
  </>;
}
