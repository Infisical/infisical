import { Outlet, useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { V4Scope } from "@app/components/v4/scope";
import "@app/components/v4/v4.css";

export const V4Root = () => {
  const { resolvedTheme } = useTheme();
  const theme = useRouterState({
    select: (state): string | undefined => {
      const value = (state.location.search as { theme?: unknown }).theme;
      return typeof value === "string" ? value : undefined;
    }
  });
  return (
    <V4Scope
      className="flex h-dvh flex-col overflow-clip"
      theme={theme === "light" || theme === "dark" ? theme : resolvedTheme}
    >
      <Outlet />
    </V4Scope>
  );
};
