export type GetSubscriptionPlan = {
  data: { plan: SubscriptionPlan }[];
};

export type SubscriptionPlan = {
  id: string;
  object: string;
  active: boolean;
  aggregate_usage: unknown;
  amount: 1400;
  amount_decimal: 1400;
  billing_scheme: string;
  created: 1674833546;
  currency: string;
  interval: string;
  interval_count: 1;
  livemode: false;
  metadata: {};
  nickname: null;
  product: string;
  tiers_mode: unknown;
  transform_usage: unknown;
  trial_period_days: unknown;
  usage_type: string;
};
