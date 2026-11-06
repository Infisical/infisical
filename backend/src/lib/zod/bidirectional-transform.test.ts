import { describe, expect, test } from "vitest";
import { z } from "zod";

import { bidirectionalTransform } from "@app/lib/zod";

const subject = bidirectionalTransform(z.union([z.string().min(1), z.string().array()]), (el) =>
  typeof el !== "string" ? el[0] : el
).optional();

describe("bidirectionalTransform", () => {
  test("normalizes on both decode and encode", () => {
    const schema = z.object({ subject });
    expect(z.decode(schema, { subject: ["secrets"] })).toEqual({ subject: "secrets" });
    expect(z.encode(schema, { subject: ["secrets"] as unknown as string })).toEqual({ subject: "secrets" });
    expect(z.encode(schema, {})).toEqual({});
  });

  test("surfaces ctx.addIssue as a validation issue", () => {
    const mongoUri = bidirectionalTransform(z.string(), (val, ctx) => {
      if (!val.startsWith("mongodb://")) {
        ctx.addIssue({ code: "custom", message: "must be mongodb" });
        return z.NEVER;
      }
      return val;
    });
    const schema = z.object({ uri: mongoUri });

    expect(z.safeDecode(schema, { uri: "postgres://x" }).error?.issues[0]).toMatchObject({
      message: "must be mongodb",
      path: ["uri"]
    });
    expect(z.safeEncode(schema, { uri: "postgres://x" }).success).toBe(false);
    expect(z.decode(schema, { uri: "mongodb://h" })).toEqual({ uri: "mongodb://h" });
  });

  test("an array-level transform sees normalized elements on encode", () => {
    const rules = bidirectionalTransform(z.object({ subject }).array(), (items) =>
      items.filter((item) => item.subject !== "hidden")
    );
    expect(z.encode(rules, [{ subject: ["hidden"] }, { subject: "shown" }] as never)).toEqual([{ subject: "shown" }]);
  });

  test("redaction runs when a response is encoded", () => {
    const token = bidirectionalTransform(z.string().min(1), () => "******");
    expect(z.encode(z.object({ token }), { token: "live-secret" })).toEqual({ token: "******" });
  });

  test("documents the wrapped schema on both sides", () => {
    const schema = z.object({ subject });
    const input = z.toJSONSchema(schema, { io: "input", target: "openapi-3.0" });
    const output = z.toJSONSchema(schema, { io: "output", target: "openapi-3.0", unrepresentable: "any" });
    expect(output.properties).toEqual(input.properties);
  });
});
