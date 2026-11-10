import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { EncryptionPage } from "./EncryptionPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/encryption")({
  staticData: { readiness: "none" },
  component: EncryptionPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
