import { useLocation } from "@tanstack/react-router";

import { Empty, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";
import { hasV3Page, toV3Href } from "@app/helpers/v4Bridge";

import { useV4Mode } from "../../data/adapters";
import { V4NotFoundPage } from "../../V4NotFoundPage";

export const NotPortedPage = () => {
  const { pathname } = useLocation();
  const demo = useV4Mode() === "demo";
  if (!demo || !hasV3Page(toV3Href(pathname))) return <V4NotFoundPage />;
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>This page isn&apos;t in v4 yet</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
};
