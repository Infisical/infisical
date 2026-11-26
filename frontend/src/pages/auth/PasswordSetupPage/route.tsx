import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { PasswordSetupPage } from "./PasswordSetupPage";

const PasswordSetupPageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string()
});

export const Route = createFileRoute("/_authenticate/password-setup")({
  component: PasswordSetupPage,
  validateSearch: zodValidator(PasswordSetupPageQueryParamsSchema),
  beforeLoad: ({ location }) => handoffToV4(location)
});
