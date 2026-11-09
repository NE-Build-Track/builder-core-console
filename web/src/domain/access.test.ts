import { describe, expect, it } from "vitest";

import { isStackReadPath } from "./access";

describe("production read boundary", () => {
  it.each(["/", "/money", "/users", "/usage", "/jobs", "/network", "/sources", "/builder-other", "/operator-other"])("protects %s", (path) => {
    expect(isStackReadPath(path)).toBe(true);
  });

  it.each(["/operator", "/operator/", "/builder", "/builder/jobs", "/builder/api/jobs/1", "/builder/run", "/auth/callback", "/livez"])("leaves %s to its own authentication", (path) => {
    expect(isStackReadPath(path)).toBe(false);
  });
});
