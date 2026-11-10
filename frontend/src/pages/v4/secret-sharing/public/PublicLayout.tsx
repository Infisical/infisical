import { Outlet, useRouteContext } from "@tanstack/react-router";

import { Toaster } from "@app/components/v4/ui/sonner";

export const usePublicSecretSharing = () =>
  useRouteContext({ from: "/v4/_v4-public", select: (context) => context.publicAdapter });

export const PublicLayout = () => (
  <>
    <Outlet />
    <Toaster />
  </>
);
