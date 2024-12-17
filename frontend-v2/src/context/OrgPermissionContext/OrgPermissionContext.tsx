import { useRouteContext } from "@tanstack/react-router";

export const useOrgPermission = () => {
  const ctx = useRouteContext({
    from: "/_authenticate/_org_details",
    select: (el) => el.orgPermission
  });

  return ctx;
};
