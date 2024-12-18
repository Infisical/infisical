import { useEffect } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import SecurityClient from "@app/components/utilities/SecurityClient";

const LoginProviderSuccess = () => {
  const search = useSearch({
    from: "/_restrict_login_signup/login/provider/success"
  });

  useEffect(() => {
    SecurityClient.setProviderAuthToken(search.token);
    window.close();
  }, []);

  return <div />;
};

const LoginProviderSuccessQuerySchema = z.object({
  token: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/login/provider/success")({
  component: LoginProviderSuccess,
  validateSearch: zodValidator(LoginProviderSuccessQuerySchema)
});
