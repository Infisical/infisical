import { createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { orgAdminPermissions } from "@app/ee/services/permission/org-permission";
import { BadRequestError } from "@app/lib/errors";
import { MAX_NEW_MEMBERS_PER_INVITE } from "@app/services/org/org-invite-quota";

import { newOrgMembershipUserFactory } from "./org-membership-user-factory";

const ORG_ID = "org-id";
const ROOT_ORG_ID = "root-org-id";

const invitees = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `user-${i}`, email: `user-${i}@example.com` }));

const createGuard = ({ rootOrgId = null }: { rootOrgId?: string | null } = {}) => {
  const admit = vi.fn();
  const factory = newOrgMembershipUserFactory({
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility<MongoAbility>(orgAdminPermissions) }),
      getOrgPermissionByRoles: vi.fn()
    } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, authEnforced: false, rootOrgId })
    } as never,
    licenseService: new FakeLicenseService(),
    membershipUserDAL: {
      find: vi
        .fn()
        .mockImplementation(async ({ $in }: { $in: { actorUserId: string[] } }) =>
          $in.actorUserId.map((actorUserId) => ({ actorUserId }))
        ),
      getUserById: vi.fn()
    } as never,
    tokenService: {} as never,
    userDAL: {} as never,
    smtpService: {} as never,
    userGroupMembershipDAL: {} as never,
    emailDomainDAL: {} as never,
    oidcConfigDAL: {} as never,
    samlConfigDAL: {} as never,
    orgInviteQuota: { admit }
  });

  const guard = (count: number) =>
    factory.onCreateMembershipUserGuard(
      {
        permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
        scopeData: { scope: AccessScope.Organization, orgId: ORG_ID },
        data: { roles: [{ role: "no-access", isTemporary: false }] }
      } as never,
      invitees(count) as never
    );

  return { guard, admit };
};

describe("org invite limits", () => {
  test("counts every new root-org invitee against the daily quota", async () => {
    // Setup
    const { guard, admit } = createGuard();

    // Action
    await guard(MAX_NEW_MEMBERS_PER_INVITE);

    // Assert
    expect(admit).toHaveBeenCalledWith(ORG_ID, MAX_NEW_MEMBERS_PER_INVITE);
  });

  test("refuses more new root-org invitees than one invite allows, before counting them", async () => {
    // Setup
    const { guard, admit } = createGuard();

    // Action
    const result = guard(MAX_NEW_MEMBERS_PER_INVITE + 1);

    // Assert
    await expect(result).rejects.toThrow(BadRequestError);
    expect(admit).not.toHaveBeenCalled();
  });

  test("lets a sub-org add any number of root-org members", async () => {
    // Setup
    const { guard, admit } = createGuard({ rootOrgId: ROOT_ORG_ID });

    // Action
    await guard(MAX_NEW_MEMBERS_PER_INVITE * 3);

    // Assert
    expect(admit).not.toHaveBeenCalled();
  });
});
