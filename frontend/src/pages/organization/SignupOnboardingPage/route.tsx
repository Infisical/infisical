import { createFileRoute } from "@tanstack/react-router";

import { SignupOnboardingPage } from "./SignupOnboardingPage";

export const Route = createFileRoute("/_authenticate/organizations/onboarding")({
  component: SignupOnboardingPage
});
