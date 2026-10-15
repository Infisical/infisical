import { createPassthroughSessionHandler } from "../passthrough/pam-passthrough-session-handler";

export const handleBrowserSession = createPassthroughSessionHandler({
  logLabel: "browser session",
  displayName: "Browser"
});
