import { Request, Response } from "express";
import { Action } from "../../models";
import { ActionNotFoundError } from "../../../utils/errors";

export const getAction = async (req: Request, res: Response) => {
    let action;
    try {
        const { actionId } = req.params;
        
        action = await Action
            .findById(actionId)
            .populate([
                "payload.secretVersions.oldSecretVersion",
                "payload.secretVersions.newSecretVersion",
            ]);
        
        if (!action) throw ActionNotFoundError({
            message: "Failed to find action",
        });

    } catch (err) {
        throw ActionNotFoundError({
            message: "Failed to find action",
        });
    }
    
    return res.status(200).send({
        action,
    });
}
