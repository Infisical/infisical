import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";

export const authMethodName = (method: IdentityAuthMethod) => identityAuthToNameMap[method];

export const AUTH_METHOD_ORDER: IdentityAuthMethod[] = [
  IdentityAuthMethod.UNIVERSAL_AUTH,
  IdentityAuthMethod.TOKEN_AUTH,
  ...Object.values(IdentityAuthMethod)
    .filter(
      (method) =>
        method !== IdentityAuthMethod.UNIVERSAL_AUTH && method !== IdentityAuthMethod.TOKEN_AUTH
    )
    .sort((a, b) => authMethodName(a).localeCompare(authMethodName(b)))
];

export const sortedMethods = (methods: readonly IdentityAuthMethod[]) =>
  AUTH_METHOD_ORDER.filter((method) => methods.includes(method));
