import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "katex/dist/katex.min.css";
import "./globals.css";
import { getT } from "@/server/http/page";

export const metadata: Metadata = {
  title: { default: "e-Paperé Exams", template: "%s · e-Paperé Exams" },
  description: "e-Paperé Online Institute exams",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3E3A98" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, tr } = await getT();
  const theme = (await cookies()).get("ep_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang} data-theme={theme}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:p-2 focus:text-brand-fg">
          {tr("skipToContent")}
        </a>
        {children}
      </body>
    </html>
  );
}
