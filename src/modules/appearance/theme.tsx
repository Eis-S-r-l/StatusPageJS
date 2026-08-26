import type { CSSProperties } from "react";

import type { PublicAppearance } from "./server";

type ThemeStyle = CSSProperties & Record<`--theme-${"light" | "dark"}-${string}`, string>;

export function appearanceStyle(appearance: PublicAppearance): ThemeStyle {
  const style = {} as ThemeStyle;
  for (const [field, color] of Object.entries(appearance.lightPalette)) style[`--theme-light-${field}`] = color;
  for (const [field, color] of Object.entries(appearance.darkPalette)) style[`--theme-dark-${field}`] = color;
  return style;
}

export const bootThemeScript = `(function(){try{var saved=localStorage.getItem('eis-theme');var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=saved==='light'||saved==='dark'?saved:(dark?'dark':'light');}catch(e){document.documentElement.dataset.theme='light';}})();`;
