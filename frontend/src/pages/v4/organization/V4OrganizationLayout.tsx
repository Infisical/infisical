import { useEffect } from "react";
import { Outlet, useRouteContext } from "@tanstack/react-router";

import { getPostHog } from "@app/components/analytics/posthog";

export const V4OrganizationLayout = () => {
  const { v4Mode } = useRouteContext({ from: "/v4/organizations/$orgId" });
  useEffect(() => {
    if (v4Mode !== "live") return undefined;
    const posthog = getPostHog();
    posthog?.register({ ui_version: "v4" });
    return () => posthog?.unregister("ui_version");
  }, [v4Mode]);
  return <Outlet />;
};
