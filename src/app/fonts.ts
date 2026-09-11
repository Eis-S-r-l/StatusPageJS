import localFont from "next/font/local";

export const inter = localFont({
  src: "./assets/fonts/Inter-latin.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "swap",
});

export const manrope = localFont({
  src: "./assets/fonts/Manrope-latin.woff2",
  weight: "200 800",
  variable: "--font-display",
  display: "swap",
});

export const fontClassName = `${inter.variable} ${manrope.variable}`;
