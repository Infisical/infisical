import { Request, Response } from "express";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/folders";

export const getFolders = async (req: Request, res: Response) => {

}

export const createFolder = async (req: Request, res: Response) => {
    const {
        params: {
            folderName
        },
        body: {
            projectId,
            environmentSlug,
            path
        }
    } = await validateRequest(reqValidator.CreateFolderV2, req);
    
    // get folder

    return res.status(200).send({
        folder: ""
    });
}

/**
 * 
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteFolder = async (req: Request, res: Response) => {
    
    return res.status(200).send({
    
    });
}

