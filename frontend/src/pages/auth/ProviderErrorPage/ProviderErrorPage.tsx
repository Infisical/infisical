import { useEffect } from "react";

export const LoginProviderErrorPage = () => {
  useEffect(() => {
    window.localStorage.setItem("PROVIDER_AUTH_ERROR", "err");
    window.close();
  }, []);

  return <div />;
};
