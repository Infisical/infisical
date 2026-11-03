import { type ReactNode, useEffect } from "react";
import { Outlet, useRouteContext } from "@tanstack/react-router";

import { getPostHog } from "@app/components/analytics/posthog";

import { V4SessionContext } from "../data/session/contract";
import { demoSession } from "../data/session/demo";
import { LiveSessionProvider } from "../data/session/live";
import { V4Shell } from "../shell/V4Shell";

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const context = useRouteContext({ from: "/v4/organizations/$orgId" });
  if (context.v4Mode === "demo") {
    return <V4SessionContext value={demoSession}>{children}</V4SessionContext>;
  }
  return (
    <LiveSessionProvider organizationId={context.organizationId!}>{children}</LiveSessionProvider>
  );
};

export const V4OrganizationLayout = () => {
  const { v4Mode } = useRouteContext({ from: "/v4/organizations/$orgId" });
  useEffect(() => {
    if (v4Mode !== "live") return undefined;
    const posthog = getPostHog();
    posthog?.register({ ui_version: "v4" });
    return () => posthog?.unregister("ui_version");
  }, [v4Mode]);
  return (
    <SessionProvider>
      <V4Shell>
        <Outlet />
      </V4Shell>
    </SessionProvider>
  );
};
