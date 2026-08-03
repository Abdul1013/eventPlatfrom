import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Use Inter as fallback for Apple HIG (SF Pro would require system fonts or custom loading)
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EventMerge",
  description: "Secure AES-256-GCM ticketing with dynamic QR codes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
