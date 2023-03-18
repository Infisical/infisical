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

    // await Promise.all(
    //     workspaces.map(async ({ 
    //         workspaceId, 
    //         environments, 
    //         permissions,
    //         encryptedKey,
    //         nonce
    //     }: {
    //         workspaceId: string;
    //         environments: string[];
    //         permissions: string[];
    //         encryptedKey: string;
    //         nonce: string;
    //     }) => {
    //         const serviceAccountKey = await new ServiceAccountKey({
    //             encryptedKey,
    //             nonce,
    //             sender: req.user._id,
    //             serviceAccount: serviceAccount._id,
    //             workspace: new Types.ObjectId(workspaceId)
    //         });
            
    //         console.log('serviceAccountKey: ', serviceAccountKey);
            
    //         await Promise.all(
    //             permissions.map(async (name: string) => {
    //                 const permission = await new ServiceAccountPermission({
    //                     serviceAccount: serviceAccount._id,
    //                     name,
    //                     workspace: new Types.ObjectId(workspaceId),
    //                     environments
    //                 }).save();

    //                 console.log('permission: ', permission);
    //             })
    //         );
    //     })
    // );
    
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
    
    return res.status(200).send({
        serviceAccount
    });
}

export const addServiceAccountWorkspaceAccess = async (req: Request, res: Response) => {
    const { serviceAccountId, workspaceId } = req.params;
    const {
        encryptedKey,
        nonce,
        permissions // should contain environments
    } = req.body;

    const serviceAccountKey = await new ServiceAccountKey({
        encryptedKey,
        nonce,
        sender: req.user._id,
        serviceAccount: req.serviceAccount._id,
        workspace: new Types.ObjectId('workspaceId')
    });
    
    const serviceAccountPermissions = await Promise.all(
        permissions.map
    );
}

export const deleteServiceAccountWorkspaceAccess = async (req: Request, res: Response) => {
    // TODO
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