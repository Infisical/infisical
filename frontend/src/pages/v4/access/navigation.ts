import { useNavigate } from "@tanstack/react-router";

import { useResolveV4Href } from "../resolveV4Href";

export const useGo = () => {
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  return (href: string) => navigate({ href: resolve(href) });
};
