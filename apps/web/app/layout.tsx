import "./globals.css";
import type { ReactNode } from "react";
import { Background } from "../components/bits";

export const metadata = { title: "Tulip" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Background />
        {children}
      </body>
    </html>
  );
}