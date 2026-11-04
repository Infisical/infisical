import { Outlet } from "@tanstack/react-router";

import { V4Scope } from "@app/components/v4/scope";
import "@app/components/v4/v4.css";

import { useV4AppTheme } from "./useV4Theme";

export const V4Root = () => (
  <V4Scope className="flex h-dvh flex-col overflow-clip" theme={useV4AppTheme()}>
    <Outlet />
  </V4Scope>
);
