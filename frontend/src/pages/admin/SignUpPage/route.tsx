import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignUpPage } from "./SignUpPage";

export const Route = createFileRoute("/_restrict-login-signup/admin/signup")({
  component: SignUpPage,
  beforeLoad: ({ context }) => {
    if (context.serverConfig.initialized) {
      throw redirect({
        to: "/login"
      });
    }
  }
});
