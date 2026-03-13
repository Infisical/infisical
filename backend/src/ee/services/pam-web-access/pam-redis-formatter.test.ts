import { describe, expect, it } from "vitest";

import { formatRedisReply, tokenizeRedisInput } from "./pam-redis-formatter";

describe("tokenizeRedisInput", () => {
  it("splits simple command", () => {
    expect(tokenizeRedisInput("SET key value")).toEqual(["SET", "key", "value"]);
  });

  it("handles double-quoted strings", () => {
    expect(tokenizeRedisInput('SET key "hello world"')).toEqual(["SET", "key", "hello world"]);
  });

  it("handles single-quoted strings", () => {
    expect(tokenizeRedisInput("SET key 'hello world'")).toEqual(["SET", "key", "hello world"]);
  });

  it("handles multiple quoted arguments", () => {
    expect(tokenizeRedisInput('MSET "key one" "value one" "key two" "value two"')).toEqual([
      "MSET",
      "key one",
      "value one",
      "key two",
      "value two"
    ]);
  });

  it("handles single word command", () => {
    expect(tokenizeRedisInput("PING")).toEqual(["PING"]);
  });

  it("handles extra whitespace", () => {
    expect(tokenizeRedisInput("  SET   key   value  ")).toEqual(["SET", "key", "value"]);
  });

  it("handles tabs", () => {
    expect(tokenizeRedisInput("SET\tkey\tvalue")).toEqual(["SET", "key", "value"]);
  });

  it("returns empty array for empty input", () => {
    expect(tokenizeRedisInput("")).toEqual([]);
    expect(tokenizeRedisInput("   ")).toEqual([]);
  });

  it("handles empty quoted string", () => {
    expect(tokenizeRedisInput('SET key ""')).toEqual(["SET", "key", ""]);
  });

  it("handles mixed quoted and unquoted", () => {
    expect(tokenizeRedisInput('MSET key1 "value 1" key2 value2')).toEqual([
      "MSET",
      "key1",
      "value 1",
      "key2",
      "value2"
    ]);
  });
});

describe("formatRedisReply", () => {
  it("formats null as (nil)", () => {
    expect(formatRedisReply(null)).toBe("(nil)");
  });

  it("formats undefined as (nil)", () => {
    expect(formatRedisReply(undefined)).toBe("(nil)");
  });

  it("formats integer", () => {
    expect(formatRedisReply(42)).toBe("(integer) 42");
  });

  it("formats zero", () => {
    expect(formatRedisReply(0)).toBe("(integer) 0");
  });

  it("formats negative integer", () => {
    expect(formatRedisReply(-1)).toBe("(integer) -1");
  });

  it("formats string with quotes", () => {
    expect(formatRedisReply("hello world")).toBe('"hello world"');
  });

  it("formats OK with quotes", () => {
    expect(formatRedisReply("OK")).toBe('"OK"');
  });

  it("formats empty array", () => {
    expect(formatRedisReply([])).toBe("(empty array)");
  });

  it("formats simple array", () => {
    const result = formatRedisReply(["foo", "bar", "baz"]);
    expect(result).toBe('1) "foo"\n2) "bar"\n3) "baz"');
  });

  it("formats array with mixed types", () => {
    const result = formatRedisReply(["key", 42, null]);
    expect(result).toBe('1) "key"\n2) (integer) 42\n3) (nil)');
  });

  it("formats nested arrays", () => {
    const result = formatRedisReply([["a", "b"], ["c"]]);
    expect(result).toContain('1) 1) "a"');
    expect(result).toContain('   2) "b"');
    expect(result).toContain('2) 1) "c"');
  });

  it("formats Buffer as quoted string", () => {
    const result = formatRedisReply(Buffer.from("hello"));
    expect(result).toBe('"hello"');
  });

  it("formats bigint", () => {
    expect(formatRedisReply(BigInt(999))).toBe("(integer) 999");
  });
});
