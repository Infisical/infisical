import { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import { UnauthorizedRequestError, ValidationError } from "../utils/errors";

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
			return next(ValidationError({ context: { errors: `One or more of your parameters are invalid [error(s)=${(JSON.stringify(errors))}]` } }))
		}

		return next();
	} catch (err) {
		return next(UnauthorizedRequestError({ message: "Unauthenticated requests are not allowed. Try logging in" }))
	}
};

export default validate;
