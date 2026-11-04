import { useNavigate, useRouterState } from "@tanstack/react-router";

export const useClearThemeOverride = () => {
  const navigate = useNavigate();
  const hasOverride = useRouterState({
    select: (state) => "theme" in (state.location.search as Record<string, unknown>)
  });
  return () => {
    if (!hasOverride) return;
    navigate({
      to: ".",
      search: ((previous: Record<string, unknown>) => {
        const { theme: _theme, ...rest } = previous;
        return rest;
      }) as never,
      replace: true
    });
  };
};
