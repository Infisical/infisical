import { randomUUID } from "node:crypto";

import { AccessScope, ProjectType, SecretFolderRole } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { PAST, TSeedActor, temporaryColumns } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { FakeProjectsService } from "@app/domains/platform/projects/ce/testing/fake-projects-service";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal, TUserPrincipal } from "@app/lib/auth/principal";

import { FolderGrantCache } from "../data-access/folder-grant-cache";
import { SecretsPermissionService } from "../services/secrets-permission/service";
import { FakeProjectPermissionService } from "./fake-project-permission-service";
import { InMemoryFolderLocationStore } from "./in-memory-folder-location-store";
import { InMemoryMemberNameStore } from "./in-memory-member-name-store";
import { InMemoryServiceTokenStore } from "./in-memory-service-token-store";

// The Secrets permission service over in-memory stores and Access Control, with one org and one Secret Manager
// project, and helpers that seed what the tests need. The cache checks its fingerprint on every read.
export const buildSecretsPermission = () => {
  const accessControl = buildAccessControl();
  const projectStore = new FakeProjectsService();
  const serviceTokenStore = new InMemoryServiceTokenStore();
  const folderLocationStore = new InMemoryFolderLocationStore();
  const memberNameStore = new InMemoryMemberNameStore();
  const keyStore = new InMemoryKeyStore();
  const service = new SecretsPermissionService(
    new FakeProjectPermissionService(projectStore, accessControl.actorGrantsService),
    accessControl.actorGrantsService,
    accessControl.groupService,
    projectStore,
    serviceTokenStore,
    folderLocationStore,
    memberNameStore,
    new FolderGrantCache(keyStore, 0)
  );

  const orgId = randomUUID();
  const addProject = (type: ProjectType = ProjectType.SecretManager) => {
    const id = randomUUID();
    projectStore.rows.set(id, {
      id,
      name: `project-${id}`,
      slug: `project-${id}`,
      orgId,
      type,
      enforceEncryptedSecretManagerSecretMetadata: false
    });
    return id;
  };
  const projectId = addProject();

  const actor = (principal: TPrincipal): TActorContext => ({
    principal,
    org: {
      id: orgId,
      name: "org",
      rootOrgId: orgId,
      parentOrgId: orgId,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    }
  });

  const addUser = (username = `user-${randomUUID()}`): TUserPrincipal => {
    const id = randomUUID();
    memberNameStore.users.set(id, { username });
    return { type: ActorType.USER, id, username, email: null, authMethod: AuthMethod.EMAIL, isSuperAdmin: false };
  };

  const seedActorOf = (principal: { type: ActorType; id: string }): TSeedActor =>
    principal.type === ActorType.IDENTITY ? { identityId: principal.id } : { userId: principal.id };

  const addProjectRole = (
    principal: { type: ActorType; id: string },
    role: string,
    { inProjectId = projectId }: { inProjectId?: string } = {}
  ) =>
    accessControl.seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId: inProjectId,
      actor: seedActorOf(principal),
      roles: [{ role }]
    });

  const addFolder = (secretPath: string, { environmentSlug = "prod", inProjectId = projectId } = {}) => {
    const folderId = randomUUID();
    folderLocationStore.folders.set(folderId, { projectId: inProjectId, environmentSlug, secretPath });
    return folderId;
  };

  const addFolderGrant = async (
    principal: { type: ActorType; id: string },
    secretPath: string,
    role: SecretFolderRole | string,
    { ended = false, environmentSlug = "prod" }: { ended?: boolean; environmentSlug?: string } = {}
  ) => {
    const folderId = addFolder(secretPath, { environmentSlug });
    const row = await accessControl.seed.privilege({
      actor: seedActorOf(principal),
      projectId,
      folder: { id: folderId, role }
    });
    if (ended) accessControl.grantStore.rows.privileges.set(row.id, { ...row, ...temporaryColumns(PAST()) });
    return { folderId, privilegeId: row.id };
  };

  return {
    service,
    accessControl,
    projectStore,
    serviceTokenStore,
    folderLocationStore,
    memberNameStore,
    keyStore,
    orgId,
    projectId,
    addProject,
    actor,
    addUser,
    addProjectRole,
    addFolder,
    addFolderGrant
  };
};
