import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { 
    ServiceAccount,
    ServiceAccountKey,
    ServiceAccountPermission
} from '../../models';
import {
    CreateServiceAccountDto
} from '../../interfaces/serviceAccounts/dto';

/**
 * Create a new service account under organization with id [organizationId]
 * that has access to workspaces [workspaces]
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceAccount = async (req: Request, res: Response) => {
    const {
        organizationId,
        name,
        publicKey,
        expiresIn,
    }: CreateServiceAccountDto = req.body;

    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    const serviceAccount = await new ServiceAccount({
        name,
        organization: new Types.ObjectId(organizationId),
        user: req.user,
        publicKey,
        expiresAt
    }).save();

    return res.status(200).send({
        serviceAccount
    });
}

/**
 * Add a service account key to service account with id [serviceAccountId]
 * for workspace with id [workspaceId]
 * @param req 
 * @param res 
 * @returns 
 */
export const addServiceAccountKey = async (req: Request, res: Response) => {
    const {
        workspaceId,
        encryptedKey,
        nonce
    } = req.body;
    
    const serviceAccountKey = await new ServiceAccountKey({
        encryptedKey,
        nonce,
        sender: req.user._id,
        serviceAccount: req.serviceAccount._d,
        workspace: new Types.ObjectId(workspaceId)
    }).save();

    return serviceAccountKey;
}

/**
 * Add a permission to service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const addServiceAccountPermission = async (req: Request, res: Response) => {
    const {
        name,
        workspaceId,
        environment
    } = req.body; // TODO: add DTO
    
    // TODO: validation?
    
    const serviceAccountPermission = await new ServiceAccountPermission({
        serviceAccount: req.serviceAccount._id,
        name,
        workspace: new Types.ObjectId(workspaceId),
        environment
    });
    
    return res.status(200).send({
        serviceAccountPermission
    });
}

/**
 * Delete a permission from service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const deleteServiceAccountPermission = async (req: Request, res: Response) => {
    const {
        name,
        workspaceId,
        environment
    } = req.body; // TODO: DTO
    
    // TODO: how to delete just 1 permission?
    const serviceAccountPermission = await ServiceAccountPermission.findOneAndDelete({
        serviceAccount: req.serviceAccount._id,
        name,
        workspace: new Types.ObjectId(workspaceId),
        environment
    });
    
    return res.status(200).send({
        serviceAccountPermission
    });
}

/**
 * Delete service account with id [serviceAccountId]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceAccount = async (req: Request, res: Response) => {
    const { serviceAccountId } = req.params;

    const serviceAccount = await ServiceAccount.findByIdAndDelete(serviceAccountId);

    await ServiceAccountKey.deleteMany({
        serviceAccount: new Types.ObjectId(serviceAccountId)
    });

    await ServiceAccountPermission.deleteMany({
        serviceAccount: new Types.ObjectId(serviceAccountId)
    });
    
    return res.status(200).send({
        serviceAccount
    });
}

// /**
//  * Add a service account key to service account with id [serviceAccountId]
//  * for workspace with id [workspaceId]
//  * @param req 
//  * @param res 
//  * @returns 
//  */
// export const addServiceAccountKey = async (req: Request, res: Response) => {
//     const {
//         workspaceId,
//         encryptedKey,
//         nonce
//     } = req.body;
    
//     const serviceAccountKey = await new ServiceAccountKey({
//         encryptedKey,
//         nonce,
//         sender: req.user._id,
//         serviceAccount: req.serviceAccount._d,
//         workspace: new Types.ObjectId(workspaceId)
//     }).save();

//     return serviceAccountKey;
// }