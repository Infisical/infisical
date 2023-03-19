import { Request, Response, NextFunction } from 'express';
import { ServiceAccount } from '../models';
import {
    ServiceAccountNotFoundError
} from '../utils/errors';
import {
    validateMembershipOrg
} from '../helpers/membershipOrg';

type req = 'params' | 'body' | 'query';

const requireServiceAccountAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = 'params'
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const serviceAccountId = req[location].serviceAccountId;
        const serviceAccount = await ServiceAccount.findById(serviceAccountId); 
        
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

export default requireServiceAccountAuth;