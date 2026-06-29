import { getAllSecretReferences, splitOnUnescapedDots } from "./secret-reference-fns";

describe("splitOnUnescapedDots", () => {
  it("should split on regular dots", () => {
    expect(splitOnUnescapedDots("dev.folder.SECRET")).toEqual(["dev", "folder", "SECRET"]);
  });

  it("should treat escaped dots as literal dots", () => {
    expect(splitOnUnescapedDots("Secret\\.Reference")).toEqual(["Secret.Reference"]);
  });

  it("should handle mixed escaped and unescaped dots", () => {
    expect(splitOnUnescapedDots("dev.folder.Secret\\.Name")).toEqual(["dev", "folder", "Secret.Name"]);
  });

  it("should handle multiple escaped dots in a single segment", () => {
    expect(splitOnUnescapedDots("a\\.b\\.c")).toEqual(["a.b.c"]);
  });

  it("should handle string with no dots", () => {
    expect(splitOnUnescapedDots("SECRET_KEY")).toEqual(["SECRET_KEY"]);
  });

  it("should handle escaped dot at end of segment followed by unescaped dot", () => {
    expect(splitOnUnescapedDots("dev.key\\.with\\.dots.SECRET")).toEqual(["dev", "key.with.dots", "SECRET"]);
  });
});

describe("getAllSecretReferences", () => {
  it("should parse a simple local reference", () => {
    const result = getAllSecretReferences("${MY_SECRET}");
    expect(result.localReferences).toEqual(["MY_SECRET"]);
    expect(result.nestedReferences).toEqual([]);
  });

  it("should parse a nested cross-environment reference", () => {
    const result = getAllSecretReferences("${dev.folder.SECRET_NAME}");
    expect(result.nestedReferences).toEqual([
      { environment: "dev", secretPath: "/folder", secretKey: "SECRET_NAME" }
    ]);
    expect(result.localReferences).toEqual([]);
  });

  it("should treat escaped-dot reference as a local reference", () => {
    const result = getAllSecretReferences("${Secret\\.Reference}");
    expect(result.localReferences).toEqual(["Secret.Reference"]);
    expect(result.nestedReferences).toEqual([]);
  });

  it("should handle nested reference with escaped dot in secret key", () => {
    const result = getAllSecretReferences("${dev.folder.Secret\\.Name}");
    expect(result.nestedReferences).toEqual([
      { environment: "dev", secretPath: "/folder", secretKey: "Secret.Name" }
    ]);
    expect(result.localReferences).toEqual([]);
  });

  it("should handle multiple references with mixed types", () => {
    const result = getAllSecretReferences("${SIMPLE} and ${dev.folder.KEY} and ${Dotted\\.Name}");
    expect(result.localReferences).toEqual(["SIMPLE", "Dotted.Name"]);
    expect(result.nestedReferences).toEqual([
      { environment: "dev", secretPath: "/folder", secretKey: "KEY" }
    ]);
  });

  it("should return empty arrays for string without references", () => {
    const result = getAllSecretReferences("no references here");
    expect(result.localReferences).toEqual([]);
    expect(result.nestedReferences).toEqual([]);
  });

  it("should not match bare backslashes that are not escaping dots", () => {
    const result = getAllSecretReferences("${FOO\\BAR}");
    expect(result.localReferences).toEqual([]);
    expect(result.nestedReferences).toEqual([]);
  });
});
