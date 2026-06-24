import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuildRight — SEO Snapshot Tool",
  description: "Capture and archive a site's SEO state before a redesign.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <Providers>
          <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="bg-foreground text-background inline-flex size-6 items-center justify-center rounded-md text-xs font-bold">
                  B
                </span>
                BuildRight
              </Link>
              <span className="text-muted-foreground hidden text-sm sm:inline">SEO Snapshot Tool</span>
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
