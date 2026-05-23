import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CantinaPro",
  description: "Sistema de gestão para cantinas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-cp-bg text-white min-h-screen">{children}</body>
    </html>
  );
}
