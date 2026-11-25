import { createMongoAbility } from "@casl/ability";

import { FakeLicenseServerBilling } from "@app/domains/platform/license/ce/testing/fake-license-server-billing";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { BadRequestError } from "@app/lib/errors";

import { OrgPermissionBillingActions, OrgPermissionSubjects } from "../permission/org-permission";
import { licenseV2ServiceFactory } from "./license-v2-service";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const actor = {
  id: "user-1",
  type: "user",
  orgId: ORG_ID,
  authMethod: "email"
} as Parameters<ReturnType<typeof licenseV2ServiceFactory>["updateBillingEmail"]>[0]["actor"];

type TBuildOptions = {
  isCloud?: boolean;
  canManageBilling?: boolean;
  // Accounts holding the billing email, each with the org memberships it can still reach.
  accounts?: { id: string; memberships: { isActive: boolean }[] }[];
};

const buildService = ({ isCloud = true, canManageBilling = true, accounts = [] }: TBuildOptions = {}) => {
  const licenseBilling = new FakeLicenseServerBilling();
  const updateBillingEmail = vi.fn(async (_orgId: string, email: string) => ({
    payment: null,
    billingDetails: { name: "Acme", email, address: undefined, taxIds: [] },
    invoices: []
  }));
  licenseBilling.updateBillingEmail = updateBillingEmail;

  const find = vi.fn(async () => accounts.map(({ id }) => ({ id })));
  const service = licenseV2ServiceFactory({
    envConfig: { isCloud, SITE_URL: "http://localhost" },
    orgDAL: {
      findEffectiveOrgMemberships: vi.fn(
        async ({ actorId }: { actorId: string }) => accounts.find(({ id }) => id === actorId)?.memberships ?? []
      )
    },
    userDAL: { find },
    permissionService: {
      getOrgPermission: vi.fn(async () => ({
        permission: createMongoAbility(
          canManageBilling
            ? [{ action: OrgPermissionBillingActions.ManageBilling, subject: OrgPermissionSubjects.Billing }]
            : []
        )
      }))
    },
    licenseService: new FakeLicenseService(),
    licenseBilling
  } as unknown as Parameters<typeof licenseV2ServiceFactory>[0]);

  return { service, updateBillingEmail, find };
};

describe("billing v2 updateBillingEmail", () => {
  test("should change the billing email and return the updated details", async () => {
    // Setup
    const { service, updateBillingEmail } = buildService();

    // Action
    const result = await service.updateBillingEmail({ orgId: ORG_ID, actor, email: "finance@acme.com" });

    // Assert
    expect(updateBillingEmail).toHaveBeenCalledWith(ORG_ID, "finance@acme.com");
    expect(result).toEqual({
      billingDetails: { name: "Acme", email: "finance@acme.com", address: null, taxIds: [] },
      billingContactLeft: false
    });
  });

  test.each([
    { name: "an address with no Infisical account", accounts: [], billingContactLeft: false },
    {
      name: "an account that is an active member",
      accounts: [{ id: "user-2", memberships: [{ isActive: true }] }],
      billingContactLeft: false
    },
    {
      name: "an account that is no longer a member",
      accounts: [{ id: "user-2", memberships: [] }],
      billingContactLeft: true
    },
    {
      name: "an account whose membership was deactivated",
      accounts: [{ id: "user-2", memberships: [{ isActive: false }] }],
      billingContactLeft: true
    },
    {
      name: "two accounts sharing the email when one is still a member",
      accounts: [
        { id: "user-2", memberships: [] },
        { id: "user-3", memberships: [{ isActive: true }] }
      ],
      billingContactLeft: false
    }
  ])("should report billingContactLeft=$billingContactLeft for $name", async ({ accounts, billingContactLeft }) => {
    // Setup
    const { service, find } = buildService({ accounts });

    // Action
    const result = await service.updateBillingEmail({ orgId: ORG_ID, actor, email: " Finance@Acme.com " });

    // Assert
    expect(find).toHaveBeenCalledWith({ email: "finance@acme.com", isGhost: false });
    expect(result.billingContactLeft).toBe(billingContactLeft);
  });

  test("should refuse an actor who cannot manage billing and change nothing", async () => {
    // Setup
    const { service, updateBillingEmail } = buildService({ canManageBilling: false });

    // Action and assert
    await expect(service.updateBillingEmail({ orgId: ORG_ID, actor, email: "finance@acme.com" })).rejects.toThrow();
    expect(updateBillingEmail).not.toHaveBeenCalled();
  });

  test("should refuse on a self-hosted instance and change nothing", async () => {
    // Setup
    const { service, updateBillingEmail } = buildService({ isCloud: false });

    // Action and assert
    await expect(service.updateBillingEmail({ orgId: ORG_ID, actor, email: "finance@acme.com" })).rejects.toThrow(
      BadRequestError
    );
    expect(updateBillingEmail).not.toHaveBeenCalled();
  });
});
