import { createFileRoute, redirect, useRouteContext } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { WelcomePage } from "./WelcomePage";

const WelcomeRoute = () => {
  const { organizationId } = useRouteContext({
    from: "/_authenticate/_inject-org-details/admin/welcome"
  });

  return <WelcomePage organizationId={organizationId} />;
};

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/welcome")({
  component: WelcomeRoute,
  beforeLoad: async ({ context, location }) => {
    if (!context.user.superAdmin) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: context.organizationId }
      });
    }
    await handoffToV4(location);
  }
});
