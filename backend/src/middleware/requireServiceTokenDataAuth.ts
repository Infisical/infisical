import { Request, Response, NextFunction } from 'express';
import { ServiceToken, ServiceTokenData } from '../models';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError, UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireServiceTokenDataAuth = ({
    acceptedRoles,
    location = 'params'
}: {
    acceptedRoles: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { serviceTokenDataId } = req[location];

        const serviceTokenData = await ServiceTokenData
            .findById(req[location].serviceTokenDataId)
            .select('+encryptedKey +iv +tag').populate('user');

        if (!serviceTokenData) {
            return next(AccountNotFoundError({ message: 'Failed to locate service token data' }));
        }

        if (req.user) {
            // case: jwt auth
            await validateMembership({
                userId: req.user._id,
                workspaceId: serviceTokenData.workspace,
                acceptedRoles
            });
        }

        req.serviceTokenData = serviceTokenData;

        next();
    }
}

export default requireServiceTokenDataAuth;