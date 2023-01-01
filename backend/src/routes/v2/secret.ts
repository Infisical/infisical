import express, { Request, Response } from 'express';
import { requireAuth, requireWorkspaceAuth, validateRequest } from '../../middleware';
import { ISecret, Secret } from '../../models';
import { decryptSymmetric } from '../../utils/crypto';
import { getLogger } from '../../utils/logger';
import { body, param, query, check } from 'express-validator';
import { BadRequestError, InternalServerError, UnauthorizedRequestError } from '../../utils/errors';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';
import { ModifySecretPayload, SafeUpdateSecret } from '../../types/secret/types';
import { AnyBulkWriteOperation } from 'mongodb';
import to from 'await-to-js';
import { Types } from 'mongoose';

const router = express.Router();

/**
 * Create a single secret for a given workspace and environment 
 */
router.post(
  '/', requireAuth,
  body('secret').exists().isObject(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  async (req: Request, res: Response) => {
    try {
      const { secret }: { secret: ISecret[] } = req.body;
      const newlyCreatedSecret = await Secret.create(secret)
      res.status(200).json(newlyCreatedSecret)
    } catch {
      throw BadRequestError({ message: "Unable to create the secret" })
    }
  }
);

/**
 * Create many secrets
 */
router.post(
  '/bulk-create', requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  body('secrets').exists().isArray().custom((value) => value.every((item: ISecret) => typeof item === 'object')),
  async (req: Request, res: Response) => {
    try {
      const { secrets }: { secrets: ISecret[] } = req.body;
      const newlyCreatedSecrets = await Secret.insertMany(secrets)
      res.status(200).json(newlyCreatedSecrets)
    } catch {
      throw BadRequestError({ message: "Unable to create the secret" })
    }
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
 * Get a single secret by secret id
 */
router.get(
  '/:bulk', requireAuth, param('secretId').exists().trim(),
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
 * Delete a single secret by secret id
 */
router.delete(
  '/:secretId',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  param('secretId').exists().trim(),
  validateRequest, async (req: Request, res: Response) => {
    try {
      const secretFromDB = await Secret.deleteOne({
        _id: req.params.secretId
      })
      return res.status(200).send(secretFromDB);
    } catch (e) {
      throw BadRequestError({ message: "Unable to find the requested secret" })
    }
  }
);

/**
 * Delete many secrets by secret ids
 */
router.delete(
  '/batch',
  requireAuth,
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    acceptedStatuses: [COMPLETED, GRANTED]
  }),
  body('secretIds').exists().isArray(),
  validateRequest, async (req: Request, res: Response) => {
    try {
      const secretIdsToDelete: string[] = req.body.secretIds
      const secretFromDB = await Secret.deleteMany({
        _id: { $in: secretIdsToDelete }
      })
      return res.status(200).send(secretFromDB);
    } catch (error) {
      throw BadRequestError({ message: `Unable to delete the requested secrets by ids [${req.body.secretIds}]` })
    }
  }
);

/**
 * Apply modifications to many existing secrets in a given workspace and environment
 */
router.patch(
  '/bulk-modify/:workspaceId/:environmentName',
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
    const secretsModificationsRequested: ModifySecretPayload[] = req.body.secrets;

    const [secretIdsUserCanModifyError, secretIdsUserCanModify] = await to(Secret.find({ workspace: workspaceId, environment: environmentName }, { _id: 1 }).then())
    if (secretIdsUserCanModifyError) {
      throw InternalServerError({ message: "Unable to fetch secrets you own" })
    }

    const secretsUserCanModifySet: Set<string> = new Set(secretIdsUserCanModify.map(objectId => objectId._id.toString()));
    const updateOperationsToPerform: any = []

    secretsModificationsRequested.forEach(userModifiedSecret => {
      if (secretsUserCanModifySet.has(userModifiedSecret._id.toString())) {
        const safeUpdateFields: SafeUpdateSecret = {
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

        const updateOperation = { updateOne: { filter: { _id: userModifiedSecret._id, workspace: workspaceId }, update: { $inc: { version: 1 }, $set: safeUpdateFields } } }
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
