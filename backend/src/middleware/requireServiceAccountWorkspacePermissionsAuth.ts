import { Request, Response, NextFunction } from 'express';
import { ServiceAccount, ServiceAccountWorkspacePermissions } from '../models';
import {
    ServiceAccountNotFoundError
} from '../utils/errors';
import {
    validateMembershipOrg
} from '../helpers/membershipOrg';

type req = 'params' | 'body' | 'query';

const requireServiceAccountWorkspacePermissionsAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = 'params'
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const serviceAccountWorkspacePermissionsId = req[location].serviceAccountWorkspacePermissionsId;
        const serviceAccountWorkspacePermissions = await ServiceAccountWorkspacePermissions.findById(serviceAccountWorkspacePermissionsId);

        if (!serviceAccountWorkspacePermissions) {
            return next(ServiceAccountNotFoundError({ message: 'Failed to locate Service Account workspace permission' }));
        }
        
        const serviceAccount = await ServiceAccount.findById(serviceAccountWorkspacePermissions.serviceAccount);

        if (!serviceAccount) {
            return next(ServiceAccountNotFoundError({ message: 'Failed to locate Service Account' }));
        }
        
        if (serviceAccount.user.toString() !== req.user.id.toString()) {
            // case: creator of the service account is different from
            // the user on the request -> apply middleware role/status validation
            await validateMembershipOrg({
                userId: req.user._id,
                organizationId: serviceAccount.organization,
                acceptedRoles,
                acceptedStatuses
            });
        }
        
        req.serviceAccount = serviceAccount;
        
        next();
    }
}

export default requireServiceAccountWorkspacePermissionsAuth;