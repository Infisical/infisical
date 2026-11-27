import { useRouteContext } from "@tanstack/react-router";

export const useAuthPreview = () =>
  useRouteContext({ from: "/v4/_v4-auth", select: (context) => context.authPreview });
