import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ServiceToken, ServiceTokenData } from '../models';
import { validateClientForServiceTokenData } from '../helpers/serviceTokenData';
import { validateMembership } from '../helpers/membership';
import { AccountNotFoundError, UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

const requireServiceTokenDataAuth = ({
    acceptedRoles,
    location = 'params'
}: {
    acceptedRoles: Array<'admin' | 'member'>;
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { serviceTokenDataId } = req[location];
        
        req.serviceTokenData = await validateClientForServiceTokenData({
            authData: req.authData,
            serviceTokenDataId: new Types.ObjectId(serviceTokenDataId),
            acceptedRoles
        });

        next();
    }
}

export default requireServiceTokenDataAuth;