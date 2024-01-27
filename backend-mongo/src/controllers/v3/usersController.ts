import { Request, Response } from "express";
import { APIKeyDataV2 } from "../../models";

/**
 * Return API keys belonging to current user.
 * @param req
 * @param res
 * @returns
 */
export const getMyAPIKeys = async (req: Request, res: Response) => {
    const apiKeyData = await APIKeyDataV2.find({
        user: req.user._id
    });

    return res.status(200).send({
        apiKeyData
    });
}