import { Request, Response } from "express";
import { ServiceToken } from "../../models";
import { createToken } from "../../helpers/auth";
import { getJwtServiceSecret } from "../../config";

/**
 * Return service token on request
 * @param req
 * @param res
 * @returns
 */
export const getServiceToken = async (req: Request, res: Response) => {
	return res.status(200).send({
		serviceToken: req.serviceToken,
	});
};

/**
 * Create and return a new service token
 * @param req
 * @param res
 * @returns
 */
export const createServiceToken = async (req: Request, res: Response) => {
	let token;
	try {
		const {
			name,
			workspaceId,
			environment,
			expiresIn,
			publicKey,
			encryptedKey,
			nonce,
		} = req.body;

		// validate environment
		const workspaceEnvs = req.membership.workspace.environments;
		if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
			throw new Error("Failed to validate environment");
		}

		// compute access token expiration date
		const expiresAt = new Date();
		expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

		const serviceToken = await new ServiceToken({
			name,
			user: req.user._id,
			workspace: workspaceId,
			environment,
			expiresAt,
			publicKey,
			encryptedKey,
			nonce,
		}).save();

		token = createToken({
			payload: {
				serviceTokenId: serviceToken._id.toString(),
				workspaceId,
			},
			expiresIn: expiresIn,
			secret: await getJwtServiceSecret(),
		});
	} catch (err) {
		return res.status(400).send({
			message: "Failed to create service token",
		});
	}

	return res.status(200).send({
		token,
	});
};