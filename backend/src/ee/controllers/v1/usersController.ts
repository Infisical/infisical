import { Request, Response } from "express";

/**
 * Return the ip address of the current user
 * @param req 
 * @param res 
 * @returns 
 */
export const getMyIp = (req: Request, res: Response) => {
    return res.status(200).send({
        ip: req.authData.ipAddress
    });
}