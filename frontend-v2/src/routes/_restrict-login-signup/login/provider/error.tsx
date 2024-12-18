import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

const LoginProviderError = () => {
  useEffect(() => {
    window.localStorage.setItem("PROVIDER_AUTH_ERROR", "err");
    window.close();
  }, []);

  return <div />;
};

export const Route = createFileRoute("/_restrict-login-signup/login/provider/error")({
  component: LoginProviderError
});
