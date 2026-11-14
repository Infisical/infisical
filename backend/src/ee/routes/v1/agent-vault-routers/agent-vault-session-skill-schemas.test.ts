import { describe, expect, test } from "vitest";

import { AgentVaultSessionSkillsInputSchema } from "./agent-vault-schemas";

const inline = (name: string, extra: { path: string; mode: string; contentBase64: string }[] = []) => ({
  files: [
    {
      path: "SKILL.md",
      mode: "0644",
      contentBase64: Buffer.from(`---\nname: ${name}\ndescription: Does ${name}.\n---\nBody.\n`).toString("base64")
    },
    ...extra
  ]
});

const issuesOf = (input: unknown) => {
  const result = AgentVaultSessionSkillsInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
};

describe("a session's skills request schema", () => {
  test("takes project skills by name beside inline ones, in the order sent", () => {
    const parsed = AgentVaultSessionSkillsInputSchema.parse(["code-review", inline("scratch"), "release-notes"]);
    expect(parsed.map((entry) => (typeof entry === "string" ? entry : "inline"))).toEqual([
      "code-review",
      "inline",
      "release-notes"
    ]);
  });

  test("refuses a name used twice, whether named or in an inline skill's SKILL.md, at the second one", () => {
    const message =
      'More than one skill in this session is named "code-review". Give each a different name, or leave one out.';
    expect(issuesOf(["code-review", "code-review"])).toEqual([expect.objectContaining({ path: [1], message })]);
    expect(issuesOf(["code-review", inline("code-review")])).toEqual([expect.objectContaining({ path: [1], message })]);
    expect(issuesOf([inline("code-review"), inline("code-review")])).toEqual([
      expect.objectContaining({ path: [1], message })
    ]);
  });

  test("leaves an inline skill whose SKILL.md doesn't parse to the session, which names the problem", () => {
    const broken = {
      files: [{ path: "SKILL.md", mode: "0644", contentBase64: Buffer.from("no header").toString("base64") }]
    };
    expect(issuesOf(["code-review", broken, broken])).toEqual([]);
  });

  test("caps the project skills a session names at 20 and the inline ones at 5", () => {
    const names = Array.from({ length: 21 }, (_, index) => `skill-${index}`);
    expect(issuesOf(names)[0]).toMatchObject({
      code: "custom",
      message: "A session can name at most 20 of the project's skills."
    });
    expect(issuesOf(names.slice(0, 20))).toEqual([]);

    const inlineSkills = Array.from({ length: 6 }, (_, index) => inline(`inline-${index}`));
    expect(issuesOf(inlineSkills)[0]).toMatchObject({
      code: "custom",
      message: "A session can carry at most 5 inline skills. Add the others to the project and name them instead."
    });
    expect(issuesOf(inlineSkills.slice(0, 5))).toEqual([]);
  });

  test("refuses a list longer than both caps together before parsing its entries", () => {
    expect(issuesOf(Array.from({ length: 26 }, () => "Not A Slug"))).toEqual([
      expect.objectContaining({
        message: "A session can carry at most 20 of the project's skills and 5 inline skills."
      })
    ]);
  });

  test("checks a name like any slug, and an inline skill field by field beside names", () => {
    expect(issuesOf(["Not A Slug"])[0].path).toEqual([0]);
    expect(issuesOf(["code-review", { files: [] }])).toEqual([
      expect.objectContaining({ path: [1, "files"], message: "Upload at least SKILL.md" })
    ]);
    expect(issuesOf([{ files: [{ path: "SKILL.md", mode: "0600", contentBase64: "" }] }])[0].path).toEqual([
      0,
      "files",
      0,
      "mode"
    ]);
  });
});
