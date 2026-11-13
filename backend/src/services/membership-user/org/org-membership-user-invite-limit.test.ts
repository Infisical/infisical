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

const newEmails = (count: number) => Array.from({ length: count }, (_, i) => `new-${i}@example.com`);

const createGuard = ({ rootOrgId = null }: { rootOrgId?: string | null } = {}) => {
  const release = vi.fn();
  const seatPlan = { identityLimit: 5 };
  const admit = vi.fn().mockResolvedValue({ release });
  const getSeatPlan = vi.fn().mockResolvedValue(seatPlan);
  const assertSeatsForInvites = vi.fn();
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
    orgInviteQuota: { admit, getSeatPlan, assertSeatsForInvites }
  });

  const dto = {
    permission: { type: "user", id: "actor-id", orgId: ORG_ID, authMethod: "email" },
    scopeData: { scope: AccessScope.Organization, orgId: ORG_ID },
    data: { roles: [{ role: "no-access", isTemporary: false }] }
  } as never;
  const guard = (existing: number, created = 0) =>
    factory.onCreateMembershipUserGuard(dto, invitees(existing) as never, newEmails(created));
  const reserve = (count: number) => factory.onCreateMembershipReserve?.(dto, count);

  return { guard, reserve, admit, release, seatPlan, assertSeatsForInvites };
};

describe("org invite limits", () => {
  test("allows up to the per-invite limit, counting invitees with and without an account", async () => {
    // Setup
    const { guard, admit, assertSeatsForInvites } = createGuard();

    // Action
    const result = guard(4, MAX_NEW_MEMBERS_PER_INVITE - 4);

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(admit).not.toHaveBeenCalled();
    expect(assertSeatsForInvites).not.toHaveBeenCalled();
  });

  test("refuses more new root-org invitees than one invite allows", async () => {
    // Setup
    const { guard } = createGuard();

    // Action
    const result = guard(4, MAX_NEW_MEMBERS_PER_INVITE - 3);

    // Assert
    await expect(result).rejects.toThrow(BadRequestError);
  });

  test("reserving spends the daily quota and holds the seats inside the membership transaction", async () => {
    // Setup
    const { reserve, admit, release, seatPlan, assertSeatsForInvites } = createGuard();
    const tx = {} as never;

    // Action
    const reservation = await reserve(MAX_NEW_MEMBERS_PER_INVITE);
    await reservation?.checkInTransaction(tx);
    await reservation?.release();

    // Assert
    expect(admit).toHaveBeenCalledWith(ORG_ID, MAX_NEW_MEMBERS_PER_INVITE);
    expect(assertSeatsForInvites).toHaveBeenCalledWith(
      { orgId: ORG_ID, plan: seatPlan, count: MAX_NEW_MEMBERS_PER_INVITE },
      tx
    );
    expect(release).toHaveBeenCalled();
  });

  test("lets a sub-org add any number of root-org members, without quota or seats", async () => {
    // Setup
    const { guard, reserve, admit } = createGuard({ rootOrgId: ROOT_ORG_ID });

    // Action
    await guard(MAX_NEW_MEMBERS_PER_INVITE * 3);
    const reservation = await reserve(MAX_NEW_MEMBERS_PER_INVITE * 3);

    // Assert
    expect(reservation).toBeUndefined();
    expect(admit).not.toHaveBeenCalled();
  });

  test("refuses a sub-org invitee who has no account, since they cannot be a root-org member", async () => {
    // Setup
    const { guard } = createGuard({ rootOrgId: ROOT_ORG_ID });

    // Action
    const result = guard(2, 1);

    // Assert
    await expect(result).rejects.toThrow("new-0@example.com");
  });
});
