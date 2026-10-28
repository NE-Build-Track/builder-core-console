/**
 * The upstream commits this console is built and tested against. deploy/compose.yaml builds the same
 * commits; tests/structure/pins.test.ts fails when the two disagree. The footer shows these next to the
 * engine's own reported version, so a mismatch is visible on every page.
 */
export const PINS = {
  engine: {
    repository: "NE-Build-Track/livepeer-builder-core",
    commit: "a2e61e4dcbec7a21fd5ab338ab359a4f5123ed87",
    note: "tasks/mz/actors-and-auditor (PR #69, #53 rebuilt on releases/m3 2134e29): JWT bearer, actors and the auditor; re-pin to its merge",
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
