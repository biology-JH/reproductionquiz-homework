import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reproduction Mastery | IGCSE Biology 0610",
  description: "A password-protected, slide-informed Chapter 16 Reproduction practice exam for Cambridge IGCSE Biology 0610.",
  icons: { icon: "/reproduction-mark.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
