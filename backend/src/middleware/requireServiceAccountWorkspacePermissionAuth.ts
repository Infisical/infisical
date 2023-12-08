import { NextFunction, Request, Response } from "express";
import { ServiceAccount, ServiceAccountWorkspacePermission } from "../models";
import {
    ServiceAccountNotFoundError,
} from "../utils/errors";
import {
    validateMembershipOrg,
} from "../helpers/membershipOrg";

type req = "params" | "body" | "query";

const requireServiceAccountWorkspacePermissionAuth = ({
    acceptedRoles,
    acceptedStatuses,
    location = "params",
}: {
    acceptedRoles: Array<"owner" | "admin" | "member">;
	acceptedStatuses: Array<"invited" | "accepted">;
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const serviceAccountWorkspacePermissionId = req[location].serviceAccountWorkspacePermissionId;
        const serviceAccountWorkspacePermission = await ServiceAccountWorkspacePermission.findById(serviceAccountWorkspacePermissionId);

        if (!serviceAccountWorkspacePermission) {
            return next(ServiceAccountNotFoundError({ message: "Failed to locate Service Account workspace permission" }));
        }
        
        const serviceAccount = await ServiceAccount.findById(serviceAccountWorkspacePermission.serviceAccount);

        if (!serviceAccount) {
            return next(ServiceAccountNotFoundError({ message: "Failed to locate Service Account" }));
        }
        
        if (serviceAccount.user.toString() !== req.user.id.toString()) {
            // case: creator of the service account is different from
            // the user on the request -> apply middleware role/status validation
            await validateMembershipOrg({
                userId: req.user._id,
                organizationId: serviceAccount.organization,
                acceptedRoles,
                acceptedStatuses,
            });
        }
        
        req.serviceAccount = serviceAccount;
        
        next();
    }
}

export default requireServiceAccountWorkspacePermissionAuth;