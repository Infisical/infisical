import { createFileRoute } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { NoOrgPage } from "./NoOrgPage";

export const Route = createFileRoute("/_authenticate/organizations/none")({
  component: NoOrgPage,
  beforeLoad: ({ location }) => handoffToV4(location)
});
