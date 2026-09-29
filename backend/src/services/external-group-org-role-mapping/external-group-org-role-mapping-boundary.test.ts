import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipRole } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionActions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { BadRequestError, PermissionBoundaryError } from "@app/lib/errors";

import { externalGroupOrgRoleMappingServiceFactory } from "./external-group-org-role-mapping-service";

// SCIM applies a stored mapping to newly provisioned members with no user in the loop, so saving a
// mapping is the grant. `scim:edit` alone must not let an editor hand out roles beyond their reach.

const ORG_ID = "org-id";
const HIGH_ROLE = { id: "high-role-id", slug: "high" };

const admin = createMongoAbility<MongoAbility>(orgAdminPermissions);
const member = createMongoAbility<MongoAbility>(orgMemberPermissions);
const noAccess = createMongoAbility<MongoAbility>(orgNoAccessPermissions);
const high = createMongoAbility<MongoAbility>(orgAdminPermissions);

const scimEditor = createMongoAbility<MongoAbility>([
  { action: [OrgPermissionActions.Read, OrgPermissionActions.Edit], subject: OrgPermissionSubjects.Scim }
]);

const scimEditorWithGrant = createMongoAbility<MongoAbility>([
  { action: [OrgPermissionActions.Read, OrgPermissionActions.Edit], subject: OrgPermissionSubjects.Scim },
  { action: [OrgPermissionMemberActions.GrantPrivileges], subject: OrgPermissionSubjects.Member }
]);

type TStoredMapping = { groupName: string; role: string; roleId?: string | null };

const createService = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  currentMappings = [],
  existingCustomRoles = [HIGH_ROLE]
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  currentMappings?: TStoredMapping[];
  existingCustomRoles?: { id: string; slug: string }[];
}) => {
  const abilityByRole: Record<string, { permission: MongoAbility; role?: { slug: string } }> = {
    [OrgMembershipRole.Admin]: { permission: admin },
    [OrgMembershipRole.Member]: { permission: member },
    [OrgMembershipRole.NoAccess]: { permission: noAccess },
    [HIGH_ROLE.slug]: { permission: high, role: HIGH_ROLE }
  };

  const getOrgPermissionByRoles = vi
    .fn()
    .mockImplementation((roles: string[]) => roles.map((role) => abilityByRole[role]));

  const externalGroupOrgRoleMappingDAL = {
    find: vi.fn().mockResolvedValue(currentMappings.map((mapping) => ({ orgId: ORG_ID, roleId: null, ...mapping }))),
    updateExternalGroupOrgRoleMappingForOrg: vi.fn().mockResolvedValue([])
  };

  const service = externalGroupOrgRoleMappingServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getOrgPermissionByRoles
    } as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ rbac: true }) } as never,
    roleDAL: {
      find: vi
        .fn()
        .mockImplementation(({ $in }: { $in: { slug?: string[]; id?: string[] } }) =>
          existingCustomRoles.filter((role) => $in.slug?.includes(role.slug) || $in.id?.includes(role.id))
        )
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem }) } as never,
    externalGroupOrgRoleMappingDAL: externalGroupOrgRoleMappingDAL as never
  });

  const actor = { type: "user", id: "actor-id", authMethod: "email", orgId: ORG_ID } as never;
  const run = (mappings: { groupName: string; roleSlug: string }[]) =>
    service.updateExternalGroupOrgRoleMappings({ mappings }, actor);

  return {
    run,
    getOrgPermissionByRoles,
    persist: externalGroupOrgRoleMappingDAL.updateExternalGroupOrgRoleMappingForOrg
  };
};

const BOTH_SYSTEMS = [true, false];

describe("updateExternalGroupOrgRoleMappings privilege boundary", () => {
  test("the editor holds scim:edit, so the plain permission check is not what rejects it", () => {
    expect(scimEditor.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim)).toBe(true);
  });

  test("a group mapped twice in one request is a 400, not a unique-index 500", async () => {
    const { run, persist } = createService({ actorPermission: admin, shouldUseNewPrivilegeSystem: true });

    await expect(
      run([
        { groupName: "g", roleSlug: OrgMembershipRole.NoAccess },
        { groupName: "g", roleSlug: OrgMembershipRole.NoAccess }
      ])
    ).rejects.toThrow(BadRequestError);
    expect(persist).not.toHaveBeenCalled();
  });

  test.each(BOTH_SYSTEMS)(
    "a limited editor can resubmit an admin mapping unchanged (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { run, persist, getOrgPermissionByRoles } = createService({
        actorPermission: scimEditor,
        shouldUseNewPrivilegeSystem,
        currentMappings: [
          { groupName: "admins", role: OrgMembershipRole.Admin },
          { groupName: "highs", role: OrgMembershipRole.Custom, roleId: HIGH_ROLE.id }
        ]
      });

      await run([
        { groupName: "admins", roleSlug: OrgMembershipRole.Admin },
        { groupName: "highs", roleSlug: HIGH_ROLE.slug },
        { groupName: "nobody", roleSlug: OrgMembershipRole.NoAccess }
      ]);

      expect(getOrgPermissionByRoles).not.toHaveBeenCalled();
      expect(persist).toHaveBeenCalledOnce();
    }
  );

  test.each(BOTH_SYSTEMS)(
    "a limited editor cannot add an admin mapping (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { run, persist } = createService({ actorPermission: scimEditor, shouldUseNewPrivilegeSystem });

      await expect(run([{ groupName: "admins", roleSlug: OrgMembershipRole.Admin }])).rejects.toThrow(
        PermissionBoundaryError
      );
      expect(persist).not.toHaveBeenCalled();
    }
  );

  test.each(BOTH_SYSTEMS)(
    "a limited editor cannot remove an admin mapping (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { run, persist } = createService({
        actorPermission: scimEditor,
        shouldUseNewPrivilegeSystem,
        currentMappings: [{ groupName: "admins", role: OrgMembershipRole.Admin }]
      });

      await expect(run([])).rejects.toThrow(PermissionBoundaryError);
      expect(persist).not.toHaveBeenCalled();
    }
  );

  test.each(BOTH_SYSTEMS)(
    "a limited editor cannot downgrade an admin mapping to no-access (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { run } = createService({
        actorPermission: scimEditor,
        shouldUseNewPrivilegeSystem,
        currentMappings: [{ groupName: "admins", role: OrgMembershipRole.Admin }]
      });

      await expect(run([{ groupName: "admins", roleSlug: OrgMembershipRole.NoAccess }])).rejects.toThrow(
        PermissionBoundaryError
      );
    }
  );

  test("a replaced custom-role mapping is bounded by the role its id resolves to", async () => {
    const { run, getOrgPermissionByRoles } = createService({
      actorPermission: scimEditor,
      shouldUseNewPrivilegeSystem: false,
      currentMappings: [{ groupName: "highs", role: OrgMembershipRole.Custom, roleId: HIGH_ROLE.id }]
    });

    await expect(run([])).rejects.toThrow(PermissionBoundaryError);
    expect(getOrgPermissionByRoles).toHaveBeenCalledWith([HIGH_ROLE.slug], ORG_ID);
  });

  test("a replaced mapping whose custom role no longer exists is skipped", async () => {
    const { run, persist, getOrgPermissionByRoles } = createService({
      actorPermission: scimEditor,
      shouldUseNewPrivilegeSystem: false,
      currentMappings: [{ groupName: "orphan", role: OrgMembershipRole.Custom, roleId: "deleted-role-id" }],
      existingCustomRoles: []
    });

    await run([]);

    expect(getOrgPermissionByRoles).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
  });

  test("on the new system, member:grant-privileges is the authority to map to admin", async () => {
    const { run, persist } = createService({
      actorPermission: scimEditorWithGrant,
      shouldUseNewPrivilegeSystem: true
    });

    await run([{ groupName: "admins", roleSlug: OrgMembershipRole.Admin }]);
    expect(persist).toHaveBeenCalledOnce();
  });

  test("on the legacy system, grant-privileges alone does not outrank admin", async () => {
    const { run } = createService({ actorPermission: scimEditorWithGrant, shouldUseNewPrivilegeSystem: false });

    await expect(run([{ groupName: "admins", roleSlug: OrgMembershipRole.Admin }])).rejects.toThrow(
      PermissionBoundaryError
    );
  });

  test.each(BOTH_SYSTEMS)(
    "an admin can add, change and remove admin mappings (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { run, persist } = createService({
        actorPermission: admin,
        shouldUseNewPrivilegeSystem,
        currentMappings: [{ groupName: "admins", role: OrgMembershipRole.Admin }]
      });

      await run([
        { groupName: "admins", roleSlug: OrgMembershipRole.Member },
        { groupName: "highs", roleSlug: HIGH_ROLE.slug }
      ]);
      expect(persist).toHaveBeenCalledOnce();
    }
  );

  // The write re-reads under a lock and refuses when the rows moved, so the snapshot it receives
  // must be the one the checks above ran against, not a second read.
  test("hands the write the exact snapshot the boundary was checked against", async () => {
    const currentMappings = [
      { groupName: "admins", role: OrgMembershipRole.Admin },
      { groupName: "highs", role: OrgMembershipRole.Custom, roleId: HIGH_ROLE.id }
    ];
    const { run, persist } = createService({
      actorPermission: scimEditor,
      shouldUseNewPrivilegeSystem: true,
      currentMappings
    });

    await run([
      { groupName: "admins", roleSlug: OrgMembershipRole.Admin },
      { groupName: "highs", roleSlug: HIGH_ROLE.slug }
    ]);

    expect(persist).toHaveBeenCalledWith(
      ORG_ID,
      expect.any(Array),
      currentMappings.map((mapping): unknown => expect.objectContaining(mapping))
    );
  });
});
