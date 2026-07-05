import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const origin = env("PUBLIC_ORIGIN") ?? "https://lp-hisho.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: { default: "LP秘書", template: "%s — LP秘書" },
  description:
    "計測から分析・改善提案・公開までLINEの中で完結する、あなた専用のLP秘書。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
