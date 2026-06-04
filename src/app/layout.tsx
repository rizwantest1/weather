import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * SEO metadata as required by the spec.
 */
export const metadata: Metadata = {
  title: "Bangladesh Weather Forecast",
  description:
    "Latest Bangladesh Meteorological Department forecast PDF updated automatically.",
  applicationName: "Bangladesh Weather Forecast",
  keywords: [
    "Bangladesh weather",
    "BMD forecast",
    "Bangladesh Meteorological Department",
    "weather forecast PDF",
    "Dhaka weather",
  ],
  authors: [{ name: "Bangladesh Weather Forecast" }],
  openGraph: {
    title: "Bangladesh Weather Forecast",
    description:
      "Latest Bangladesh Meteorological Department forecast PDF updated automatically.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bangladesh Weather Forecast",
    description:
      "Latest Bangladesh Meteorological Department forecast PDF updated automatically.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

/**
 * Inline script that applies the saved/system theme BEFORE first paint to
 * avoid a flash of the wrong theme (FOUC).
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
