import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";

import {
  CLI_CAPABILITY_MIN_VERSION,
  CLI_USER_AGENT_NAME,
  CliCapability,
  cliSupports,
  getReportedCliVersion,
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

describe("getReportedCliVersion", () => {
  const reported = (cliVersion: string) => ({ cliVersion, fromCli: true });
  const tooOld = { cliVersion: null, fromCli: true };
  const unknown = { cliVersion: null, fromCli: false };

  test("reads the version a released CLI reports", () => {
    expect(getReportedCliVersion("cli/0.45.6")).toEqual(reported("0.45.6"));
    expect(getReportedCliVersion("cli/0.43.131")).toEqual(reported("0.43.131"));
    expect(getReportedCliVersion("cli/1.0.0")).toEqual(reported("1.0.0"));
  });

  test("keeps the suffixes the CLI's own snapshot builds add whole", () => {
    expect(getReportedCliVersion("cli/0.45.12-devel")).toEqual(reported("0.45.12-devel"));
    expect(getReportedCliVersion("cli/0.45.7-SNAPSHOT-abc1234")).toEqual(reported("0.45.7-SNAPSHOT-abc1234"));
  });

  test("reports a source build as devel", () => {
    expect(getReportedCliVersion("cli/devel")).toEqual(reported("devel"));
  });

  test("accepts the longest version, a snapshot with a full commit hash", () => {
    const longest = `999999999.999999999.999999999-SNAPSHOT-${"f".repeat(40)}`;
    expect(getReportedCliVersion(`cli/${longest}`)).toEqual(reported(longest));
    expect(getReportedCliVersion(`cli/1.2.3-SNAPSHOT-${"f".repeat(41)}`)).toEqual(unknown);
  });

  test("marks a CLI too old to report a version, which sends the bare token", () => {
    expect(getReportedCliVersion("cli")).toEqual(tooOld);
  });

  test("rejects every suffix the CLI does not ship, so the value can't carry words", () => {
    [
      "cli/1.2.3-rc1",
      "cli/1.2.3-rc.1",
      "cli/0.0.1-contact-support-at-evil.co",
      "cli/1.2.3-DEVEL",
      "cli/1.2.3-SNAPSHOT-ABC1234",
      "cli/1.2.3-SNAPSHOT-xyz1234",
      "cli/1.2.3-SNAPSHOT-abc12",
      "cli/1.2.3-SNAPSHOT-",
      "cli/1.2.3-snapshot-abc1234"
    ].forEach((userAgent) => expect(getReportedCliVersion(userAgent)).toEqual(unknown));
  });

  test("knows nothing about callers that are not the CLI", () => {
    [
      undefined,
      "",
      "cli/",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "infisical-harness",
      "curl/8.7.1",
      "k8-operator/0.11.4",
      "terraform",
      "client/1.2.3",
      "CLI/1.2.3",
      "CLI",
      " cli",
      "cli ",
      " cli/1.2.3",
      "cli/cli/1.2.3"
    ].forEach((userAgent) => expect(getReportedCliVersion(userAgent)).toEqual(unknown));
  });

  test("knows nothing from a version that is not major.minor.patch", () => {
    ["cli/v1.2.3", "cli/1.2", "cli/1.2.3.4", "cli/1..3", "cli/a.b.c"].forEach((userAgent) =>
      expect(getReportedCliVersion(userAgent)).toEqual(unknown)
    );
  });

  test("knows nothing when anything follows the version", () => {
    ["cli/1.2.3 (linux)", "cli/1.2.3 ", "cli/1.2.3+build.5", "cli/1.2.3-", "cli/1.2.3--", "cli/1.2.3-devel-1"].forEach(
      (userAgent) => expect(getReportedCliVersion(userAgent)).toEqual(unknown)
    );
  });

  test("anchors at the end of the text, not before a newline", () => {
    expect(getReportedCliVersion("cli/1.2.3\n")).toEqual(unknown);
    expect(getReportedCliVersion("cli/1.2.3\nX")).toEqual(unknown);
    expect(getReportedCliVersion("cli/devel\n")).toEqual(unknown);
  });

  test("rejects digits outside ASCII", () => {
    expect(getReportedCliVersion("cli/١.٢.٣")).toEqual(unknown);
    expect(getReportedCliVersion("cli/１.２.３")).toEqual(unknown);
  });

  test("rejects overlong parts and very long agents without throwing", () => {
    expect(getReportedCliVersion("cli/1234567890.0.0")).toEqual(unknown);
    expect(getReportedCliVersion(`cli/${"1".repeat(10000)}`)).toEqual(unknown);
    expect(getReportedCliVersion(`cli/1.2.3-SNAPSHOT-${"a".repeat(10000)}`)).toEqual(unknown);
  });

  test("only the exact devel token counts as a source build", () => {
    ["cli/devel2", "cli/develop", "cli/DEVEL", "cli/devel-1"].forEach((userAgent) =>
      expect(getReportedCliVersion(userAgent)).toEqual(unknown)
    );
  });

  test("agrees with parseCliVersion on every release it accepts", () => {
    ["0.45.6", "0.43.131", "0.45.12-devel", "0.45.7-SNAPSHOT-abc1234"].forEach((version) => {
      const { cliVersion } = getReportedCliVersion(`cli/${version}`);
      expect(cliVersion).toBe(version);
      expect(parseCliVersion(`cli/${cliVersion}`)).toEqual(version.split("-")[0].split(".").map(Number));
    });
  });
});
