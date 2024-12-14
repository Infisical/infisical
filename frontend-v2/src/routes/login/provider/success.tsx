import { useEffect } from "react";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { createFileRoute, useSearch } from "@tanstack/react-router";

const LoginProviderSuccess = () => {
  const search = useSearch({ from: "/login/provider/success" });

  useEffect(() => {
    SecurityClient.setProviderAuthToken(search.token);
    window.close();
  }, []);

  return <div />;
};

export const Route = createFileRoute("/login/provider/success")({
  component: LoginProviderSuccess
});
