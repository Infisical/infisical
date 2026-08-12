import { describe, expect, it } from "vitest";

import { parseDiff, verifyAnchor } from "../src/verify/anchor.js";

/**
 * The model picks which line; these two pieces decide whether its answer is usable. Line numbers
 * are computed here rather than derived by the model, and every answer is checked against the diff
 * before it can become a comment on somebody's code.
 */

const DIFF = `diff --git a/frontend/src/pages/project/AccessControlPage/index.tsx b/frontend/src/pages/project/AccessControlPage/index.tsx
index 1111111..2222222 100644
--- a/frontend/src/pages/project/AccessControlPage/index.tsx
+++ b/frontend/src/pages/project/AccessControlPage/index.tsx
@@ -10,6 +10,6 @@ export const AccessControlPage = () => {
   return (
     <Page>
-      <Heading>Access Controls</Heading>
+      <Heading>Access Control</Heading>
       <Tabs />
     </Page>
   );
diff --git a/backend/src/services/thing.ts b/backend/src/services/thing.ts
index 3333333..4444444 100644
--- a/backend/src/services/thing.ts
+++ b/backend/src/services/thing.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
`;

describe("parseDiff", () => {
  it("finds every changed file", () => {
    expect(parseDiff(DIFF).map((entry) => entry.file)).toEqual([
      "frontend/src/pages/project/AccessControlPage/index.tsx",
      "backend/src/services/thing.ts"
    ]);
  });

  it("numbers lines against the new version of the file", () => {
    // The hunk starts at new-file line 10. Two context lines take 10 and 11, the removed line
    // does not exist in the new file and so consumes no number, which puts the added Heading
    // at 12. Getting this off by one would put the comment on the wrong line of the right file.
    const frontend = parseDiff(DIFF)[0];
    const added = frontend?.lines.find((line) => line.text.includes("Access Control<"));
    expect(added).toEqual({ line: 12, text: "      <Heading>Access Control</Heading>", added: true });
  });

  it("keeps context lines so a label defined nearby can still be found", () => {
    const frontend = parseDiff(DIFF)[0];
    expect(frontend?.lines.some((line) => !line.added && line.text.includes("<Tabs />"))).toBe(
      true
    );
  });

  it("gives removed lines no line number, since they are not in the new file", () => {
    const frontend = parseDiff(DIFF)[0];
    expect(frontend?.lines.some((line) => line.text.includes("Access Controls<"))).toBe(false);
  });

  it("returns nothing for an empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("ignores a chunk with no hunk header", () => {
    const binary = `diff --git a/a.png b/a.png
index 111..222 100644
Binary files a/a.png and b/a.png differ
`;
    expect(parseDiff(binary)).toEqual([]);
  });
});

describe("verifyAnchor", () => {
  // A real file in this repo, so the line-count check has something true to check against.
  const realFile = "guiderails/src/verify/anchor.ts";

  it("rejects a file that is not in the diff", () => {
    // This is the check that stops a hallucinated path becoming a comment on unrelated code.
    expect(
      verifyAnchor({ file: "frontend/src/nope.tsx", line: 1, reasoning: "" }, [realFile])
    ).toBeNull();
  });

  it("rejects a non-frontend file even when it is in the diff", () => {
    expect(
      verifyAnchor({ file: "backend/src/x.ts", line: 1, reasoning: "" }, ["backend/src/x.ts"])
    ).toBeNull();
  });

  it("rejects a line past the end of the file", () => {
    expect(
      verifyAnchor(
        { file: "frontend/src/main.tsx", line: 9_999_999, reasoning: "" },
        ["frontend/src/main.tsx"]
      )
    ).toBeNull();
  });

  it("rejects a line number below one", () => {
    expect(
      verifyAnchor({ file: "frontend/src/main.tsx", line: 0, reasoning: "" }, [
        "frontend/src/main.tsx"
      ])
    ).toBeNull();
  });

  it("rejects a file that does not exist on disk", () => {
    expect(
      verifyAnchor({ file: "frontend/src/ghost.tsx", line: 1, reasoning: "" }, [
        "frontend/src/ghost.tsx"
      ])
    ).toBeNull();
  });

  it("accepts a real frontend file in the diff and normalizes a leading slash", () => {
    const anchor = verifyAnchor(
      { file: "./frontend/src/main.tsx", line: 1, reasoning: "because" },
      ["frontend/src/main.tsx"]
    );
    expect(anchor).toEqual({ file: "frontend/src/main.tsx", line: 1, reasoning: "because" });
  });
});
