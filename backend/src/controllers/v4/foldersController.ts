import { Request, Response } from "express";
// import { Types } from "mongoose";
// import { FolderVersion } from "../../ee/models";
// import { Folder } from "../../models";
// import { appendFolder } from "../../services/FolderService";
// import { validateRequest } from "../../helpers/validation";
// import * as reqValidator from "../../validation/folders";
// import { ResourceNotFoundError } from "../../utils/errors";

/**
 * 
 * Return list of folders in project with id [projectId]
 * @param req 
 * @param res 
 * @returns 
 */
export const getFolders = async (req: Request, res: Response) => {
    // TODO
}

/**
 * 
 * Create folder with name [folderName] in project with id [projectId]
 * under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const createFolder = async (req: Request, res: Response) => {
    // TODO
    
    // const {
    //     body: {
    //         folderName,
    //         projectId,
    //         environmentSlug,
    //         path
    //     }
    // } = await validateRequest(reqValidator.CreateFolderV2, req);
    
    // // get folder

    // const folders = await Folder.findOne({
    //     workspace: new Types.ObjectId(projectId),
    //     environment: environmentSlug
    // });
    
    // if (!folders) throw ResourceNotFoundError();

    // const { parent, child: folder, hasCreated } = appendFolder(folders.nodes, { folderName, directory: path });

    // if (!hasCreated) return res.json({ folder });

    // await Folder.findByIdAndUpdate(folders._id, folders);
    
    // await new FolderVersion({
    //     project: new Types.ObjectId(projectId),
    //     nodes: parent
    // }).save();

    // return res.status(200).send({
    //     folder
    // });
}

/**
 * 
 * Update folder with name [folderName] in project with id [projectId]
 * under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateFolder = async (req: Request, res: Response) => {
    // TODO
}

/**
 * Delete folder with name [folderName] in project with id [projectId]
 * under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteFolder = async (req: Request, res: Response) => {
    // TODO
}