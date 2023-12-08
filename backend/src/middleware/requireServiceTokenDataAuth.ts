import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { validateClientForServiceTokenData } from "../validation";

type req = "params" | "body" | "query";

const requireServiceTokenDataAuth = ({
    acceptedRoles,
    location = "params",
}: {
    acceptedRoles: Array<"admin" | "member">;
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { serviceTokenDataId } = req[location];
        
        req.serviceTokenData = await validateClientForServiceTokenData({
            authData: req.authData,
            serviceTokenDataId: new Types.ObjectId(serviceTokenDataId),
            acceptedRoles,
        });

        next();
    }
}

export default requireServiceTokenDataAuth;