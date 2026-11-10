import { useEffect } from "react";
import { Outlet, useRouteContext } from "@tanstack/react-router";

import { analytics } from "@app/lib/analytics";

import { V4SessionContext } from "../data/session/contract";
import { demoSession } from "../data/session/demo";
import { LiveSessionProvider } from "../data/session/live";

export const V4AdminRoot = () => {
  const { v4Mode, organizationId } = useRouteContext({ from: "/v4/admin" });
  useEffect(() => {
    if (v4Mode !== "live") return undefined;
    analytics.registerUiVersion("v4");
    return () => analytics.unregisterUiVersion();
  }, [v4Mode]);
  if (v4Mode === "demo") {
    return (
      <V4SessionContext value={demoSession}>
        <Outlet />
      </V4SessionContext>
    );
  }
  return (
    <LiveSessionProvider organizationId={organizationId}>
      <Outlet />
    </LiveSessionProvider>
  );
};
