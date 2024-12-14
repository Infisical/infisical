import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const LoginProviderError = () => {
  useEffect(() => {
    window.localStorage.setItem("PROVIDER_AUTH_ERROR", "err");
    window.close();
  }, []);

  return <div />;
};

export const Route = createFileRoute("/login/provider/error")({
  component: LoginProviderError
});
