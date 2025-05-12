import { ForbiddenError, subject } from "@casl/ability";
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
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSshHostActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TProjectTemplateServiceFactory } from "@app/ee/services/project-template/project-template-service";
import { InfisicalProjectTemplate } from "@app/ee/services/project-template/project-template-types";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostGroupDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-dal";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectPermission } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { TGroupProjectDALFactory } from "../group-project/group-project-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityProjectDALFactory } from "../identity-project/identity-project-dal";
import { TIdentityProjectMembershipRoleDALFactory } from "../identity-project/identity-project-membership-role-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { validateMicrosoftTeamsChannelsSchema } from "../microsoft-teams/microsoft-teams-fns";
import { TMicrosoftTeamsIntegrationDALFactory } from "../microsoft-teams/microsoft-teams-integration-dal";
import { TProjectMicrosoftTeamsConfigDALFactory } from "../microsoft-teams/project-microsoft-teams-config-dal";
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
import { validateSlackChannelsField } from "../slack/slack-auth-validators";
import { TSlackIntegrationDALFactory } from "../slack/slack-integration-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { WorkflowIntegration, WorkflowIntegrationStatus } from "../workflow-integration/workflow-integration-types";
import { TProjectDALFactory } from "./project-dal";
import { assignWorkspaceKeysToMembers, bootstrapSshProject, createProjectKey } from "./project-fns";
import { TProjectQueueFactory } from "./project-queue";
import { TProjectSshConfigDALFactory } from "./project-ssh-config-dal";
import {
  TCreateProjectDTO,
  TDeleteProjectDTO,
  TDeleteProjectWorkflowIntegration,
  TGetProjectDTO,
  TGetProjectKmsKey,
  TGetProjectSshConfig,
  TGetProjectWorkflowIntegrationConfig,
  TListProjectAlertsDTO,
  TListProjectCasDTO,
  TListProjectCertificateTemplatesDTO,
  TListProjectCertsDTO,
  TListProjectPkiSubscribersDTO,
  TListProjectsDTO,
  TListProjectSshCasDTO,
  TListProjectSshCertificatesDTO,
  TListProjectSshCertificateTemplatesDTO,
  TListProjectSshHostsDTO,
  TLoadProjectKmsBackupDTO,
  TProjectAccessRequestDTO,
  TSearchProjectsDTO,
  TToggleProjectAutoCapitalizationDTO,
  TToggleProjectDeleteProtectionDTO,
  TUpdateAuditLogsRetentionDTO,
  TUpdateProjectDTO,
  TUpdateProjectKmsDTO,
  TUpdateProjectNameDTO,
  TUpdateProjectSshConfig,
  TUpdateProjectVersionLimitDTO,
  TUpdateProjectWorkflowIntegration,
  TUpgradeProjectDTO
} from "./project-types";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  projectSshConfigDAL: Pick<TProjectSshConfigDALFactory, "transaction" | "create" | "findOne" | "updateById">;
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
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    "create" | "findProjectGhostUser" | "findOne" | "delete" | "findAllProjectMembers"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "delete">;
  projectSlackConfigDAL: Pick<
    TProjectSlackConfigDALFactory,
    "findOne" | "transaction" | "updateById" | "create" | "delete"
  >;
  projectMicrosoftTeamsConfigDAL: Pick<
    TProjectMicrosoftTeamsConfigDALFactory,
    "findOne" | "transaction" | "updateById" | "create" | "delete"
  >;
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findById" | "findByIdWithWorkflowIntegrationDetails">;
  microsoftTeamsIntegrationDAL: Pick<
    TMicrosoftTeamsIntegrationDALFactory,
    "findById" | "findByIdWithWorkflowIntegrationDetails"
  >;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create">;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "find">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "find">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "countCertificatesInProject">;
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "getCertTemplatesByProjectId">;
  pkiAlertDAL: Pick<TPkiAlertDALFactory, "find">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "find">;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "find" | "findOne" | "create" | "transaction">;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "create">;
  sshCertificateDAL: Pick<TSshCertificateDALFactory, "find" | "countSshCertificatesInProject">;
  sshCertificateTemplateDAL: Pick<TSshCertificateTemplateDALFactory, "find">;
  sshHostDAL: Pick<TSshHostDALFactory, "find" | "findSshHostsWithLoginMappings">;
  sshHostGroupDAL: Pick<TSshHostGroupDALFactory, "find" | "findSshHostGroupsWithLoginMappings">;
  permissionService: TPermissionServiceFactory;
  orgService: Pick<TOrgServiceFactory, "addGhostUser">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  queueService: Pick<TQueueServiceFactory, "stopRepeatableJob">;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgDAL: Pick<TOrgDALFactory, "findOne">;
  keyStore: Pick<TKeyStoreFactory, "deleteItem">;
  projectBotDAL: Pick<TProjectBotDALFactory, "create">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find" | "insertMany" | "delete">;
  kmsService: Pick<
    TKmsServiceFactory,
    | "updateProjectSecretManagerKmsKey"
    | "getProjectKeyBackup"
    | "loadProjectKeyBackup"
    | "getKmsById"
    | "getProjectSecretManagerKmsKeyId"
    | "deleteInternalKms"
    | "createCipherPairWithDataKey"
  >;
  projectTemplateService: TProjectTemplateServiceFactory;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  projectSshConfigDAL,
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
  pkiSubscriberDAL,
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshCertificateDAL,
  sshCertificateTemplateDAL,
  sshHostDAL,
  sshHostGroupDAL,
  keyStore,
  kmsService,
  projectBotDAL,
  projectSlackConfigDAL,
  projectMicrosoftTeamsConfigDAL,
  slackIntegrationDAL,
  microsoftTeamsIntegrationDAL,
  projectTemplateService,
  groupProjectDAL,
  smtpService
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

      if (type === ProjectType.SSH) {
        await bootstrapSshProject({
          projectId: project.id,
          sshCertificateAuthorityDAL,
          sshCertificateAuthoritySecretDAL,
          kmsService,
          projectSshConfigDAL,
          tx
        });
      }

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
        if (projectTemplate.environments) {
          envs = await projectEnvDAL.insertMany(
            projectTemplate.environments.map((env) => ({ ...env, projectId: project.id })),
            tx
          );
          await folderDAL.insertMany(
            envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
            tx
          );
        }
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

    if (project.hasDeleteProtection) {
      throw new ForbiddenRequestError({
        message: "Project delete protection is enabled"
      });
    }

    const deletedProject = await projectDAL.transaction(async (tx) => {
      // delete these so that project custom roles can be deleted in cascade effect
      // direct deletion of project without these will cause fk error
      await projectMembershipDAL.delete({ projectId: project.id }, tx);
      await groupProjectDAL.delete({ projectId: project.id }, tx);
      const delProject = await projectDAL.deleteById(project.id, tx);
      const projectGhostUser = await projectMembershipDAL.findProjectGhostUser(project.id, tx).catch(() => null);
      // akhilmhdh: before removing those kms checking any other project uses it
      // happened due to project split
      if (delProject.kmsCertificateKeyId) {
        const projectsLinkedToForiegnKey = await projectDAL.find(
          { kmsCertificateKeyId: delProject.kmsCertificateKeyId },
          { tx }
        );
        if (!projectsLinkedToForiegnKey.length) {
          await kmsService.deleteInternalKms(delProject.kmsCertificateKeyId, delProject.orgId, tx);
        }
      }

      if (delProject.kmsSecretManagerKeyId) {
        const projectsLinkedToForiegnKey = await projectDAL.find(
          { kmsSecretManagerKeyId: delProject.kmsSecretManagerKeyId },
          { tx }
        );
        if (!projectsLinkedToForiegnKey.length) {
          await kmsService.deleteInternalKms(delProject.kmsSecretManagerKeyId, delProject.orgId, tx);
        }
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
    const workspaces = await projectDAL.findUserProjects(actorId, actorOrgId, type);

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
            roles: [
              ...(workspaceMappedToRoles[workspace.id] || []),
              ...getPredefinedRoles({ projectId: workspace.id, projectType: workspace.type as ProjectType })
            ]
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

    if (update.slug) {
      const existingProject = await projectDAL.findOne({
        slug: update.slug,
        orgId: actorOrgId
      });
      if (existingProject && existingProject.id !== project.id) {
        throw new BadRequestError({
          message: `Failed to update project slug. The project "${existingProject.name}" with the slug "${existingProject.slug}" already exists in your organization. Please choose a unique slug for your project.`
        });
      }
    }

    const updatedProject = await projectDAL.updateById(project.id, {
      name: update.name,
      description: update.description,
      autoCapitalization: update.autoCapitalization,
      enforceCapitalization: update.autoCapitalization,
      hasDeleteProtection: update.hasDeleteProtection,
      slug: update.slug
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

    const updatedProject = await projectDAL.updateById(projectId, {
      autoCapitalization,
      enforceCapitalization: autoCapitalization
    });

    return updatedProject;
  };

  const toggleDeleteProtection = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    hasDeleteProtection
  }: TToggleProjectDeleteProtectionDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const updatedProject = await projectDAL.updateById(projectId, { hasDeleteProtection });

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
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret);

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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

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
   * Return list of PKI subscribers for project
   */
  const listProjectPkiSubscribers = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectPkiSubscribersDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const allowedSubscribers = [];

    // (dangtony98): room to optimize
    const subscribers = await pkiSubscriberDAL.find({ projectId });

    for (const subscriber of subscribers) {
      const canRead = permission.can(
        ProjectPermissionPkiSubscriberActions.Read,
        subject(ProjectPermissionSub.PkiSubscribers, {
          name: subscriber.name
        })
      );
      if (canRead) {
        allowedSubscribers.push(subscriber);
      }
    }

    return allowedSubscribers;
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
   * Return list of SSH hosts for project
   */
  const listProjectSshHosts = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectSshHostsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    const allowedHosts = [];

    // (dangtony98): room to optimize
    const hosts = await sshHostDAL.findSshHostsWithLoginMappings(projectId);

    for (const host of hosts) {
      const canRead = permission.can(
        ProjectPermissionSshHostActions.Read,
        subject(ProjectPermissionSub.SshHosts, {
          hostname: host.hostname
        })
      );

      if (canRead) {
        allowedHosts.push(host);
      }
    }

    return allowedHosts;
  };

  /**
   * Return list of SSH host groups for project
   */
  const listProjectSshHostGroups = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor,
    projectId
  }: TListProjectSshHostsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHostGroups);

    const sshHostGroups = await sshHostGroupDAL.findSshHostGroupsWithLoginMappings(projectId);

    return sshHostGroups;
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

  const getProjectSshConfig = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TGetProjectSshConfig) => {
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
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);

    const projectSshConfig = await projectSshConfigDAL.findOne({
      projectId: project.id
    });

    if (!projectSshConfig) {
      throw new NotFoundError({
        message: `Project SSH config with ID '${project.id}' not found`
      });
    }

    return projectSshConfig;
  };

  const updateProjectSshConfig = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    defaultUserSshCaId,
    defaultHostSshCaId
  }: TUpdateProjectSshConfig) => {
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
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    let projectSshConfig = await projectSshConfigDAL.findOne({
      projectId: project.id
    });

    if (!projectSshConfig) {
      throw new NotFoundError({
        message: `Project SSH config with ID '${project.id}' not found`
      });
    }

    projectSshConfig = await projectSshConfigDAL.transaction(async (tx) => {
      if (defaultUserSshCaId) {
        const userSshCa = await sshCertificateAuthorityDAL.findOne(
          {
            id: defaultUserSshCaId,
            projectId: project.id
          },
          tx
        );

        if (!userSshCa) {
          throw new NotFoundError({
            message: "User SSH CA must exist and belong to this project"
          });
        }
      }

      if (defaultHostSshCaId) {
        const hostSshCa = await sshCertificateAuthorityDAL.findOne(
          {
            id: defaultHostSshCaId,
            projectId: project.id
          },
          tx
        );

        if (!hostSshCa) {
          throw new NotFoundError({
            message: "Host SSH CA must exist and belong to this project"
          });
        }
      }

      const updatedProjectSshConfig = await projectSshConfigDAL.updateById(
        projectSshConfig.id,
        {
          defaultUserSshCaId,
          defaultHostSshCaId
        },
        tx
      );

      return updatedProjectSshConfig;
    });

    return projectSshConfig;
  };

  const getProjectWorkflowIntegrationConfig = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    integration
  }: TGetProjectWorkflowIntegrationConfig) => {
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

    if (integration === WorkflowIntegration.SLACK) {
      const config = await projectSlackConfigDAL.findOne({
        projectId: project.id
      });

      if (!config) {
        throw new NotFoundError({
          message: `Workflow integration config for project '${projectId}' and integration '${integration}' not found`
        });
      }

      return {
        ...config,
        integration,
        integrationId: config.slackIntegrationId
      };
    }

    if (integration === WorkflowIntegration.MICROSOFT_TEAMS) {
      const config = await projectMicrosoftTeamsConfigDAL.findOne({
        projectId: project.id
      });

      if (!config) {
        throw new NotFoundError({
          message: `Workflow integration config for project '${projectId}' and integration '${integration}' not found`
        });
      }

      return {
        ...config,
        integration,
        integrationId: config.microsoftTeamsIntegrationId
      };
    }

    throw new BadRequestError({
      message: `Integration type '${integration as string}' not supported`
    });
  };

  const updateProjectWorkflowIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    integration,
    integrationId,
    isAccessRequestNotificationEnabled,
    accessRequestChannels,
    isSecretRequestNotificationEnabled,
    secretRequestChannels
  }: TUpdateProjectWorkflowIntegration) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    if (integration === WorkflowIntegration.SLACK) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

      const sanitizedAccessRequestChannels = validateSlackChannelsField.parse(accessRequestChannels);
      const sanitizedSecretRequestChannels = validateSlackChannelsField.parse(secretRequestChannels);

      const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(integrationId);

      if (!slackIntegration) {
        throw new NotFoundError({
          message: `Slack integration with ID '${integrationId}' not found`
        });
      }

      if (slackIntegration.orgId !== actorOrgId) {
        throw new ForbiddenRequestError({
          message: "Selected slack integration is not in the same organization"
        });
      }

      if (slackIntegration.orgId !== project.orgId) {
        throw new ForbiddenRequestError({
          message: "Selected slack integration is not in the same organization"
        });
      }

      const updatedWorkflowIntegration = await projectSlackConfigDAL.transaction(async (tx) => {
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
              slackIntegrationId: integrationId,
              isAccessRequestNotificationEnabled,
              accessRequestChannels: sanitizedAccessRequestChannels,
              isSecretRequestNotificationEnabled,
              secretRequestChannels: sanitizedSecretRequestChannels
            },
            tx
          );
        }

        return projectSlackConfigDAL.create(
          {
            projectId,
            slackIntegrationId: integrationId,
            isAccessRequestNotificationEnabled,
            accessRequestChannels: sanitizedAccessRequestChannels,
            isSecretRequestNotificationEnabled,
            secretRequestChannels: sanitizedSecretRequestChannels
          },
          tx
        );
      });

      return {
        ...updatedWorkflowIntegration,
        accessRequestChannels: sanitizedAccessRequestChannels,
        secretRequestChannels: sanitizedSecretRequestChannels,
        integrationId: slackIntegration.id,
        integration: WorkflowIntegration.SLACK
      } as const;
    }
    if (integration === WorkflowIntegration.MICROSOFT_TEAMS) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

      if (isAccessRequestNotificationEnabled && !accessRequestChannels) {
        throw new BadRequestError({
          message: "Access request channels are required when access request notifications are enabled"
        });
      }

      if (isSecretRequestNotificationEnabled && !secretRequestChannels) {
        throw new BadRequestError({
          message: "Secret request channels are required when secret request notifications are enabled"
        });
      }

      if (!secretRequestChannels && !accessRequestChannels) {
        throw new BadRequestError({
          message: "At least one of access request channels or secret request channels is required"
        });
      }

      const microsoftTeamsIntegration =
        await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(integrationId);

      if (!microsoftTeamsIntegration) {
        throw new NotFoundError({
          message: `Microsoft Teams integration with ID '${integrationId}' not found`
        });
      }

      if (microsoftTeamsIntegration.status !== WorkflowIntegrationStatus.INSTALLED) {
        throw new BadRequestError({
          message: "Microsoft Teams integration is not properly installed in your tenant."
        });
      }

      if (microsoftTeamsIntegration.orgId !== actorOrgId) {
        throw new ForbiddenRequestError({
          message: "Selected Microsoft Teams integration is not in the same organization"
        });
      }

      if (microsoftTeamsIntegration.orgId !== project.orgId) {
        throw new ForbiddenRequestError({
          message: "Selected Microsoft Teams integration is not in the same organization"
        });
      }

      const sanitizedAccessRequestChannels = validateMicrosoftTeamsChannelsSchema.parse(accessRequestChannels);
      const sanitizedSecretRequestChannels = validateMicrosoftTeamsChannelsSchema.parse(secretRequestChannels);

      const updatedWorkflowIntegration = await projectMicrosoftTeamsConfigDAL.transaction(async (tx) => {
        const microsoftTeamsConfig = await projectMicrosoftTeamsConfigDAL.findOne(
          {
            projectId
          },
          tx
        );

        if (microsoftTeamsConfig) {
          return projectMicrosoftTeamsConfigDAL.updateById(
            microsoftTeamsConfig.id,
            {
              microsoftTeamsIntegrationId: integrationId,
              isAccessRequestNotificationEnabled,
              accessRequestChannels: sanitizedAccessRequestChannels || {},
              isSecretRequestNotificationEnabled,
              secretRequestChannels: sanitizedSecretRequestChannels || {}
            },
            tx
          );
        }

        return projectMicrosoftTeamsConfigDAL.create(
          {
            projectId,
            microsoftTeamsIntegrationId: integrationId,
            isAccessRequestNotificationEnabled,
            accessRequestChannels: sanitizedAccessRequestChannels || {},
            isSecretRequestNotificationEnabled,
            secretRequestChannels: sanitizedSecretRequestChannels || {}
          },
          tx
        );
      });

      return {
        ...updatedWorkflowIntegration,
        accessRequestChannels: sanitizedAccessRequestChannels,
        secretRequestChannels: sanitizedSecretRequestChannels,
        integrationId: microsoftTeamsIntegration.id,
        integration: WorkflowIntegration.MICROSOFT_TEAMS
      } as const;
    }

    throw new BadRequestError({
      message: `Integration type '${integration as string}' not supported`
    });
  };

  const deleteProjectWorkflowIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    integrationId,
    integration
  }: TDeleteProjectWorkflowIntegration) => {
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

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

    if (integration === WorkflowIntegration.SLACK) {
      const [deletedIntegration] = await projectSlackConfigDAL.delete({
        projectId,
        slackIntegrationId: integrationId
      });

      return deletedIntegration;
    }

    if (integration === WorkflowIntegration.MICROSOFT_TEAMS) {
      const [deletedIntegration] = await projectMicrosoftTeamsConfigDAL.delete({
        projectId,
        microsoftTeamsIntegrationId: integrationId
      });

      return deletedIntegration;
    }

    throw new BadRequestError({
      message: `Integration with ID '${integrationId}' not found`
    });
  };

  const searchProjects = async ({
    name,
    offset,
    permission,
    limit,
    type,
    orderBy,
    orderDirection
  }: TSearchProjectsDTO) => {
    // check user belong to org
    await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );

    return projectDAL.searchProjects({
      limit,
      offset,
      name,
      type,
      orgId: permission.orgId,
      actor: permission.type,
      actorId: permission.id,
      sortBy: orderBy,
      sortDir: orderDirection
    });
  };

  const requestProjectAccess = async ({ permission, comment, projectId }: TProjectAccessRequestDTO) => {
    // check user belong to org
    await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );

    const projectMember = await permissionService
      .getProjectPermission({
        actor: permission.type,
        actorId: permission.id,
        projectId,
        actionProjectType: ActionProjectType.Any,
        actorAuthMethod: permission.authMethod,
        actorOrgId: permission.orgId
      })
      .catch(() => {
        return null;
      });
    if (projectMember) throw new BadRequestError({ message: "User already has access to the project" });

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
    const filteredProjectMembers = projectMembers
      .filter((member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin))
      .map((el) => el.user.email!);
    const org = await orgDAL.findOne({ id: permission.orgId });
    const project = await projectDAL.findById(projectId);
    const userDetails = await userDAL.findById(permission.id);
    const appCfg = getConfig();

    await smtpService.sendMail({
      template: SmtpTemplates.ProjectAccessRequest,
      recipients: filteredProjectMembers,
      subjectLine: "Project Access Request",
      substitutions: {
        requesterName: `${userDetails.firstName} ${userDetails.lastName}`,
        requesterEmail: userDetails.email,
        projectName: project?.name,
        orgName: org?.name,
        note: comment,
        callback_url: `${appCfg.SITE_URL}/${project.type}/${project.id}/access-management?selectedTab=members&requesterEmail=${userDetails.email}`
      }
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
    toggleDeleteProtection,
    updateName,
    upgradeProject,
    listProjectCas,
    listProjectCertificates,
    listProjectAlerts,
    listProjectPkiCollections,
    listProjectCertificateTemplates,
    listProjectSshCas,
    listProjectSshHosts,
    listProjectSshHostGroups,
    listProjectPkiSubscribers,
    listProjectSshCertificates,
    listProjectSshCertificateTemplates,
    updateVersionLimit,
    updateAuditLogsRetention,
    updateProjectKmsKey,
    getProjectKmsBackup,
    loadProjectKmsBackup,
    getProjectKmsKeys,
    getProjectWorkflowIntegrationConfig,
    updateProjectWorkflowIntegration,
    deleteProjectWorkflowIntegration,
    getProjectSshConfig,
    updateProjectSshConfig,
    requestProjectAccess,
    searchProjects
  };
};
