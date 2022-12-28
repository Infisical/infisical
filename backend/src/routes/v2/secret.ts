import express, { Request, Response } from 'express';
import { requireAuth, validateRequest } from '../../middleware';
import { ISecret, Secret } from '../../models';
import { decryptSymmetric } from '../../utils/crypto';
import { getLogger } from '../../utils/logger';
import { body, param, query, check } from 'express-validator';
import { BadRequestError } from '../../utils/errors';
const router = express.Router();

/**
 * Create a single secret for a given workspace and environment 
 */
router.post(
  '/', requireAuth,
  body('secret').exists().isObject(),
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
 * Apply modifications to many existing secrets
 */
router.patch(
  '/bulk-update',
  requireAuth,
  body('secrets').exists().isArray().custom((value) => value.every((item: ISecret) => typeof item === 'object')),
  validateRequest, async (req: Request, res: Response) => {
    try {
      const { secrets }: { secrets: ISecret[] } = req.body;

      const operations = secrets.map((secretToUpdate: ISecret) => ({
        updateOne: { filter: { _id: secretToUpdate._id }, update: secretToUpdate },
      }));

      const bulkModificationInfo = await Secret.bulkWrite(operations);

      return res.status(200).json(bulkModificationInfo)
    } catch (error) {
      throw BadRequestError({ message: `Unable to process the bulk update. Double check the ids of the secrets` })
    }
  }
);

export default router;
