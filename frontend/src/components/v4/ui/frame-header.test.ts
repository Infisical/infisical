import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = (file: string) => readFileSync(path.join(import.meta.dirname, file), "utf8");
const block = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("}", start));
};

describe("frame header row", () => {
  const frame = css("frame.module.css");
  const controls = css("controls.module.css");

  it("keeps the title and action on one row that wraps only when both cannot fit", () => {
    const head = block(frame, ".frameHead");
    expect(head).toMatch(/flex-wrap:\s*wrap/);
    expect(head).toMatch(/justify-content:\s*space-between/);
    expect(block(frame, ".frameTitle")).toMatch(/flex:\s*1 1 var\(--v4-size-cell-min\)/);
    const action = block(frame, ".frameAction");
    expect(action).toMatch(/flex:\s*none/);
    expect(action).not.toMatch(/margin-inline-start:\s*auto/);
  });

  it("does not force the framed Card header into a grid or stack it at 320px", () => {
    expect(controls).not.toMatch(
      /\.card\[data-variant="framed"\] > \.cardHeader \{[^}]*display:\s*grid/
    );
    const stacks = [
      ...controls.matchAll(/@container \(max-width: (\d+(?:\.\d+)?)rem\)\s*\{\s*\.cardHeader/g)
    ];
    stacks.forEach(([, rem]) => expect(Number(rem) * 16).toBeLessThan(320));
    expect(controls).toMatch(/\.cardHeader:not\(\[data-framed\]\)/);
  });
});
