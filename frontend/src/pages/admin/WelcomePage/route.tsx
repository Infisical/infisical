import { createFileRoute, redirect, useRouteContext } from "@tanstack/react-router";

import { WelcomePage } from "./WelcomePage";

const WelcomeRoute = () => {
  const { organizationId } = useRouteContext({
    from: "/_authenticate/_inject-org-details/admin/welcome"
  });

  return <WelcomePage organizationId={organizationId} />;
};

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/welcome")({
  component: WelcomeRoute,
  beforeLoad: ({ context }) => {
    if (!context.user.superAdmin) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: context.organizationId }
      });
    }
  }
});
