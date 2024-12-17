import { useRouteContext } from "@tanstack/react-router";

export const useSubscription = () => {
  const subscription = useRouteContext({
    from: "/_authenticate/_org_details",
    select: (el) => el.subscription
  });

  return { subscription };
};
