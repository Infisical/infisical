# MFA for SSO logins

Read before changing `ssoMfaTrust`, `idp-mfa-signal.ts`, the SAML or OIDC callbacks' MFA handling, or
`isIdpMfaTrusted`.

`organizations.ssoMfaTrust` (`SsoMfaTrust` enum, `none` or `signal`) lets a SAML or OIDC login satisfy the
org's MFA enforcement with the MFA the IdP already performed. The SAML and OIDC callbacks derive one verdict
per login with `matchIdpMfaSignal` (`services/auth/idp-mfa-signal.ts`): the OIDC claim named by
`oidc_configs.mfaClaimName` contains `mfa`, the SAML `AuthnContextClassRef` is a class whose definition asserts
two factors (possession-only classes such as `Smartcard`, `SoftwarePKI` and `TimeSyncToken` are not defaults), or the
attribute named by `saml_configs.mfaSignalAttribute` contains `mfa` or `multipleauthn`. A null attribute name
means the provider's default: Entra ID's `authnmethodsreferences` for `azure-saml`, because Entra reports a push
or TOTP login as `Password` in `AuthnContextClassRef` and puts `multipleauthn` only there, and `amr` for every
other provider. The OIDC claim name defaults to `amr`, and the
per-config allowlists extend the built-in values rather than replace them. The verdict travels on the org-less
session token as `idpMfaOrgId`, the root org whose SSO config produced it (absent when the IdP did not signal
MFA). A first login that still has to verify its mailbox carries it on the signup token instead, and
`completeAccount` copies it onto the session it mints. `selectOrganization` (`auth-login-service.ts`) applies it
through `isIdpMfaTrusted` (`auth-fns.ts`), the only reader of the setting. Rules that must hold:

- Enforcement is decided once per selection against the root org (`actorRootOrgId`), so moving between a root
  org and its sub-orgs never re-prompts.
- `isIdpMfaTrusted` refuses every non-SSO auth method, so password, Google and LDAP logins (break-glass
  accounts) always get the Infisical challenge.
- The proof only counts for the root org whose IdP produced it. A user in two orgs could otherwise tune one
  org's allowlist to accept a single factor and carry that verdict into the other, so the token stores the org
  id rather than a boolean and selection requires it to equal the selected root org.
- The trust only applies while `enforceMfa` is on, and then it waives the whole challenge, including the user's
  personal `isMfaEnabled`: passing an enforced challenge turns that flag on (`Mfa.tsx` calls `activateMfa`), so
  honoring it would make the trust dead for anyone who ever logged in before it was enabled. Personal MFA in an
  org that does not enforce it is still prompted. Like the admin SSO bypass, the setting can be stored at any
  time, before enforcement is on or before any SSO config exists; `updateOrg` only requires the plan to allow
  MFA enforcement for `signal`, and like `authEnforced` it needs `Sso.Edit`, not just `Settings.Edit`.
- `isMfaVerified` is never set from the IdP. It still means "proved a factor to Infisical", so step-up
  (`mfa-step-up-fns.ts`) and PAM MFA are unaffected. OAuth consent (`authorizeConsent`) re-derives the MFA
  requirement for the client's org and applies the same `isIdpMfaTrusted` waiver, so a session that skipped
  the login prompt is not refused when authorizing an application.
- Updating a SAML or OIDC config resets the org's `authEnforced` and `scimEnabled`, except when the update
  carries only the MFA signal fields (`mfaSignalAttribute` / `mfaAuthnContexts`, `mfaClaimName` /
  `mfaAmrValues`), which cannot break a login. The SSO modals send only those fields when nothing else changed,
  so tuning an allowlist on a live, enforced setup does not turn enforcement off.
- The callback writes a `USER_LOGIN` audit event with the `idpMfa` verdict: `evidence` is what matched and
  `received` is every value the IdP sent in the fields that were read, so a rejected login shows which value
  to add to the allowlist. `SELECT_ORGANIZATION` records `mfaSatisfiedBy`, so an admin can see why a login was
  or wasn't prompted.
