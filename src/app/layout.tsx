import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Picture Day Scheduler — Sandbox Photographers",
  description: "Internal scheduling tool for Sandbox Photographers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
