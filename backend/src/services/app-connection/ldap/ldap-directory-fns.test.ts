import { EventEmitter } from "node:events";

import { GatewayTimeoutError } from "@app/lib/errors";
import { classifyError } from "@app/lib/errors/classify";
import { buildDomainBaseDN } from "@app/lib/ldap/ldap-search-fns";
import { sidStringToBuffer } from "@app/lib/windows-sid/windows-sid-fns";

import { LdapProvider } from "./ldap-connection-enums";
import { executeWithPotentialGateway, extractDomainFromDN } from "./ldap-connection-fns";
import { TLdapConnectionConfig } from "./ldap-connection-types";
import {
  assertLdapProviderIsSupported,
  findDirectoryComputerBySid,
  parseLdapBindIdentity,
  readAccountDisabledFlag,
  readDirectoryComputerGroupSids,
  resolveDirectorySecurityGroupNames,
  searchDirectoryGroups,
  withActiveDirectoryErrors
} from "./ldap-directory-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

vi.mock("./ldap-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ldap-connection-fns")>()),
  executeWithPotentialGateway: vi.fn()
}));

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

describe("readAccountDisabledFlag", () => {
  test.each([
    ["4096", false],
    ["4098", true],
    ["2", true]
  ])("reads the disabled bit from %s", (userAccountControl, isDisabled) => {
    expect(readAccountDisabledFlag(userAccountControl)).toBe(isDisabled);
  });

  test.each(["", "   ", "not-a-number"])(
    "returns null when userAccountControl is absent or unreadable (%j)",
    (userAccountControl) => {
      expect(readAccountDisabledFlag(userAccountControl)).toBeNull();
    }
  );
});

describe("directory searches", () => {
  const config = { credentials: { dn: "svc-certs@corp.example.com" } } as unknown as TLdapConnectionConfig;
  const gatewayServices = { gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() } };

  const useDirectory = (answer: (filter: string, res: EventEmitter) => void) => {
    const filters: string[] = [];
    vi.mocked(executeWithPotentialGateway).mockImplementation(async (_config, _gateway, operation) =>
      operation({
        search: (_baseDN: string, options: { filter: unknown }, cb: (err: Error | null, res: EventEmitter) => void) => {
          const filter = String(options.filter);
          filters.push(filter);
          const res = new EventEmitter();
          cb(null, res);
          setImmediate(() => answer(filter, res));
        }
      } as never)
    );
    return filters;
  };

  const answerEmpty = (_filter: string, res: EventEmitter) => res.emit("end", { status: 0 });

  test("lists only security groups, with and without a search term", async () => {
    const filters = useDirectory(answerEmpty);

    await searchDirectoryGroups({ config, search: "web*" }, gatewayServices);
    await searchDirectoryGroups({ config }, gatewayServices);

    expect(filters).toContain(
      "(&(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=2147483648)(|(cn=*web\\2a*)(sAMAccountName=*web\\2a*)))"
    );
    expect(filters).toContain("(&(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=2147483648))");
  });

  test("resolves allowed group SIDs among security groups only", async () => {
    const filters = useDirectory(answerEmpty);

    await resolveDirectorySecurityGroupNames(
      { config, sids: ["S-1-5-21-1111111111-2222222222-3333333333-1200"] },
      gatewayServices
    );

    const groupFilter = filters.find((filter) => filter.includes("objectSid="));
    expect(
      groupFilter?.startsWith("(&(&(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=2147483648))(|(objectSid=")
    ).toBe(true);
  });

  test.each([
    ["the directory's time limit", () => Object.assign(new Error("Time limit exceeded"), { code: 3 })],
    [
      "the client's request timeout",
      () => Object.assign(new Error("request timeout (client interrupt)"), { name: "TimeoutError" })
    ]
  ])("reports a search stopped by %s as a timeout, not a bad request", async (_name, buildError) => {
    useDirectory((filter, res) => {
      if (filter.includes("objectCategory=computer")) res.emit("error", buildError());
      else answerEmpty(filter, res);
    });

    const error: unknown = await findDirectoryComputerBySid(
      { config, sid: "S-1-5-21-1111111111-2222222222-3333333333-1105" },
      gatewayServices
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayTimeoutError);
    expect(classifyError(error)).toBe("timeout");
  });

  test("still reports other search errors as a bad request", async () => {
    useDirectory((filter, res) => {
      if (filter.includes("objectCategory=computer"))
        res.emit("error", Object.assign(new Error("No such object"), { code: 32 }));
      else answerEmpty(filter, res);
    });

    const error: unknown = await findDirectoryComputerBySid(
      { config, sid: "S-1-5-21-1111111111-2222222222-3333333333-1105" },
      gatewayServices
    ).catch((caught: unknown) => caught);

    expect(classifyError(error)).toBe("validation");
  });
});

describe("readDirectoryComputerGroupSids", () => {
  const config = { credentials: { dn: "svc-certs@corp.example.com" } } as unknown as TLdapConnectionConfig;
  const gatewayServices = { gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() } };
  const COMPUTER_SID = "S-1-5-21-1111111111-2222222222-3333333333-1105";
  const COMPUTER_DN = "CN=LAPTOP01,OU=Laptops,DC=corp,DC=example,DC=com";
  const GROUP_SIDS = [
    "S-1-5-21-1111111111-2222222222-3333333333-515",
    "S-1-5-21-1111111111-2222222222-3333333333-1200"
  ];

  const attribute = (type: string, values: string[], buffers: Buffer[] = []) => ({ type, values, buffers });

  const useDirectory = (entriesFor: (baseDN: string, scope: string, attributes: string[]) => unknown[]) => {
    const searches: { baseDN: string; scope: string; attributes: string[] }[] = [];
    vi.mocked(executeWithPotentialGateway).mockImplementation(async (_config, _gateway, operation) =>
      operation({
        search: (
          baseDN: string,
          options: { scope: string; attributes: string[] },
          cb: (err: Error | null, res: EventEmitter) => void
        ) => {
          searches.push({ baseDN, scope: options.scope, attributes: options.attributes });
          const res = new EventEmitter();
          cb(null, res);
          setImmediate(() => {
            entriesFor(baseDN, options.scope, options.attributes).forEach((entry) => res.emit("searchEntry", entry));
            res.emit("end", { status: 0 });
          });
        }
      } as never)
    );
    return searches;
  };

  const directoryWithComputer = (baseDN: string, scope: string, attributes: string[]) => {
    if (attributes.includes("defaultNamingContext")) {
      return [{ attributes: [attribute("defaultNamingContext", ["DC=corp,DC=example,DC=com"])] }];
    }
    if (attributes.includes("distinguishedName")) {
      return [{ attributes: [attribute("distinguishedName", [COMPUTER_DN])] }];
    }
    if (baseDN === COMPUTER_DN && scope === "base") {
      return [{ attributes: [attribute("tokenGroups", [], GROUP_SIDS.map(sidStringToBuffer))] }];
    }
    return [];
  };

  test("reads the computer's transitive group SIDs from tokenGroups on its own entry", async () => {
    const searches = useDirectory(directoryWithComputer);

    await expect(readDirectoryComputerGroupSids({ config, sid: COMPUTER_SID }, gatewayServices)).resolves.toEqual(
      GROUP_SIDS
    );
    expect(searches).toContainEqual({ baseDN: COMPUTER_DN, scope: "base", attributes: ["tokenGroups"] });
  });

  test("returns null when no computer has the SID", async () => {
    const searches = useDirectory((baseDN, scope, attributes) =>
      attributes.includes("distinguishedName") ? [] : directoryWithComputer(baseDN, scope, attributes)
    );

    await expect(readDirectoryComputerGroupSids({ config, sid: COMPUTER_SID }, gatewayServices)).resolves.toBeNull();
    expect(searches.map((search) => search.attributes)).not.toContainEqual(["tokenGroups"]);
  });
});

describe("withActiveDirectoryErrors", () => {
  it("keeps a directory timeout a timeout, naming the connection", () => {
    expect(() =>
      withActiveDirectoryErrors({ id: "connection-id", name: "corp-ad" })(
        new GatewayTimeoutError({ message: "The directory did not answer within 10 seconds." })
      )
    ).toThrow(GatewayTimeoutError);
    expect(() =>
      withActiveDirectoryErrors({ id: "connection-id", name: "corp-ad" })(
        new GatewayTimeoutError({ message: "The directory did not answer within 10 seconds." })
      )
    ).toThrow(/LDAP connection 'corp-ad': The directory did not answer/);
  });
});
