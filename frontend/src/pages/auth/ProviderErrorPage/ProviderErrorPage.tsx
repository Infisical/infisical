import { useEffect } from "react";

import { PageTitle } from "@app/components/PageTitle";

export const LoginProviderErrorPage = () => {
  useEffect(() => {
    window.localStorage.setItem("PROVIDER_AUTH_ERROR", "err");
    window.close();
  }, []);

  return (
    <>
      <PageTitle title="Login Failed" />
      <div />
    </>
  );
};
