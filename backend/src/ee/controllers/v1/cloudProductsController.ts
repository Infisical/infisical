import { Request, Response } from 'express';
import { EELicenseService } from '../../services';
import { getLicenseServerUrl } from '../../../config';
import { licenseServerKeyRequest } from '../../../config/request';

/**
 * Return available cloud product information.
 * Note: Nicely formatted to easily construct a table from
 * @param req 
 * @param res 
 * @returns 
 */
export const getCloudProducts = async (req: Request, res: Response) => {
    const billingCycle = req.query['billing-cycle'] as string;

    if (EELicenseService.instanceType === 'cloud') {
        const { data } = await licenseServerKeyRequest.get(
            `${await getLicenseServerUrl()}/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
        ); 

        return res.status(200).send(data);
    }
    
    return res.status(200).send({
        head: [],
        rows: []
    });
}
