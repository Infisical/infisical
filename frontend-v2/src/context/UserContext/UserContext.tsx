import { useRouteContext } from "@tanstack/react-router";

export const useUser = () => {
  const user = useRouteContext({ from: "/_authenticate", select: (el) => el.user })!;

  return { user };
};
