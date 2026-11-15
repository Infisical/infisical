import { Navigate } from "@tanstack/react-router";

import { v4Path } from "../../../links";

export const ShareSecretLegacyRedirect = () => (
  <Navigate replace to={v4Path("/shared/new")} search={(current) => current} />
);
