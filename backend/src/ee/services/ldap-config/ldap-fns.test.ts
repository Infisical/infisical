import { describe, expect, test } from "vitest";

import { extractCnFromDn } from "./ldap-fns";

describe("extractCnFromDn", () => {
  test("extracts CN from an Active Directory style DN (uppercase attribute types)", () => {
    expect(extractCnFromDn("CN=Infisical-Admins,OU=Groups,DC=corp,DC=example,DC=com")).toBe("Infisical-Admins");
  });

  test("extracts cn from an OpenLDAP style DN (lowercase attribute types)", () => {
    expect(extractCnFromDn("cn=engineering,ou=groups,dc=example,dc=com")).toBe("engineering");
  });

  test("extracts Cn regardless of mixed casing", () => {
    expect(extractCnFromDn("Cn=Team,DC=example,DC=com")).toBe("Team");
  });

  test("preserves the original casing of the CN value", () => {
    expect(extractCnFromDn("CN=MiXeDCaSe,OU=Groups,DC=example,DC=com")).toBe("MiXeDCaSe");
  });

  test("returns undefined when the DN has no CN RDN", () => {
    expect(extractCnFromDn("OU=Groups,DC=example,DC=com")).toBeUndefined();
  });

  test("extracts CN when it is not the leading RDN", () => {
    expect(extractCnFromDn("OU=Groups,CN=Nested,DC=example,DC=com")).toBe("Nested");
  });

  test("handles a single-RDN DN with no trailing comma", () => {
    expect(extractCnFromDn("cn=solo")).toBe("solo");
  });

  test("tolerates spaces after RDN separators", () => {
    expect(extractCnFromDn("CN=Team, OU=Groups, DC=example, DC=com")).toBe("Team");
  });

  test("does not match cn= inside another RDN's value", () => {
    expect(extractCnFromDn("OU=acn=trap,DC=example,DC=com")).toBeUndefined();
  });

  test("keeps ldapjs hex-escaped commas within the CN value intact", () => {
    // ldapjs DN.toString() serializes an escaped comma as \2c, so the value
    // contains no raw comma and the RDN split cannot cut it in half
    expect(extractCnFromDn("CN=Smith\\2c John,OU=Groups,DC=example,DC=com")).toBe("Smith\\2c John");
  });

  test("does not corrupt offsets when a preceding value contains uppercase Unicode that expands under case folding", () => {
    // "İ" (U+0130) lowercases to two code units, so whole-string toLowerCase()
    // approaches shift indexes and would extract a corrupted value here
    expect(extractCnFromDn("OU=İstanbul,CN=Admins,DC=example,DC=com")).toBe("Admins");
  });
});
