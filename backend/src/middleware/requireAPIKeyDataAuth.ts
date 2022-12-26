import { Request, Response, NextFunction } from 'express';
import { APIKeyData } from '../models';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireAPIKeyDataAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = 'params'
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
    
        // req.user
        
        const apiKeyData = await APIKeyData.findById(req[location].apiKeyDataId);
        
        if (!apiKeyData) {
            return next(AccountNotFoundError({message: 'Failed to locate API Key data'}));
        }
        
        await validateMembership({
            userId: req.user._id.toString(),
            workspaceId: apiKeyData?.workspace.toString(),
            acceptedRoles,
            acceptedStatuses
        });
        
        req.apiKeyData = '' // ??
        
        next();
    }
}

export default requireAPIKeyDataAuth;