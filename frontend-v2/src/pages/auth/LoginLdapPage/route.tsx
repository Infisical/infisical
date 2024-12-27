import { createFileRoute } from "@tanstack/react-router";

import { LoginLdapPage } from "./LoginLDAPPage";

export const Route = createFileRoute("/_restrict-login-signup/login/ldap")({
  component: LoginLdapPage
});
