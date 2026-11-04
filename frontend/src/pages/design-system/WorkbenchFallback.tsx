import { Navigate, useParams } from "@tanstack/react-router";

import { fallbackLink } from "./navigation";

export const WorkbenchFallback = () => {
  const { _splat: splat } = useParams({ from: "/design-system/$" });
  return <Navigate {...(fallbackLink(splat ?? "") as Parameters<typeof Navigate>[0])} replace />;
};
