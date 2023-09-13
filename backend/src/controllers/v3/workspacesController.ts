import { Request, Response } from "express";
import { Types } from "mongoose";
import { validateRequest } from "@app/helpers/validation";
import { Secret } from "@app/models";
import { SecretService } from "@app/services";
import { getUserProjectPermissions } from "@app/ee/services/ProjectRoleService";
import { UnauthorizedRequestError } from "@app/utils/errors";
import * as reqValidator from "@app/validation/workspace";

/**
 * Return whether or not all secrets in workspace with id [workspaceId]
 * are blind-indexed
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceBlindIndexStatus = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetWorkspaceBlinkIndexStatusV3, req);

  const { membership } = await getUserProjectPermissions(req.user._id, workspaceId);
  if (membership.role !== "admin")
    throw UnauthorizedRequestError({ message: "User must be an admin" });

  const secretsWithoutBlindIndex = await Secret.countDocuments({
    workspace: new Types.ObjectId(workspaceId),
    secretBlindIndex: {
      $exists: false
    }
  });

  return res.status(200).send(secretsWithoutBlindIndex === 0);
};

/**
 * Get all secrets for workspace with id [workspaceId]
 */
export const getWorkspaceSecrets = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetWorkspaceSecretsV3, req);

  const { membership } = await getUserProjectPermissions(req.user._id, workspaceId);
  if (membership.role !== "admin")
    throw UnauthorizedRequestError({ message: "User must be an admin" });

  const secrets = await Secret.find({
    workspace: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    secrets
  });
};

/**
 * Update blind indices for secrets in workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const nameWorkspaceSecrets = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { secretsToUpdate }
  } = await validateRequest(reqValidator.NameWorkspaceSecretsV3, req);

  const { membership } = await getUserProjectPermissions(req.user._id, workspaceId);
  if (membership.role !== "admin")
    throw UnauthorizedRequestError({ message: "User must be an admin" });

  // get secret blind index salt
  const salt = await SecretService.getSecretBlindIndexSalt({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  // update secret blind indices
  const operations = await Promise.all(
    secretsToUpdate.map(async (secretToUpdate) => {
      const secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
        secretName: secretToUpdate.secretName,
        salt
      });

      return {
        updateOne: {
          filter: {
            _id: new Types.ObjectId(secretToUpdate._id)
          },
          update: {
            secretBlindIndex
          }
        }
      };
    })
  );

  await Secret.bulkWrite(operations);

  return res.status(200).send({
    message: "Successfully named workspace secrets"
  });
};
