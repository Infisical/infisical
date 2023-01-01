import express, { Request, Response } from 'express';
import { requireAuth, requireWorkspaceAuth, validateRequest } from '../../middleware';
import { ISecret, Secret } from '../../models';
import { body, param, query, check } from 'express-validator';
import { BadRequestError, InternalServerError, UnauthorizedRequestError, ValidationError as RouteValidationError } from '../../utils/errors';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';
import { SanitizedSecretModify, SecretUserInput, SanitizedSecretForCreate } from '../../types/secret/types';
import to from 'await-to-js';
import mongoose, { Types } from 'mongoose';
import { AnyBulkWriteOperation } from 'mongodb';
const { ValidationError } = mongoose.Error;

const router = express.Router();

/**
 * Create many secrets for a given workspace and environmentName
 */
router.post(
  '/batch-create/workspace/:workspaceId/environment/:environmentName',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  body('secrets').exists().isArray().custom((value) => value.every((item: ISecret) => typeof item === 'object')),
  validateRequest,
  async (req: Request, res: Response) => {
    const secretsToCreate: SecretUserInput[] = req.body.secrets;
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

    res.status(200).send(newlyCreatedSecrets)
  }
);

/**
 * Get a single secret by secret id
 */
router.get(
  '/:secretId', requireAuth, param('secretId').exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  validateRequest, async (req: Request, res: Response) => {
    try {
      const secretFromDB = await Secret.findById(req.params.secretId)
      return res.status(200).send(secretFromDB);
    } catch (e) {
      throw BadRequestError({ message: "Unable to find the requested secret" })
    }
  }
);

/**
 * Batch delete secrets in a given workspace and environment name
 */
router.delete(
  '/batch/workspace/:workspaceId/environment/:environmentName',
  requireAuth,
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  body('secretIds').exists().isArray(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  validateRequest, async (req: Request, res: Response) => {
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

    const [bulkModificationInfoError, bulkModificationInfo] = await to(Secret.bulkWrite(deleteOperationsToPerform).then())
    if (bulkModificationInfoError) {
      throw InternalServerError({ message: "Unable to apply modifications, please try again" })
    }

    res.status(200).send()
  }
);

/**
 * Apply modifications to many existing secrets in a given workspace and environment
 */
router.patch(
  '/batch-modify/:workspaceId/:environmentName',
  requireAuth,
  body('secrets').exists().isArray().custom((value) => value.every((item: ISecret) => typeof item === 'object')),
  param('workspaceId').exists().isMongoId().trim(),
  param('environmentName').exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  validateRequest, async (req: Request, res: Response) => {
    const { workspaceId, environmentName } = req.params
    const secretsModificationsRequested: SecretUserInput[] = req.body.secrets;

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
      throw InternalServerError({ message: "Unable to apply modifications, please try again" })
    }

    return res.status(200).send()
  }
);

export default router;
