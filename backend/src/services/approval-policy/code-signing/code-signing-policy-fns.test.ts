import { CodeSigningScopeField } from "./code-signing-policy-enums";
import {
  commandsMatch,
  getCodeSigningScopeMismatches,
  isSameRequestedSigningWindow,
  normalizeCodeSigningScope
} from "./code-signing-policy-fns";

const DIGEST = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
const CHECKSUM = "8f677ab944beafd2cc37af6c173beb116b91b2400c9dfd3b7ae218b15b3c11b3";

// A scope covering every parameter, plus the signing situation that matches it exactly.
const fullScope = {
  [CodeSigningScopeField.Command]: "signtool sign /fd sha256 installer.msi",
  [CodeSigningScopeField.SigningApplication]: "signtool",
  [CodeSigningScopeField.SigningApplicationHash]: CHECKSUM,
  [CodeSigningScopeField.Hostname]: "build-agent-01",
  [CodeSigningScopeField.OsUsername]: "svc-release",
  [CodeSigningScopeField.IpAddress]: "203.0.113.10",
  [CodeSigningScopeField.DataHash]: DIGEST
};

const matchingContext = { ...fullScope };

describe("normalizeCodeSigningScope", () => {
  test("returns undefined when nothing was declared", () => {
    expect(normalizeCodeSigningScope(undefined)).toBeUndefined();
    expect(normalizeCodeSigningScope({})).toBeUndefined();
  });

  test("treats blank and whitespace-only values as not declared", () => {
    expect(
      normalizeCodeSigningScope({
        [CodeSigningScopeField.Command]: "   ",
        [CodeSigningScopeField.Hostname]: ""
      })
    ).toBeUndefined();
  });

  test("keeps only the declared parameters and trims them", () => {
    expect(
      normalizeCodeSigningScope({
        [CodeSigningScopeField.Command]: "  signtool sign a.msi  ",
        [CodeSigningScopeField.Hostname]: "",
        [CodeSigningScopeField.OsUsername]: "svc-release"
      })
    ).toEqual({
      [CodeSigningScopeField.Command]: "signtool sign a.msi",
      [CodeSigningScopeField.OsUsername]: "svc-release"
    });
  });
});

describe("getCodeSigningScopeMismatches", () => {
  test("an unscoped grant constrains nothing", () => {
    expect(getCodeSigningScopeMismatches(null, {})).toEqual([]);
    expect(getCodeSigningScopeMismatches(undefined, matchingContext)).toEqual([]);
    expect(getCodeSigningScopeMismatches({}, {})).toEqual([]);
  });

  test("an exact match on every parameter reports no mismatch", () => {
    expect(getCodeSigningScopeMismatches(fullScope, matchingContext)).toEqual([]);
  });

  test("a parameter left unbound is not constrained, whatever the caller reports", () => {
    const scope = { [CodeSigningScopeField.Command]: "signtool sign a.msi" };
    expect(
      getCodeSigningScopeMismatches(scope, {
        [CodeSigningScopeField.Command]: "signtool sign a.msi",
        [CodeSigningScopeField.Hostname]: "some-other-machine",
        [CodeSigningScopeField.OsUsername]: "someone-else"
      })
    ).toEqual([]);
  });

  test.each([
    [CodeSigningScopeField.Command, "signtool sign EVIL.msi"],
    [CodeSigningScopeField.SigningApplication, "osslsigncode"],
    [CodeSigningScopeField.SigningApplicationHash, CHECKSUM.replace("8f6", "aaa")],
    [CodeSigningScopeField.Hostname, "laptop-42"],
    [CodeSigningScopeField.OsUsername, "attacker"],
    [CodeSigningScopeField.IpAddress, "198.51.100.7"],
    [CodeSigningScopeField.DataHash, DIGEST.replace("b94", "ccc")]
  ])("reports %s alone when only that parameter differs", (field, wrongValue) => {
    expect(getCodeSigningScopeMismatches(fullScope, { ...matchingContext, [field]: wrongValue })).toEqual([field]);
  });

  test("reports every parameter that differs", () => {
    const mismatches = getCodeSigningScopeMismatches(fullScope, {
      ...matchingContext,
      [CodeSigningScopeField.SigningApplication]: "osslsigncode",
      [CodeSigningScopeField.Hostname]: "laptop-42"
    });
    expect(mismatches).toEqual([CodeSigningScopeField.SigningApplication, CodeSigningScopeField.Hostname]);
  });

  // A caller that simply omits the context must not slip past a scope that names it.
  test("a missing observed value fails closed", () => {
    expect(getCodeSigningScopeMismatches(fullScope, {})).toEqual(Object.values(CodeSigningScopeField));
    expect(
      getCodeSigningScopeMismatches(fullScope, {
        ...matchingContext,
        [CodeSigningScopeField.Hostname]: undefined
      })
    ).toEqual([CodeSigningScopeField.Hostname]);
  });

  test("a blank or whitespace-only observed value also fails closed", () => {
    expect(
      getCodeSigningScopeMismatches(fullScope, {
        ...matchingContext,
        [CodeSigningScopeField.OsUsername]: "   "
      })
    ).toEqual([CodeSigningScopeField.OsUsername]);
  });

  test.each([
    [CodeSigningScopeField.Hostname, "BUILD-AGENT-01"],
    [CodeSigningScopeField.SigningApplicationHash, CHECKSUM.toUpperCase()],
    [CodeSigningScopeField.DataHash, DIGEST.toUpperCase()]
  ])("%s matches regardless of case", (field, differentCase) => {
    expect(getCodeSigningScopeMismatches(fullScope, { ...matchingContext, [field]: differentCase })).toEqual([]);
  });

  test("an IPv6 address matches regardless of hex case", () => {
    const scope = { [CodeSigningScopeField.IpAddress]: "2001:DB8::1" };
    expect(getCodeSigningScopeMismatches(scope, { [CodeSigningScopeField.IpAddress]: "2001:db8::1" })).toEqual([]);
  });

  test.each([
    [CodeSigningScopeField.Command, "SIGNTOOL SIGN /FD SHA256 INSTALLER.MSI"],
    [CodeSigningScopeField.SigningApplication, "SIGNTOOL"],
    [CodeSigningScopeField.OsUsername, "SVC-RELEASE"]
  ])("%s stays case-sensitive", (field, differentCase) => {
    expect(getCodeSigningScopeMismatches(fullScope, { ...matchingContext, [field]: differentCase })).toEqual([field]);
  });

  test("surrounding whitespace does not change the decision", () => {
    expect(
      getCodeSigningScopeMismatches(
        { [CodeSigningScopeField.Command]: "  signtool sign a.msi  " },
        { [CodeSigningScopeField.Command]: "signtool sign a.msi  " }
      )
    ).toEqual([]);
  });
});

describe("commandsMatch", () => {
  const SIGNTOOL =
    '"C:\\Program Files (x86)\\Windows Kits\\10\\bin\\signtool.exe" sign /fd SHA256 /f cert.cer /csp "Infisical KSP" /kc demo app.exe';

  test("a command matches itself", () => {
    expect(commandsMatch(SIGNTOOL, SIGNTOOL)).toBe(true);
    expect(commandsMatch("pkcs11-tool --sign --slot 0", "pkcs11-tool --sign --slot 0")).toBe(true);
  });

  // The one tolerance: a client that renders its argv with a different amount of whitespace than
  // the operator typed still describes the same command.
  test("whitespace is collapsed on both sides", () => {
    expect(commandsMatch("tool  --sign   --slot 0", "tool --sign --slot 0")).toBe(true);
    expect(commandsMatch("tool\t--sign\t--slot 0", "tool --sign --slot 0")).toBe(true);
    expect(commandsMatch("  tool --sign  ", "tool --sign")).toBe(true);
    expect(commandsMatch("tool\n--sign", "tool --sign")).toBe(true);
  });

  // Reordering is deliberately NOT tolerated: it cannot be recognised without knowing which flags
  // take values, so a reordered command is a new command and needs its own approval.
  test("reordered options do not match", () => {
    expect(commandsMatch("tool --sign --slot 0", "tool --slot 0 --sign")).toBe(false);
    expect(commandsMatch(SIGNTOOL, SIGNTOOL.replace("/fd SHA256 /f cert.cer", "/f cert.cer /fd SHA256"))).toBe(false);
  });

  test("an inline value is not the same as a separated one", () => {
    expect(commandsMatch("tool --fd=sha256", "tool --fd sha256")).toBe(false);
  });

  test("any changed, added or removed token does not match", () => {
    const bound = "tool --sign --slot 0 app.exe";
    expect(commandsMatch(bound, "tool --sign --slot 1 app.exe")).toBe(false);
    expect(commandsMatch(bound, "tool --sign --slot 0 --login app.exe")).toBe(false);
    expect(commandsMatch(bound, "tool --sign app.exe")).toBe(false);
    expect(commandsMatch(bound, "tool --sign --slot 0 other.exe")).toBe(false);
    expect(commandsMatch(bound, "/usr/bin/tool --sign --slot 0 app.exe")).toBe(false);
  });

  test("comparison is case-sensitive", () => {
    expect(commandsMatch("tool --fd SHA256", "tool --fd sha256")).toBe(false);
  });

  test("quoting is part of the command", () => {
    expect(commandsMatch('tool --csp "Infisical KSP"', 'tool --csp "Infisical KSP"')).toBe(true);
    expect(commandsMatch('tool --csp "Infisical KSP"', "tool --csp Infisical KSP")).toBe(false);
  });

  // Redaction runs before the command is sent, so both sides carry the marker rather than the
  // secret. Two different secrets therefore look identical, which is intended.
  test("redacted secrets compare as equal", () => {
    expect(commandsMatch("signtool sign /p *** app.exe", "signtool sign /p *** app.exe")).toBe(true);
  });

  test("empty and whitespace-only commands", () => {
    expect(commandsMatch("", "")).toBe(true);
    expect(commandsMatch("   ", "")).toBe(true);
    expect(commandsMatch("tool", "")).toBe(false);
  });
});

describe("isSameRequestedSigningWindow", () => {
  const MACHINE = false;
  const HUMAN = true;

  // The case that made the pending-request lookup useless for signing clients: a retry asks for
  // the same duration, but every call anchors the window at its own "now".
  test("a client retry asking for the same duration later is the same ask", () => {
    const first = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T18:00:00.000Z" };
    const retriedSecondsLater = { start: "2026-08-04T10:00:07.000Z", end: "2026-08-04T18:00:07.000Z" };
    const retriedHoursLater = { start: "2026-08-04T15:30:00.000Z", end: "2026-08-04T23:30:00.000Z" };

    expect(isSameRequestedSigningWindow(MACHINE, first, retriedSecondsLater)).toBe(true);
    expect(isSameRequestedSigningWindow(MACHINE, first, retriedHoursLater)).toBe(true);
  });

  test("a client asking for a different duration is a new ask", () => {
    const eightHours = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T18:00:00.000Z" };
    const oneHour = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T11:00:00.000Z" };

    expect(isSameRequestedSigningWindow(MACHINE, eightHours, oneHour)).toBe(false);
  });

  // A person picks absolute times, so two windows of equal length at different times are two
  // different asks and must not collapse into one.
  test("equal-length windows at different times stay distinct for a person", () => {
    const morning = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T11:00:00.000Z" };
    const midday = { start: "2026-08-04T11:00:00.000Z", end: "2026-08-04T12:00:00.000Z" };

    expect(isSameRequestedSigningWindow(HUMAN, morning, midday)).toBe(false);
    expect(isSameRequestedSigningWindow(HUMAN, morning, { ...morning })).toBe(true);
  });

  test("a count-only request with no window at all is the same ask", () => {
    expect(isSameRequestedSigningWindow(MACHINE, {}, {})).toBe(true);
    expect(isSameRequestedSigningWindow(HUMAN, {}, {})).toBe(true);
  });

  // With no start there is no duration, so falling back to the instant keeps two different
  // absolute ends apart instead of treating both unknowns as equal.
  test("an end with no start falls back to comparing the instant", () => {
    const a = { end: "2026-08-04T18:00:00.000Z" };
    const b = { end: "2026-08-04T19:00:00.000Z" };

    expect(isSameRequestedSigningWindow(MACHINE, a, b)).toBe(false);
    expect(isSameRequestedSigningWindow(MACHINE, a, { ...a })).toBe(true);
  });

  test("an unparseable timestamp does not read as a match", () => {
    const good = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T18:00:00.000Z" };
    const broken = { start: "not a date", end: "2026-08-04T18:00:00.000Z" };

    expect(isSameRequestedSigningWindow(MACHINE, good, broken)).toBe(false);
  });

  test("a window is never the same ask as no window", () => {
    const windowed = { start: "2026-08-04T10:00:00.000Z", end: "2026-08-04T18:00:00.000Z" };

    expect(isSameRequestedSigningWindow(MACHINE, windowed, {})).toBe(false);
    expect(isSameRequestedSigningWindow(HUMAN, windowed, {})).toBe(false);
  });
});
