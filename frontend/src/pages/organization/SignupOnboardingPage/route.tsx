import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { SignupOnboardingPage } from "./SignupOnboardingPage";

const SignupOnboardingPageQueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined)
});

export const Route = createFileRoute("/_authenticate/organizations/onboarding")({
  component: SignupOnboardingPage,
  validateSearch: zodValidator(SignupOnboardingPageQueryParamsSchema),
  beforeLoad: ({ location }) => handoffToV4(location),
  search: {
    middlewares: [stripSearchParams({ callback_port: undefined })]
  }
});
