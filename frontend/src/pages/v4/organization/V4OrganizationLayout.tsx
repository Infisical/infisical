import { type ReactNode, useEffect } from "react";
import { Outlet, useRouteContext } from "@tanstack/react-router";

import { analytics } from "@app/lib/analytics";

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
    analytics.registerUiVersion("v4");
    return () => analytics.unregisterUiVersion();
  }, [v4Mode]);
  return (
    <SessionProvider>
      <V4Shell>
        <Outlet />
      </V4Shell>
    </SessionProvider>
  );
};
