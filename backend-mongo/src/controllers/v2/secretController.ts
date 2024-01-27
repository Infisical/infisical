import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import {
  CreateSecretRequestBody,
  ModifySecretRequestBody,
  SanitizedSecretForCreate,
  SanitizedSecretModify
} from "../../types/secret";
const { ValidationError } = mongoose.Error;
import {
  ValidationError as RouteValidationError,
  UnauthorizedRequestError
} from "../../utils/errors";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  SECRET_PERSONAL,
  SECRET_SHARED
} from "../../variables";
import { TelemetryService } from "../../services";
import { Secret, User } from "../../models";
import { AccountNotFoundError } from "../../utils/errors";

/**
 * Create secret for workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 */
export const createSecret = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const secretToCreate: CreateSecretRequestBody = req.body.secret;
  const { workspaceId, environment } = req.params;
  const sanitizedSecret: SanitizedSecretForCreate = {
    secretKeyCiphertext: secretToCreate.secretKeyCiphertext,
    secretKeyIV: secretToCreate.secretKeyIV,
    secretKeyTag: secretToCreate.secretKeyTag,
    secretKeyHash: secretToCreate.secretKeyHash,
    secretValueCiphertext: secretToCreate.secretValueCiphertext,
    secretValueIV: secretToCreate.secretValueIV,
    secretValueTag: secretToCreate.secretValueTag,
    secretValueHash: secretToCreate.secretValueHash,
    secretCommentCiphertext: secretToCreate.secretCommentCiphertext,
    secretCommentIV: secretToCreate.secretCommentIV,
    secretCommentTag: secretToCreate.secretCommentTag,
    secretCommentHash: secretToCreate.secretCommentHash,
    workspace: new Types.ObjectId(workspaceId),
    environment,
    type: secretToCreate.type,
    user: new Types.ObjectId(req.user._id),
    algorithm: ALGORITHM_AES_256_GCM,
    keyEncoding: ENCODING_SCHEME_UTF8
  };

  const secret = await new Secret(sanitizedSecret).save();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets added",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: 1,
        workspaceId,
        environment,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  res.status(200).send({
    secret
  });
};

/**
 * Create many secrets for workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 */
export const createSecrets = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const secretsToCreate: CreateSecretRequestBody[] = req.body.secrets;
  const { workspaceId, environment } = req.params;
  const sanitizedSecretesToCreate: SanitizedSecretForCreate[] = [];

  secretsToCreate.forEach((rawSecret) => {
    const safeUpdateFields: SanitizedSecretForCreate = {
      secretKeyCiphertext: rawSecret.secretKeyCiphertext,
      secretKeyIV: rawSecret.secretKeyIV,
      secretKeyTag: rawSecret.secretKeyTag,
      secretKeyHash: rawSecret.secretKeyHash,
      secretValueCiphertext: rawSecret.secretValueCiphertext,
      secretValueIV: rawSecret.secretValueIV,
      secretValueTag: rawSecret.secretValueTag,
      secretValueHash: rawSecret.secretValueHash,
      secretCommentCiphertext: rawSecret.secretCommentCiphertext,
      secretCommentIV: rawSecret.secretCommentIV,
      secretCommentTag: rawSecret.secretCommentTag,
      secretCommentHash: rawSecret.secretCommentHash,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      type: rawSecret.type,
      user: new Types.ObjectId(req.user._id),
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    };

    sanitizedSecretesToCreate.push(safeUpdateFields);
  });

  const secrets = await Secret.insertMany(sanitizedSecretesToCreate);

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets added",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: (secretsToCreate ?? []).length,
        workspaceId,
        environment,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  res.status(200).send({
    secrets
  });
};

/**
 * Delete secrets in workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 */
export const deleteSecrets = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const { workspaceId, environmentName } = req.params;
  const secretIdsToDelete: string[] = req.body.secretIds;

  const secretIdsUserCanDelete = await Secret.find({ workspace: workspaceId, environment: environmentName }, { _id: 1 });

  const secretsUserCanDeleteSet: Set<string> = new Set(
    secretIdsUserCanDelete.map((objectId) => objectId._id.toString())
  );

  // Filter out IDs that user can delete and then map them to delete operations
  const deleteOperationsToPerform = secretIdsToDelete
    .filter(secretIdToDelete => {
      if (!secretsUserCanDeleteSet.has(secretIdToDelete)) {
        throw RouteValidationError({
          message: "You cannot delete secrets that you do not have access to"
        });
      }
      return true;
    })
    .map(secretIdToDelete => ({
      deleteOne: { filter: { _id: new Types.ObjectId(secretIdToDelete) } }
    }));

  const numSecretsDeleted = deleteOperationsToPerform.length;

  await Secret.bulkWrite(deleteOperationsToPerform);

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets deleted",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: numSecretsDeleted,
        environment: environmentName,
        workspaceId,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  res.status(200).send();
};

/**
 * Delete secret with id [secretId]
 * @param req
 * @param res
 */
export const deleteSecret = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  await Secret.findByIdAndDelete(req._secret._id);

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets deleted",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: 1,
        workspaceId: req._secret.workspace.toString(),
        environment: req._secret.environment,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  res.status(200).send({
    secret: req._secret
  });
};

/**
 * Update secrets for workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const updateSecrets = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const { workspaceId, environmentName } = req.params;
  const secretsModificationsRequested: ModifySecretRequestBody[] = req.body.secrets;
  const secretIdsUserCanModify = await Secret.find({ workspace: workspaceId, environment: environmentName }, { _id: 1 });

  const secretsUserCanModifySet: Set<string> = new Set(
    secretIdsUserCanModify.map((objectId) => objectId._id.toString())
  );
  const updateOperationsToPerform: any = [];

  secretsModificationsRequested.forEach((userModifiedSecret) => {
    if (secretsUserCanModifySet.has(userModifiedSecret._id.toString())) {
      const sanitizedSecret: SanitizedSecretModify = {
        secretKeyCiphertext: userModifiedSecret.secretKeyCiphertext,
        secretKeyIV: userModifiedSecret.secretKeyIV,
        secretKeyTag: userModifiedSecret.secretKeyTag,
        secretKeyHash: userModifiedSecret.secretKeyHash,
        secretValueCiphertext: userModifiedSecret.secretValueCiphertext,
        secretValueIV: userModifiedSecret.secretValueIV,
        secretValueTag: userModifiedSecret.secretValueTag,
        secretValueHash: userModifiedSecret.secretValueHash,
        secretCommentCiphertext: userModifiedSecret.secretCommentCiphertext,
        secretCommentIV: userModifiedSecret.secretCommentIV,
        secretCommentTag: userModifiedSecret.secretCommentTag,
        secretCommentHash: userModifiedSecret.secretCommentHash
      };

      const updateOperation = {
        updateOne: {
          filter: { _id: userModifiedSecret._id, workspace: workspaceId },
          update: { $inc: { version: 1 }, $set: sanitizedSecret }
        }
      };
      updateOperationsToPerform.push(updateOperation);
    } else {
      throw UnauthorizedRequestError({
        message: "You do not have permission to modify one or more of the requested secrets"
      });
    }
  });

  await Secret.bulkWrite(updateOperationsToPerform);

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets modified",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: (secretsModificationsRequested ?? []).length,
        environment: environmentName,
        workspaceId,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  return res.status(200).send();
};

/**
 * Update a secret within workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const updateSecret = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const { workspaceId, environmentName } = req.params;
  const secretModificationsRequested: ModifySecretRequestBody = req.body.secret;

  await Secret.findOne({ workspace: workspaceId, environment: environmentName }, { _id: 1 });

  const sanitizedSecret: SanitizedSecretModify = {
    secretKeyCiphertext: secretModificationsRequested.secretKeyCiphertext,
    secretKeyIV: secretModificationsRequested.secretKeyIV,
    secretKeyTag: secretModificationsRequested.secretKeyTag,
    secretKeyHash: secretModificationsRequested.secretKeyHash,
    secretValueCiphertext: secretModificationsRequested.secretValueCiphertext,
    secretValueIV: secretModificationsRequested.secretValueIV,
    secretValueTag: secretModificationsRequested.secretValueTag,
    secretValueHash: secretModificationsRequested.secretValueHash,
    secretCommentCiphertext: secretModificationsRequested.secretCommentCiphertext,
    secretCommentIV: secretModificationsRequested.secretCommentIV,
    secretCommentTag: secretModificationsRequested.secretCommentTag,
    secretCommentHash: secretModificationsRequested.secretCommentHash
  };

  const singleModificationUpdate = await Secret.updateOne(
    { _id: secretModificationsRequested._id, workspace: workspaceId },
    { $inc: { version: 1 }, $set: sanitizedSecret }
  )
    .catch((error) => {
      if (error instanceof ValidationError) {
        throw RouteValidationError({
          message: "Unable to apply modifications, please try again",
          stack: error.stack
        });
      }

      throw error;
    });

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets modified",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: 1,
        environment: environmentName,
        workspaceId,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  return res.status(200).send(singleModificationUpdate);
};

/**
 * Return secrets for workspace with id [workspaceId], environment [environment] and user
 * with id [req.user._id]
 * @param req
 * @param res
 * @returns
 */
export const getSecrets = async (req: Request, res: Response) => {
  const postHogClient = await TelemetryService.getPostHogClient();
  const { environment } = req.query;
  const { workspaceId } = req.params;

  let userId: Types.ObjectId | undefined = undefined; // used for getting personal secrets for user
  let userEmail: string | undefined = undefined; // used for posthog
  if (req.user) {
    userId = req.user._id;
    userEmail = req.user.email;
  }

  if (req.serviceTokenData) {
    userId = req.serviceTokenData.user;

    const user = await User.findById(req.serviceTokenData.user, "email");
    if (!user) throw AccountNotFoundError();
    userEmail = user.email;
  }

  const secrets = await Secret.find({
    workspace: workspaceId,
    environment,
    $or: [{ user: userId }, { user: { $exists: false } }],
    type: { $in: [SECRET_SHARED, SECRET_PERSONAL] }
  })
    .catch((err) => {
      throw RouteValidationError({
        message: "Failed to get secrets, please try again",
        stack: err.stack
      });
    })

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets pulled",
      distinctId: userEmail,
      properties: {
        numberOfSecrets: (secrets ?? []).length,
        environment,
        workspaceId,
        channel: req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli",
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  return res.json(secrets);
};

/**
 * Return secret with id [secretId]
 * @param req
 * @param res
 * @returns
 */
export const getSecret = async (req: Request, res: Response) => {
  // if (postHogClient) {
  //   postHogClient.capture({
  //     event: 'secrets pulled',
  //     distinctId: req.user.email,
  //     properties: {
  //       numberOfSecrets: 1,
  //       workspaceId: req._secret.workspace.toString(),
  //       environment: req._secret.environment,
  //       channel: req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli',
  //       userAgent: req.headers?.['user-agent']
  //     }
  //   });
  // }

  return res.status(200).send({
    secret: req._secret
  });
};
