import { buildDomainBaseDN } from "@app/lib/ldap/ldap-search-fns";

import { LdapProvider } from "./ldap-connection-enums";
import { extractDomainFromDN } from "./ldap-connection-fns";
import { assertLdapProviderIsSupported, parseLdapBindIdentity } from "./ldap-directory-fns";

describe("parseLdapBindIdentity", () => {
  test("derives the domain and the UPN local part, which is only a fallback for the logon name", () => {
    expect(parseLdapBindIdentity("svc-certs@corp.example.com")).toEqual({
      domainFqdn: "corp.example.com",
      accountName: "svc-certs"
    });
  });

  test("the UPN local part is not assumed to be the sAMAccountName", () => {
    expect(parseLdapBindIdentity("john.smith@corp.example.com").accountName).toBe("john.smith");
  });

  test("lowercases the domain but preserves the account's case", () => {
    expect(parseLdapBindIdentity("Svc-Certs@CORP.Example.COM")).toEqual({
      domainFqdn: "corp.example.com",
      accountName: "Svc-Certs"
    });
  });

  test("derives the domain from a full DN and defers the account to a directory lookup", () => {
    expect(parseLdapBindIdentity("CN=svc-certs,OU=Service Accounts,DC=corp,DC=example,DC=com")).toEqual({
      domainFqdn: "corp.example.com",
      accountName: null
    });
  });

  test("rejects a DN with no DC components, because the domain cannot be derived", () => {
    expect(() => parseLdapBindIdentity("CN=svc-certs,OU=Service Accounts")).toThrow("Unable to determine the domain");
  });

  test("treats a DN containing @ inside an RDN value as a DN, not a user principal name", () => {
    expect(parseLdapBindIdentity("CN=john.smith@example.com,OU=Users,DC=corp,DC=example,DC=com")).toEqual({
      domainFqdn: "corp.example.com",
      accountName: null
    });
  });

  test("uses the last @ when a user principal name is otherwise well formed", () => {
    expect(parseLdapBindIdentity("svc.certs@corp.example.com")).toEqual({
      domainFqdn: "corp.example.com",
      accountName: "svc.certs"
    });
  });

  test("rejects a value that is neither a user principal name nor a DN with DC components", () => {
    expect(() => parseLdapBindIdentity("@corp.example.com")).toThrow("Unable to determine the domain");
    expect(() => parseLdapBindIdentity("svc-certs@")).toThrow("Unable to determine the domain");
  });
});

describe("extractDomainFromDN", () => {
  test("joins the DC components in order", () => {
    expect(extractDomainFromDN("CN=svc,OU=Users,DC=corp,DC=example,DC=com")).toBe("corp.example.com");
  });

  test("is case insensitive on the attribute name and lowercases the result", () => {
    expect(extractDomainFromDN("cn=svc,dc=CORP,dc=Example,dc=COM")).toBe("corp.example.com");
  });

  test("returns null when there is no DC component", () => {
    expect(extractDomainFromDN("CN=svc,OU=Users")).toBeNull();
  });
});

describe("buildDomainBaseDN", () => {
  test("maps every domain label to a DC component", () => {
    expect(buildDomainBaseDN("corp.example.com")).toBe("DC=corp,DC=example,DC=com");
  });

  test("handles a single-label domain", () => {
    expect(buildDomainBaseDN("corp")).toBe("DC=corp");
  });
});

describe("assertLdapProviderIsSupported", () => {
  it("accepts an Active Directory connection", () => {
    expect(() => assertLdapProviderIsSupported(LdapProvider.ActiveDirectory, "corp-ad")).not.toThrow();
  });

  it("refuses a provider that is not Active Directory, naming the connection", () => {
    expect(() => assertLdapProviderIsSupported("openldap", "corp-ad")).toThrow(/corp-ad/);
    expect(() => assertLdapProviderIsSupported("openldap", "corp-ad")).toThrow(/Active Directory/);
  });

  it("accepts an absent provider, which is a connection read without decrypted credentials", () => {
    expect(() => assertLdapProviderIsSupported(undefined, "corp-ad")).not.toThrow();
  });
});
