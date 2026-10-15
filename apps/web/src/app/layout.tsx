import type { Metadata } from "next";
import { Bricolage_Grotesque, } from "next/font/google";
import type { ReactNode } from "react";
import { AuthProvider } from "@/providers/auth-provider";
import "./globals.css";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PayScope",
  description: "HR compensation management for ACME",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolageGrotesque.className} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
