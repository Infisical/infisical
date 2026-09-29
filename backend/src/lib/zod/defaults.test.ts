import { describe, expect, test } from "vitest";
import { z } from "zod";

import { partialWithoutDefaults, withoutDefault } from "@app/lib/zod";

const trimmedList = z
  .string()
  .trim()
  .default("")
  .transform((value) => value.split(",").filter(Boolean))
  .refine((items) => items.length <= 2, "At most two items");

describe("withoutDefault", () => {
  test("an omitted optional key stays absent, as in Zod 3", () => {
    const schema = z.object({ items: withoutDefault(trimmedList).optional() });
    expect(schema.parse({})).toEqual({});
    expect(z.object({ items: trimmedList.optional() }).parse({})).toEqual({ items: [] });
  });

  test("a provided value is still transformed and checked", () => {
    const schema = z.object({ items: withoutDefault(trimmedList).optional() });
    expect(schema.parse({ items: " a,b " })).toEqual({ items: ["a", "b"] });
    expect(schema.safeParse({ items: "a,b,c" }).success).toBe(false);
  });
});

describe("partialWithoutDefaults", () => {
  const Base = z.object({
    name: z.string(),
    ttl: z.number().int().default(3600),
    items: trimmedList
  });

  test("omitted keys stay absent instead of resetting to their defaults", () => {
    expect(partialWithoutDefaults(Base).parse({ name: "x" })).toEqual({ name: "x" });
    expect(Base.partial().parse({ name: "x" })).toEqual({ name: "x", ttl: 3600, items: [] });
  });

  test("provided keys keep their validation", () => {
    const Partial = partialWithoutDefaults(Base);
    expect(Partial.parse({ ttl: 60, items: "a" })).toEqual({ ttl: 60, items: ["a"] });
    expect(Partial.safeParse({ ttl: 1.5 }).success).toBe(false);
    expect(Partial.safeParse({ items: "a,b,c" }).success).toBe(false);
  });
});
