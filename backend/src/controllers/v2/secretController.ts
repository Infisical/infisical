import to from "await-to-js";
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Secret, { ISecret } from "../../models/secret";
import { CreateSecretRequestBody, ModifySecretRequestBody, SanitizedSecretForCreate, SanitizedSecretModify } from "../../types/secret";
const { ValidationError } = mongoose.Error;
import { BadRequestError, InternalServerError, UnauthorizedRequestError, ValidationError as RouteValidationError } from '../../utils/errors';
import { AnyBulkWriteOperation } from 'mongodb';
import { SECRET_PERSONAL, SECRET_SHARED } from "../../variables";
import { validateMembership } from "../../helpers/membership";
import { ADMIN, MEMBER } from '../../variables';

export const createSingleSecret = async (req: Request, res: Response) => {
  const secretToCreate: CreateSecretRequestBody = req.body.secret;
  const { workspaceId, environmentName } = req.params
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
    environment: environmentName,
    type: secretToCreate.type,
    user: new Types.ObjectId(req.user._id)
  }


  const [error, newlyCreatedSecret] = await to(Secret.create(sanitizedSecret).then())
  if (error instanceof ValidationError) {
    throw RouteValidationError({ message: error.message, stack: error.stack })
  }

  res.status(200).send()
}

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

export const deleteSingleSecret = async (req: Request, res: Response) => {
  const { secretId } = req.params;

  const [error, singleSecretRetrieved] = await to(Secret.findById(secretId).then())
  if (error instanceof ValidationError) {
    throw RouteValidationError({ message: "Unable to get secret, please try again", stack: error.stack })
  }

  if (singleSecretRetrieved) {
    const [membershipValidationError, membership] = await to(validateMembership({
      userId: req.user._id,
      workspaceId: singleSecretRetrieved.workspace._id.toString(),
      acceptedRoles: [ADMIN, MEMBER]
    }))

    if (membershipValidationError || !membership) {
      throw UnauthorizedRequestError()
    }

    await Secret.findByIdAndDelete(secretId)

    res.status(200).send()
  } else {
    throw BadRequestError()
  }
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

export const modifySingleSecrets = async (req: Request, res: Response) => {
  const { workspaceId, environmentName } = req.params
  const secretModificationsRequested: ModifySecretRequestBody = req.body.secret;

  const [secretIdUserCanModifyError, secretIdUserCanModify] = await to(Secret.findOne({ workspace: workspaceId, environment: environmentName }, { _id: 1 }).then())
  if (secretIdUserCanModifyError && !secretIdUserCanModify) {
    throw BadRequestError()
  }

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
    secretCommentHash: secretModificationsRequested.secretCommentHash,
  }

  const [error, singleModificationUpdate] = await to(Secret.updateOne({ _id: secretModificationsRequested._id, workspace: workspaceId }, { $inc: { version: 1 }, $set: sanitizedSecret }).then())
  if (error instanceof ValidationError) {
    throw RouteValidationError({ message: "Unable to apply modifications, please try again", stack: error.stack })
  }

  return res.status(200).send(singleModificationUpdate)
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

export const fetchSingleSecret = async (req: Request, res: Response) => {
  const { secretId } = req.params;

  const [error, singleSecretRetrieved] = await to(Secret.findById(secretId).then())

  if (error instanceof ValidationError) {
    throw RouteValidationError({ message: "Unable to get secret, please try again", stack: error.stack })
  }

  if (singleSecretRetrieved) {
    const [membershipValidationError, membership] = await to(validateMembership({
      userId: req.user._id,
      workspaceId: singleSecretRetrieved.workspace._id.toString(),
      acceptedRoles: [ADMIN, MEMBER]
    }))

    if (membershipValidationError || !membership) {
      throw UnauthorizedRequestError()
    }

    res.json(singleSecretRetrieved)

  } else {
    throw BadRequestError()
  }
}