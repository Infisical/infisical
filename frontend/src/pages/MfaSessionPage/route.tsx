import { createFileRoute } from "@tanstack/react-router";

import { MfaSessionPage } from "./MfaSessionPage";

export const Route = createFileRoute("/_authenticate/mfa-session/$mfaSessionId")({
  component: MfaSessionPage
});
