import { useEffect } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

import { Empty, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";
import { Loader } from "@app/components/v4/ui/loader";

import { useV4Mode } from "../../data/adapters";
import { V4NotFoundPage } from "../../V4NotFoundPage";

export const NotPortedPage = () => {
  const router = useRouter();
  const location = useLocation();
  const live = useV4Mode() === "live";
  const v3Exists = !router
    .matchRoutes({ ...location, pathname: location.pathname.replace(/^\/v4/, "") })
    .some((match) => match.globalNotFound);
  const redirecting = live && v3Exists;
  useEffect(() => {
    if (redirecting) router.history.replace(location.href.replace(/^\/v4/, ""));
  }, [redirecting, router, location.href]);
  if (!v3Exists) return <V4NotFoundPage />;
  if (redirecting) return <Loader size="page" label="Loading" />;
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>This page isn&apos;t in v4 yet</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
};
