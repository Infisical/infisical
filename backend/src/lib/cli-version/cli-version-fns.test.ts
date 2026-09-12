import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";

import {
  CLI_CAPABILITY_MIN_VERSION,
  CLI_USER_AGENT_NAME,
  CliCapability,
  cliSupports,
  isCliAtLeastVersion,
  isCliUserAgent,
  isDevelopmentCli,
  parseCliVersion
} from "./cli-version-fns";

describe("CLI_USER_AGENT_NAME", () => {
  test("matches the audit log's own CLI user agent", () => {
    expect(CLI_USER_AGENT_NAME).toBe(UserAgentType.CLI);
  });
});

describe("isCliUserAgent", () => {
  test("accepts a versioned CLI and the bare token older releases send", () => {
    expect(isCliUserAgent("cli/0.43.131")).toBe(true);
    expect(isCliUserAgent("cli/devel")).toBe(true);
    expect(isCliUserAgent("cli")).toBe(true);
  });

  test("rejects anything else, including a user agent that merely starts with the token", () => {
    expect(isCliUserAgent(undefined)).toBe(false);
    expect(isCliUserAgent("")).toBe(false);
    expect(isCliUserAgent("client/1.0.0")).toBe(false);
    expect(isCliUserAgent("k8-operator/0.11.4")).toBe(false);
    expect(isCliUserAgent("Mozilla/5.0")).toBe(false);
  });
});

describe("parseCliVersion", () => {
  test("reads the release number, ignoring any suffix a pre-release carries", () => {
    expect(parseCliVersion("cli/0.43.131")).toEqual([0, 43, 131]);
    expect(parseCliVersion("cli/1.2.3-rc1")).toEqual([1, 2, 3]);
  });

  test("returns null for a CLI that does not report a version, and for non-CLI callers", () => {
    expect(parseCliVersion("cli")).toBeNull();
    expect(parseCliVersion("cli/devel")).toBeNull();
    expect(parseCliVersion("terraform")).toBeNull();
    expect(parseCliVersion(undefined)).toBeNull();
  });
});

describe("isDevelopmentCli", () => {
  test("only a source build counts", () => {
    expect(isDevelopmentCli("cli/devel")).toBe(true);
    expect(isDevelopmentCli("cli/0.43.131")).toBe(false);
    expect(isDevelopmentCli("cli")).toBe(false);
    expect(isDevelopmentCli(undefined)).toBe(false);
  });
});

describe("isCliAtLeastVersion", () => {
  test("the boundary release itself satisfies its own minimum", () => {
    expect(isCliAtLeastVersion("cli/0.43.131", "0.43.131")).toBe(true);
  });

  test("later releases satisfy it, across every position", () => {
    expect(isCliAtLeastVersion("cli/0.43.132", "0.43.131")).toBe(true);
    expect(isCliAtLeastVersion("cli/0.44.0", "0.43.131")).toBe(true);
    expect(isCliAtLeastVersion("cli/1.0.0", "0.43.131")).toBe(true);
  });

  test("earlier releases do not, including ones whose later segments read as larger", () => {
    expect(isCliAtLeastVersion("cli/0.43.130", "0.43.131")).toBe(false);
    expect(isCliAtLeastVersion("cli/0.42.999", "0.43.131")).toBe(false);
    expect(isCliAtLeastVersion("cli/0.9.999", "0.43.131")).toBe(false);
  });

  test("a source build satisfies any minimum", () => {
    expect(isCliAtLeastVersion("cli/devel", "0.43.131")).toBe(true);
    expect(isCliAtLeastVersion("cli/devel", "99.0.0")).toBe(true);
  });

  test("a caller that is not a versioned CLI never satisfies a minimum", () => {
    expect(isCliAtLeastVersion("cli", "0.43.131")).toBe(false);
    expect(isCliAtLeastVersion(undefined, "0.43.131")).toBe(false);
    expect(isCliAtLeastVersion("k8-operator/9.9.9", "0.43.131")).toBe(false);
    expect(isCliAtLeastVersion("Mozilla/5.0", "0.43.131")).toBe(false);
  });

  test("a malformed minimum is a programming error and fails loudly", () => {
    expect(() => isCliAtLeastVersion("cli/0.43.131", "0.43")).toThrow("Invalid CLI version");
    expect(() => isCliAtLeastVersion("cli/0.43.131", "v0.43.131")).toThrow("Invalid CLI version");
    expect(() => isCliAtLeastVersion("cli/devel", "0.43.131-rc1")).toThrow("Invalid CLI version");
  });
});

describe("cliSupports", () => {
  test("every registered capability carries a well-formed minimum", () => {
    Object.values(CliCapability).forEach((capability) => {
      expect(() => isCliAtLeastVersion("cli/devel", CLI_CAPABILITY_MIN_VERSION[capability])).not.toThrow();
    });
  });

  test("direct gateway transport starts at the release that shipped it", () => {
    expect(cliSupports("cli/0.43.131", CliCapability.DirectGatewayTransport)).toBe(true);
    expect(cliSupports("cli/0.43.130", CliCapability.DirectGatewayTransport)).toBe(false);
    expect(cliSupports("cli", CliCapability.DirectGatewayTransport)).toBe(false);
    expect(cliSupports(undefined, CliCapability.DirectGatewayTransport)).toBe(false);
  });
});
