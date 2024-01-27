import { Request, Response } from "express";
import { Types } from "mongoose";
import { APIKeyDataV2 } from "../../../models/apiKeyDataV2";
import { validateRequest } from "../../../helpers/validation";
import { BadRequestError } from "../../../utils/errors";
import * as reqValidator from "../../../validation";
import { createToken } from "../../../helpers";
import { AuthTokenType } from "../../../variables";
import { getAuthSecret } from "../../../config";

/**
 * Create API key data v2
 * @param req 
 * @param res 
 */
export const createAPIKeyData = async (req: Request, res: Response) => {
    const {
        body: {
            name
        }
    } = await validateRequest(reqValidator.CreateAPIKeyV3, req);

    const apiKeyData = await new APIKeyDataV2({
        name,
        user: req.user._id,
        usageCount: 0,
    }).save();
    
    const apiKey = createToken({
        payload: {
            authTokenType: AuthTokenType.API_KEY,
            apiKeyDataId: apiKeyData._id.toString(),
            userId: req.user._id.toString()
        },
        secret: await getAuthSecret()
    });

    return res.status(200).send({
        apiKeyData,
        apiKey
    });
}

/**
 * Update API key data v2 with id [apiKeyDataId]
 * @param req 
 * @param res 
 */
 export const updateAPIKeyData = async (req: Request, res: Response) => {
    const {
        params: { apiKeyDataId },
        body: { 
            name, 
        }
    } = await validateRequest(reqValidator.UpdateAPIKeyV3, req);

    const apiKeyData = await APIKeyDataV2.findOneAndUpdate(
        {
            _id: new Types.ObjectId(apiKeyDataId),
            user: req.user._id
        },
        {
            name
        },
        {
            new: true
        }
    );
    
    if (!apiKeyData) throw BadRequestError({
        message: "Failed to update API key"
    });

    return res.status(200).send({
        apiKeyData
    });
}

/**
 * Delete API key data v2 with id [apiKeyDataId]
 * @param req 
 * @param res 
 */
 export const deleteAPIKeyData = async (req: Request, res: Response) => {
    const {
        params: { apiKeyDataId }
    } = await validateRequest(reqValidator.DeleteAPIKeyV3, req);

    const apiKeyData = await APIKeyDataV2.findOneAndDelete({
        _id: new Types.ObjectId(apiKeyDataId),
        user: req.user._id
    });

    if (!apiKeyData) throw BadRequestError({
        message: "Failed to delete API key"
    });
    
    return res.status(200).send({
        apiKeyData
    });
}