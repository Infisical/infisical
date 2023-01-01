import { Request, Response } from 'express';

/**
 * Return user on request
 * @param req
 * @param res
 * @returns
 */
export const getUser = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};
