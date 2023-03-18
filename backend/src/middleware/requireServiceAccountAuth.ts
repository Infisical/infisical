import { Request, Response, NextFunction } from 'express';
import { ServiceAccount } from '../models';
import {
    AccountNotFoundError,
    UnauthorizedRequestError
} from '../utils/errors';

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
        
        // TODO: acceptedRoles and acceptedStatuses
        
        if (!serviceAccount) {
            return next(AccountNotFoundError({ message: 'Failed to locate Service Account' }));
        }
        
        if (serviceAccount.user.toString() !== req.user.id.toString()) {
            return next(UnauthorizedRequestError({ message: 'Failed to authenticate the Service Account' }));
        }
        
        req.serviceAccount = serviceAccount;
        
        next();
    }
}

export default requireServiceAccountAuth;