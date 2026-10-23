/**
 * The upstream commits this console is built and tested against. deploy/compose.yaml builds the same
 * commits; tests/structure/pins.test.ts fails when the two disagree. The footer shows these next to the
 * engine's own reported version, so a mismatch is visible on every page.
 */
export const PINS = {
  engine: {
    repository: "NE-Build-Track/livepeer-builder-core",
    commit: "165e60192f85a736bcda9df429d5078bf0328ea2",
    note: "releases/m3: the merge of PR #28 (streaming) and PR #31 (gateway 3238731, D41); the commit ChatLPT pins",
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
