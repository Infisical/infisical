import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignupOnboardingPage } from "./SignupOnboardingPage";

const SignupOnboardingPageQueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined)
});

export const Route = createFileRoute("/_authenticate/organizations/onboarding")({
  component: SignupOnboardingPage,
  validateSearch: zodValidator(SignupOnboardingPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ callback_port: undefined })]
  }
});
