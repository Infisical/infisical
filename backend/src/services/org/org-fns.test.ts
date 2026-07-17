import { resolveOrgSsoMethod } from "./org-fns";
import { OrgAuthMethod } from "./org-types";

const createConfigDAL = (config: unknown) => ({
  findOne: vi.fn().mockResolvedValue(config)
});

describe("resolveOrgSsoMethod", () => {
  const orgId = "org-id";

  it("returns SAML when only an active SAML configuration exists", async () => {
    const samlConfigDAL = createConfigDAL({ id: "saml-config" });
    const oidcConfigDAL = createConfigDAL(undefined);

    await expect(resolveOrgSsoMethod({ orgId, samlConfigDAL, oidcConfigDAL })).resolves.toBe(OrgAuthMethod.SAML);
    expect(samlConfigDAL.findOne).toHaveBeenCalledWith({ orgId, isActive: true });
    expect(oidcConfigDAL.findOne).toHaveBeenCalledWith({ orgId, isActive: true });
  });

  it("returns OIDC when only an active OIDC configuration exists", async () => {
    const samlConfigDAL = createConfigDAL(undefined);
    const oidcConfigDAL = createConfigDAL({ id: "oidc-config" });

    await expect(resolveOrgSsoMethod({ orgId, samlConfigDAL, oidcConfigDAL })).resolves.toBe(OrgAuthMethod.OIDC);
  });

  it("returns null when no active SSO configuration exists", async () => {
    const samlConfigDAL = createConfigDAL(undefined);
    const oidcConfigDAL = createConfigDAL(undefined);

    await expect(resolveOrgSsoMethod({ orgId, samlConfigDAL, oidcConfigDAL })).resolves.toBeNull();
  });

  it("rejects an ambiguous organization with both SSO configurations active", async () => {
    const samlConfigDAL = createConfigDAL({ id: "saml-config" });
    const oidcConfigDAL = createConfigDAL({ id: "oidc-config" });

    await expect(resolveOrgSsoMethod({ orgId, samlConfigDAL, oidcConfigDAL })).rejects.toThrow(
      "Unable to determine the SSO method for this organization"
    );
  });
});
