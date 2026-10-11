import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DURBAR COLLEZIONI — A World of Distinction",
  description: "The complete Durbar wardrobe. Signature polos, tailoring, eveningwear, footwear, fragrance and Junior — a global expression of modern luxury.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
