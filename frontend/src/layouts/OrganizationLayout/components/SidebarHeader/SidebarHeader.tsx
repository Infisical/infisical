import { useOrganization, useSubscription } from "@app/context";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { SubscriptionPlan } from "@app/hooks/api/types";

const getPlan = (subscription: {
  get: <C extends SubscriptionProductCategory, K extends keyof SubscriptionPlan[C]>(
    category: C,
    featureKey: K
  ) => SubscriptionPlan[C][K] | undefined;
}) => {
  if (subscription.get(SubscriptionProductCategory.Platform, "groups")) return "Enterprise Plan";
  if (subscription.get(SubscriptionProductCategory.SecretManager, "pitRecovery")) return "Pro Plan";
  return "Free Plan";
};

export const SidebarHeader = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  return (
    <div className="flex w-full items-center justify-center rounded-md border border-mineshaft-600 p-1 transition-all duration-150 hover:bg-mineshaft-700">
      <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary">
        {currentOrg?.name.charAt(0)}
      </div>
      <div className="flex grow flex-col text-white">
        <div className="max-w-36 truncate text-sm font-medium text-ellipsis capitalize">
          {currentOrg?.name}
        </div>
        <div className="text-xs text-mineshaft-400">{getPlan(subscription)}</div>
      </div>
    </div>
  );
};
