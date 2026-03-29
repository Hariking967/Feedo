import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/client";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Food Rescue Platform",
  description: "Real-time surplus food redistribution operations platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TRPCReactProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} feedo-app antialiased`}
        >
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <div className="feedo-chrome">
              <div className="feedo-ambient" aria-hidden>
                <svg className="feedo-globe" viewBox="0 0 520 520" fill="none">
                  <circle cx="260" cy="260" r="204" className="feedo-orbit" />
                  <circle cx="260" cy="260" r="152" className="feedo-orbit feedo-orbit-muted" />
                  <path className="feedo-route" d="M94 278C150 186 230 140 323 152C388 160 435 202 463 260" />
                  <path className="feedo-route" d="M108 330C194 360 278 366 352 330C405 304 436 262 448 226" />
                  <path className="feedo-route feedo-route-muted" d="M134 204C210 242 286 248 352 220" />
                  <circle cx="94" cy="278" r="5" className="feedo-node" />
                  <circle cx="323" cy="152" r="5" className="feedo-node" />
                  <circle cx="463" cy="260" r="5" className="feedo-node" />
                  <circle cx="108" cy="330" r="4" className="feedo-node feedo-node-alt" />
                  <circle cx="352" cy="330" r="4" className="feedo-node feedo-node-alt" />
                  <circle cx="448" cy="226" r="4" className="feedo-node feedo-node-alt" />
                </svg>
                <svg className="feedo-food" viewBox="0 0 220 220" fill="none">
                  <circle cx="110" cy="110" r="92" className="feedo-food-ring" />
                  <path className="feedo-food-line" d="M70 132C82 154 110 168 138 162C154 158 168 147 176 132" />
                  <path className="feedo-food-line" d="M84 86C90 70 102 58 118 54C132 50 150 53 161 64" />
                  <path className="feedo-food-line feedo-food-line-soft" d="M63 110H157" />
                  <circle cx="84" cy="86" r="4" className="feedo-food-dot" />
                  <circle cx="118" cy="54" r="4" className="feedo-food-dot" />
                  <circle cx="161" cy="64" r="4" className="feedo-food-dot" />
                </svg>
              </div>
              <div className="feedo-page-transition">
                {children}
              </div>
            </div>
          </ThemeProvider>
        </body>
      </html>
    </TRPCReactProvider>
  );
}
