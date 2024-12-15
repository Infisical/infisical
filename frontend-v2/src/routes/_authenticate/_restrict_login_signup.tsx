import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticate/_restrict_login_signup")({
  beforeLoad: ({ context }) => {
    if (context.isAuthenticated) {
      redirect({
        throw: true,
        to: "/organization/$organizationId/secret-manager",
        params: {
          organizationId: context.organizationId
        }
      });
    }
  }
});
