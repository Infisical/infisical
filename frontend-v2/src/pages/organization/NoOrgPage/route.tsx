import { createFileRoute } from "@tanstack/react-router";
import { NoOrgPage } from "./NoOrgPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/none/"
)({
  component: NoOrgPage
});
