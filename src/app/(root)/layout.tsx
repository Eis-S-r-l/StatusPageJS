import type { Metadata } from "next";

import { fontClassName } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "EIS Service Status",
  description: "Live availability and operational updates.",
};

export default function RedirectRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontClassName}>
      <body>{children}</body>
    </html>
  );
}
