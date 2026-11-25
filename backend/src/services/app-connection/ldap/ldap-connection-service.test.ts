import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { LdapProvider } from "./ldap-connection-enums";
import { ldapConnectionService } from "./ldap-connection-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { searchDirectoryGroups } = vi.hoisted(() => ({ searchDirectoryGroups: vi.fn() }));

vi.mock("./ldap-directory-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ldap-directory-fns")>()),
  searchDirectoryGroups
}));

const CONNECTION_ID = "8f0c6a1e-3c4b-4d5e-9f60-7a8b9c0d1e2f";
const SERVERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1200";
const actor = { type: "user", id: "user-id", authMethod: null, orgId: "org-id" } as never;

describe("ldapConnectionService.listGroups", () => {
  const getAppConnection = vi.fn();
  const service = ldapConnectionService(getAppConnection, {} as never, {} as never, {} as never);

  beforeEach(() => {
    vi.clearAllMocks();
    getAppConnection.mockResolvedValue({
      id: CONNECTION_ID,
      name: "corp-ad",
      credentials: { provider: LdapProvider.ActiveDirectory }
    });
  });

  test("reads the connection with the caller's permission and returns the groups", async () => {
    searchDirectoryGroups.mockResolvedValue({ groups: [{ sid: SERVERS_SID, name: "Servers" }], isTruncated: true });

    await expect(service.listGroups(CONNECTION_ID, { search: "serv" }, actor)).resolves.toEqual({
      groups: [{ sid: SERVERS_SID, name: "Servers" }],
      isTruncated: true
    });
    expect(getAppConnection).toHaveBeenCalledWith(AppConnection.LDAP, CONNECTION_ID, actor);
  });

  test("refuses a connection that does not use the Active Directory provider", async () => {
    getAppConnection.mockResolvedValue({ id: CONNECTION_ID, name: "corp-ldap", credentials: { provider: "openldap" } });

    await expect(service.listGroups(CONNECTION_ID, {}, actor)).rejects.toThrow(
      "requires an Active Directory connection"
    );
    expect(searchDirectoryGroups).not.toHaveBeenCalled();
  });

  test("names the LDAP connection when the directory refuses the search, keeping the cause", async () => {
    searchDirectoryGroups.mockRejectedValue(
      new BadRequestError({ message: "TLS connection error: certificate has expired" })
    );

    await expect(service.listGroups(CONNECTION_ID, {}, actor)).rejects.toThrow(
      "Could not search Active Directory with the LDAP connection 'corp-ad'. Check that the directory is reachable and the connection's credentials are valid. Details: TLS connection error: certificate has expired"
    );
  });

  test("names the LDAP connection without the raw error when the search fails unexpectedly", async () => {
    searchDirectoryGroups.mockRejectedValue(new Error("ECONNRESET 10.0.0.4:636"));

    const error = await service.listGroups(CONNECTION_ID, {}, actor).catch((err: Error) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toContain("'corp-ad'");
    expect((error as Error).message).not.toContain("ECONNRESET");
  });
});
