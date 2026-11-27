import { createFileRoute } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { MfaSessionPage } from "./MfaSessionPage";

export const Route = createFileRoute("/_authenticate/mfa-session/$mfaSessionId")({
  component: MfaSessionPage,
  beforeLoad: ({ location }) => handoffToV4(location)
});
