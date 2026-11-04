import { useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

export const useV4AppTheme = () => {
  const { resolvedTheme } = useTheme();
  const override = useRouterState({
    select: (state): unknown => (state.location.search as { theme?: unknown }).theme
  });
  return override === "light" || override === "dark" ? override : resolvedTheme;
};
