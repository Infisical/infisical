import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError } from '../utils/errors';
import { Secret, Membership } from '../models';
import { validateClientForSecrets } from '../helpers/secrets';

const requireSecretsAuth = ({
    acceptedRoles,
    requiredPermissions = []
}: {
    acceptedRoles: string[];
    requiredPermissions?: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let secretIds = [];
        if (Array.isArray(req.body.secrets)) {
            secretIds = req.body.secrets.map((s: any) => s.id);
        } else if (typeof req.body.secrets === 'object') {
            secretIds = [req.body.secrets.id];
        } else if (Array.isArray(req.body.secretIds)) {
            secretIds = req.body.secretIds;
        } else if (typeof req.body.secretIds === 'string') {
            secretIds = [req.body.secretIds];
        }

        req.secrets = await validateClientForSecrets({
            authData: req.authData,
            secretIds: [req.body.secretIds],
            requiredPermissions
        });
    
        return next();
    }
}

export default requireSecretsAuth;