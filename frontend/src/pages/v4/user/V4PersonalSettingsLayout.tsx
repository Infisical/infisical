import { type ReactNode, useEffect } from "react";
import { Outlet, useRouteContext } from "@tanstack/react-router";

import { analytics } from "@app/lib/analytics";

import { V4SessionContext } from "../data/session/contract";
import { demoSession } from "../data/session/demo";
import { LiveSessionProvider } from "../data/session/live";
import { V4Shell } from "../shell/V4Shell";

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { v4Mode, organizationId } = useRouteContext({ from: "/v4/personal-settings" });
  if (v4Mode === "demo") {
    return <V4SessionContext value={demoSession}>{children}</V4SessionContext>;
  }
  return <LiveSessionProvider organizationId={organizationId!}>{children}</LiveSessionProvider>;
};

export const V4PersonalSettingsLayout = () => {
  const { v4Mode } = useRouteContext({ from: "/v4/personal-settings" });
  useEffect(() => {
    if (v4Mode !== "live") return undefined;
    analytics.registerUiVersion("v4");
    return () => analytics.unregisterUiVersion();
  }, [v4Mode]);
  return (
    <SessionProvider>
      <V4Shell nav={{ crumbs: [{ label: "Personal settings" }] }}>
        <Outlet />
      </V4Shell>
    </SessionProvider>
  );
};
