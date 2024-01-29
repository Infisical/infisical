import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { validateClientForSecrets } from "../validation";

const requireSecretsAuth = ({
    acceptedRoles,
    requiredPermissions = [],
}: {
    acceptedRoles: string[];
    requiredPermissions?: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        let secretIds = [];
        if (Array.isArray(req.body.secrets)) {
            secretIds = req.body.secrets.map((s: any) => s.id);
        } else if (typeof req.body.secrets === "object") {
            secretIds = [req.body.secrets.id];
        } else if (Array.isArray(req.body.secretIds)) {
            secretIds = req.body.secretIds;
        } else if (typeof req.body.secretIds === "string") {
            secretIds = [req.body.secretIds];
        }

        req.secrets = await validateClientForSecrets({
            authData: req.authData,
            secretIds: secretIds.map((secretId: string) => new Types.ObjectId(secretId)),
            requiredPermissions,
        });
    
        return next();
    }
}

export default requireSecretsAuth;