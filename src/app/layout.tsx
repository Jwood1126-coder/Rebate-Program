import type { Metadata } from "next";
import { AuthProvider } from "@/components/providers/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brennan Industries - Rebate Management System",
  description: "Centralized rebate master data management for sales operations",
  icons: {
    icon: "/brennan-icon.jpg",
    apple: "/brennan-icon.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
          <AuthProvider>{children}</AuthProvider>
        </body>
    </html>
  );
}
