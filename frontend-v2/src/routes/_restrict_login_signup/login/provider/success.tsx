import { useEffect } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";

import SecurityClient from "@app/components/utilities/SecurityClient";

const LoginProviderSuccess = () => {
  const search = useSearch({ from: "/login/provider/success" });

  useEffect(() => {
    SecurityClient.setProviderAuthToken(search.token);
    window.close();
  }, []);

  return <div />;
};

export const Route = createFileRoute("/_restrict_login_signup/login/provider/success")({
  component: LoginProviderSuccess
});
