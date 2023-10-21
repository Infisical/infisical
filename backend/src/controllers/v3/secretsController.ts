import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventService, SecretService } from "../../services";
import { eventPushSecrets } from "../../events";
import { BotService } from "../../services";
import { containsGlobPatterns, isValidScopeV3, repackageSecretToRaw } from "../../helpers/secrets";
import { encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { Folder, IMembership, IServiceTokenData, IServiceTokenDataV3 } from "../../models";
import { Permission } from "../../models/serviceTokenDataV3";
import { getFolderByPath, getFolderWithPathFromId } from "../../services/FolderService";
import { BadRequestError } from "../../utils/errors";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secrets";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError, subject } from "@casl/ability";
import {
  validateServiceTokenDataClientForWorkspace,
  validateServiceTokenDataV3ClientForWorkspace
} from "../../validation";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../../variables";
import { ActorType } from "../../ee/models";
import { UnauthorizedRequestError } from "../../utils/errors";
import { AuthData } from "../../interfaces/middleware";
import {
  generateSecretApprovalRequest,
  getSecretPolicyOfBoard
} from "../../ee/services/SecretApprovalService";
import { CommitType } from "../../ee/models/secretApprovalRequest";
import { IRole } from "../../ee/models/role";

const checkSecretsPermission = async ({
  authData,
  workspaceId,
  environment,
  secretPath,
  secretAction
}: {
  authData: AuthData;
  workspaceId: string;
  environment: string;
  secretPath: string;
  secretAction: ProjectPermissionActions; // CRUD
}): Promise<{
  authVerifier: (env: string, secPath: string) => boolean;
  membership?: Omit<IMembership, "customRole"> & { customRole: IRole };
}> => {
  let STV2RequiredPermissions = [];
  let STV3RequiredPermissions: Permission[] = [];

  switch (secretAction) {
    case ProjectPermissionActions.Create:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      STV3RequiredPermissions = [Permission.WRITE];
      break;
    case ProjectPermissionActions.Read:
      STV2RequiredPermissions = [PERMISSION_READ_SECRETS];
      STV3RequiredPermissions = [Permission.READ];
      break;
    case ProjectPermissionActions.Edit:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      STV3RequiredPermissions = [Permission.WRITE];
      break;
    case ProjectPermissionActions.Delete:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      STV3RequiredPermissions = [Permission.WRITE];
      break;
  }

  switch (authData.actor.type) {
    case ActorType.USER: {
      const { permission, membership } = await getUserProjectPermissions(
        authData.actor.metadata.userId,
        workspaceId
      );
      ForbiddenError.from(permission).throwUnlessCan(
        secretAction,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
      return {
        authVerifier: (env: string, secPath: string) =>
          permission.can(
            secretAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: env,
              secretPath: secPath
            })
          ),
        membership
      };
    }
    case ActorType.SERVICE: {
      await validateServiceTokenDataClientForWorkspace({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        secretPath,
        requiredPermissions: STV2RequiredPermissions
      });
      return { authVerifier: () => true };
    }
    case ActorType.SERVICE_V3: {
      await validateServiceTokenDataV3ClientForWorkspace({
        authData,
        serviceTokenData: authData.authPayload as IServiceTokenDataV3,
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        secretPath,
        requiredPermissions: STV3RequiredPermissions
      });
      return {
        authVerifier: (env: string, secPath: string) =>
          isValidScopeV3({
            authPayload: authData.authPayload as IServiceTokenDataV3,
            environment: env,
            secretPath: secPath,
            requiredPermissions: STV3RequiredPermissions
          })
      };
    }
    default: {
      throw UnauthorizedRequestError();
    }
  }
};

/**
 * Return secrets for workspace with id [workspaceId] and environment
 * [environment] in plaintext
 * @param req
 * @param res
 */
export const getSecretsRaw = async (req: Request, res: Response) => {
  const validatedData = await validateRequest(reqValidator.GetSecretsRawV3, req);
  let {
    query: { secretPath, environment, workspaceId }
  } = validatedData;
  const {
    query: { folderId, include_imports: includeImports }
  } = validatedData;

  // if the service token has single scope, it will get all secrets for that scope by default
  const serviceTokenDetails: IServiceTokenData = req?.serviceTokenData;
  if (
    serviceTokenDetails &&
    serviceTokenDetails.scopes.length == 1 &&
    !containsGlobPatterns(serviceTokenDetails.scopes[0].secretPath)
  ) {
    const scope = serviceTokenDetails.scopes[0];
    secretPath = scope.secretPath;
    environment = scope.environment;
    workspaceId = serviceTokenDetails.workspace.toString();
  }

  if (folderId && folderId !== "root") {
    const folder = await Folder.findOne({ workspace: workspaceId, environment });
    if (!folder) throw BadRequestError({ message: "Folder not found" });

    secretPath = getFolderWithPathFromId(folder.nodes, folderId).folderPath;
  }

  if (!environment || !workspaceId)
    throw BadRequestError({ message: "Missing environment or workspace id" });

  const { authVerifier: permissionCheckFn } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secrets = await SecretService.getSecrets({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId,
    secretPath,
    authData: req.authData
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  if (includeImports) {
    const folders = await Folder.findOne({ workspace: workspaceId, environment });
    let folderId = "root";
    // if folder exist get it and replace folderid with new one
    if (folders) {
      const folder = getFolderByPath(folders.nodes, secretPath as string);
      if (!folder) {
        throw BadRequestError({ message: "Folder not found" });
      }
      folderId = folder.id;
    }
    const importedSecrets = await getAllImportedSecrets(
      workspaceId,
      environment,
      folderId,
      permissionCheckFn
    );
    return res.status(200).send({
      secrets: secrets.map((secret) =>
        repackageSecretToRaw({
          secret,
          key
        })
      ),
      imports: importedSecrets.map((el) => ({
        ...el,
        secrets: el.secrets.map((secret) => repackageSecretToRaw({ secret, key }))
      }))
    });
  }

  return res.status(200).send({
    secrets: secrets.map((secret) => {
      const rep = repackageSecretToRaw({
        secret,
        key
      });
      return rep;
    })
  });
};

/**
 * Return secret with name [secretName] in plaintext
 * @param req
 * @param res
 */
export const getSecretByNameRaw = async (req: Request, res: Response) => {
  const {
    query: { secretPath, environment, workspaceId, type, include_imports },
    params: { secretName }
  } = await validateRequest(reqValidator.GetSecretByNameRawV3, req);

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secret = await SecretService.getSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretPath,
    authData: req.authData,
    include_imports
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Create secret with name [secretName] in plaintext
 * @param req
 * @param res
 */
export const createSecretRaw = async (req: Request, res: Response) => {
  const {
    params: { secretName },
    body: {
      secretPath,
      environment,
      workspaceId,
      type,
      secretValue,
      secretComment,
      skipMultilineEncoding
    }
  } = await validateRequest(reqValidator.CreateSecretRawV3, req);

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretName,
    key
  });

  const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretValue,
    key
  });

  const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretComment,
    key
  });

  const secret = await SecretService.createSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretKeyCiphertext: secretKeyEncrypted.ciphertext,
    secretKeyIV: secretKeyEncrypted.iv,
    secretKeyTag: secretKeyEncrypted.tag,
    secretValueCiphertext: secretValueEncrypted.ciphertext,
    secretValueIV: secretValueEncrypted.iv,
    secretValueTag: secretValueEncrypted.tag,
    secretPath,
    secretCommentCiphertext: secretCommentEncrypted.ciphertext,
    secretCommentIV: secretCommentEncrypted.iv,
    secretCommentTag: secretCommentEncrypted.tag,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const secretWithoutBlindIndex = secret.toObject();
  delete secretWithoutBlindIndex.secretBlindIndex;

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret: secretWithoutBlindIndex,
      key
    })
  });
};

/**
 * Update secret with name [secretName]
 * @param req
 * @param res
 */
export const updateSecretByNameRaw = async (req: Request, res: Response) => {
  const {
    params: { secretName },
    body: { secretValue, environment, secretPath, type, workspaceId, skipMultilineEncoding }
  } = await validateRequest(reqValidator.UpdateSecretByNameRawV3, req);

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretValue,
    key
  });

  const secret = await SecretService.updateSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretValueCiphertext: secretValueEncrypted.ciphertext,
    secretValueIV: secretValueEncrypted.iv,
    secretValueTag: secretValueEncrypted.tag,
    secretPath,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Delete secret with name [secretName]
 * @param req
 * @param res
 */
export const deleteSecretByNameRaw = async (req: Request, res: Response) => {
  const {
    params: { secretName },
    body: { environment, secretPath, type, workspaceId }
  } = await validateRequest(reqValidator.DeleteSecretByNameRawV3, req);

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  const { secret } = await SecretService.deleteSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretPath
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Get secrets for workspace with id [workspaceId] and environment
 * [environment]
 * @param req
 * @param res
 */
export const getSecrets = async (req: Request, res: Response) => {
  const validatedData = await validateRequest(reqValidator.GetSecretsV3, req);
  const {
    query: { environment, workspaceId, include_imports: includeImports, folderId }
  } = validatedData;

  let {
    query: { secretPath }
  } = validatedData;

  if (folderId && folderId !== "root") {
    const folder = await Folder.findOne({ workspace: workspaceId, environment });
    if (!folder) return res.send({ secrets: [] });

    secretPath = getFolderWithPathFromId(folder.nodes, folderId).folderPath;
  }

  const { authVerifier: permissionCheckFn } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secrets = await SecretService.getSecrets({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId,
    secretPath,
    authData: req.authData
  });

  if (includeImports) {
    const folders = await Folder.findOne({ workspace: workspaceId, environment });
    let folderId = "root";
    // if folder exist get it and replace folderid with new one
    if (folders) {
      const folder = getFolderByPath(folders.nodes, secretPath as string);
      if (!folder) {
        throw BadRequestError({ message: "Folder not found" });
      }
      folderId = folder.id;
    }
    const importedSecrets = await getAllImportedSecrets(
      workspaceId,
      environment,
      folderId,
      permissionCheckFn
    );
    return res.status(200).send({
      secrets,
      imports: importedSecrets
    });
  }

  return res.status(200).send({
    secrets
  });
};

/**
 * Return secret with name [secretName]
 * @param req
 * @param res
 */
export const getSecretByName = async (req: Request, res: Response) => {
  const {
    query: { secretPath, environment, workspaceId, type, include_imports },
    params: { secretName }
  } = await validateRequest(reqValidator.GetSecretByNameV3, req);

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secret = await SecretService.getSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretPath,
    authData: req.authData,
    include_imports
  });

  return res.status(200).send({
    secret
  });
};

/**
 * Create secret with name [secretName]
 * @param req
 * @param res
 */
export const createSecret = async (req: Request, res: Response) => {
  const {
    body: {
      workspaceId,
      secretPath,
      environment,
      metadata,
      type,
      secretKeyIV,
      secretKeyTag,
      secretValueIV,
      secretValueTag,
      secretCommentIV,
      secretCommentTag,
      secretKeyCiphertext,
      secretValueCiphertext,
      secretCommentCiphertext,
      skipMultilineEncoding
    },
    params: { secretName }
  } = await validateRequest(reqValidator.CreateSecretV3, req);

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  if (membership && type !== "personal") {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        authData: req.authData,
        data: {
          [CommitType.CREATE]: [
            {
              secretName,
              secretValueCiphertext,
              secretValueIV,
              secretValueTag,
              secretCommentIV,
              secretCommentTag,
              secretCommentCiphertext,
              skipMultilineEncoding,
              secretKeyTag,
              secretKeyCiphertext,
              secretKeyIV
            }
          ]
        }
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const secret = await SecretService.createSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretPath,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag,
    metadata,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const secretWithoutBlindIndex = secret.toObject();
  delete secretWithoutBlindIndex.secretBlindIndex;

  return res.status(200).send({
    secret: secretWithoutBlindIndex
  });
};

/**
 * Update secret with name [secretName]
 * @param req
 * @param res
 */
export const updateSecretByName = async (req: Request, res: Response) => {
  const {
    body: {
      secretValueCiphertext,
      secretValueTag,
      secretValueIV,
      secretId,
      type,
      environment,
      secretPath,
      workspaceId,
      tags,
      secretCommentIV,
      secretCommentTag,
      secretCommentCiphertext,
      secretName: newSecretName,
      secretKeyIV,
      secretKeyTag,
      secretKeyCiphertext,
      skipMultilineEncoding
    },
    params: { secretName }
  } = await validateRequest(reqValidator.UpdateSecretByNameV3, req);

  if (newSecretName && (!secretKeyIV || !secretKeyTag || !secretKeyCiphertext)) {
    throw BadRequestError({ message: "Missing encrypted key" });
  }

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  if (membership && type !== "personal") {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        authData: req.authData,
        data: {
          [CommitType.UPDATE]: [
            {
              secretName,
              newSecretName,
              secretValueCiphertext,
              secretValueIV,
              secretValueTag,
              tags,
              secretCommentIV,
              secretCommentTag,
              secretCommentCiphertext,
              skipMultilineEncoding,
              secretKeyTag,
              secretKeyCiphertext,
              secretKeyIV
            }
          ]
        }
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const secret = await SecretService.updateSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretId,
    authData: req.authData,
    newSecretName,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretPath,
    tags,
    secretCommentIV,
    secretCommentTag,
    secretCommentCiphertext,
    skipMultilineEncoding,
    secretKeyTag,
    secretKeyCiphertext,
    secretKeyIV
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret
  });
};

/**
 * Delete secret with name [secretName]
 * @param req
 * @param res
 */
export const deleteSecretByName = async (req: Request, res: Response) => {
  const {
    body: { type, environment, secretPath, workspaceId, secretId },
    params: { secretName }
  } = await validateRequest(reqValidator.DeleteSecretByNameV3, req);

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  if (membership && type !== "personal") {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        authData: req.authData,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        data: {
          [CommitType.DELETE]: [
            {
              secretName
            }
          ]
        }
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const { secret } = await SecretService.deleteSecret({
    secretName,
    secretId,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretPath
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret
  });
};

export const createSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.CreateSecretByNameBatchV3, req);

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  if (membership) {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        authData: req.authData,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        data: {
          [CommitType.CREATE]: secrets.filter(({ type }) => type === "shared")
        }
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const createdSecrets = await SecretService.createSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  return res.status(200).send({
    secrets: createdSecrets
  });
};

export const updateSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.UpdateSecretByNameBatchV3, req);

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  if (membership) {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        data: {
          [CommitType.UPDATE]: secrets.filter(({ type }) => type === "shared")
        },
        authData: req.authData
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const updatedSecrets = await SecretService.updateSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  return res.status(200).send({
    secrets: updatedSecrets
  });
};

export const deleteSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.DeleteSecretByNameBatchV3, req);

  const { membership } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  if (membership) {
    const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
    if (secretApprovalPolicy) {
      const secretApprovalRequest = await generateSecretApprovalRequest({
        workspaceId,
        environment,
        secretPath,
        policy: secretApprovalPolicy,
        commiterMembershipId: membership._id.toString(),
        data: {
          [CommitType.DELETE]: secrets.filter(({ type }) => type === "shared")
        },
        authData: req.authData
      });
      return res.send({ approval: secretApprovalRequest });
    }
  }

  const deletedSecrets = await SecretService.deleteSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secrets: deletedSecrets
  });
};
