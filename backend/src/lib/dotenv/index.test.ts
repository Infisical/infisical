import { parseEnvFile, serializeEnvFile } from "./index";

describe("serializeEnvFile", () => {
  test("serializes simple key-value pairs", () => {
    expect(serializeEnvFile({ FOO: "bar", BAZ: "qux" })).toBe("FOO=bar\nBAZ=qux");
  });

  test("leaves plain values unquoted", () => {
    expect(serializeEnvFile({ KEY: "simple" })).toBe("KEY=simple");
  });

  test("quotes values containing newlines", () => {
    expect(serializeEnvFile({ KEY: "line1\nline2" })).toBe('KEY="line1\\nline2"');
  });

  test("quotes values containing carriage returns", () => {
    expect(serializeEnvFile({ KEY: "a\rb" })).toBe('KEY="a\\rb"');
  });

  test("escapes backslashes inside values", () => {
    expect(serializeEnvFile({ KEY: "path\\to\\file" })).toBe('KEY="path\\\\to\\\\file"');
  });

  test("escapes double quotes inside values", () => {
    expect(serializeEnvFile({ KEY: 'say "hello"' })).toBe('KEY="say \\"hello\\""');
  });

  test("handles empty value", () => {
    expect(serializeEnvFile({ KEY: "" })).toBe("KEY=");
  });

  test("handles empty map", () => {
    expect(serializeEnvFile({})).toBe("");
  });

  test("allows keys with spaces", () => {
    expect(serializeEnvFile({ "MY KEY": "val" })).toBe("MY KEY=val");
  });

  test("allows keys starting with a digit", () => {
    expect(serializeEnvFile({ "1KEY": "val" })).toBe("1KEY=val");
  });

  test("allows hyphenated keys", () => {
    expect(serializeEnvFile({ "my-secret": "val" })).toBe("my-secret=val");
  });

  test("rejects keys containing equals", () => {
    expect(() => serializeEnvFile({ "K=V": "val" })).toThrow("Invalid environment variable name");
  });

  test("rejects keys containing newlines", () => {
    expect(() => serializeEnvFile({ "K\nV": "val" })).toThrow("Invalid environment variable name");
  });

  test("rejects empty keys", () => {
    expect(() => serializeEnvFile({ "": "val" })).toThrow("Invalid environment variable name");
  });

  test("allows underscores and dots in keys", () => {
    expect(serializeEnvFile({ "MY_KEY.sub": "val" })).toBe("MY_KEY.sub=val");
  });
});

describe("parseEnvFile", () => {
  test("parses simple key-value pairs", () => {
    expect(parseEnvFile("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("parses double-quoted values and unescapes sequences", () => {
    expect(parseEnvFile('KEY="line1\\nline2"')).toEqual({ KEY: "line1\nline2" });
  });

  test("unescapes backslashes in quoted values", () => {
    expect(parseEnvFile('KEY="path\\\\to\\\\file"')).toEqual({ KEY: "path\\to\\file" });
  });

  test("unescapes double quotes in quoted values", () => {
    expect(parseEnvFile('KEY="say \\"hello\\""')).toEqual({ KEY: 'say "hello"' });
  });

  test("unescapes carriage returns", () => {
    expect(parseEnvFile('KEY="a\\rb"')).toEqual({ KEY: "a\rb" });
  });

  test("skips empty lines and comments", () => {
    expect(parseEnvFile("# comment\n\nKEY=val\n  \n# another")).toEqual({ KEY: "val" });
  });

  test("handles value containing equals sign", () => {
    expect(parseEnvFile("KEY=a=b=c")).toEqual({ KEY: "a=b=c" });
  });

  test("handles empty value", () => {
    expect(parseEnvFile("KEY=")).toEqual({ KEY: "" });
  });

  test("handles empty input", () => {
    expect(parseEnvFile("")).toEqual({});
  });

  test("does not strip unquoted values", () => {
    expect(parseEnvFile("KEY=hello world")).toEqual({ KEY: "hello world" });
  });

  test("preserves leading and trailing whitespace in quoted values", () => {
    expect(parseEnvFile('KEY=" spaced "')).toEqual({ KEY: " spaced " });
  });

  test("preserves unquoted value with surrounding whitespace", () => {
    expect(parseEnvFile("KEY= spaced ")).toEqual({ KEY: " spaced " });
  });
});

describe("round-trip", () => {
  const cases: Record<string, string>[] = [
    { SIMPLE: "value" },
    { NEWLINE: "line1\nline2\nline3" },
    { CRLF: "a\r\nb" },
    { QUOTES: 'say "hello"' },
    { BACKSLASH: "C:\\Users\\test" },
    { MIXED: 'val with "quotes" and\nnewlines and \\backslash' },
    { EMPTY: "" },
    { A: "1", B: "2", C: "3" },
    { "my-secret": "hyphenated" },
    { "2FA_KEY": "digit-start" },
    { LEADING_SPACE: " hello" },
    { TRAILING_SPACE: "hello " },
    { BOTH_SPACES: " hello " },
    { TAB_PADDED: "\tvalue\t" }
  ];

  test.each(cases)("round-trips %j", (input) => {
    const serialized = serializeEnvFile(input);
    const parsed = parseEnvFile(serialized);
    expect(parsed).toEqual(input);
  });

  test("newline injection is neutralized", () => {
    const malicious = { LEGIT: "original\nOTHER_KEY=attacker-value" };
    const serialized = serializeEnvFile(malicious);
    const parsed = parseEnvFile(serialized);
    expect(parsed).toEqual(malicious);
    expect(Object.keys(parsed)).toEqual(["LEGIT"]);
  });
});
