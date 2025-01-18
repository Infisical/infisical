import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import {
  ActionProjectType,
  ProjectMembershipRole,
  ProjectType,
  ProjectVersion,
  TProjectEnvironments
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TProjectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-service";
import { InfisicalProjectTemplate } from "@app/ee/services/project-template/project-template-types";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectPermission } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityProjectDALFactory } from "../identity-project/identity-project-dal";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgServiceFactory } from "../org/org-service";
import { TPkiAlertDALFactory } from "../pki-alert/pki-alert-dal";
import { TPkiCollectionDALFactory } from "../pki-collection/pki-collection-dal";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { getPredefinedRoles } from "../project-role/project-role-fns";
import { TSecretDALFactory } from "../secret/secret-dal";
import { fnDeleteProjectSecretReminders } from "../secret/secret-fns";
import { ROOT_FOLDER_NAME, TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TProjectSlackConfigDALFactory } from "../slack/project-slack-config-dal";
import { TSlackIntegrationDALFactory } from "../slack/slack-integration-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TProjectDALFactory } from "./project-dal";
import { assignWorkspaceKeysToMembers, createProjectKey } from "./project-fns";
import { TProjectQueueFactory } from "./project-queue";
import {
  TCreateProjectDTO,
  TDeleteProjectDTO,
  TGetProjectDTO,
  TGetProjectKmsKey,
  TGetProjectSlackConfig,
  TListProjectAlertsDTO,
  TListProjectCasDTO,
  TListProjectCertificateTemplatesDTO,
  TListProjectCertsDTO,
  TListProjectsDTO,
  TListProjectSshCasDTO,
  TListProjectSshCertificatesDTO,
  TListProjectSshCertificateTemplatesDTO,
  TLoadProjectKmsBackupDTO,
  TToggleProjectAutoCapitalizationDTO,
  TUpdateAuditLogsRetentionDTO,
  TUpdateProjectDTO,
  TUpdateProjectKmsDTO,
  TUpdateProjectNameDTO,
  TUpdateProjectSlackConfig,
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
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "insertMany" | "findByProjectId">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "insertMany" | "find">;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  identityProjectDAL: TIdentityProjectDALFactory;
  identityProjectMembershipRoleDAL: Pick<TIdentityProjectMembershipRoleDALFactory, "create">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "create" | "findLatestProjectKey" | "delete" | "find" | "insertMany">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "create" | "findProjectGhostUser" | "findOne">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "findOne" | "transaction" | "updateById" | "create">;
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findById" | "findByIdWithWorkflowIntegrationDetails">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "find">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "countCertificatesInProject">;
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "getCertTemplatesByProjectId">;
  pkiAlertDAL: Pick<TPkiAlertDALFactory, "find">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "find">;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "find">;
  sshCertificateDAL: Pick<TSshCertificateDALFactory, "find" | "countSshCertificatesInProject">;
  sshCertificateTemplateDAL: Pick<TSshCertificateTemplateDALFactory, "find">;
  permissionService: TPermissionServiceFactory;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  queueService: Pick<TQueueServiceFactory, "stopRepeatableJob">;

  orgDAL: Pick<TOrgDALFactory, "findOne">;
  keyStore: Pick<TKeyStoreFactory, "deleteItem">;
  projectBotDAL: Pick<TProjectBotDALFactory, "create">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find" | "insertMany">;
  kmsService: Pick<
    TKmsServiceFactory,
    | "updateProjectSecretManagerKmsKey"
    | "getProjectKeyBackup"
    | "loadProjectKeyBackup"
    | "getKmsById"
    | "getProjectSecretManagerKmsKeyId"
    | "deleteInternalKms"
  >;
  projectTemplateService: TProjectTemplateServiceFactory;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  secretDAL,
  secretV2BridgeDAL,
  projectQueue,
  projectKeyDAL,
  permissionService,
  queueService,
  projectBotService,
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
  projectRoleDAL,
  identityProjectMembershipRoleDAL,
  certificateAuthorityDAL,
  certificateDAL,
  certificateTemplateDAL,
  pkiCollectionDAL,
  pkiAlertDAL,
  sshCertificateAuthorityDAL,
  sshCertificateDAL,
  sshCertificateTemplateDAL,
  keyStore,
  kmsService,
  projectBotDAL,
  projectSlackConfigDAL,
  slackIntegrationDAL,
  projectTemplateService
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
    workspaceDescription,
    slug: projectSlug,
    kmsKeyId,
    tx: trx,
    createDefaultEnvs = true,
    template = InfisicalProjectTemplate.Default,
    type = ProjectType.SecretManager
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

    const results = await (trx || projectDAL).transaction(async (tx) => {
      const ghostUser = await orgService.addGhostUser(organization.id, tx);

      if (kmsKeyId) {
        const kms = await kmsService.getKmsById(kmsKeyId, tx);

        if (kms.orgId !== organization.id) {
          throw new ForbiddenRequestError({
            message: "KMS does not belong in the organization"
          });
        }
      }

      let projectTemplate: Awaited<ReturnType<typeof projectTemplateService.findProjectTemplateByName>> | null = null;

      switch (template) {
        case InfisicalProjectTemplate.Default:
          projectTemplate = null;
          break;
        default:
          projectTemplate = await projectTemplateService.findProjectTemplateByName(template, {
            id: actorId,
            orgId: organization.id,
            type: actor,
            authMethod: actorAuthMethod
          });
      }

      const project = await projectDAL.create(
        {
          name: workspaceName,
          type,
          description: workspaceDescription,
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
      let envs: TProjectEnvironments[] = [];
      if (projectTemplate) {
        envs = await projectEnvDAL.insertMany(
          projectTemplate.environments.map((env) => ({ ...env, projectId: project.id })),
          tx
        );
        await folderDAL.insertMany(
          envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
          tx
        );
        await projectRoleDAL.insertMany(
          projectTemplate.packedRoles.map((role) => ({
            ...role,
            permissions: JSON.stringify(role.permissions),
            projectId: project.id
          })),
          tx
        );
      } else if (createDefaultEnvs) {
        envs = await projectEnvDAL.insertMany(
          DEFAULT_PROJECT_ENVS.map((el, i) => ({ ...el, projectId: project.id, position: i + 1 })),
          tx
        );
        await folderDAL.insertMany(
          envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
          tx
        );
      }

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
              orgMembershipId: orgMembership.id
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
          { projectMembershipId: userProjectMembership.id, role: ProjectMembershipRole.Admin },
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
          throw new NotFoundError({
            message: `Failed to find identity with id '${actorId}'`
          });
        }

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
            role: ProjectMembershipRole.Admin
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
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

      await fnDeleteProjectSecretReminders(project.id, {
        secretDAL,
        secretV2BridgeDAL,
        queueService,
        projectBotService,
        folderDAL
      });

      return delProject;
    });

    await keyStore.deleteItem(`infisical-cloud-plan-${actorOrgId}`);
    return deletedProject;
  };

  const getProjects = async ({
    actorId,
    includeRoles,
    actorAuthMethod,
    actorOrgId,
    type = ProjectType.SecretManager
  }: TListProjectsDTO) => {
    const workspaces = await projectDAL.findAllProjects(actorId, actorOrgId, type);

    if (includeRoles) {
      const { permission } = await permissionService.getUserOrgPermission(
        actorId,
        actorOrgId,
        actorAuthMethod,
        actorOrgId
      );

      // `includeRoles` is specifically used by organization admins when inviting new users to the organizations to avoid looping redundant api calls.
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
      const customRoles = await projectRoleDAL.find({
        $in: {
          projectId: workspaces.map((workspace) => workspace.id)
        }
      });

      const workspaceMappedToRoles = groupBy(customRoles, (role) => role.projectId);

      const workspacesWithRoles = await Promise.all(
        workspaces.map(async (workspace) => {
          return {
            ...workspace,
            roles: [...(workspaceMappedToRoles[workspace.id] || []), ...getPredefinedRoles(workspace.id)]
          };
        })
      );

      return workspacesWithRoles;
    }

    return workspaces;
  };

  const getAProject = async ({ actorId, actorOrgId, actorAuthMethod, filter, actor }: TGetProjectDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    return project;
  };

  const updateProject = async ({ actor, actorId, actorOrgId, actorAuthMethod, update, filter }: TUpdateProjectDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(project.id, {
      name: update.name,
      description: update.description,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
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
      throw new NotFoundError({
        message: `Project with slug '${workspaceSlug}' not found`
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new ForbiddenRequestError({
        message: "Insufficient privileges, only admins are allowed to take this action"
      });

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
        message: `Project with slug '${workspaceSlug}' not found`
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Insufficient privileges, only admins are allowed to take this action"
      });
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
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
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);

    const project = await projectDAL.findProjectById(projectId);

    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
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
    let projectId = project.id;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const cas = await certificateAuthorityDAL.find(
      {
        projectId,
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
    let projectId = project.id;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    const cas = await certificateAuthorityDAL.find({ projectId });

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
      projectId,
      friendlyName,
      commonName
    });

    return {
      certificates,
      totalCount: count
    };
  };

  /**
   * Return list of (PKI) alerts configured for project
   */
  const listProjectAlerts = async ({
    projectId: preSplitProjectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectAlertsDTO) => {
    let projectId = preSplitProjectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    const alerts = await pkiAlertDAL.find({ projectId });

    return {
      alerts
    };
  };

  /**
   * Return list of PKI collections for project
   */
  const listProjectPkiCollections = async ({
    projectId: preSplitProjectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectAlertsDTO) => {
    let projectId = preSplitProjectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections);

    const pkiCollections = await pkiCollectionDAL.find({ projectId });

    return {
      pkiCollections
    };
  };

  /**
   * Return list of certificate templates for project
   */
  const listProjectCertificateTemplates = async ({
    projectId: preSplitProjectId,
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor
  }: TListProjectCertificateTemplatesDTO) => {
    let projectId = preSplitProjectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    const certificateTemplates = await certificateTemplateDAL.getCertTemplatesByProjectId(projectId);

    return {
      certificateTemplates
    };
  };

  /**
   * Return list of SSH CAs for project
   */
  const listProjectSshCas = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectSshCasDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SshCertificateAuthorities
    );

    const cas = await sshCertificateAuthorityDAL.find(
      {
        projectId
      },
      { sort: [["updatedAt", "desc"]] }
    );

    return cas;
  };

  /**
   * Return list of SSH certificates for project
   */
  const listProjectSshCertificates = async ({
    limit = 25,
    offset = 0,
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectSshCertificatesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificates);

    const cas = await sshCertificateAuthorityDAL.find({
      projectId
    });

    const certificates = await sshCertificateDAL.find(
      {
        $in: {
          sshCaId: cas.map((ca) => ca.id)
        }
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    const count = await sshCertificateDAL.countSshCertificatesInProject(projectId);

    return { certificates, totalCount: count };
  };

  /**
   * Return list of SSH certificate templates for project
   */
  const listProjectSshCertificateTemplates = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectSshCertificateTemplatesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SshCertificateTemplates
    );

    const cas = await sshCertificateAuthorityDAL.find({
      projectId
    });

    const certificateTemplates = await sshCertificateTemplateDAL.find({
      $in: {
        sshCaId: cas.map((ca) => ca.id)
      }
    });

    return { certificateTemplates };
  };

  const updateProjectKmsKey = async ({
    projectId,
    kms,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectKmsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

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
    const { membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const kmsKeyId = await kmsService.getProjectSecretManagerKmsKeyId(projectId);
    const kmsKey = await kmsService.getKmsById(kmsKeyId);

    return { secretManagerKmsKey: kmsKey };
  };

  const getProjectSlackConfig = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TGetProjectSlackConfig) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);

    return projectSlackConfigDAL.findOne({
      projectId: project.id
    });
  };

  const updateProjectSlackConfig = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    slackIntegrationId,
    isAccessRequestNotificationEnabled,
    accessRequestChannels,
    isSecretRequestNotificationEnabled,
    secretRequestChannels
  }: TUpdateProjectSlackConfig) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(slackIntegrationId);

    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID '${slackIntegrationId}' not found`
      });
    }

    if (slackIntegration.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({
        message: "Selected slack integration is not in the same organization"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    if (slackIntegration.orgId !== project.orgId) {
      throw new ForbiddenRequestError({
        message: "Selected slack integration is not in the same organization"
      });
    }

    return projectSlackConfigDAL.transaction(async (tx) => {
      const slackConfig = await projectSlackConfigDAL.findOne(
        {
          projectId
        },
        tx
      );

      if (slackConfig) {
        return projectSlackConfigDAL.updateById(
          slackConfig.id,
          {
            slackIntegrationId,
            isAccessRequestNotificationEnabled,
            accessRequestChannels,
            isSecretRequestNotificationEnabled,
            secretRequestChannels
          },
          tx
        );
      }

      return projectSlackConfigDAL.create(
        {
          projectId,
          slackIntegrationId,
          isAccessRequestNotificationEnabled,
          accessRequestChannels,
          isSecretRequestNotificationEnabled,
          secretRequestChannels
        },
        tx
      );
    });
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
    listProjectAlerts,
    listProjectPkiCollections,
    listProjectCertificateTemplates,
    listProjectSshCas,
    listProjectSshCertificates,
    listProjectSshCertificateTemplates,
    updateVersionLimit,
    updateAuditLogsRetention,
    updateProjectKmsKey,
    getProjectKmsBackup,
    loadProjectKmsBackup,
    getProjectKmsKeys,
    getProjectSlackConfig,
    updateProjectSlackConfig
  };
};
