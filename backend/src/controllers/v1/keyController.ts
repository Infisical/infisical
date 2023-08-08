import { Types } from "mongoose";
import { Request, Response } from "express";
import { Key } from "../../models";
import { findMembership } from "../../helpers/membership";
import { EventType } from "../../ee/models";
import { EEAuditLogService } from "../../ee/services";

/**
 * Add (encrypted) copy of workspace key for workspace with id [workspaceId] for user with
 * id [key.userId]
 * @param req
 * @param res
 * @returns
 */
export const uploadKey = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const { key } = req.body;

  // validate membership of receiver
  const receiverMembership = await findMembership({
    user: key.userId,
    workspace: workspaceId,
  });

  if (!receiverMembership) {
    throw new Error("Failed receiver membership validation for workspace");
  }

  await new Key({
    encryptedKey: key.encryptedKey,
    nonce: key.nonce,
    sender: req.user._id,
    receiver: key.userId,
    workspace: workspaceId,
  }).save();

	return res.status(200).send({
		message: "Successfully uploaded key to workspace",
	});
};

/**
 * Return latest (encrypted) copy of workspace key for user
 * @param req
 * @param res
 * @returns
 */
export const getLatestKey = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  
  // get latest key
  const latestKey = await Key.find({
    workspace: workspaceId,
    receiver: req.user._id,
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .populate("sender", "+publicKey");

	const resObj: any = {};

	if (latestKey.length > 0) {
		resObj["latestKey"] = latestKey[0];
    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.GET_WORKSPACE_KEY,
        metadata: {
          keyId: latestKey[0]._id.toString()
        }
      },
      {
        workspaceId: new Types.ObjectId(workspaceId)
      }
    );
	}

	return res.status(200).send(resObj);
};
