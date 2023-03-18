import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripeSecretKey, getStripeWebhookSecret } from '../../../config';

/**
 * Handle service provisioning/un-provisioning via Stripe
 * @param req
 * @param res
 * @returns
 */
export const handleWebhook = async (req: Request, res: Response) => {
	let event;
	try {
		const stripe = new Stripe(getStripeSecretKey(), {
			apiVersion: '2022-08-01'
		});

		// check request for valid stripe signature
		const sig = req.headers['stripe-signature'] as string;
		event = stripe.webhooks.constructEvent(
			req.body,
			sig,
			getStripeWebhookSecret()
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed to process webhook'
		});
	}

	switch (event.type) {
		case '':
			break;
		default:
	}

	return res.json({ received: true });
};
