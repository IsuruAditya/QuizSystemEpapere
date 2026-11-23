import type { Metadata, Viewport } from "next";
import { Abhaya_Libre, Gemunu_Libre } from "next/font/google";
import { cookies } from "next/headers";
import "katex/dist/katex.min.css";
import "./globals.css";
import { getT } from "@/server/http/page";

export const metadata: Metadata = {
  title: { default: "e-Paperé Exams", template: "%s · e-Paperé Exams" },
  description: "e-Paperé Online Institute exams",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0F766E" }, { media: "(prefers-color-scheme: dark)", color: "#091312" }] };

/*
 * Sinhala typefaces, self-hosted by next/font at build time (no runtime request to Google; CSP font-src 'self').
 * Abhaya Libre: reading text (body, questions, options). Gemunu Libre: headings and the brand name only
 * (too condensed for small labels). Only the Sinhala subset is preloaded; the CSS stacks in globals.css put
 * Latin UI fonts first, so these faces render Sinhala only. No metric-adjusted fallback is generated.
 */
const sinhalaText = Abhaya_Libre({ subsets: ["sinhala"], weight: ["400", "500", "600", "700"], display: "swap", adjustFontFallback: false, variable: "--font-sinhala-text" });
const sinhalaDisplay = Gemunu_Libre({ subsets: ["sinhala"], display: "swap", adjustFontFallback: false, variable: "--font-sinhala-display" });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, tr } = await getT();
  const theme = (await cookies()).get("ep_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang} data-theme={theme} className={`${sinhalaText.variable} ${sinhalaDisplay.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:p-2 focus:text-brand-fg">
          {tr("skipToContent")}
        </a>
        {children}
      </body>
    </html>
  );
}
