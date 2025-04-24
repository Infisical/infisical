import { useOrganization, useSubscription } from "@app/context";
import { SubscriptionPlan } from "@app/hooks/api/types";

const getPlan = (subscription: SubscriptionPlan) => {
  if (subscription.groups) return "Enterprise Plan";
  if (subscription.pitRecovery) return "Pro Plan";
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
      <div className="flex flex-grow flex-col text-white">
        <div className="max-w-36 truncate text-ellipsis text-sm font-medium capitalize">
          {currentOrg?.name}
        </div>
        <div className="text-xs text-mineshaft-400">{getPlan(subscription)}</div>
      </div>
    </div>
  );
};
