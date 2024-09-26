import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, ProjectMembershipRole, SecretType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TOrgServiceFactory } from "../org/org-service";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { decryptEnvKeyData, parseEnvKeyData } from "./external-migration-fns";
import { TImportEnvKeyDataCreate, TImportInfisicalDataCreate } from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  projectService: TProjectServiceFactory;
  orgService: TOrgServiceFactory;
  projectEnvService: TProjectEnvServiceFactory;
  secretService: TSecretServiceFactory;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  projectService,
  orgService,
  projectEnvService,
  secretService
}: TExternalMigrationServiceFactoryDep) => {
  const importInfisicalData = async ({
    data,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportInfisicalDataCreate) => {
    // Import data to infisical
    if (!data || !data.projects) {
      logger.error("No projects found in data");
      return {
        success: false,
        message: "No projects found in data"
      };
    }

    const orginalToNewProjectId = new Map<string, string>();
    const orginalToNewEnvironmentId = new Map<string, string>();

    // Import projects
    const projectPromises = [];
    for (const [id, project] of data.projects) {
      const projectPromise = projectService
        .createProject({
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          workspaceName: project?.name,
          createDefaultEnvs: false
        })
        .then((projectResponse) => {
          if (!projectResponse) {
            logger.error(`Failed to import project: [name:${project.name}] [id:${id}]`);
            throw new Error(`Failed to import project: [name:${project.name}] [id:${id}]`);
          }
          orginalToNewProjectId.set(project.id, projectResponse.id);
        });
      projectPromises.push(projectPromise);
    }
    await Promise.all(projectPromises);

    // Invite user importing projects
    const response = await orgService.inviteUserToOrganization({
      actorAuthMethod,
      actorId,
      actorOrgId,
      actor,
      inviteeEmails: [],
      orgId: actorOrgId,
      organizationRoleSlug: OrgMembershipRole.NoAccess,
      projects: Array.from(orginalToNewProjectId.values()).map((project) => {
        return {
          id: project,
          projectRoleSlug: [ProjectMembershipRole.Member]
        };
      })
    });
    if (!response) {
      logger.error(`Failed to invite user to projects: [userId:${actorId}]`);
      return {
        success: false,
        message: `Failed to invite user to project: [userId:${actorId}]`
      };
    }

    // Import environments
    if (data.environments) {
      for (const [id, environment] of data.environments) {
        try {
          // TODO: we can create envs parallely once the position constraint is handled differently
          // eslint-disable-next-line
          const newEnvironment = await projectEnvService.createEnvironment({
            actor,
            actorId,
            actorOrgId,
            actorAuthMethod,
            name: environment.name,
            projectId: orginalToNewProjectId.get(environment.projectId)!,
            slug: slugify(`${environment.name}-${alphaNumericNanoId(4)}`)
          });

          if (!newEnvironment) {
            logger.error(`Failed to import environment: [name:${environment.name}] [id:${id}]`);
            throw new BadRequestError({
              message: `Failed to import environment: [name:${environment.name}] [id:${id}]`
            });
          }
          orginalToNewEnvironmentId.set(id, newEnvironment.slug);
        } catch (error) {
          return {
            success: false
          };
        }
      }
    }

    // Import secrets
    if (data.secrets) {
      for (const [id, secret] of data.secrets) {
        const dataProjectId = data.environments?.get(secret.environmentId)?.projectId;
        if (!dataProjectId) {
          logger.error(`Failed to import secret: [name:${secret.name}] [id:${id}], project not found`);
          return {
            success: false,
            message: `Failed to import secret: [name:${secret.name}] [id:${id}], project not found`
          };
        }
        const projectId = orginalToNewProjectId.get(dataProjectId);
        // TODO: we can create secrets parallely once the KMS ID bug on create is fixed
        // eslint-disable-next-line
        const newSecret = await secretService.createSecretRaw({
          actorId,
          actor,
          actorOrgId,
          environment: orginalToNewEnvironmentId.get(secret.environmentId)!,
          actorAuthMethod,
          projectId: projectId!,
          secretPath: "/",
          secretName: secret.name,
          type: SecretType.Shared,
          secretValue: secret.value
        });
        if (!newSecret) {
          logger.error(`Failed to import secret: [name:${secret.name}] [id:${id}]`);
          return {
            success: false,
            message: `Failed to import secret: [name:${secret.name}] [id:${id}]`
          };
        }
      }
    }

    return {
      success: true
    };
  };

  const importEnvnKeyData = async ({
    decryptionKey,
    encryptedJson,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportEnvKeyDataCreate) => {
    const json = await decryptEnvKeyData(decryptionKey, encryptedJson);
    const envKeyData = await parseEnvKeyData(json);
    const response = await importInfisicalData({ data: envKeyData, actor, actorId, actorOrgId, actorAuthMethod });
    return response;
  };

  return {
    importEnvnKeyData
  };
};
