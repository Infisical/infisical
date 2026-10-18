import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const generateWith = (file: string, from: string, to: string) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "ui-coverage-"));
  try {
    [
      "scripts/generate-ui.ts",
      "scripts/check-v4.ts",
      "src/components/v4",
      "src/pages/design-system/examples",
      "package.json",
      "public/r",
      "registry.json"
    ].forEach((entry) => {
      cpSync(path.resolve(entry), path.join(fixture, entry), { recursive: true });
    });
    symlinkSync(path.resolve("node_modules"), path.join(fixture, "node_modules"), "dir");
    const manifest = "src/components/v4/generated-manifest.json";
    const outputs: string[] = JSON.parse(readFileSync(path.join(fixture, manifest), "utf8"));
    const digest = () =>
      outputs.map((output) =>
        createHash("sha256")
          .update(readFileSync(path.join(fixture, output)))
          .digest("hex")
      );
    const before = digest();
    const target = path.join(fixture, file);
    const source = readFileSync(target, "utf8");
    expect(source).toContain(from);
    writeFileSync(target, source.replace(from, to));
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/generate-ui.ts"], {
      cwd: fixture,
      encoding: "utf8"
    });
    return {
      status: result.status,
      stderr: result.stderr,
      unchanged: digest().join() === before.join()
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
};

it("rejects unresolved declared coverage without writing any generated outputs", () => {
  const result = generateWith(
    "src/components/v4/contracts/baseline-actions.ts",
    '{ value: "outline", exampleId: "default"',
    '{ value: "outline", exampleId: "missing"'
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Missing coverage example: button:variant:outline -> missing");
  expect(result.unchanged).toBe(true);
}, 20000);

it("rejects coverage that drifts from the component's cva variants", () => {
  const result = generateWith(
    "src/components/v4/ui/button.tsx",
    "lg: geometry.large,",
    "lg: geometry.large,\n        xl: geometry.large,"
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Coverage drifts from source: button:size missing [xl] extra []");
}, 20000);

it("rejects coverage that drifts from a prop's string-literal union", () => {
  const result = generateWith(
    "src/components/v4/ui/badge.tsx",
    'size?: "sm" | "md";',
    'size?: "sm" | "md" | "lg";'
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Coverage drifts from source: badge:size missing [lg] extra []");
}, 20000);

it("rejects a declared part axis that no source defines", () => {
  const result = generateWith(
    "src/components/v4/contracts/baseline-content.ts",
    'axis: "ItemMedia.variant"',
    'axis: "ItemThumb.variant"'
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Declared part axis has no source: item:ItemThumb.variant");
}, 20000);

it("rejects a cva call the generator cannot read", () => {
  const result = generateWith(
    "src/components/v4/ui/button.tsx",
    "const buttonVariants = cva(",
    "const buttonVariants = (cva)("
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unparsed cva call: src/components/v4/ui/button.tsx:15");
}, 20000);

it("rejects a shared rule whose instruction opens with a lowercase scope fragment", () => {
  const result = generateWith(
    "src/components/v4/skills/infisical-ui/rules.json",
    '"instruction": "For irreversible changes, provide',
    '"instruction": "irreversible changes. Provide'
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "Shared rule destructive-confirmation instruction opens with a lowercase fragment"
  );
  expect(result.unchanged).toBe(true);
}, 20000);

it("rejects a sentence that a family's guidance repeats", () => {
  const result = generateWith(
    "src/components/v4/contracts/baseline-actions.ts",
    '"Choose emphasis with variant and geometry with size.',
    '"Choose Button for an action. Choose emphasis with variant and geometry with size.'
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    'Repeated sentence in button: guidance.decision and guidance.use[0] both say "choose button for an action"'
  );
  expect(result.unchanged).toBe(true);
}, 20000);
