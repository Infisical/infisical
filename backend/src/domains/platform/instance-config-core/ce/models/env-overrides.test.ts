import { RuleViolationError } from "@app/domains/lib/errors";

import { EnvOverrides } from "./env-overrides";

const keys: ReadonlySet<string> = new Set(["ALLOWED_A", "ALLOWED_B"]);

describe("EnvOverrides.create", () => {
  test("should drop the keys an admin cannot override", () => {
    // Setup
    const raw = { ALLOWED_A: "1", NOT_ALLOWED: "2" };

    // Action
    const overrides = EnvOverrides.create(raw, keys, () => []);

    // Assert
    expect(overrides.toJSON()).toEqual({ ALLOWED_A: "1" });
  });

  test("should refuse overrides the env schema rejects, with one line per issue", () => {
    // Setup
    const findIssues = () => ['Key: "ALLOWED_A", Error: bad', 'Key: "ALLOWED_B", Error: worse'];

    // Action
    const act = () => EnvOverrides.create({ ALLOWED_A: "x" }, keys, findIssues);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow('Key: "ALLOWED_A", Error: bad\nKey: "ALLOWED_B", Error: worse');
  });

  test("should hand only the allowed values to the validator", () => {
    // Setup
    let validated: Record<string, string> = {};

    // Action
    EnvOverrides.create({ ALLOWED_A: "1", NOT_ALLOWED: "2" }, keys, (values) => {
      validated = values;
      return [];
    });

    // Assert
    expect(validated).toEqual({ ALLOWED_A: "1" });
  });
});

describe("EnvOverrides.toBytes", () => {
  test("should round trip through fromBytes", () => {
    // Setup
    const overrides = EnvOverrides.restore({ ALLOWED_A: "1", ALLOWED_B: "2" });

    // Action
    const restored = EnvOverrides.fromBytes(overrides.toBytes());

    // Assert
    expect(restored.toJSON()).toEqual({ ALLOWED_A: "1", ALLOWED_B: "2" });
  });

  test("should be the JSON object every release has written", () => {
    // Setup
    const overrides = EnvOverrides.restore({ ALLOWED_A: "1" });

    // Action
    const bytes = overrides.toBytes();

    // Assert
    expect(bytes.toString()).toBe('{"ALLOWED_A":"1"}');
  });
});

describe("EnvOverrides.organize", () => {
  test("should list every field by group with its override and env marker", () => {
    // Setup
    const overrides = EnvOverrides.restore({ ALLOWED_A: "1" });
    const groups = {
      first: { name: "First", fields: [{ key: "ALLOWED_A", description: "a" }, { key: "ALLOWED_B" }] }
    };

    // Action
    const organized = overrides.organize(groups, (key) => key === "ALLOWED_B");

    // Assert
    expect(organized).toEqual({
      first: {
        name: "First",
        fields: [
          { key: "ALLOWED_A", description: "a", value: "1", hasEnvEntry: false },
          { key: "ALLOWED_B", description: undefined, value: "", hasEnvEntry: true }
        ]
      }
    });
  });
});

describe("EnvOverrides.none", () => {
  test("should hold no overrides", () => {
    // Setup
    // Action
    const overrides = EnvOverrides.none();

    // Assert
    expect(overrides.toJSON()).toEqual({});
  });
});
