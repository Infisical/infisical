import slugify from "@sindresorhus/slugify";
import { randomUUID } from "crypto";
import sjcl from "sjcl";
import tweetnacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";

import { OrgMembershipRole, ProjectMembershipRole, SecretType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TOrgServiceFactory } from "../org/org-service";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { InfisicalImportData, TEnvKeyExportJSON, TImportInfisicalDataCreate } from "./external-migration-types";

export type TImportDataIntoInfisicalDTO = {
  projectService: TProjectServiceFactory;
  orgService: TOrgServiceFactory;
  projectEnvService: TProjectEnvServiceFactory;
  secretService: TSecretServiceFactory;

  input: TImportInfisicalDataCreate;
};

const { codec, hash } = sjcl;
const { secretbox } = tweetnacl;

export const decryptEnvKeyDataFn = async (decryptionKey: string, encryptedJson: { nonce: string; data: string }) => {
  const key = tweetnaclUtil.decodeBase64(codec.base64.fromBits(hash.sha256.hash(decryptionKey)));
  const nonce = tweetnaclUtil.decodeBase64(encryptedJson.nonce);
  const encryptedData = tweetnaclUtil.decodeBase64(encryptedJson.data);

  const decrypted = secretbox.open(encryptedData, nonce, key);

  if (!decrypted) {
    throw new BadRequestError({ message: "Decryption failed, please check the entered encryption key" });
  }

  const decryptedJson = tweetnaclUtil.encodeUTF8(decrypted);
  return decryptedJson;
};

export const parseEnvKeyDataFn = async (decryptedJson: string): Promise<InfisicalImportData> => {
  const parsedJson: TEnvKeyExportJSON = JSON.parse(decryptedJson) as TEnvKeyExportJSON;

  const infisicalImportData: InfisicalImportData = {
    projects: new Map<string, { name: string; id: string }>(),
    environments: new Map<string, { name: string; id: string; projectId: string }>(),
    secrets: new Map<string, { name: string; id: string; projectId: string; environmentId: string; value: string }>()
  };

  parsedJson.apps.forEach((app: { name: string; id: string }) => {
    infisicalImportData.projects.set(app.id, { name: app.name, id: app.id });
  });

  // string to string map for env templates
  const envTemplates = new Map<string, string>();
  for (const env of parsedJson.defaultEnvironmentRoles) {
    envTemplates.set(env.id, env.defaultName);
  }

  // environments
  for (const env of parsedJson.baseEnvironments) {
    infisicalImportData.environments?.set(env.id, {
      id: env.id,
      name: envTemplates.get(env.environmentRoleId)!,
      projectId: env.envParentId
    });
  }

  // secrets
  for (const env of Object.keys(parsedJson.envs)) {
    if (!env.includes("|")) {
      const envData = parsedJson.envs[env];
      for (const secret of Object.keys(envData.variables)) {
        const id = randomUUID();
        infisicalImportData.secrets?.set(id, {
          id,
          name: secret,
          environmentId: env,
          value: envData.variables[secret].val
        });
      }
    }
  }

  return infisicalImportData;
};

export const importDataIntoInfisicalFn = async ({
  projectService,
  orgService,
  projectEnvService,
  secretService,
  input: { data, actor, actorId, actorOrgId, actorAuthMethod }
}: TImportDataIntoInfisicalDTO) => {
  // Import data to infisical
  if (!data || !data.projects) {
    throw new BadRequestError({ message: "No projects found in data" });
  }

  const originalToNewProjectId = new Map<string, string>();
  const originalToNewEnvironmentId = new Map<string, string>();

  for await (const [id, project] of data.projects) {
    const newProject = await projectService
      .createProject({
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        workspaceName: project.name,
        createDefaultEnvs: false
      })
      .catch(() => {
        throw new BadRequestError({ message: `Failed to import to project [name:${project.name}] [id:${id}]` });
      });

    originalToNewProjectId.set(project.id, newProject.id);
  }

  // Invite user importing projects
  const invites = await orgService.inviteUserToOrganization({
    actorAuthMethod,
    actorId,
    actorOrgId,
    actor,
    inviteeEmails: [],
    orgId: actorOrgId,
    organizationRoleSlug: OrgMembershipRole.NoAccess,
    projects: Array.from(originalToNewProjectId.values()).map((project) => ({
      id: project,
      projectRoleSlug: [ProjectMembershipRole.Member]
    }))
  });
  if (!invites) {
    throw new BadRequestError({ message: `Failed to invite user to projects: [userId:${actorId}]` });
  }

  // Import environments
  if (data.environments) {
    for await (const [id, environment] of data.environments) {
      try {
        const newEnvironment = await projectEnvService.createEnvironment({
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          name: environment.name,
          projectId: originalToNewProjectId.get(environment.projectId)!,
          slug: slugify(`${environment.name}-${alphaNumericNanoId(4)}`)
        });

        if (!newEnvironment) {
          logger.error(`Failed to import environment: [name:${environment.name}] [id:${id}]`);
          throw new BadRequestError({
            message: `Failed to import environment: [name:${environment.name}] [id:${id}]`
          });
        }
        originalToNewEnvironmentId.set(id, newEnvironment.slug);
      } catch (error) {
        throw new BadRequestError({
          message: `Failed to import environment: ${environment.name}]`,
          name: "EnvKeyMigrationImportEnvironment"
        });
      }
    }
  }

  // Import secrets
  if (data.secrets) {
    for await (const [id, secret] of data.secrets) {
      const dataProjectId = data.environments?.get(secret.environmentId)?.projectId;
      if (!dataProjectId) {
        throw new BadRequestError({ message: `Failed to import secret "${secret.name}", project not found` });
      }
      const projectId = originalToNewProjectId.get(dataProjectId);
      const newSecret = await secretService.createSecretRaw({
        actorId,
        actor,
        actorOrgId,
        environment: originalToNewEnvironmentId.get(secret.environmentId)!,
        actorAuthMethod,
        projectId: projectId!,
        secretPath: "/",
        secretName: secret.name,
        type: SecretType.Shared,
        secretValue: secret.value
      });
      if (!newSecret) {
        throw new BadRequestError({ message: `Failed to import secret: [name:${secret.name}] [id:${id}]` });
      }
    }
  }
};
