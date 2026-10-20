/**
 * Page and data transitions with React's <ViewTransition> (Next.js 16.4, React 19.3; see
 * node_modules/next/dist/docs/01-app/02-guides/view-transitions.md). A page fades and settles in on
 * navigation; its data replaces the skeleton the same way when the reads arrive. The CSS for both is
 * in globals.css (@layer motion) and is skipped when motion is reduced.
 */
import { Suspense, ViewTransition, type ReactNode } from "react";

import { PageSkeleton } from "./primitives";

export function PageView({ children }: { readonly children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <div className="view">{children}</div>
    </ViewTransition>
  );
}

/** The page's data, streamed in under a skeleton. `tiles` sizes the skeleton to the page. */
export function Streamed({ children, tiles, keyed }: { readonly children: ReactNode; readonly tiles?: number; readonly keyed?: string }) {
  return (
    <Suspense
      key={keyed}
      fallback={
        <ViewTransition exit="skeleton-out" default="none">
          <PageSkeleton tiles={tiles} />
        </ViewTransition>
      }
    >
      <ViewTransition enter="data-in" default="none">
        <div className="view-body">{children}</div>
      </ViewTransition>
    </Suspense>
  );
}
