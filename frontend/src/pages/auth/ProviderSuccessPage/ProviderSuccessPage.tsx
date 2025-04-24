import { useEffect } from "react";
import { useSearch } from "@tanstack/react-router";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { ROUTE_PATHS } from "@app/const/routes";

export const LoginProviderSuccessPage = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Auth.ProviderSuccessPage.id
  });

  useEffect(() => {
    SecurityClient.setProviderAuthToken(search.token);
    window.close();
  }, []);

  return <div />;
};
