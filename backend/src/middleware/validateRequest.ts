import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { validationResult } from 'express-validator';

/**
 * Validate intended inputs on [req] via express-validator
 * @param req - express request object
 * @param res - express response object
 * @param next - express next function
 * @returns
 */
const validate = (req: Request, res: Response, next: NextFunction) => {
	// express validator middleware

	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}

		return next();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(401).send({
			error: "Looks like you're unauthenticated . Try logging in"
		});
	}
};

export default validate;
