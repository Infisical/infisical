import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { 
    ServiceAccount,
    ServiceAccountKey,
    ServiceAccountPermission
} from '../../models';
import {
    validateCreateServiceAccountPermission
} from '../../helpers/serviceAccount';
import {
    CreateServiceAccountDto,
    AddServiceAccountPermissionDto
} from '../../interfaces/serviceAccounts/dto';
import { 
    PERMISSION_SA_WORKSPACE_SET,
    PERMISSION_SA_SET
} from '../../variables';
import { ServiceAccountKeyNotFoundError, ValidationError } from '../../utils/errors';

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
    }: AddServiceAccountPermissionDto = req.body;
    
    if (PERMISSION_SA_WORKSPACE_SET.has(name)) {
        // case: permission named [name] is workspace-related
        
        // some such permissions require workspaceId and environment to be present.
        
        if (!workspaceId || !environment) {
            throw ValidationError({
                message: 'Failed validation that is workspace-related permission must specify a workspace and environment' 
            });
        } else {
            const serviceAccountKey = await ServiceAccountKey.findOne({
                serviceAccount: req.serviceAccount._id,
                workspace: new Types.ObjectId(workspaceId)
            });
            
            if (!serviceAccountKey) throw ServiceAccountKeyNotFoundError({ message: 'Failed to find service account key' });
        }
    }
    
    const serviceAccountPermission = await new ServiceAccountPermission({
        serviceAccount: req.serviceAccount._id,
        name,
        workspace: workspaceId ? new Types.ObjectId(workspaceId) : undefined,
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
    const { serviceAccountPermissionId } = req.params;
    
    // user must either be an admin/owner of the organization or they must 
    // have created the service account in the first place to be able to delete it
    
    // TODO: how to delete just 1 permission?
    

    const serviceAccountPermission = await ServiceAccountPermission.findByIdAndDelete(serviceAccountPermissionId);
    
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

    if (serviceAccount) {
        // case: service account with id [serviceAccountId] was deleted

        await ServiceAccountKey.deleteMany({
            serviceAccount: serviceAccount?._id
        });

        await ServiceAccountPermission.deleteMany({
            serviceAccount: new Types.ObjectId(serviceAccountId)
        });
    }

    return res.status(200).send({
        serviceAccount
    });
}