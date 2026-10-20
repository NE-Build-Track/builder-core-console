import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { AutoRefresh, PointerGlow } from "@/components/console/ambient";
import { CommandPalette } from "@/components/console/command-palette";
import { IconSprite } from "@/components/console/icons";
import { RailNav } from "@/components/console/rail-nav";
import { THEME_SCRIPT } from "@/components/console/theme";
import { ThemeToggle } from "@/components/console/theme-toggle";
import { Toaster } from "@/components/console/toaster";
import { Tooltips } from "@/components/console/tooltips";
import { Ago, Id, Pill } from "@/components/console/values";
import { PINS, shortCommit } from "@/domain/pins";
import { consoleSettings, loadNavCounts, loadStackHealth } from "@/runtime/console";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Builder console", template: "%s · Builder console" },
  description: "A read-only view of a livepeer-builder stack: engine, Batteries and the remote signer.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Applies a stored light/dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <IconSprite />
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-inner">
            <Link className="brand" href="/" aria-label="Builder console, health">
              <span className="brand-mark">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="5" height="5" rx="1.2" />
                  <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
                  <rect x="16" y="16" width="5" height="5" rx="1.2" />
                  <rect x="16" y="3" width="5" height="5" rx="1.2" opacity=".45" />
                  <rect x="3" y="16" width="5" height="5" rx="1.2" opacity=".45" />
                </svg>
              </span>
              <span className="brand-name">Builder console</span>
            </Link>
            <Suspense fallback={<span className="topbar-spacer" />}>
              <TopStatus />
            </Suspense>
            <CommandPalette />
            <ThemeToggle />
          </div>
          <div className="progress" aria-hidden="true" />
        </header>
        <div className="shell">
          <nav className="rail" aria-label="Console sections">
            <Suspense fallback={<RailNav counts={null} />}>
              <RailWithCounts />
            </Suspense>
            <div className="rail-foot">
              <Pill state="ok" quiet>
                Read-only: every route is a GET
              </Pill>
              <Suspense fallback={<EnginePin version={null} />}>
                <ReportedPin />
              </Suspense>
              <span>
                Batteries <Id value={shortCommit(PINS.batteries.commit)} /> · signer <Id value={shortCommit(PINS.signer.commit)} />
              </span>
              <span>Reads the stack every 15 s. Stores nothing.</span>
            </div>
          </nav>
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
        <Toaster />
        <Tooltips />
        <PointerGlow />
      </body>
    </html>
  );
}

/** The application chip, the verdict pill and when it was checked: read at request time. */
async function TopStatus() {
  await connection();
  const [health, settings] = await Promise.all([loadStackHealth(), Promise.resolve(consoleSettings())]);
  return (
    <>
      <span className="env-chip" title="The engine application this console reads (CONSOLE_APPLICATION_ID)">
        {settings.applicationId} · {health.engine.ok ? health.engine.value.allocation_mode.replace("_", "-") : "engine unreachable"}
      </span>
      <span className="topbar-spacer" />
      <Link className="pill verdict-mini" data-state={health.verdict.state} href="/">
        <i className="glyph" />
        {health.verdict.short}
      </Link>
      <span className="checked">
        checked <Ago iso={health.checkedAt} />
      </span>
      <AutoRefresh seconds={settings.refreshS} />
    </>
  );
}

async function RailWithCounts() {
  await connection();
  return <RailNav counts={await loadNavCounts()} />;
}

async function ReportedPin() {
  await connection();
  const health = await loadStackHealth();
  return <EnginePin version={health.engine.ok ? health.engine.value.version : null} />;
}

function EnginePin({ version }: { readonly version: string | null }) {
  return (
    <span>
      Engine <Id value={shortCommit(PINS.engine.commit)} />
      {version ? (
        <>
          {" "}
          · reports <Id value={version} />
        </>
      ) : null}
    </span>
  );
}
