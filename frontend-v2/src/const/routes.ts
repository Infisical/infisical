import { FileRouteTypes } from "@app/routeTree.gen";

const setRoute = <TFull extends FileRouteTypes["fullPaths"], TId extends FileRouteTypes["id"]>(
  full: TFull,
  id: TId
) => ({ full, id }) as const;

export const ROUTE_PATHS = Object.freeze({
  ProviderSuccessPage: setRoute(
    "/login/provider/success",
    "/_restrict-login-signup/login/provider/success"
  ),
  SignUpSsoPage: setRoute("/signup/sso", "/_restrict-login-signup/signup/sso/"),
  PasswordResetPage: setRoute("/password-reset", "/_restrict-login-signup/password-reset")
});
