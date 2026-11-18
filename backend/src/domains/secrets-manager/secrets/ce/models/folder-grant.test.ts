import { packRules } from "@casl/ability/extra";

import { SecretFolderRole } from "@app/db/schemas";
import { Privilege, TPrivilegeRecord } from "@app/domains/platform/access-control/ce/module";

import { FolderGrant, TFolderGrantRecord } from "./folder-grant";
import { FolderGrants } from "./folder-grants";

const record = (overrides: Partial<TFolderGrantRecord> = {}): TFolderGrantRecord => ({
  id: "grant-id",
  name: "",
  actorId: "user-id",
  folderId: "folder-id",
  role: SecretFolderRole.Edit,
  environmentSlug: "prod",
  secretPath: "/app",
  isTemporary: false,
  temporaryAccessStartTime: null,
  temporaryAccessEndTime: null,
  ...overrides
});

const privilegeRow = (overrides: Partial<TPrivilegeRecord> = {}): TPrivilegeRecord => ({
  id: "privilege-id",
  name: "folder access",
  isTemporary: false,
  permissions: [],
  actorUserId: "user-id",
  actorIdentityId: null,
  orgId: null,
  projectId: "project-id",
  folderId: "folder-id",
  role: SecretFolderRole.Read,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe("FolderGrant.isActive", () => {
  test("should stay active when the grant is permanent", () => {
    // Setup
    const grant = FolderGrant.restore(record());

    // Action
    const active = grant.isActive(new Date());

    // Assert
    expect(active).toBe(true);
  });

  test("should end a temporary grant at its end time, read back from a cache as a string", () => {
    // Setup
    const endsAt = new Date("2030-01-01T00:00:00.000Z");
    const cached = JSON.parse(JSON.stringify(record({ isTemporary: true, temporaryAccessEndTime: endsAt }))) as unknown;
    const grant = FolderGrant.restore(cached as TFolderGrantRecord);

    // Action
    const before = grant.isActive(new Date(endsAt.getTime() - 1));
    const after = grant.isActive(endsAt);

    // Assert
    expect(before).toBe(true);
    expect(after).toBe(false);
  });

  test("should never apply a temporary grant without an end time", () => {
    // Setup
    const grant = FolderGrant.restore(record({ isTemporary: true }));

    // Action
    const active = grant.isActive(new Date());

    // Assert
    expect(active).toBe(false);
  });
});

describe("FolderGrant.fromPrivilege", () => {
  test("should place the grant at its folder's location, held by the privilege's actor", () => {
    // Setup
    const privilege = Privilege.restore(privilegeRow({ actorUserId: null, actorIdentityId: "identity-id" }));

    // Action
    const grant = FolderGrant.fromPrivilege(privilege, { environmentSlug: "dev", secretPath: "/a" });

    // Assert
    expect(grant?.toJSON()).toMatchObject({
      id: "privilege-id",
      actorId: "identity-id",
      folderId: "folder-id",
      role: SecretFolderRole.Read,
      environmentSlug: "dev",
      secretPath: "/a"
    });
  });

  test("should give nothing for a privilege without a folder role", () => {
    // Setup
    const location = { environmentSlug: "dev", secretPath: "/a" };

    // Action
    const noRole = FolderGrant.fromPrivilege(Privilege.restore(privilegeRow({ role: null })), location);
    const noFolder = FolderGrant.fromPrivilege(Privilege.restore(privilegeRow({ folderId: null })), location);

    // Assert
    expect(noRole).toBeNull();
    expect(noFolder).toBeNull();
  });
});

describe("FolderGrant.toAuditSource", () => {
  test("should name an unnamed grant Folder Access and carry its denies and allows at the folder", () => {
    // Setup
    const grant = FolderGrant.restore(record({ name: "" }));

    // Action
    const source = grant.toAuditSource();

    // Assert
    expect(source).toMatchObject({ id: "grant-id", type: "additional_privilege", name: "Folder Access" });
    expect(source.permissions).toEqual(packRules(FolderGrants.inForce([grant]).rules().rules));
  });
});

describe("FolderGrants.inForce", () => {
  test("should leave out a grant that has ended", () => {
    // Setup
    const ended = FolderGrant.restore(
      record({ id: "ended", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 1000) })
    );
    const permanent = FolderGrant.restore(record({ id: "permanent" }));

    // Action
    const grants = FolderGrants.inForce([ended, permanent]);

    // Assert
    expect(grants.list.map((grant) => grant.id)).toEqual(["permanent"]);
  });

  test("should not refuse an unknown role until its rules are built", () => {
    // Setup
    const unknown = FolderGrant.restore(record({ role: "superuser" }));

    // Action
    const grants = FolderGrants.inForce([unknown]);

    // Assert
    expect(grants.list).toHaveLength(1);
    expect(() => grants.rules()).toThrow("Folder access role 'superuser' on grant with ID 'grant-id' not found");
  });
});
