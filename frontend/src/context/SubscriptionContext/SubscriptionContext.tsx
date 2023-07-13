import { createContext, ReactNode, useContext, useMemo } from "react";

import { useGetOrgSubscription } from "@app/hooks/api";
import { SubscriptionPlan } from "@app/hooks/api/types";

import { useOrganization } from "../OrganizationContext";

type TSubscriptionContext = {
  subscription?: SubscriptionPlan;
  isLoading: boolean;
};

const SubscriptionContext = createContext<TSubscriptionContext | null>(null);

type Props = {
  children: ReactNode;
};

export const SubscriptionProvider = ({ children }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();

  const { data, isLoading } = useGetOrgSubscription({
    orgID: currentOrg?._id || ""
  });

  // memorize the workspace details for the context
  const value = useMemo<TSubscriptionContext>(
    () => ({
      subscription: data,
      isLoading
    }),
    [data, isLoading]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription has to be used within <SubscriptionContext.Provider>");
  }

  return ctx;
};
