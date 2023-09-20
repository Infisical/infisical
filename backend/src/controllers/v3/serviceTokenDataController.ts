import { Request, Response } from "express";
import { Types } from "mongoose";
import { ServiceTokenDataV3 } from "../../models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/serviceTokenV3";
import { createToken } from "../../helpers/auth";

export const createServiceTokenData = async (req: Request, res: Response) => {
    const {
        body: { name, workspaceId, publicKey }
    } = await validateRequest(reqValidator.CreateServiceTokenV3, req);
    
    const serviceTokenData = await new ServiceTokenDataV3({
        name,
        workspace: new Types.ObjectId(workspaceId),
        publicKey,
        isActive: false
    }).save();

    console.log("the newly created serviceTokenDataV3: ", serviceTokenData);
    
    const token = createToken({
        payload: {
            _id: serviceTokenData._id.toString()
        },
        expiresIn: "5d",
        secret: "hello" // TODO: replace with real secret
    });
    
    console.log("jwt token: ", token);
    
    return res.status(200).send({
        serviceTokenData,
        serviceToken: `proj_token.${token}`
    });
}

export const updateServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId },
        body: { name, isActive }
    } = await validateRequest(reqValidator.UpdateServiceTokenV3, req);
    
    const serviceTokenData = await ServiceTokenDataV3.findByIdAndUpdate(
        serviceTokenDataId,
        {
            name,
            isActive
        },
        {
            new: true
        }
    );

    return res.status(200).send({
        serviceTokenData
    }); 
}

export const deleteServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId }
    } = await validateRequest(reqValidator.DeleteServiceTokenV3, req);
    
    const serviceTokenData = await ServiceTokenDataV3.findByIdAndDelete(serviceTokenDataId);

    return res.status(200).send({
        serviceTokenData
    }); 
}