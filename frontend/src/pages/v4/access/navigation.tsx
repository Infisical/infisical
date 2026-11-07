import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { RowLink } from "@app/components/v4/ui/row-link";

import { useResolveV4Href } from "../resolveV4Href";

export const useGo = () => {
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  return (href: string) => navigate({ href: resolve(href) });
};

export const AccessRowLink = ({
  href,
  title,
  children
}: {
  href?: string;
  title?: string;
  children: ReactNode;
}) => {
  const resolve = useResolveV4Href();
  const [path, query] = href ? resolve(href).split("?") : [];
  return (
    <RowLink
      to={path as never}
      search={(query ? Object.fromEntries(new URLSearchParams(query)) : undefined) as never}
      disabled={!href}
      title={title}
    >
      {children}
    </RowLink>
  );
};
