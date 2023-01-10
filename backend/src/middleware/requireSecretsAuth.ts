import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError } from '../utils/errors';
import { Secret, Membership } from '../models';
import { validateSecrets } from '../helpers/secret';

// TODO: make this work for delete route

const requireSecretsAuth = ({
    acceptedRoles
}: {
    acceptedRoles: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let secrets;
        try {
            if (Array.isArray(req.body.secrets)) {
                // case: validate multiple secrets
                secrets = await validateSecrets({
                    userId: req.user._id.toString(),
                    secretIds: req.body.secrets.map((s: any) => s.id)
                });
            } else if (typeof req.body.secrets === 'object') { // change this to check for object
                // case: validate 1 secret
                secrets = await validateSecrets({
                    userId: req.user._id.toString(),
                    secretIds: req.body.secrets.id
                });
            } else if (Array.isArray(req.body.secretIds)) {
                secrets = await validateSecrets({
                    userId: req.user._id.toString(),
                    secretIds: req.body.secretIds
                });
            } else if (typeof req.body.secretIds === 'string') {
                // case: validate secretIds
                secrets = await validateSecrets({
                    userId: req.user._id.toString(),
                    secretIds: [req.body.secretIds]
                });
            }
            
            req.secrets = secrets;
            return next();
        } catch (err) {
            return next(UnauthorizedRequestError({ message: 'Unable to authenticate secret(s)' }));
        }
    }
}

export default requireSecretsAuth;