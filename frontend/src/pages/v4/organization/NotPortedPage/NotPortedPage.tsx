import { useLocation } from "@tanstack/react-router";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";

export const NotPortedPage = () => {
  const { pathname } = useLocation();
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
