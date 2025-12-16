import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  ProjectMembershipRole,
  ProjectType,
  ProjectVersion,
  TableName,
  TProjectEnvironments,
  TProjects
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSshHostActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  InfisicalProjectTemplate,
  TProjectTemplateServiceFactory
} from "@app/ee/services/project-template/project-template-types";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostGroupDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-dal";
import { PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectPermission } from "@app/lib/types";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { expandInternalCa } from "../certificate-authority/certificate-authority-fns";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "../membership-group/membership-group-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { validateMicrosoftTeamsChannelsSchema } from "../microsoft-teams/microsoft-teams-fns";
import { TMicrosoftTeamsIntegrationDALFactory } from "../microsoft-teams/microsoft-teams-integration-dal";
import { TProjectMicrosoftTeamsConfigDALFactory } from "../microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TPkiAlertDALFactory } from "../pki-alert/pki-alert-dal";
import { TPkiCollectionDALFactory } from "../pki-collection/pki-collection-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { getPredefinedRoles } from "../project-role/project-role-fns";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TRoleDALFactory } from "../role/role-dal";
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
import { bootstrapSshProject } from "./project-fns";
import { TProjectQueueFactory } from "./project-queue";
import { TProjectSshConfigDALFactory } from "./project-ssh-config-dal";
import {
  ProjectFilterType,
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
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectGhostUser" | "findAllProjectMembers">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "create" | "findOne" | "delete">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "delete">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "create" | "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
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
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "find">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "find" | "findWithAssociatedCa">;
  certificateDAL: Pick<
    TCertificateDALFactory,
    | "find"
    | "countCertificatesInProject"
    | "findWithPrivateKeyInfo"
    | "findActiveCertificatesForSync"
    | "countActiveCertificatesForSync"
  >;
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
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "invalidateGetPlan">;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgDAL: Pick<TOrgDALFactory, "findOne">;
  keyStore: Pick<TKeyStoreFactory, "deleteItem">;
  roleDAL: Pick<TRoleDALFactory, "find" | "insertMany" | "delete">;
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
  reminderService: Pick<TReminderServiceFactory, "deleteReminderBySecretId">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  projectSshConfigDAL,
  secretDAL,
  secretV2BridgeDAL,
  projectQueue,
  permissionService,
  projectBotService,
  orgDAL,
  userDAL,
  folderDAL,
  projectMembershipDAL,
  projectEnvDAL,
  licenseService,
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
  projectSlackConfigDAL,
  projectMicrosoftTeamsConfigDAL,
  slackIntegrationDAL,
  microsoftTeamsIntegrationDAL,
  projectTemplateService,
  smtpService,
  reminderService,
  notificationService,
  membershipIdentityDAL,
  membershipUserDAL,
  membershipRoleDAL,
  roleDAL
}: TProjectServiceFactoryDep) => {
  /*
   * Create workspace. Make user the admin
   * */
  const createProject = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectName: workspaceName,
    projectDescription: workspaceDescription,
    slug: projectSlug,
    kmsKeyId,
    tx: trx,
    createDefaultEnvs = true,
    template = InfisicalProjectTemplate.Default,
    type = ProjectType.SecretManager,
    hasDeleteProtection
  }: TCreateProjectDTO) => {
    const organization = await orgDAL.findOne({ id: actorOrgId });
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: organization.id,
      actorAuthMethod,
      actorOrgId
    });

    if (
      permission.cannot(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace) &&
      permission.cannot(OrgPermissionActions.Create, OrgPermissionSubjects.Project)
    ) {
      throw new ForbiddenRequestError({ message: "You don't have permission to create a project" });
    }

    const results = await (trx || projectDAL).transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateProject(organization.id)]);

      const plan = await licenseService.getPlan(organization.id);
      if (
        plan.workspaceLimit !== null &&
        plan.workspacesUsed >= plan.workspaceLimit &&
        type === ProjectType.SecretManager
      ) {
        // case: limit imposed on number of workspaces allowed
        // case: number of workspaces used exceeds the number of workspaces allowed
        throw new BadRequestError({
          message: "Failed to create workspace due to plan limit reached. Upgrade plan to add more workspaces."
        });
      }

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

      const slug = projectSlug || slugify(`${workspaceName}-${alphaNumericNanoId(4)}`);

      let project: TProjects;
      try {
        project = await projectDAL.create(
          {
            name: workspaceName,
            type,
            description: workspaceDescription,
            orgId: organization.id,
            slug,
            kmsSecretManagerKeyId: kmsKeyId,
            version: ProjectVersion.V3,
            pitVersionLimit: 10,
            hasDeleteProtection
          },
          tx
        );
      } catch (err) {
        if (
          err instanceof DatabaseError &&
          (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation
        ) {
          throw new BadRequestError({
            message: `A project with the slug "${slug}" already exists in your organization. Please choose a different name or slug.`
          });
        }
        throw err;
      }

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
        await roleDAL.insertMany(
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

      // If the project is being created by a user, add the user to the project as an admin
      if (actor === ActorType.USER) {
        // Find public key of user
        const user = await userDAL.findUserEncKeyByUserId(actorId);

        if (!user) {
          throw new Error("User not found");
        }

        // Create a membership for the user
        const userProjectMembership = await membershipUserDAL.create(
          {
            scopeProjectId: project.id,
            actorUserId: user.id,
            scope: AccessScope.Project,
            scopeOrgId: project.orgId
          },
          tx
        );
        await membershipRoleDAL.create(
          { membershipId: userProjectMembership.id, role: ProjectMembershipRole.Admin },
          tx
        );
      }

      // If the project is being created by an identity, add the identity to the project as an admin
      else if (actor === ActorType.IDENTITY) {
        // Find identity org membership
        const identityOrgMembership = await membershipIdentityDAL.findOne(
          {
            actorIdentityId: actorId,
            scopeOrgId: project.orgId,
            scope: AccessScope.Organization
          },
          tx
        );

        // If identity org membership not found, throw error
        if (!identityOrgMembership) {
          throw new NotFoundError({
            message: `Failed to find identity with id '${actorId}'`
          });
        }

        const identityProjectMembership = await membershipIdentityDAL.create(
          {
            actorIdentityId: actorId,
            scopeProjectId: project.id,
            scope: AccessScope.Project,
            scopeOrgId: project.orgId
          },
          tx
        );

        await membershipRoleDAL.create(
          {
            membershipId: identityProjectMembership.id,
            role: ProjectMembershipRole.Admin
          },
          tx
        );
      }

      // no need to invalidate if there was no limit
      if (plan.workspaceLimit) {
        await licenseService.invalidateGetPlan(organization.id);
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
      // this will clean up all memberships
      await membershipUserDAL.delete(
        { scopeOrgId: project.orgId, scopeProjectId: project.id, scope: AccessScope.Project },
        tx
      );
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
        reminderService,
        projectBotService,
        folderDAL
      });

      return delProject;
    });

    await keyStore.deleteItem(`infisical-cloud-plan-${actorOrgId}`);
    return deletedProject;
  };

  const getProjects = async ({ actorId, actor, includeRoles, actorAuthMethod, actorOrgId, type }: TListProjectsDTO) => {
    const workspaces =
      actor === ActorType.IDENTITY
        ? await projectDAL.findIdentityProjects(actorId, actorOrgId, type)
        : await projectDAL.findUserProjects(actorId, actorOrgId, type);

    if (includeRoles) {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId
      });

      // `includeRoles` is specifically used by organization admins when inviting new users to the organizations to avoid looping redundant api calls.
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
      const customRoles = await roleDAL.find({
        $in: {
          projectId: workspaces.map((workspace) => workspace.id)
        }
      });

      const workspaceMappedToRoles = groupBy(customRoles, (role) => role.projectId as string);

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

    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    if (update.secretDetectionIgnoreValues && !hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Only admins can update secret detection ignore values"
      });
    }

    try {
      const updatedProject = await projectDAL.updateById(project.id, {
        name: update.name,
        description: update.description,
        autoCapitalization: update.autoCapitalization,
        enforceCapitalization: update.autoCapitalization,
        hasDeleteProtection: update.hasDeleteProtection,
        slug: update.slug,
        secretSharing: update.secretSharing,
        defaultProduct: update.defaultProduct,
        showSnapshotsLegacy: update.showSnapshotsLegacy,
        secretDetectionIgnoreValues: update.secretDetectionIgnoreValues,
        pitVersionLimit: update.pitVersionLimit
      });

      return updatedProject;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Failed to update project. A project with the slug "${update.slug}" already exists in your organization. Please choose a different slug.`
        });
      }
      throw err;
    }
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
    filter
  }: TUpdateAuditLogsRetentionDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);
    const projectId = project.id;

    if (!project) {
      throw new NotFoundError({
        message: `Project not found`
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
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

    const encryptedPrivateKey = crypto.encryption().symmetric().encryptWithRootEncryptionKey(userPrivateKey);

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

  const extractProjectIdFromSlug = async ({
    projectSlug,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: {
    projectSlug?: string;
    projectId?: string;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actor: ActorType;
    actorOrgId: string;
  }) => {
    if (projectId) return projectId;
    if (!projectSlug) throw new BadRequestError({ message: "You must provide projectSlug or workspaceId" });
    const project = await getAProject({
      filter: {
        type: ProjectFilterType.SLUG,
        orgId: actorOrgId,
        slug: projectSlug
      },
      actorId,
      actorAuthMethod,
      actor,
      actorOrgId
    });

    if (!project) throw new NotFoundError({ message: `No project found with slug ${projectSlug}` });
    return project.id;
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
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const cas = await certificateAuthorityDAL.findWithAssociatedCa(
      {
        [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
        $notNull: [`${TableName.InternalCertificateAuthority}.id` as "id"],
        ...(status && { [`${TableName.CertificateAuthority}.status` as "status"]: status }),
        ...(friendlyName && {
          [`${TableName.InternalCertificateAuthority}.friendlyName` as "friendlyName"]: friendlyName
        }),
        ...(commonName && { [`${TableName.InternalCertificateAuthority}.commonName` as "commonName"]: commonName })
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    return cas.map((ca) => expandInternalCa(ca));
  };

  /**
   * Return list of certificates for project
   */
  const listProjectCertificates = async ({
    limit = 25,
    offset = 0,
    friendlyName,
    commonName,
    forPkiSync = false,
    actorId,
    actorOrgId,
    actorAuthMethod,
    filter,
    actor
  }: TListProjectCertsDTO) => {
    const project = await projectDAL.findProjectByFilter(filter);
    const projectId = project.id;

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

    const regularFilters = {
      projectId,
      ...(friendlyName && { friendlyName }),
      ...(commonName && { commonName })
    };
    const permissionFilters = getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const certificates = forPkiSync
      ? await certificateDAL.findActiveCertificatesForSync(regularFilters, { offset, limit }, permissionFilters)
      : await certificateDAL.findWithPrivateKeyInfo(
          regularFilters,
          {
            offset,
            limit,
            sort: [["notAfter", "desc"]]
          },
          permissionFilters
        );

    const countFilter = {
      projectId,
      ...(regularFilters.friendlyName && { friendlyName: String(regularFilters.friendlyName) }),
      ...(regularFilters.commonName && { commonName: String(regularFilters.commonName) })
    };

    const count = forPkiSync
      ? await certificateDAL.countActiveCertificatesForSync(countFilter)
      : await certificateDAL.countCertificatesInProject(countFilter);

    return {
      certificates,
      totalCount: count
    };
  };

  /**
   * Return list of (PKI) alerts configured for project
   */
  const listProjectAlerts = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectAlertsDTO) => {
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
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectAlertsDTO) => {
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
    projectId,
    actorId,
    actorOrgId,
    actorAuthMethod,
    actor
  }: TListProjectCertificateTemplatesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const certificateTemplates = await certificateTemplateDAL.getCertTemplatesByProjectId(projectId);

    return {
      certificateTemplates: certificateTemplates.filter((el) =>
        permission.can(
          ProjectPermissionPkiTemplateActions.Read,
          subject(ProjectPermissionSub.CertificateTemplates, { name: el.name })
        )
      )
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
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

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
    secretRequestChannels,
    secretSyncErrorChannels,
    isSecretSyncErrorNotificationEnabled
  }: TUpdateProjectWorkflowIntegration & {
    // workaround intersection type while we don't have the microsoft teams integration for failed secret syncs
    isSecretSyncErrorNotificationEnabled?: boolean;
    secretSyncErrorChannels?: string;
  }) => {
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
      const sanitizedSecretSyncErrorChannels = validateSlackChannelsField.parse(secretSyncErrorChannels);

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
              secretRequestChannels: sanitizedSecretRequestChannels,
              isSecretSyncErrorNotificationEnabled,
              secretSyncErrorChannels: sanitizedSecretSyncErrorChannels
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
            secretRequestChannels: sanitizedSecretRequestChannels,
            isSecretSyncErrorNotificationEnabled,
            secretSyncErrorChannels: sanitizedSecretSyncErrorChannels
          },
          tx
        );
      });

      return {
        ...updatedWorkflowIntegration,
        accessRequestChannels: sanitizedAccessRequestChannels,
        secretRequestChannels: sanitizedSecretRequestChannels,
        secretSyncErrorChannels: sanitizedSecretSyncErrorChannels,
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
    orderDirection,
    projectIds
  }: TSearchProjectsDTO) => {
    // check user belong to org
    await permissionService.getOrgPermission({
      actor: permission.type,
      actorId: permission.id,
      orgId: permission.orgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.Any,
      actorOrgId: permission.orgId
    });

    return projectDAL.searchProjects({
      limit,
      offset,
      name,
      type,
      projectIds,
      orgId: permission.orgId,
      actor: permission.type,
      actorId: permission.id,
      sortBy: orderBy,
      sortDir: orderDirection
    });
  };

  const requestProjectAccess = async ({ permission, comment, projectId }: TProjectAccessRequestDTO) => {
    // check user belong to org
    await permissionService.getOrgPermission({
      actor: permission.type,
      actorId: permission.id,
      orgId: permission.orgId,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId,
      scope: OrganizationActionScope.Any
    });

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

    let filteredProjectMembers = projectMembers
      .filter((member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin))
      .map((el) => el.user.email!);
    if (filteredProjectMembers.length === 0) {
      const customRolesWithMemberCreate = await roleDAL.find({ projectId });
      const customRoleSlugsCanCreate = customRolesWithMemberCreate
        .filter((role) => {
          try {
            const permissions = (
              typeof role.permissions === "string"
                ? (JSON.parse(role.permissions) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
                : role.permissions
            ) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];

            const ability = createMongoAbility<MongoAbility<ProjectPermissionSet>>(
              unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(permissions)
            );
            return ability.can(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member);
          } catch {
            return false;
          }
        })
        .map((role) => role.slug);

      if (customRoleSlugsCanCreate.length > 0) {
        const usersWithCustomCreateMemberRole = projectMembers
          .filter((member) =>
            member.roles.some((role) => role.customRoleSlug && customRoleSlugsCanCreate.includes(role.customRoleSlug))
          )
          .map((el) => el.user.email!)
          .filter(Boolean);

        if (usersWithCustomCreateMemberRole.length > 0) {
          filteredProjectMembers = usersWithCustomCreateMemberRole;
        }
      }
    }

    if (filteredProjectMembers.length === 0) {
      throw new BadRequestError({
        message:
          "No users in this project have permission to grant you access. Please contact an organization administrator to assign the necessary permissions."
      });
    }

    const org = await orgDAL.findOne({ id: permission.orgId });
    const project = await projectDAL.findById(projectId);
    const userDetails = await userDAL.findById(permission.id);
    const appCfg = getConfig();

    let projectTypeUrl = project.type;
    if (project.type === ProjectType.SecretManager) {
      projectTypeUrl = "secret-management";
    } else if (project.type === ProjectType.CertificateManager) {
      projectTypeUrl = "cert-manager";
    }

    const callbackPath = `/organizations/${project.orgId}/projects/${projectTypeUrl}/${project.id}/access-management?selectedTab=members&requesterEmail=${userDetails.email}`;

    await notificationService.createUserNotifications(
      projectMembers
        .filter((member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin))
        .map((member) => ({
          userId: member.userId,
          orgId: project.orgId,
          type: NotificationType.PROJECT_ACCESS_REQUEST,
          title: "Project Access Request",
          body: `**${userDetails.firstName} ${userDetails.lastName}** (${userDetails.email}) has requested access to the project **${project.name}**.`,
          link: callbackPath
        }))
    );

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
        callback_url: `${appCfg.SITE_URL}${callbackPath}`
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
    searchProjects,
    extractProjectIdFromSlug
  };
};
