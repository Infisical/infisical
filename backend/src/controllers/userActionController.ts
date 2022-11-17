import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { UserAction } from '../models';

/**
 * Add user action [action]
 * @param req
 * @param res
 * @returns
 */
export const addUserAction = async (req: Request, res: Response) => {
	// add/record new action [action] for user with id [req.user._id]

	let userAction;
	try {
		const { action } = req.body;

		userAction = await UserAction.findOneAndUpdate(
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
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to record user action'
		});
	}

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
	let userAction;
	try {
		const action: string = req.query.action as string;

		userAction = await UserAction.findOne({
			user: req.user._id,
			action
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get user action'
		});
	}

	return res.status(200).send({
		userAction
	});
};
