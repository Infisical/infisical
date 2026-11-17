import { randomUUID } from "node:crypto";

import { Knex } from "knex";

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

// Covers every billing rule. Counted: u1/i1 (Secret Manager, direct), u3/i3 (no project), u4/i4 (KMS via a
// group), u7 (Secret Manager and PAM, once), u8 (only a pending group, so no project), i5 (sub-org, no project,
// counted at the root). Not counted: u2/i2 (PAM only), u5 (ghost), u6 (not accepted), u9 (Certificate Manager
// only), u10 (deleted Secret Manager project and PAM).
// Ids are fresh so tests sharing a database never see each other's rows.
export const seedBillableActors = async (testDb: Knex) => {
  const ROOT_ORG_ID = randomUUID();
  const SUB_ORG_ID = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    u1: randomUUID(),
    u2: randomUUID(),
    u3: randomUUID(),
    u4: randomUUID(),
    u5: randomUUID(),
    u6: randomUUID(),
    u7: randomUUID(),
    u8: randomUUID(),
    u9: randomUUID(),
    u10: randomUUID(),
    i1: randomUUID(),
    i2: randomUUID(),
    i3: randomUUID(),
    i4: randomUUID(),
    i5: randomUUID(),
    pSm: randomUUID(),
    pKms: randomUUID(),
    pPam: randomUUID(),
    pCert: randomUUID(),
    pSmDeleted: randomUUID(),
    gLive: randomUUID(),
    gPending: randomUUID()
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
    projectMembership({ groupId: ids.gLive }, ids.pKms),
    projectMembership({ groupId: ids.gPending }, ids.pSm)
  ]);

  const userGroupRows: (TUserGroupMembershipInsert & { id: string })[] = [
    { id: randomUUID(), userId: ids.u4, groupId: ids.gLive, isPending: false },
    { id: randomUUID(), userId: ids.u8, groupId: ids.gPending, isPending: true }
  ];
  await testDb(TableName.UserGroupMembership).insert(userGroupRows);

  const identityGroupRows: (TIdentityGroupMembershipInsert & { id: string })[] = [
    { id: randomUUID(), identityId: ids.i4, groupId: ids.gLive }
  ];
  await testDb(TableName.IdentityGroupMembership).insert(identityGroupRows);

  return { rootOrgId: ROOT_ORG_ID, subOrgId: SUB_ORG_ID, ids };
};
