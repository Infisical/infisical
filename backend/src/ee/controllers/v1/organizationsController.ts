import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { getOrganizationPlanHelper } from '../../helpers/organizations';

export const getOrganizationPlan = async (req: Request, res: Response) => {
    const { organizationId } = req.params;

    const plan = await getOrganizationPlanHelper({
        organizationId: new Types.ObjectId(organizationId)
    });
    
    return res.status(200).send({
        plan
    });
}