/**
 * The upstream commits this console is built and tested against. deploy/compose.yaml builds the same
 * commits; tests/structure/pins.test.ts fails when the two disagree. The footer shows these next to the
 * engine's own reported version, so a mismatch is visible on every page.
 */
export const PINS = {
  engine: {
    repository: "NE-Build-Track/livepeer-builder-core",
    commit: "f58a2b1ab47e9265eb2c9708bf02b47b3b2110fa",
    note: "tasks/mz/iss-11-14-idempotency (PR #76, on releases/m3 after #69): admin commands require an operation reference and are repeat-safe (D57)",
  },
  batteries: {
    repository: "livepeer/clearinghouse-batteries",
    commit: "ca09e47c067682fb48c3f15425546fb6aa5b6659",
    note: "same as ChatLPT and builder-core's dev stack",
  },
  signer: {
    repository: "livepeer/node",
    commit: "406b248f6cb8728e6e7eba1809901f589060bc6b",
    note: "v1.0.2, same as ChatLPT and builder-core's dev stack",
  },
} as const;

export type PinnedComponent = keyof typeof PINS;

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}
