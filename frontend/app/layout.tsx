import type {Metadata} from "next";
import type {ReactNode} from "react";
import Script from "next/script";
import "./globals.css";
import {ThemeSwitch} from "./theme-switch";

export const metadata: Metadata = {
  title: "Fire Factory Si",
  description: "Fire Factory Si on Firebase.",
};

const themeBoot = `(function(){try{var stored=localStorage.getItem("ff-theme");var choice=stored==="light"||stored==="dark"?stored:"system";var dark=matchMedia("(prefers-color-scheme: dark)").matches;var resolved=choice==="system"?(dark?"dark":"light"):choice;var root=document.documentElement;root.dataset.theme=choice;root.dataset.resolved=resolved;}catch(e){}})();`;

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        <ThemeSwitch />
        <main>{children}</main>
      </body>
    </html>
  );
}
