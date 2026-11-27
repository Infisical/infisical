import { Toaster } from "@infisical/cipher/ui/sonner";
import { Outlet, useRouteContext } from "@tanstack/react-router";

export const usePublicSecretSharing = () =>
  useRouteContext({ from: "/v4/_v4-public", select: (context) => context.publicAdapter });

export const PublicLayout = () => (
  <>
    <Outlet />
    <Toaster />
  </>
);
