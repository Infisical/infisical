import { createFileRoute } from "@tanstack/react-router";

import { AccountBlockedPage } from "./AccountBlockedPage";

export const Route = createFileRoute("/account-blocked")({
  component: AccountBlockedPage
});
