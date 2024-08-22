import { ForbiddenError } from "@casl/ability";

import { ProjectVersion } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { generateAsymmetricKeyPair } from "@app/lib/crypto";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "./project-bot-dal";
import { getBotKeyFnFactory, getBotPrivateKey } from "./project-bot-fns";
import { TFindBotByProjectIdDTO, TSetActiveStateDTO } from "./project-bot-types";

type TProjectBotServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectBotDAL: TProjectBotDALFactory;
};

export type TProjectBotServiceFactory = ReturnType<typeof projectBotServiceFactory>;

export const projectBotServiceFactory = ({
  projectBotDAL,
  projectDAL,
  permissionService
}: TProjectBotServiceFactoryDep) => {
  const getBotKeyFn = getBotKeyFnFactory(projectBotDAL, projectDAL);

  const getBotKey = async (projectId: string) => {
    return getBotKeyFn(projectId);
  };

  const findBotByProjectId = async ({
    actorId,
    actor,
    projectId,
    actorOrgId,
    privateKey,
    actorAuthMethod,
    botKey,
    publicKey
  }: TFindBotByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);

    const bot = await projectBotDAL.transaction(async (tx) => {
      const doc = await projectBotDAL.findOne({ projectId }, tx);
      if (doc) return doc;

      const keys = privateKey && publicKey ? { privateKey, publicKey } : generateAsymmetricKeyPair();

      const { iv, tag, ciphertext, encoding, algorithm } = infisicalSymmetricEncypt(keys.privateKey);

      const project = await projectDAL.findById(projectId, tx);

      if (project.version === ProjectVersion.V2 || project.version === ProjectVersion.V3) {
        throw new BadRequestError({ message: "Failed to create bot, project is upgraded." });
      }

      return projectBotDAL.create(
        {
          name: "Infisical Bot",
          projectId,
          tag,
          iv,
          encryptedPrivateKey: ciphertext,
          isActive: false,
          publicKey: keys.publicKey,
          algorithm,
          keyEncoding: encoding,
          ...(botKey && {
            encryptedProjectKey: botKey.encryptedKey,
            encryptedProjectKeyNonce: botKey.nonce
          })
        },
        tx
      );
    });
    return bot;
  };

  const findProjectByBotId = async (botId: string) => {
    try {
      const bot = await projectBotDAL.findProjectByBotId(botId);
      return bot;
    } catch (e) {
      throw new BadRequestError({ message: "Failed to find bot by ID" });
    }
  };

  const setBotActiveState = async ({
    actor,
    botId,
    botKey,
    actorId,
    actorOrgId,
    actorAuthMethod,
    isActive
  }: TSetActiveStateDTO) => {
    const bot = await projectBotDAL.findById(botId);
    if (!bot) throw new BadRequestError({ message: "Bot not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      bot.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Integrations);

    const project = await projectBotDAL.findProjectByBotId(botId);

    if (!project) {
      throw new BadRequestError({ message: "Failed to find project by bot ID" });
    }

    if (project.version === ProjectVersion.V2) {
      throw new BadRequestError({ message: "Failed to set bot active for upgraded project. Bot is already active" });
    }

    if (isActive) {
      if (!botKey?.nonce || !botKey?.encryptedKey) {
        throw new BadRequestError({ message: "Failed to set bot active - missing bot key" });
      }
      const doc = await projectBotDAL.updateById(botId, {
        isActive: true,
        encryptedProjectKey: botKey.encryptedKey,
        encryptedProjectKeyNonce: botKey.nonce,
        senderId: actorId
      });
      if (!doc) throw new BadRequestError({ message: "Failed to update bot active state" });
      return doc;
    }

    const doc = await projectBotDAL.updateById(botId, {
      isActive: false,
      encryptedProjectKey: null,
      encryptedProjectKeyNonce: null
    });
    if (!doc) throw new BadRequestError({ message: "Failed to update bot active state" });
    return doc;
  };

  return {
    findBotByProjectId,
    setBotActiveState,
    getBotPrivateKey,
    findProjectByBotId,
    getBotKey
  };
};
