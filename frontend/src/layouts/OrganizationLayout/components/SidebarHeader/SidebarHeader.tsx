import { useOrganization, useSubscription } from "@app/context";
import { getSubscriptionPlanLabel } from "@app/hooks/api/subscriptions";

export const SidebarHeader = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  return (
    <div className="flex w-full items-center justify-center rounded-md border border-border p-1 transition-all duration-150 hover:bg-container-hover">
      <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-md bg-project">
        {currentOrg?.name.charAt(0)}
      </div>
      <div className="flex grow flex-col text-foreground">
        <div className="max-w-36 truncate text-sm font-medium text-ellipsis capitalize">
          {currentOrg?.name}
        </div>
        <div className="text-xs text-muted">{getSubscriptionPlanLabel(subscription, " Plan")}</div>
      </div>
    </div>
  );
};
