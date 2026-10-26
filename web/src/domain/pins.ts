/**
 * The upstream commits this console is built and tested against. deploy/compose.yaml builds the same
 * commits; tests/structure/pins.test.ts fails when the two disagree. The footer shows these next to the
 * engine's own reported version, so a mismatch is visible on every page.
 */
export const PINS = {
  engine: {
    repository: "NE-Build-Track/livepeer-builder-core",
    commit: "d0579355377b36694849d65d3311e408e594dd0b",
    note: "tasks/mz/iss-08-credentials (PR #48, ISS-08): releases/m3 629f1ab plus key inspection and rotation; re-pin to the merge",
  },
  batteries: {
    repository: "NE-Build-Track/clearinghouse-batteries",
    commit: "ca09e47c067682fb48c3f15425546fb6aa5b6659",
    note: "same as ChatLPT and builder-core's dev stack",
  },
  signer: {
    repository: "NE-Build-Track/node",
    commit: "406b248f6cb8728e6e7eba1809901f589060bc6b",
    note: "v1.0.2, same as ChatLPT and builder-core's dev stack",
  },
} as const;

export type PinnedComponent = keyof typeof PINS;

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}
