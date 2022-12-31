import express, { Request, Response } from 'express';
import { requireAuth, requireWorkspaceAuth, validateRequest } from '../../middleware';
import { ISecret, Secret } from '../../models';
import { decryptSymmetric } from '../../utils/crypto';
import { getLogger } from '../../utils/logger';
import { body, param, query, check } from 'express-validator';
import { BadRequestError, UnauthorizedRequestError } from '../../utils/errors';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';
import { ModifySecretPayload } from '../../types/secret';
import { AnyBulkWriteOperation } from 'mongodb';
import to from 'await-to-js';

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
 * Note: although we do not check access for environments, we will in the future
 */
router.patch(
  '/bulk-modify/:workspaceId/:environmentName',
  requireAuth,
  body('secrets').exists().isArray().custom((value) => value.every((item: ISecret) => typeof item === 'object')),
  param('workspaceId').exists().trim(),
  param('environmentName').exists().trim(),
  // requireWorkspaceAuth({
  //   acceptedRoles: [ADMIN, MEMBER],
  //   acceptedStatuses: [COMPLETED, GRANTED]
  // }),
  validateRequest, async (req: Request, res: Response) => {
    try {
      const { workspaceId, environmentName } = req.params
      const secretsModificationsRequested: ModifySecretPayload[] = req.body.secrets;

      const secretsUserCanModify: ISecret[] = await Secret.find({ workspace: workspaceId, environment: environmentName })

      const secretsUserCanModifyMapBySecretId: Map<string, ISecret> = new Map<string, ISecret>();
      secretsUserCanModify.forEach(secret => secretsUserCanModifyMapBySecretId.set(secret._id.toString(), secret))

      // Check if the entity has access to the secret ids it wants to modify
      const updateOperationsToPerform: AnyBulkWriteOperation<ISecret>[] = []
      secretsModificationsRequested.forEach(userModifiedSecret => {
        const canModifyRequestedSecret = secretsUserCanModifyMapBySecretId.has(userModifiedSecret._id.toString())
        if (canModifyRequestedSecret) {
          const oldSecretInDB = secretsUserCanModifyMapBySecretId.get(userModifiedSecret._id.toString())

          if (oldSecretInDB !== undefined) {
            oldSecretInDB.secretKeyCiphertext = userModifiedSecret.secretKeyCiphertext
            oldSecretInDB.secretKeyIV = userModifiedSecret.secretKeyIV
            oldSecretInDB.secretKeyTag = userModifiedSecret.secretKeyTag
            oldSecretInDB.secretKeyHash = userModifiedSecret.secretKeyHash
            oldSecretInDB.secretValueCiphertext = userModifiedSecret.secretValueCiphertext
            oldSecretInDB.secretValueIV = userModifiedSecret.secretValueIV
            oldSecretInDB.secretValueTag = userModifiedSecret.secretValueTag
            oldSecretInDB.secretValueHash = userModifiedSecret.secretValueHash
            oldSecretInDB.secretCommentCiphertext = userModifiedSecret.secretCommentCiphertext
            oldSecretInDB.secretCommentIV = userModifiedSecret.secretCommentIV
            oldSecretInDB.secretCommentTag = userModifiedSecret.secretCommentTag
            oldSecretInDB.secretCommentHash = userModifiedSecret.secretCommentHash

            const updateOperation = { updateOne: { filter: { _id: oldSecretInDB._id, workspace: oldSecretInDB.workspace }, update: { $inc: { version: 1 }, $set: oldSecretInDB } } }
            updateOperationsToPerform.push(updateOperation)
          }
        } else {
          throw UnauthorizedRequestError({ message: "You do not have permission to modify one or more of the requested secrets" })
        }
      })

      const bulkModificationInfo = await Secret.bulkWrite(updateOperationsToPerform);

      return res.status(200).json({
        bulkModificationInfo
      })

    } catch (e) {
      throw BadRequestError()
    }
  }
);

export default router;
