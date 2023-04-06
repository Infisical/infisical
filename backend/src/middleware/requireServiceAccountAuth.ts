import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ServiceAccount } from '../models';
import {
    ServiceAccountNotFoundError
} from '../utils/errors';
import {
    validateMembershipOrg
} from '../helpers/membershipOrg';
import {
    validateClientForServiceAccount
} from '../helpers/serviceAccount';

type req = 'params' | 'body' | 'query';

const requireServiceAccountAuth = ({
    acceptedRoles,
    acceptedStatuses,
    locationServiceAccountId = 'params',
    requiredPermissions = []
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    locationServiceAccountId?: req;
    requiredPermissions?: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const serviceAccountId = req[locationServiceAccountId].serviceAccountId;
        
        req.serviceAccount = await validateClientForServiceAccount({
            authData: req.authData,
            serviceAccountId: new Types.ObjectId(serviceAccountId),
            requiredPermissions
        });
        
        next();
    }
}

export default requireServiceAccountAuth;