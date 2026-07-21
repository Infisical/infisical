import { describe, expect, test } from "vitest";

import { extractSamAccountName, resolveRunAsFingerprint } from "./active-directory-discovery-factory";

describe("extractSamAccountName", () => {
  test.each([
    ["CORP\\svc-sql", "svc-sql"],
    ["svc-sql@corp.example.com", "svc-sql"],
    ["svc-sql", "svc-sql"],
    ["  CORP\\svc-sql  ", "svc-sql"]
  ])("extracts the account name from %s", (input, expected) => {
    expect(extractSamAccountName(input)).toBe(expected);
  });

  test.each([["NT AUTHORITY\\SYSTEM"], ["NT SERVICE\\MSSQL$SQLEXPRESS"], ["BUILTIN\\Administrators"], [""], ["   "]])(
    "returns null for built-in / empty run-as %s",
    (input) => {
      expect(extractSamAccountName(input)).toBeNull();
    }
  );
});

describe("resolveRunAsFingerprint", () => {
  const domain = "corp.example.com";
  const userGuidByName = new Map([
    ["svc-sql", "11111111-1111-1111-1111-111111111111"],
    ["svc-backup", "22222222-2222-2222-2222-222222222222"]
  ]);

  test("anchors a domain run-as to its objectGUID fingerprint", () => {
    expect(resolveRunAsFingerprint("CORP\\svc-sql", domain, userGuidByName)).toBe(
      "corp.example.com:11111111-1111-1111-1111-111111111111"
    );
  });

  test("resolves a UPN-style run-as", () => {
    expect(resolveRunAsFingerprint("svc-backup@corp.example.com", domain, userGuidByName)).toBe(
      "corp.example.com:22222222-2222-2222-2222-222222222222"
    );
  });

  test("matches the discovered-account fingerprint format (domain:objectGUID)", () => {
    const fingerprint = resolveRunAsFingerprint("CORP\\svc-sql", domain, userGuidByName);
    expect(fingerprint).toBe(`${domain}:${userGuidByName.get("svc-sql")}`);
  });

  test.each([
    ["LocalSystem"],
    ["NT AUTHORITY\\NetworkService"],
    ["ApplicationPoolIdentity"],
    ["CORP\\unknown-account"] // real user but not enumerated from LDAP
  ])("returns null for built-in or unresolvable run-as %s", (runAs) => {
    expect(resolveRunAsFingerprint(runAs, domain, userGuidByName)).toBeNull();
  });

  test("is case-insensitive on the account name", () => {
    expect(resolveRunAsFingerprint("CORP\\SVC-SQL", domain, userGuidByName)).toBe(
      "corp.example.com:11111111-1111-1111-1111-111111111111"
    );
  });

  test.each([
    ["WEB01\\svc-sql"], // same name, different (machine-local) domain
    ["OTHERDOM\\svc-sql"], // same name, a trusted domain
    [".\\svc-sql"] // explicit local account
  ])("does not anchor a same-named account from another domain (%s)", (runAs) => {
    expect(resolveRunAsFingerprint(runAs, domain, userGuidByName)).toBeNull();
  });

  test("accepts the real NetBIOS name when it differs from the DNS label", () => {
    // Without the NetBIOS name, a CONTOSO\ run-as would be wrongly dropped (DNS label is "corp").
    expect(resolveRunAsFingerprint("CONTOSO\\svc-sql", domain, userGuidByName)).toBeNull();
    expect(resolveRunAsFingerprint("CONTOSO\\svc-sql", domain, userGuidByName, "CONTOSO")).toBe(
      "corp.example.com:11111111-1111-1111-1111-111111111111"
    );
  });

  const machine = { objectGUID: "99999999-9999-9999-9999-999999999999", name: "WEB01" };

  test.each([[".\\localsvc"], ["WEB01\\localsvc"]])(
    "anchors a local run-as (%s) to the machine's local account",
    (runAs) => {
      expect(resolveRunAsFingerprint(runAs, domain, userGuidByName, null, machine)).toBe(
        `corp.example.com:${machine.objectGUID}:localsvc`
      );
    }
  );

  test("still anchors a domain run-as to the domain user when machine context is present", () => {
    expect(resolveRunAsFingerprint("CORP\\svc-sql", domain, userGuidByName, null, machine)).toBe(
      "corp.example.com:11111111-1111-1111-1111-111111111111"
    );
  });
});
