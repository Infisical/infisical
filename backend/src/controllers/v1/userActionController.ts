import { Request, Response } from 'express';
import { UserAction } from '../../models';

/**
 * Add user action [action]
 * @param req
 * @param res
 * @returns
 */
export const addUserAction = async (req: Request, res: Response) => {
	// add/record new action [action] for user with id [req.user._id]

  const { action } = req.body;

  const userAction = await UserAction.findOneAndUpdate(
    {
      user: req.user._id,
      action
    },
    { user: req.user._id, action },
    {
      new: true,
      upsert: true
    }
  );

	return res.status(200).send({
		message: 'Successfully recorded user action',
		userAction
	});
};

/**
 * Return user action [action] for user
 * @param req
 * @param res
 * @returns
 */
export const getUserAction = async (req: Request, res: Response) => {
	// get user action [action] for user with id [req.user._id]
  const action: string = req.query.action as string;

  const userAction = await UserAction.findOne({
    user: req.user._id,
    action
  });

	return res.status(200).send({
		userAction
	});
};
