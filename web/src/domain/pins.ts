/**
 * The upstream commits this console is built and tested against. deploy/compose.yaml builds the same
 * commits; tests/structure/pins.test.ts fails when the two disagree. The footer shows these next to the
 * engine's own reported version, so a mismatch is visible on every page.
 */
export const PINS = {
  engine: {
    repository: "NE-Build-Track/livepeer-builder-core",
    commit: "719378fef583a70f2321f0de5dcf8553df978667",
    note: "the hardened releases/m4 of 17 November 2026: v0.2.0 plus the hardening tickets #112 to #115 (migrations 0012 and 0013). It has no tag yet",
  },
  batteries: {
    repository: "livepeer/clearinghouse-batteries",
    commit: "03bc9fb5e15b073e68986ec0261e68d7ecd9598b",
    note: "v0.0.3, the release builder-core's dev stack runs since v0.2.1",
  },
  signer: {
    repository: "livepeer/node",
    commit: "eee09c41f46d64a34bfd9ed3c9cb649536490f13",
    note: "v1.0.7. Its chain observer polls the RPC provider non-stop, also with no jobs (builder-core #159)",
  },
  discovery: {
    repository: "livepeer/node",
    commit: "eee09c41f46d64a34bfd9ed3c9cb649536490f13",
    note: "livepeer-discovery in static mode (D63), from the same v1.0.7 image as the signer",
  },
} as const;

export type PinnedComponent = keyof typeof PINS;

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}
