import { createMongoAbility } from "@casl/ability";
import dns from "node:dns/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { ldapConfigServiceFactory } from "./ldap-config-service";
import { testLDAPConfig } from "./ldap-fns";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

vi.mock("./ldap-fns", () => ({
  testLDAPConfig: vi.fn().mockResolvedValue(true)
}));

const createService = () =>
  ldapConfigServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility([{ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Ldap }])
      })
    },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ ldap: true }) }
  } as unknown as Parameters<typeof ldapConfigServiceFactory>[0]);

// literal IPs keep the suite hermetic: blockLocalAndPrivateIpAddresses skips the DNS lookup
const testConnection = (url: string) =>
  createService().testLDAPConnection({
    actor: ActorType.USER,
    actorId: "user-id",
    actorOrgId: "org-id",
    actorAuthMethod: null,
    orgId: "org-id",
    url,
    bindDN: "cn=admin",
    bindPass: "pw",
    caCert: ""
  });

describe("testLDAPConnection", () => {
  beforeEach(() => vi.clearAllMocks());

  test("refuses a private address without connecting", async () => {
    await expect(testConnection("ldap://127.0.0.1:389")).rejects.toThrow("Local IPs not allowed as URL");
    expect(testLDAPConfig).not.toHaveBeenCalled();
  });

  test("returns false without connecting when the hostname does not resolve", async () => {
    vi.spyOn(dns, "lookup").mockRejectedValueOnce(
      Object.assign(new Error("getaddrinfo ENOTFOUND ldap.example.com"), { code: "ENOTFOUND" })
    );

    await expect(testConnection("ldap://ldap.example.com:389")).resolves.toBe(false);
    expect(testLDAPConfig).not.toHaveBeenCalled();
  });

  test("connects to a public address", async () => {
    await expect(testConnection("ldap://8.8.8.8:389")).resolves.toBe(true);
    expect(testLDAPConfig).toHaveBeenCalledWith(expect.objectContaining({ url: "ldap://8.8.8.8:389" }));
  });
});
