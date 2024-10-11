import slugify from "@sindresorhus/slugify";
import { randomUUID } from "crypto";
import sjcl from "sjcl";
import tweetnacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TOrgServiceFactory } from "../org/org-service";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import type { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { InfisicalImportData, TEnvKeyExportJSON, TImportInfisicalDataCreate } from "./external-migration-types";

export type TImportDataIntoInfisicalDTO = {
  projectService: Pick<TProjectServiceFactory, "createProject">;
  orgService: Pick<TOrgServiceFactory, "inviteUserToOrganization">;
  projectEnvService: Pick<TProjectEnvServiceFactory, "createEnvironment">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret">;

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
    projects: [],
    environments: [],
    secrets: []
  };

  parsedJson.apps.forEach((app: { name: string; id: string }) => {
    infisicalImportData.projects.push({ name: app.name, id: app.id });
  });

  // string to string map for env templates
  const envTemplates = new Map<string, string>();
  for (const env of parsedJson.defaultEnvironmentRoles) {
    envTemplates.set(env.id, env.defaultName);
  }

  // environments
  for (const env of parsedJson.baseEnvironments) {
    infisicalImportData.environments.push({
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
        infisicalImportData.secrets.push({
          id: randomUUID(),
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
  secretV2BridgeService,
  input: { data, actor, actorId, actorOrgId, actorAuthMethod }
}: TImportDataIntoInfisicalDTO) => {
  // Import data to infisical
  if (!data || !data.projects) {
    throw new BadRequestError({ message: "No projects found in data" });
  }

  const originalToNewProjectId = new Map<string, string>();
  const originalToNewEnvironmentId = new Map<string, string>();

  for await (const project of data.projects) {
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
        throw new BadRequestError({ message: `Failed to import to project [name:${project.name}` });
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
    for await (const environment of data.environments) {
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
          logger.error(`Failed to import environment: [name:${environment.name}]`);
          throw new BadRequestError({
            message: `Failed to import environment: [name:${environment.name}]`
          });
        }
        originalToNewEnvironmentId.set(environment.id, newEnvironment.slug);
      } catch (error) {
        throw new BadRequestError({
          message: `Failed to import environment: ${environment.name}]`,
          name: "EnvKeyMigrationImportEnvironment"
        });
      }
    }
  }

  if (data.secrets && data.secrets.length > 0) {
    const mappedToEnvironmentId = new Map<
      string,
      {
        secretKey: string;
        secretValue: string;
      }[]
    >();

    for (const secret of data.secrets) {
      if (!mappedToEnvironmentId.has(secret.environmentId)) {
        mappedToEnvironmentId.set(secret.environmentId, []);
      }
      mappedToEnvironmentId.get(secret.environmentId)!.push({
        secretKey: secret.name,
        secretValue: secret.value || ""
      });
    }

    // for each of the mappedEnvironmentId
    for await (const [envId, secrets] of mappedToEnvironmentId) {
      const environment = data.environments.find((env) => env.id === envId);
      const projectId = environment?.projectId;

      if (!projectId) {
        throw new BadRequestError({ message: `Failed to import secret, project not found` });
      }

      const secretBatches = chunkArray(secrets, 2500);

      for await (const secretBatch of secretBatches) {
        await secretV2BridgeService.createManySecret({
          actorId,
          actor,
          actorOrgId,
          environment: originalToNewEnvironmentId.get(envId)!,
          actorAuthMethod,
          projectId: originalToNewProjectId.get(projectId)!,
          secretPath: "/",
          secrets: secretBatch
        });
      }
    }
  }
};
