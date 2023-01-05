import to from "await-to-js";
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Secret, { ISecret } from "../../models/secret";
import { CreateSecretRequestBody, ModifySecretRequestBody, SanitizedSecretForCreate, SanitizedSecretModify } from "../../types/secret";
const { ValidationError } = mongoose.Error;
import { BadRequestError, InternalServerError, UnauthorizedRequestError, ValidationError as RouteValidationError } from '../../utils/errors';
import { AnyBulkWriteOperation } from 'mongodb';
import { SECRET_PERSONAL, SECRET_SHARED } from "../../variables";

export const batchCreateSecrets = async (req: Request, res: Response) => {
  const secretsToCreate: CreateSecretRequestBody[] = req.body.secrets;
  const { workspaceId, environmentName } = req.params
  const sanitizedSecretesToCreate: SanitizedSecretForCreate[] = []

  secretsToCreate.forEach(rawSecret => {
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
      environment: environmentName,
      type: rawSecret.type,
      user: new Types.ObjectId(req.user._id)
    }

    sanitizedSecretesToCreate.push(safeUpdateFields)
  })

  const [bulkCreateError, newlyCreatedSecrets] = await to(Secret.insertMany(sanitizedSecretesToCreate).then())
  if (bulkCreateError) {
    if (bulkCreateError instanceof ValidationError) {
      throw RouteValidationError({ message: bulkCreateError.message, stack: bulkCreateError.stack })
    }

    throw InternalServerError({ message: "Unable to process your batch create request. Please try again", stack: bulkCreateError.stack })
  }

  res.status(200).send()
}


export const createSingleSecret = async (req: Request, res: Response) => {
  try {
    const secretFromDB = await Secret.findById(req.params.secretId)
    return res.status(200).send(secretFromDB);
  } catch (e) {
    throw BadRequestError({ message: "Unable to find the requested secret" })
  }
}

export const batchDeleteSecrets = async (req: Request, res: Response) => {
  const { workspaceId, environmentName } = req.params
  const secretIdsToDelete: string[] = req.body.secretIds

  const [secretIdsUserCanDeleteError, secretIdsUserCanDelete] = await to(Secret.find({ workspace: workspaceId, environment: environmentName }, { _id: 1 }).then())
  if (secretIdsUserCanDeleteError) {
    throw InternalServerError({ message: `Unable to fetch secrets you own: [error=${secretIdsUserCanDeleteError.message}]` })
  }

  const secretsUserCanDeleteSet: Set<string> = new Set(secretIdsUserCanDelete.map(objectId => objectId._id.toString()));
  const deleteOperationsToPerform: AnyBulkWriteOperation<ISecret>[] = []

  secretIdsToDelete.forEach(secretIdToDelete => {
    if (secretsUserCanDeleteSet.has(secretIdToDelete)) {
      const deleteOperation = { deleteOne: { filter: { _id: new Types.ObjectId(secretIdToDelete) } } }
      deleteOperationsToPerform.push(deleteOperation)
    } else {
      throw RouteValidationError({ message: "You cannot delete secrets that you do not have access to" })
    }
  })

  const [bulkDeleteError, bulkDelete] = await to(Secret.bulkWrite(deleteOperationsToPerform).then())
  if (bulkDeleteError) {
    if (bulkDeleteError instanceof ValidationError) {
      throw RouteValidationError({ message: "Unable to apply modifications, please try again", stack: bulkDeleteError.stack })
    }
    throw InternalServerError()
  }

  res.status(200).send()
}

export const batchModifySecrets = async (req: Request, res: Response) => {
  const { workspaceId, environmentName } = req.params
  const secretsModificationsRequested: ModifySecretRequestBody[] = req.body.secrets;
  const [secretIdsUserCanModifyError, secretIdsUserCanModify] = await to(Secret.find({ workspace: workspaceId, environment: environmentName }, { _id: 1 }).then())
  if (secretIdsUserCanModifyError) {
    throw InternalServerError({ message: "Unable to fetch secrets you own" })
  }

  const secretsUserCanModifySet: Set<string> = new Set(secretIdsUserCanModify.map(objectId => objectId._id.toString()));
  const updateOperationsToPerform: any = []


  secretsModificationsRequested.forEach(userModifiedSecret => {
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
        secretCommentHash: userModifiedSecret.secretCommentHash,
      }

      const updateOperation = { updateOne: { filter: { _id: userModifiedSecret._id, workspace: workspaceId }, update: { $inc: { version: 1 }, $set: sanitizedSecret } } }
      updateOperationsToPerform.push(updateOperation)
    } else {
      throw UnauthorizedRequestError({ message: "You do not have permission to modify one or more of the requested secrets" })
    }
  })

  const [bulkModificationInfoError, bulkModificationInfo] = await to(Secret.bulkWrite(updateOperationsToPerform).then())
  if (bulkModificationInfoError) {
    if (bulkModificationInfoError instanceof ValidationError) {
      throw RouteValidationError({ message: "Unable to apply modifications, please try again", stack: bulkModificationInfoError.stack })
    }

    throw InternalServerError()
  }

  return res.status(200).send()
}

export const fetchAllSecrets = async (req: Request, res: Response) => {
  const { environment } = req.query;
  const { workspaceId } = req.params;

  let userId: string | undefined = undefined // Used for choosing the personal secrets to fetch in 
  if (req.user) {
    userId = req.user._id.toString();
  }

  if (req.serviceTokenData) {
    userId = req.serviceTokenData.user._id
  }

  const [retriveAllSecretsError, allSecrets] = await to(Secret.find(
    {
      workspace: workspaceId,
      environment,
      $or: [{ user: userId }, { user: { $exists: false } }],
      type: { $in: [SECRET_SHARED, SECRET_PERSONAL] }
    }
  ).then())

  if (retriveAllSecretsError instanceof ValidationError) {
    throw RouteValidationError({ message: "Unable to get secrets, please try again", stack: retriveAllSecretsError.stack })
  }

  return res.json(allSecrets)
}