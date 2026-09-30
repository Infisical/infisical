import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { useOrganization } from "@app/context";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";
import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import { UpgradeGate } from "./UpgradeGate";
import { UpgradeIntent, UpgradeReturnTarget } from "./upgrade-intents";

type UpgradeRequest = {
  intent: UpgradeIntent;
  returnTarget?: UpgradeReturnTarget;
  paywallKey: string;
  isEntitled: (subscription: SubscriptionPlan) => boolean;
  onGranted: () => void | Promise<void>;
  failureMessage: string;
};

export const useUpgradeGate = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<UpgradeRequest | null>(null);

  const completeUpgradeRequest = useCallback(
    async (activeRequest: UpgradeRequest) => {
      const refreshSubscription = async (attempt = 0): Promise<void> => {
        const refreshedSubscription = await fetchOrgSubscription(currentOrg.id, true);
        queryClient.setQueryData(
          subscriptionQueryKeys.getOrgSubsription(currentOrg.id),
          refreshedSubscription
        );

        if (activeRequest.isEntitled(refreshedSubscription)) {
          setRequest(null);
          await activeRequest.onGranted();
          return;
        }

        if (attempt < 4) {
          await new Promise((resolve) => {
            setTimeout(resolve, 1000);
          });
          await refreshSubscription(attempt + 1);
          return;
        }

        createNotification({
          type: "info",
          text: "Your trial is still being activated. Try this action again in a moment."
        });
      };

      try {
        await refreshSubscription();
      } catch {
        createNotification({ type: "error", text: activeRequest.failureMessage });
      }
    },
    [currentOrg.id, queryClient]
  );

  const openUpgradeGate = useCallback((nextRequest: UpgradeRequest) => {
    setRequest(nextRequest);
  }, []);

  const upgradeGate = request ? (
    <UpgradeGate
      intent={request.intent}
      returnTarget={request.returnTarget}
      paywallKey={request.paywallKey}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) setRequest(null);
      }}
      onGranted={() => completeUpgradeRequest(request)}
    />
  ) : null;

  return { openUpgradeGate, upgradeGate, resumeUpgradeGate: completeUpgradeRequest };
};
