import infisical from 'infisical-node';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import Stripe from 'stripe';

/**
 * Handle service provisioning/un-provisioning via Stripe
 * @param req
 * @param res
 * @returns
 */
export const handleWebhook = async (req: Request, res: Response) => {
	let event;
	try {
		// check request for valid stripe signature
		const stripe = new Stripe(infisical.get('STRIPE_SECRET_KEY')!, {
			apiVersion: '2022-08-01'
		});

		const sig = req.headers['stripe-signature'] as string;
		event = stripe.webhooks.constructEvent(
			req.body,
			sig,
			infisical.get('STRIPE_WEBHOOK_SECRET')!
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
