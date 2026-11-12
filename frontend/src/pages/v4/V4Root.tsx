import { V4Scope } from "@infisical/cipher/scope";
import { Outlet } from "@tanstack/react-router";

import "@app/pages/v4/cipher.css";

import { V4RouterProvider } from "./cipher-router";
import { useV4AppTheme } from "./useV4Theme";

export const V4Root = () => (
  <V4Scope className="flex h-dvh flex-col overflow-clip" theme={useV4AppTheme()}>
    <V4RouterProvider>
      <Outlet />
    </V4RouterProvider>
  </V4Scope>
);
