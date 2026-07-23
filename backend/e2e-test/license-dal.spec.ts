import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  AccessScope,
  ProjectType,
  TableName,
  TGroupsInsert,
  TIdentitiesInsert,
  TIdentityGroupMembershipInsert,
  TOrganizationsInsert,
  TProjectsInsert,
  TUserGroupMembershipInsert,
  TUsersInsert
} from "@app/db/schemas";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";

declare const testDb: Knex;

const licenseDAL = licenseDALFactory(testDb);

// Fixed ids for the two orgs under test so cleanup is trivial.
const ROOT_ORG_ID = randomUUID();
const SUB_ORG_ID = randomUUID();
const suffix = randomUUID().slice(0, 8);

const ids = {
  // users
  u1: randomUUID(), // SM project (direct) -> counted
  u2: randomUUID(), // PAM project only -> not counted
  u3: randomUUID(), // projectless -> counted
  u4: randomUUID(), // KMS project via group -> counted
  u5: randomUUID(), // ghost, projectless -> not counted
  u6: randomUUID(), // not accepted, projectless -> not counted
  u7: randomUUID(), // SM + PAM -> counted once
  u8: randomUUID(), // only a PENDING group into SM -> not a counted member, falls through to projectless (counted)
  u9: randomUUID(), // PKI (cert-manager) project only -> not counted
  u10: randomUUID(), // soft-deleted SM project + live PAM -> not counted (deleted project ignored, PAM doesn't count)
  // identities
  i1: randomUUID(), // SM project (direct) -> counted
  i2: randomUUID(), // PAM project only -> not counted
  i3: randomUUID(), // projectless (root org) -> counted
  i4: randomUUID(), // KMS project via group -> counted
  i5: randomUUID(), // projectless, in the SUB-ORG -> counted (proves sub-org rollup)
  // projects
  pSm: randomUUID(),
  pKms: randomUUID(),
  pPam: randomUUID(),
  pCert: randomUUID(),
  pSmDeleted: randomUUID(),
  // groups
  gLive: randomUUID(), // assigned to the KMS project, non-pending members
  gPending: randomUUID() // assigned to the SM project, pending member
};

const orgMembership = (userId: string, orgId = ROOT_ORG_ID) => ({
  id: randomUUID(),
  scope: AccessScope.Organization,
  scopeOrgId: orgId,
  actorUserId: userId
});

const projectMembership = (
  actor: { userId?: string; identityId?: string; groupId?: string },
  projectId: string,
  orgId = ROOT_ORG_ID
) => ({
  id: randomUUID(),
  scope: AccessScope.Project,
  scopeOrgId: orgId,
  scopeProjectId: projectId,
  actorUserId: actor.userId ?? null,
  actorIdentityId: actor.identityId ?? null,
  actorGroupId: actor.groupId ?? null
});

describe("license-dal billable org-actor count", () => {
  beforeAll(async () => {
    // Rows are held in typed consts rather than inline literals: the generated *Insert types omit the
    // immutable `id` key, and TS's excess-property check only fires on fresh object literals, so a
    // const lets the fixtures set explicit ids to wire relationships up front.
    const orgRows: (TOrganizationsInsert & { id: string })[] = [
      { id: ROOT_ORG_ID, name: `root-${suffix}`, slug: `root-${suffix}` },
      { id: SUB_ORG_ID, name: `sub-${suffix}`, slug: `sub-${suffix}`, rootOrgId: ROOT_ORG_ID }
    ];
    await testDb(TableName.Organization).insert(orgRows);

    const userRows: (TUsersInsert & { id: string })[] = [
      { id: ids.u1, username: `u1-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u2, username: `u2-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u3, username: `u3-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u4, username: `u4-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u5, username: `u5-${suffix}`, isAccepted: true, isGhost: true },
      { id: ids.u6, username: `u6-${suffix}`, isAccepted: false, isGhost: false },
      { id: ids.u7, username: `u7-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u8, username: `u8-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u9, username: `u9-${suffix}`, isAccepted: true, isGhost: false },
      { id: ids.u10, username: `u10-${suffix}`, isAccepted: true, isGhost: false }
    ];
    await testDb(TableName.Users).insert(userRows);

    const identityRows: (TIdentitiesInsert & { id: string })[] = [
      { id: ids.i1, name: `i1-${suffix}`, orgId: ROOT_ORG_ID },
      { id: ids.i2, name: `i2-${suffix}`, orgId: ROOT_ORG_ID },
      { id: ids.i3, name: `i3-${suffix}`, orgId: ROOT_ORG_ID },
      { id: ids.i4, name: `i4-${suffix}`, orgId: ROOT_ORG_ID },
      { id: ids.i5, name: `i5-${suffix}`, orgId: SUB_ORG_ID }
    ];
    await testDb(TableName.Identity).insert(identityRows);

    const projectRows: (TProjectsInsert & { id: string })[] = [
      { id: ids.pSm, name: `sm-${suffix}`, slug: `sm-${suffix}`, orgId: ROOT_ORG_ID, type: ProjectType.SecretManager },
      { id: ids.pKms, name: `kms-${suffix}`, slug: `kms-${suffix}`, orgId: ROOT_ORG_ID, type: ProjectType.KMS },
      { id: ids.pPam, name: `pam-${suffix}`, slug: `pam-${suffix}`, orgId: ROOT_ORG_ID, type: ProjectType.PAM },
      {
        id: ids.pCert,
        name: `cert-${suffix}`,
        slug: `cert-${suffix}`,
        orgId: ROOT_ORG_ID,
        type: ProjectType.CertificateManager
      },
      {
        id: ids.pSmDeleted,
        name: `sm-del-${suffix}`,
        slug: `sm-del-${suffix}`,
        orgId: ROOT_ORG_ID,
        type: ProjectType.SecretManager,
        deleteAfter: new Date()
      }
    ];
    await testDb(TableName.Project).insert(projectRows);

    const groupRows: (TGroupsInsert & { id: string })[] = [
      { id: ids.gLive, orgId: ROOT_ORG_ID, name: `g-live-${suffix}`, slug: `g-live-${suffix}` },
      { id: ids.gPending, orgId: ROOT_ORG_ID, name: `g-pending-${suffix}`, slug: `g-pending-${suffix}` }
    ];
    await testDb(TableName.Groups).insert(groupRows);

    // Org memberships (every real actor belongs to the org). u5/u6 belong too but are filtered as
    // ghost / unaccepted.
    await testDb(TableName.Membership).insert([
      orgMembership(ids.u1),
      orgMembership(ids.u2),
      orgMembership(ids.u3),
      orgMembership(ids.u4),
      orgMembership(ids.u5),
      orgMembership(ids.u6),
      orgMembership(ids.u7),
      orgMembership(ids.u8),
      orgMembership(ids.u9),
      orgMembership(ids.u10)
    ]);

    // Project memberships (direct).
    await testDb(TableName.Membership).insert([
      projectMembership({ userId: ids.u1 }, ids.pSm),
      projectMembership({ userId: ids.u2 }, ids.pPam),
      projectMembership({ userId: ids.u7 }, ids.pSm),
      projectMembership({ userId: ids.u7 }, ids.pPam),
      projectMembership({ userId: ids.u9 }, ids.pCert),
      projectMembership({ userId: ids.u10 }, ids.pSmDeleted),
      projectMembership({ userId: ids.u10 }, ids.pPam),
      projectMembership({ identityId: ids.i1 }, ids.pSm),
      projectMembership({ identityId: ids.i2 }, ids.pPam),
      // Group -> project assignments.
      projectMembership({ groupId: ids.gLive }, ids.pKms),
      projectMembership({ groupId: ids.gPending }, ids.pSm)
    ]);

    // Group memberships: gLive (KMS) has a non-pending user + identity; gPending (SM) has a pending user.
    const userGroupRows: (TUserGroupMembershipInsert & { id: string })[] = [
      { id: randomUUID(), userId: ids.u4, groupId: ids.gLive, isPending: false },
      { id: randomUUID(), userId: ids.u8, groupId: ids.gPending, isPending: true }
    ];
    await testDb(TableName.UserGroupMembership).insert(userGroupRows);

    const identityGroupRows: (TIdentityGroupMembershipInsert & { id: string })[] = [
      { id: randomUUID(), identityId: ids.i4, groupId: ids.gLive }
    ];
    await testDb(TableName.IdentityGroupMembership).insert(identityGroupRows);
  });

  afterAll(async () => {
    const orgIds = [ROOT_ORG_ID, SUB_ORG_ID];
    const groupIds = [ids.gLive, ids.gPending];
    await testDb(TableName.UserGroupMembership).whereIn("groupId", groupIds).delete();
    await testDb(TableName.IdentityGroupMembership).whereIn("groupId", groupIds).delete();
    await testDb(TableName.Membership).whereIn("scopeOrgId", orgIds).delete();
    await testDb(TableName.Groups).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Identity).whereIn("orgId", orgIds).delete();
    await testDb(TableName.Project).whereIn("orgId", orgIds).delete();
    // Sub-org first: rootOrgId FK on the root org.
    await testDb(TableName.Organization).where("id", SUB_ORG_ID).delete();
    await testDb(TableName.Organization).where("id", ROOT_ORG_ID).delete();
  });

  // Billable users: u1 (SM), u4 (KMS via group), u7 (SM+PAM, once), u3 (projectless),
  // u8 (only a pending group -> projectless). Excluded: u2/u10 (PAM/PKI or deleted-SM), u5 (ghost),
  // u6 (unaccepted), u9 (PKI).
  test("countOfOrgMembers counts only billable users", async () => {
    const count = await licenseDAL.countOfOrgMembers(ROOT_ORG_ID, testDb);
    expect(count).toBe(5);
  });

  // Billable identities: i1 (SM), i4 (KMS via group), i3 (projectless root), i5 (projectless sub-org).
  // Excluded: i2 (PAM only).
  test("countOfOrgIdentities counts only billable identities, including sub-orgs", async () => {
    const count = await licenseDAL.countOfOrgIdentities(ROOT_ORG_ID, testDb);
    expect(count).toBe(4);
  });

  test("countOrgUsersAndIdentities returns the combined billable total", async () => {
    const count = await licenseDAL.countOrgUsersAndIdentities(ROOT_ORG_ID, testDb);
    expect(count).toBe(9);
  });

  test("scoping to an unrelated org yields zero", async () => {
    const users = await licenseDAL.countOfOrgMembers(randomUUID(), testDb);
    const identities = await licenseDAL.countOfOrgIdentities(randomUUID(), testDb);
    expect(users).toBe(0);
    expect(identities).toBe(0);
  });
});
