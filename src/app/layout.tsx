import type { Metadata } from "next";
import "./globals.css";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";

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
      <body>
        {/* Every page, team app included — see UpdateAvailableBanner. */}
        <UpdateAvailableBanner />
        {children}
      </body>
    </html>
  );
}
