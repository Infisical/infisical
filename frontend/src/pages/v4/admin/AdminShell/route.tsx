import { createFileRoute } from "@tanstack/react-router";

import { V4AdminShell } from "../V4AdminShell";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell")({
  component: V4AdminShell
});
