import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { V4Scope } from "@app/components/v4/scope";
import "@app/components/v4/v4.css";

import { V4PageLoader } from "./V4PageLoader";

const V4Root = () => {
  const { resolvedTheme } = useTheme();
  return (
    <V4Scope className="flex h-dvh flex-col overflow-clip" theme={resolvedTheme}>
      <Outlet />
    </V4Scope>
  );
};

export const Route = createFileRoute("/v4")({
  component: V4Root,
  pendingComponent: V4PageLoader
});
