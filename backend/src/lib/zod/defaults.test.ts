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

  test("strips defaults nested in optional, nullable and prefault wrappers", () => {
    const schema = z.object({
      optional: withoutDefault(z.string().default("a").optional()).optional(),
      nullable: withoutDefault(z.string().default("b").nullable()).optional(),
      prefault: withoutDefault(z.string().prefault("c")).optional()
    });
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ nullable: null })).toEqual({ nullable: null });
  });

  test("keeps refinements chained after the default", () => {
    const schema = z.object({
      tags: withoutDefault(
        z
          .string()
          .array()
          .default([])
          .refine((tags) => tags.length < 2, "At most one tag")
      ).optional()
    });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ tags: ["a", "b"] }).success).toBe(false);
  });

  test("keeps the description of the field", () => {
    expect(withoutDefault(z.string().default("a").describe("Name")).description).toBe("Name");
    expect(withoutDefault(z.string().default("a").optional().describe("Name")).description).toBe("Name");
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
