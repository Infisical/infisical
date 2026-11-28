// What Billing reads from the instance's configuration, passed in so services never read env themselves.
export type TBillingConfig = {
  // Cloud orgs each have a self-serve subscription. Self-hosted billing is read-only and managed by Infisical.
  isCloud: boolean;
  // Where Stripe sends the buyer back to; unset makes every checkout fail.
  siteUrl: string | undefined;
};
