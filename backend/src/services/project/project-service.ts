import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, ProjectMembershipRole, ProjectVersion } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectPermission } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityProjectDALFactory } from "../identity-project/identity-project-dal";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { ROOT_FOLDER_NAME, TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";
import { assignWorkspaceKeysToMembers, createProjectKey } from "./project-fns";
import { TProjectQueueFactory } from "./project-queue";
import {
  TCreateProjectDTO,
  TDeleteProjectDTO,
  TGetProjectDTO,
  TGetProjectKmsKey,
  TListProjectCasDTO,
  TListProjectCertsDTO,
  TLoadProjectKmsBackupDTO,
  TToggleProjectAutoCapitalizationDTO,
  TUpdateAuditLogsRetentionDTO,
  TUpdateProjectDTO,
  TUpdateProjectKmsDTO,
  TUpdateProjectNameDTO,
  TUpdateProjectVersionLimitDTO,
  TUpgradeProjectDTO
} from "./project-types";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  // TODO: Pick
  projectDAL: TProjectDALFactory;
  projectQueue: TProjectQueueFactory;
  userDAL: TUserDALFactory;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "insertMany" | "find">;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  identityProjectDAL: TIdentityProjectDALFactory;
  identityProjectMembershipRoleDAL: Pick<TIdentityProjectMembershipRoleDALFactory, "create">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "create" | "findLatestProjectKey" | "delete" | "find" | "insertMany">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "create" | "findProjectGhostUser" | "findOne">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "find">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "countCertificatesInProject">;
  permissionService: TPermissionServiceFactory;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findOne">;
  keyStore: Pick<TKeyStoreFactory, "deleteItem">;
  projectBotDAL: Pick<TProjectBotDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    | "updateProjectSecretManagerKmsKey"
    | "getProjectKeyBackup"
    | "loadProjectKeyBackup"
    | "getKmsById"
    | "getProjectSecretManagerKmsKeyId"
    | "deleteInternalKms"
  >;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  projectQueue,
  projectKeyDAL,
  permissionService,
  orgDAL,
  userDAL,
  folderDAL,
  orgService,
  identityProjectDAL,
  identityOrgMembershipDAL,
  projectMembershipDAL,
  projectEnvDAL,
  licenseService,
  projectUserMembershipRoleDAL,
  identityProjectMembershipRoleDAL,
  certificateAuthorityDAL,
  certificateDAL,
  keyStore,
  kmsService,
  projectBotDAL
}: TProjectServiceFactoryDep) => {
  /*
   * Create workspace. Make user the admin
   * */
  const createProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    workspaceName,
    slug: projectSlug,
    kmsKeyId
  }: TCreateProjectDTO) => {
    const organization = await orgDAL.findOne({ id: actorOrgId });

    const { permission, membership: orgMembership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      organization.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);

    const plan = await licenseService.getPlan(organization.id);
    if (plan.workspaceLimit !== null && plan.workspacesUsed >= plan.workspaceLimit) {
      // case: limit imposed on number of workspaces allowed
      // case: number of workspaces used exceeds the number of workspaces allowed
      throw new BadRequestError({
        message: "Failed to create workspace due to plan limit reached. Upgrade plan to add more workspaces."
      });
    }

    const results = await projectDAL.transaction(async (tx) => {
      const ghostUser = await orgService.addGhostUser(organization.id, tx);

      if (kmsKeyId) {
        const kms = await kmsService.getKmsById(kmsKeyId, tx);

        if (kms.orgId !== organization.id) {
          throw new BadRequestError({
            message: "KMS does not belong in the organization"
          });
        }
      }

      const project = await projectDAL.create(
        {
          name: workspaceName,
          orgId: organization.id,
          slug: projectSlug || slugify(`${workspaceName}-${alphaNumericNanoId(4)}`),
          kmsSecretManagerKeyId: kmsKeyId,
          version: ProjectVersion.V3,
          pitVersionLimit: 10
        },
        tx
      );

      // set ghost user as admin of project
      const projectMembership = await projectMembershipDAL.create(
        {
          userId: ghostUser.user.id,
          projectId: project.id
        },
        tx
      );
      await projectUserMembershipRoleDAL.create(
        { projectMembershipId: projectMembership.id, role: ProjectMembershipRole.Admin },
        tx
      );

      // set default environments and root folder for provided environments
      const envs = await projectEnvDAL.insertMany(
        DEFAULT_PROJECT_ENVS.map((el, i) => ({ ...el, projectId: project.id, position: i + 1 })),
        tx
      );
      await folderDAL.insertMany(
        envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
        tx
      );

      // 3. Create a random key that we'll use as the project key.
      const { key: encryptedProjectKey, iv: encryptedProjectKeyIv } = createProjectKey({
        publicKey: ghostUser.keys.publicKey,
        privateKey: ghostUser.keys.plainPrivateKey
      });

      // 4. Save the project key for the ghost user.
      await projectKeyDAL.create(
        {
          projectId: project.id,
          receiverId: ghostUser.user.id,
          encryptedKey: encryptedProjectKey,
          nonce: encryptedProjectKeyIv,
          senderId: ghostUser.user.id
        },
        tx
      );

      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(ghostUser.keys.plainPrivateKey);

      // 5. Create & a bot for the project
      await projectBotDAL.create(
        {
          name: "Infisical Bot (Ghost)",
          projectId: project.id,
          tag,
          iv,
          encryptedProjectKey,
          encryptedProjectKeyNonce: encryptedProjectKeyIv,
          encryptedPrivateKey: ciphertext,
          isActive: true,
          publicKey: ghostUser.keys.publicKey,
          senderId: ghostUser.user.id,
          algorithm,
          keyEncoding: encoding
        },
        tx
      );

      // Find the ghost users latest key
      const latestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.user.id, project.id, tx);

      if (!latestKey) {
        throw new Error("Latest key not found for user");
      }

      // If the project is being created by a user, add the user to the project as an admin
      if (actor === ActorType.USER) {
        // Find public key of user
        const user = await userDAL.findUserEncKeyByUserId(actorId);

        if (!user) {
          throw new Error("User not found");
        }

        const [projectAdmin] = assignWorkspaceKeysToMembers({
          decryptKey: latestKey,
          userPrivateKey: ghostUser.keys.plainPrivateKey,
          members: [
            {
              userPublicKey: user.publicKey,
              orgMembershipId: orgMembership.id,
              projectMembershipRole: ProjectMembershipRole.Admin
            }
          ]
        });

        // Create a membership for the user
        const userProjectMembership = await projectMembershipDAL.create(
          {
            projectId: project.id,
            userId: user.id
          },
          tx
        );
        await projectUserMembershipRoleDAL.create(
          { projectMembershipId: userProjectMembership.id, role: projectAdmin.projectRole },
          tx
        );

        // Create a project key for the user
        await projectKeyDAL.create(
          {
            encryptedKey: projectAdmin.workspaceEncryptedKey,
            nonce: projectAdmin.workspaceEncryptedNonce,
            senderId: ghostUser.user.id,
            receiverId: user.id,
            projectId: project.id
          },
          tx
        );
      }

      // If the project is being created by an identity, add the identity to the project as an admin
      else if (actor === ActorType.IDENTITY) {
        // Find identity org membership
        const identityOrgMembership = await identityOrgMembershipDAL.findOne(
          {
            identityId: actorId,
            orgId: project.orgId
          },
          tx
        );

        // If identity org membership not found, throw error
        if (!identityOrgMembership) {
          throw new BadRequestError({
            message: `Failed to find identity with id ${actorId}`
          });
        }

        // Get the role permission for the identity
        const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
          OrgMembershipRole.Member,
          organization.id
        );

        // Identity has to be at least a member in order to create projects
        const hasPrivilege = isAtLeastAsPrivileged(permission, rolePermission);
        if (!hasPrivilege)
          throw new ForbiddenRequestError({
            message: "Failed to add identity to project with more privileged role"
          });
        const isCustomRole = Boolean(customRole);

        const identityProjectMembership = await identityProjectDAL.create(
          {
            identityId: actorId,
            projectId: project.id
          },
          tx
        );

        await identityProjectMembershipRoleDAL.create(
          {
            projectMembershipId: identityProjectMembership.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : ProjectMembershipRole.Admin,
            customRoleId: customRole?.id
          },
          tx
        );
      }

      return {
        ...project,
        environments: envs,
        _id: project.id
      };
    });

    await keyStore.deleteItem(`infisical-cloud-plan-${actorOrgId}`);
    return results;
  };

  const deleteProject = async ({ actor, actorId, actorOrgId, actorAuthMethod, filter }: TDeleteProjectDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Project);

    const deletedProject = await projectDAL.transaction(async (tx) => {
      const delProject = await projectDAL.deleteById(project.id, tx);
      const projectGhostUser = await projectMembershipDAL.findProjectGhostUser(project.id, tx).catch(() => null);
      if (delProject.kmsCertificateKeyId) {
        await kmsService.deleteInternalKms(delProject.kmsCertificateKeyId, delProject.orgId, tx);
      }
      if (delProject.kmsSecretManagerKeyId) {
        await kmsService.deleteInternalKms(delProject.kmsSecretManagerKeyId, delProject.orgId, tx);
      }
      // Delete the org membership for the ghost user if it's found.
      if (projectGhostUser) {
        await userDAL.deleteById(projectGhostUser.id, tx);
      }

      return delProject;
    });

    await keyStore.deleteItem(`infisical-cloud-plan-${actorOrgId}`);
    return deletedProject;
  };

  const getProjects = async (actorId: string) => {
    const workspaces = await projectDAL.findAllProjects(actorId);
    return workspaces;
  };

  const getAProject = async ({ actorId, actorOrgId, actorAuthMethod, filter, actor }: TGetProjectDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    await permissionService.getProjectPermission(actor, actorId, project.id, actorAuthMethod, actorOrgId);
    return project;
  };

  const updateProject = async ({ actor, actorId, actorOrgId, actorAuthMethod, update, filter }: TUpdateProjectDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(project.id, {
      name: update.name,
      autoCapitalization: update.autoCapitalization
    });
    return updatedProject;
  };

  const toggleAutoCapitalization = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    autoCapitalization
  }: TToggleProjectAutoCapitalizationDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(projectId, { autoCapitalization });
    return updatedProject;
  };

  const updateVersionLimit = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    pitVersionLimit,
    workspaceSlug
  }: TUpdateProjectVersionLimitDTO) => {
    const project = await projectDAL.findProjectBySlug(workspaceSlug, actorOrgId);
    if (!project) {
      throw new BadRequestError({
        message: "Project not found"
      });
    }

    const { hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new BadRequestError({ message: "Only admins are allowed to take this action" });

    return projectDAL.updateById(project.id, { pitVersionLimit });
  };

  const updateAuditLogsRetention = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    auditLogsRetentionDays,
    workspaceSlug
  }: TUpdateAuditLogsRetentionDTO) => {
    const project = await projectDAL.findProjectBySlug(workspaceSlug, actorOrgId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new BadRequestError({ message: "Only admins are allowed to take this action" });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.auditLogs || auditLogsRetentionDays > plan.auditLogsRetentionDays) {
      throw new BadRequestError({
        message: "Failed to update audit logs retention due to plan limit reached. Upgrade plan to increase."
      });
    }

    return projectDAL.updateById(project.id, { auditLogsRetentionDays });
  };

  const updateName = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name
  }: TUpdateProjectNameDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(projectId, { name });
    return updatedProject;
  };

  const upgradeProject = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    userPrivateKey
  }: TUpgradeProjectDTO) => {
    const { permission, hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Project);

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "User must be admin"
      });
    }

    const encryptedPrivateKey = infisicalSymmetricEncypt(userPrivateKey);

    await projectQueue.upgradeProject({
      projectId,
      startedByUserId: actorId,
      encryptedPrivateKey: {
        encryptedKey: encryptedPrivateKey.ciphertext,
        encryptedKeyIv: encryptedPrivateKey.iv,
        encryptedKeyTag: encryptedPrivateKey.tag,
        keyEncoding: encryptedPrivateKey.encoding
      }
    });
  };

  const getProjectUpgradeStatus = async ({
    projectId,
    actor,
    actorAuthMethod,
    actorOrgId,
    actorId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);

    const project = await projectDAL.findProjectById(projectId);

    if (!project) {
      throw new BadRequestError({
        message: `Project with id ${projectId} not found`
      });
    }

    return project.upgradeStatus || null;
  };

  /**
   * Return list of CAs for project
   */
  const listProjectCas = async ({
    status,
    friendlyName,
    commonName,
    limit = 25,
    offset = 0,
    actorId,
    actorOrgId,
    actorAuthMethod,
    filter,
    actor
  }: TListProjectCasDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const cas = await certificateAuthorityDAL.find(
      {
        projectId: project.id,
        ...(status && { status }),
        ...(friendlyName && { friendlyName }),
        ...(commonName && { commonName })
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    return cas;
  };

  /**
   * Return list of certificates for project
   */
  const listProjectCertificates = async ({
    limit = 25,
    offset = 0,
    friendlyName,
    commonName,
    actorId,
    actorOrgId,
    actorAuthMethod,
    filter,
    actor
  }: TListProjectCertsDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    const cas = await certificateAuthorityDAL.find({ projectId: project.id });

    const certificates = await certificateDAL.find(
      {
        $in: {
          caId: cas.map((ca) => ca.id)
        },
        ...(friendlyName && { friendlyName }),
        ...(commonName && { commonName })
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    const count = await certificateDAL.countCertificatesInProject({
      projectId: project.id,
      friendlyName,
      commonName
    });

    return {
      certificates,
      totalCount: count
    };
  };

  const updateProjectKmsKey = async ({
    projectId,
    kms,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectKmsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Kms);

    const secretManagerKmsKey = await kmsService.updateProjectSecretManagerKmsKey({
      projectId,
      kms
    });

    return {
      secretManagerKmsKey
    };
  };

  const getProjectKmsBackup = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Kms);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to get KMS backup due to plan restriction. Upgrade to the enterprise plan."
      });
    }

    const kmsBackup = await kmsService.getProjectKeyBackup(projectId);
    return kmsBackup;
  };

  const loadProjectKmsBackup = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    backup
  }: TLoadProjectKmsBackupDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Kms);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to load KMS backup due to plan restriction. Upgrade to the enterprise plan."
      });
    }

    const kmsBackup = await kmsService.loadProjectKeyBackup(projectId, backup);
    return kmsBackup;
  };

  const getProjectKmsKeys = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TGetProjectKmsKey) => {
    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    if (!membership) {
      throw new ForbiddenRequestError({
        message: "User is not a member of the project"
      });
    }

    const kmsKeyId = await kmsService.getProjectSecretManagerKmsKeyId(projectId);
    const kmsKey = await kmsService.getKmsById(kmsKeyId);

    return { secretManagerKmsKey: kmsKey };
  };

  return {
    createProject,
    deleteProject,
    getProjects,
    updateProject,
    getProjectUpgradeStatus,
    getAProject,
    toggleAutoCapitalization,
    updateName,
    upgradeProject,
    listProjectCas,
    listProjectCertificates,
    updateVersionLimit,
    updateAuditLogsRetention,
    updateProjectKmsKey,
    getProjectKmsBackup,
    loadProjectKmsBackup,
    getProjectKmsKeys
  };
};
