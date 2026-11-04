import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import axios from "axios";
import { z } from "zod";

import { SessionStorageKeys } from "@app/const";

import { CliRedirectPage } from "./CliRedirectPage";

const CliRedirectPageQueryParamsSchema = z.object({
  org_id: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/cli-redirect")({
  component: CliRedirectPage,
  validateSearch: zodValidator(CliRedirectPageQueryParamsSchema),
  beforeLoad: async () => {
    const cliTerminalTokenInfo = sessionStorage.getItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    if (!cliTerminalTokenInfo) return;

    try {
      const { expiry, data, callbackPort } = JSON.parse(cliTerminalTokenInfo);
      if (new Date() > new Date(expiry)) {
        sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
        return;
      }

      if (!callbackPort) return;

      const payload = JSON.parse(window.atob(data));
      const instance = axios.create();
      await instance.post(`http://127.0.0.1:${callbackPort}/`, payload);

      // POST succeeded — clear the token so the page shows the success message
      sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);
    } catch {
      // POST failed — token stays in session storage so the page shows the fallback UI
    }
  }
});
