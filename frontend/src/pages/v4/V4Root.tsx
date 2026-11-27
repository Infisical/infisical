import { CipherScope } from "@infisical/cipher/scope";
import { Outlet } from "@tanstack/react-router";

import "@app/pages/v4/cipher.css";

import { V4RouterProvider } from "./cipher-router";
import { useV4AppTheme } from "./useV4Theme";

import "@infisical/cipher/fonts.css";

export const V4Root = () => (
  <CipherScope className="flex h-dvh flex-col overflow-clip" theme={useV4AppTheme()}>
    <V4RouterProvider>
      <Outlet />
    </V4RouterProvider>
  </CipherScope>
);
