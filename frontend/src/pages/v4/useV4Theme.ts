import { useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

export const useV4AppTheme = () => {
  const { resolvedTheme } = useTheme();
  const override = useRouterState({
    select: (state): string | undefined => {
      const value = (state.location.search as { theme?: unknown }).theme;
      return typeof value === "string" ? value : undefined;
    }
  });
  return override === "light" || override === "dark" ? override : resolvedTheme;
};
