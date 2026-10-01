import { describe, expect, test } from "vitest";
import { z } from "zod";

import { validatorCompiler } from "./validator-compiler";

const validate = (schema: z.ZodType, data: unknown) =>
  (validatorCompiler({ schema, method: "POST", url: "/", httpPart: "body" }) as (input: unknown) => unknown)(data) as {
    value?: unknown;
    error?: unknown;
  };

describe("validatorCompiler", () => {
  test("returns the decoded value", () => {
    expect(validate(z.object({ name: z.string().trim() }), { name: " a " })).toEqual({ value: { name: "a" } });
  });

  test("keeps Zod's issue paths, numeric indices and slashed keys included", () => {
    const schema = z.object({
      permissions: z.object({ action: z.string() }).array(),
      teams: z.record(z.string(), z.number())
    });
    const { error } = validate(schema, { permissions: [{ action: "read" }, {}], teams: { "team/x": "1" } });

    expect(error).toBeInstanceOf(z.ZodError);
    expect((error as z.ZodError).issues.map((issue) => issue.path)).toEqual([
      ["permissions", 1, "action"],
      ["teams", "team/x"]
    ]);
  });
});
