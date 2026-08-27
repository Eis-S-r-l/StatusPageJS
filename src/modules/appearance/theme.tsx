import type { CSSProperties } from "react";

import type { PublicAppearance } from "./server";

type ThemeStyle = CSSProperties & Record<`--theme-${"light" | "dark"}-${string}`, string>;
export type Theme = "light" | "dark";

export function appearanceStyle(appearance: PublicAppearance): ThemeStyle {
  const style = {} as ThemeStyle;
  for (const [field, color] of Object.entries(appearance.lightPalette)) style[`--theme-light-${field}`] = color;
  for (const [field, color] of Object.entries(appearance.darkPalette)) style[`--theme-dark-${field}`] = color;
  return style;
}

export function themeFromCookie(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export const bootThemeScript = `(function(){try{var saved=localStorage.getItem('eis-theme');var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=saved==='light'||saved==='dark'?saved:(dark?'dark':'light');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;var cookie='eis-theme='+theme+'; Path=/; Max-Age=31536000; SameSite=Lax';if(location.protocol==='https:')cookie+='; Secure';document.cookie=cookie;}catch(e){document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';}})();`;
