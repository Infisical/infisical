import { Navigate, useLocation } from "@tanstack/react-router";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";

export const NotPortedPage = () => {
  const { pathname } = useLocation();
  const scanningIndex = pathname.match(/^\/v4\/organizations\/([^/]+)\/secret-scanning\/?$/);
  if (scanningIndex)
    return (
      <Navigate
        to="/v4/organizations/$orgId/secret-scanning/data-sources"
        params={{ orgId: scanningIndex[1] }}
        replace
      />
    );
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>This page isn&apos;t in v4 yet</EmptyTitle>
        <EmptyDescription>
          {pathname.replace(/^\/v4/, "")} hasn&apos;t been ported to the new app. The demo shows the
          pages that have.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};
