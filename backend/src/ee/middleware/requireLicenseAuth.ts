import { Request, Response, NextFunction } from 'express';

/**
 * Validate if organization hosting meets license requirements to 
 * access a license-specific route.
 * @param {Object} obj
 * @param {String[]} obj.acceptedTiers
 */
const requireLicenseAuth = ({
    acceptedTiers
}: {
    acceptedTiers: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {

        } catch (err) {

        }
    }
}

export default requireLicenseAuth;