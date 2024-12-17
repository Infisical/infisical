import { useRouteContext } from "@tanstack/react-router";

export const useOrganization = () => {
  const currentOrg = useRouteContext({
    from: "/_authenticate/_org_details",
    select: (el) => el.organization
  });

  return { currentOrg };
};
