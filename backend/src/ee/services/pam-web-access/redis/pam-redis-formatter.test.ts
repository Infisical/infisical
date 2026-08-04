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

  it("keeps an escaped double quote inside the argument", () => {
    expect(tokenizeRedisInput('SET key "hello\\"world"')).toEqual(["SET", "key", 'hello"world']);
  });

  it("keeps multiple escaped quotes inside one argument", () => {
    expect(tokenizeRedisInput('LPUSH logs "a \\"quoted\\" value"')).toEqual(["LPUSH", "logs", 'a "quoted" value']);
  });

  it("keeps an escaped single quote inside a single-quoted argument", () => {
    expect(tokenizeRedisInput("SET key 'it\\'s here'")).toEqual(["SET", "key", "it's here"]);
  });

  it("keeps an escaped backslash inside the argument", () => {
    expect(tokenizeRedisInput('SET path "C:\\\\temp"')).toEqual(["SET", "path", "C:\\temp"]);
  });

  it("does not treat a backslash outside quotes as an escape", () => {
    expect(tokenizeRedisInput("SET key back\\slash")).toEqual(["SET", "key", "back\\slash"]);
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

  it("escapes embedded double quotes", () => {
    expect(formatRedisReply('He said "hello"')).toBe('"He said \\"hello\\""');
  });

  it("escapes embedded backslashes", () => {
    expect(formatRedisReply("path\\to\\file")).toBe('"path\\\\to\\\\file"');
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

  it("escapes terminal control bytes so xterm cannot act on them", () => {
    expect(formatRedisReply("safe\u001b[2J\u001b[Hspoofed")).toBe('"safe\\x1b[2J\\x1b[Hspoofed"');
  });

  it("escapes carriage return, bell and null", () => {
    expect(formatRedisReply("a\rb\u0007c\u0000d")).toBe('"a\\rb\\x07c\\x00d"');
  });

  it("escapes C1 control bytes", () => {
    expect(formatRedisReply("a\u009bb")).toBe('"a\\x9bb"');
  });

  it("leaves normal printable text alone", () => {
    expect(formatRedisReply("hello world 123")).toBe('"hello world 123"');
  });

  it("lets newline and tab through so multi-line replies stay readable", () => {
    expect(formatRedisReply("line1\nline2")).toBe('"line1\nline2"');
    expect(formatRedisReply("a\tb")).toBe('"a\tb"');
  });

  it("normalizes CRLF to a single newline", () => {
    expect(formatRedisReply("a\r\nb")).toBe('"a\nb"');
  });

  it("escapes a lone CR, which could otherwise overwrite the line above", () => {
    expect(formatRedisReply("a\rb")).toBe('"a\\rb"');
  });

  it("still escapes ESC and other control bytes", () => {
    expect(formatRedisReply("a\u001b[2Jb")).toBe('"a\\x1b[2Jb"');
    expect(formatRedisReply("a\u0007b")).toBe('"a\\x07b"');
    expect(formatRedisReply("a\u0000b")).toBe('"a\\x00b"');
  });
});

describe("round trip: what you type comes back the same way", () => {
  it("translates \\n on input and keeps it as a real newline coming back", () => {
    const [, , value] = tokenizeRedisInput('SET k "a\\nb"');
    expect(value).toBe("a\nb");
    expect(formatRedisReply(value)).toBe('"a\nb"');
  });

  it("translates \\t and \\xHH on input", () => {
    expect(tokenizeRedisInput('SET k "a\\tb"')[2]).toBe("a\tb");
    expect(tokenizeRedisInput('SET k "a\\x41b"')[2]).toBe("aAb");
  });

  it("still keeps an escaped quote literal", () => {
    expect(tokenizeRedisInput('SET k "he said \\"hi\\""')[2]).toBe('he said "hi"');
  });

  it("single quotes only treat the quote itself as escapable", () => {
    expect(tokenizeRedisInput("SET k 'a\\nb'")[2]).toBe("a\\nb");
  });
});
