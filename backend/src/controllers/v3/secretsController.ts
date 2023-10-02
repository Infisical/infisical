import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventService, SecretService } from "../../services";
import { eventPushSecrets } from "../../events";
import { BotService } from "../../services";
import { containsGlobPatterns, isValidScope, repackageSecretToRaw } from "../../helpers/secrets";
import { encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { Folder, IServiceTokenData } from "../../models";
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
import { validateServiceTokenDataClientForWorkspace } from "../../validation";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../../variables";

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

  let permissionCheckFn: (env: string, secPath: string) => boolean; // used to pass as callback function to import secret
  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
    permissionCheckFn = (env: string, secPath: string) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: env,
          secretPath: secPath
        })
      );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_READ_SECRETS]
    });
    permissionCheckFn = (env: string, secPath: string) =>
      isValidScope(req.authData.authPayload as IServiceTokenData, env, secPath);
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_READ_SECRETS]
    });
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

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
    if (!folder) throw BadRequestError({ message: "Folder not found" });

    secretPath = getFolderWithPathFromId(folder.nodes, folderId).folderPath;
  }

  let permissionCheckFn: (env: string, secPath: string) => boolean; // used to pass as callback function to import secret
  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
    permissionCheckFn = (env: string, secPath: string) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: env,
          secretPath: secPath
        })
      );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_READ_SECRETS]
    });
    permissionCheckFn = (env: string, secPath: string) =>
      isValidScope(req.authData.authPayload as IServiceTokenData, env, secPath);
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_READ_SECRETS]
    });
  }

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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
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

  if (newSecretName && (!secretKeyIV || !secretKeyTag || !secretKeyCiphertext))
    throw BadRequestError({ message: "Missing encrypted key" });

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

  const secret = await SecretService.updateSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
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
    body: { type, environment, secretPath, workspaceId },
    params: { secretName }
  } = await validateRequest(reqValidator.DeleteSecretByNameV3, req);

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

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

  return res.status(200).send({
    secret
  });
};

export const createSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.CreateSecretByNameBatchV3, req);

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
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

  if (req.user?._id) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
  } else {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload as IServiceTokenData,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

  const deletedSecrets = await SecretService.deleteSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  return res.status(200).send({
    secrets: deletedSecrets
  });
};
