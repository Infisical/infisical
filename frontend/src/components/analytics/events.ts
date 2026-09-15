export const PAYWALL_EVENTS = {
  Viewed: "Paywall Viewed",
  UpgradeClicked: "Paywall Upgrade Clicked"
} as const;

export const BILLING_EVENTS = {
  CheckoutStarted: "Billing Checkout Started",
  CheckoutCompleted: "Billing Checkout Completed",
  CheckoutCanceled: "Billing Checkout Canceled",
  SubscriptionUpdated: "Billing Subscription Updated",
  SubscriptionUpgraded: "Billing Subscription Upgraded"
} as const;

export const organizationTelemetryProperties = (orgId: string) => ({
  orgId,
  $groups: { organization: orgId }
});
