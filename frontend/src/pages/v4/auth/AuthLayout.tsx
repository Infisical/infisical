import { Outlet } from "@tanstack/react-router";

import { Toaster } from "@app/components/v4/ui/sonner";

export const AuthLayout = () => (
  <>
    <Outlet />
    <Toaster />
  </>
);
