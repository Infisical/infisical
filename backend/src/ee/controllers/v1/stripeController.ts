import { Request, Response } from "express";
import Stripe from "stripe";
import { getStripeSecretKey, getStripeWebhookSecret } from "../../../config";

/**
 * Handle service provisioning/un-provisioning via Stripe
 * @param req
 * @param res
 * @returns
 */
export const handleWebhook = async (req: Request, res: Response) => {
  const stripe = new Stripe(await getStripeSecretKey(), {
    apiVersion: "2022-08-01",
  });

  // check request for valid stripe signature
  const sig = req.headers["stripe-signature"] as string;
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    await getStripeWebhookSecret()
  );

	switch (event.type) {
		case "":
			break;
		default:
	}

	return res.json({ received: true });
};
