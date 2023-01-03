import { Request, Response, NextFunction } from 'express';
import { ServiceToken, ServiceTokenData } from '../models';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError, UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireServiceTokenDataAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = 'params'
}: {
    acceptedRoles: string[];
    acceptedStatuses: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { serviceTokenDataId } = req[location];

        const serviceTokenData = await ServiceTokenData
            .findById(req[location].serviceTokenDataId)
            .select('+encryptedKey +iv +tag');

        if (!serviceTokenData) {
            return next(AccountNotFoundError({message: 'Failed to locate service token data'}));
        }

        if (req.user) {
            // case: jwt auth
            await validateMembership({
                userId: req.user._id.toString(),
                workspaceId: serviceTokenData.workspace.toString(),
                acceptedRoles,
                acceptedStatuses
            });
        }
        
        req.serviceTokenData = serviceTokenData;
        
        next();
    }
}

export default requireServiceTokenDataAuth;