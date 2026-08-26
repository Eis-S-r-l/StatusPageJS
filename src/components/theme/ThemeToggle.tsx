"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (!localStorage.getItem("eis-theme")) document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    onChange();
  };
  window.addEventListener("eis-theme-change", onChange);
  media.addEventListener("change", onSystemChange);
  return () => { window.removeEventListener("eis-theme-change", onChange); media.removeEventListener("change", onSystemChange); };
}

export function ThemeToggle({ labelLight = "Use light mode", labelDark = "Use dark mode", className }: { labelLight?: string; labelDark?: string; className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("eis-theme", next);
    window.dispatchEvent(new Event("eis-theme-change"));
  }

  const nextLabel = theme === "dark" ? labelLight : labelDark;
  return <button className={className} type="button" onClick={toggle} aria-label={nextLabel} title={nextLabel}>
    {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
  </button>;
}
