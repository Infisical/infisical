# Audit: v4 OAuth applications page

Scope: `frontend/src/pages/v4/organization/OauthApplicationsPage` (list, add and edit sheet, client credentials dialog, rotate and delete confirmations), checked in demo mode at `/v4/organizations/demo/oauth-applications` in Light and Dark, against the code, `DESIGN.md`, Cipher 0.1.1 and the backend contract in `backend/src/services/oauth-client/`.

Paths below are relative to that folder unless they say otherwise. Line numbers are on branch `design/v4-controls-polish` at `9c1b4095dc`.

## Ranked findings

### 1. Editing resends the whole grant config, which locks admins out of token-exchange apps and silently widens auth-code apps

- **Severity:** High
- **Where:** Edit sheet submit, `OauthClientSheet.tsx` 224-264 (payload 227-236), the token-exchange gate 217-218, 441 and 482-484.
- **What's wrong:** Every save sends `grantTypes`, `redirectUris`, `requirePkce`, `tokenExchangeAudience` and `tokenExchangeIdpSatisfiesMfa`, changed or not. The backend (`oauth-client-service.ts`, `resolveGrantConfig`) treats any of those fields on a token-exchange app as "establishing trust", so it then demands SSO Edit permission and an active OIDC config. Its own comment says this is so "an admin with just OauthClients Edit can still rename an exchange application", and the sheet defeats that. Three consequences:
  1. An admin with OAuth application Edit but not SSO Edit can't rename a token-exchange app or change its lifetime or description. Save fails with a 403 toast.
  2. When OIDC SSO is off, editing a token-exchange app hides its audience and MFA settings and disables Save outright (reproduced in demo on "CI token broker"), so nothing can be changed and the configured audience can't even be read.
  3. An app registered through the API with `authorization_code` only gets `refresh_token` added on any save, so a rename quietly starts issuing long-lived refresh tokens.
- **Fix:** On edit, send only the fields the form marks dirty (`formState.dirtyFields`). Send `grantTypes` only when the flow changed, and keep the stored grant list otherwise. Show the audience and MFA fields read-only when OIDC is off, and gate only flow and audience changes on OIDC, not the whole form.

### 2. Token-exchange actions aren't gated on SSO permission, so they fail after confirmation

- **Severity:** Medium
- **Where:** Rotate secret menu item, `OauthApplicationsPage.tsx` 165-172 (gated only on `canEdit`, 74). Token exchange radio, `OauthClientSheet.tsx` 358-387.
- **What's wrong:** The backend requires SSO Edit, on top of OAuth application permissions, to rotate a token-exchange app's secret or to create or switch an app to token exchange (`checkSsoConfigPermission`). The UI only checks OAuth application permissions. A user without SSO Edit can open Rotate, confirm it, and only then get a 403 toast, or fill out the whole token-exchange form for a submit that can't succeed.
- **Fix:** Read `permission.can(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso)` once. Pass a `description` reason to Rotate secret on token-exchange rows and to the Token exchange radio, using the same disabled-with-reason pattern the page already uses for `RESTRICTED`.

### 3. The credentials dialog's description is wrong, and it doesn't apply to token exchange at all

- **Severity:** Medium
- **Where:** `OauthClientSecretDialog.tsx` 36-40.
- **What's wrong:** It reads "Use these credentials to register {clientName} as an OAuth provider on the external platform". With the app named after the platform (the sheet's own placeholder is "e.g. Coder") this renders as "register Coder as an OAuth provider", which is backwards: Infisical is the provider, and Coder is the platform it's registered on. For a token-exchange app there's no provider registration at all, because the app calls the token endpoint directly. The title "OAuth client credentials" also switches vocabulary from "application", which the rest of the page uses.
- **Fix:** Title it "Credentials for {name}". Make the subtitle depend on the flow: "Add these to {name} to register Infisical as its OAuth provider." for authorization code, and "{name} sends these with each token exchange request." for token exchange. Pass the flow in `TOauthClientSecretData`.

### 4. The add and edit sheet discards edits without asking

- **Severity:** Medium
- **Where:** `OauthClientSheet.tsx` 275-281 (close handler), 478-491 (footer).
- **What's wrong:** Escape, an outside click, the close button and Cancel all close the sheet and `reset()` the form, even mid-edit (verified: typing a name and then pressing Cancel or Escape closes with no prompt). This form has redirect URI lists and lifetimes that are tedious to retype. Sibling sheets such as `AuditLogsPage/streams/stream-sheet.tsx` guard this with `DiscardChangesAlertDialog`. Save changes also stays enabled on a pristine edit form, so a no-op save fires a mutation and a "Successfully updated" toast.
- **Fix:** Use `useDiscardChangesGuard` or `DiscardChangesAlertDialog` from Cipher keyed on `formState.isDirty`, as stream-sheet does. Give the edit submit `disabledReason={isDirty ? undefined : "No changes to save"}`.

### 5. Rows don't follow the row-in-sheet pattern

- **Severity:** Medium
- **Where:** `OauthApplicationsPage.tsx` 111-118 (Name column), 203-224 (`DataTable` has no `onRowActivate`).
- **What's wrong:** The table rule is one row-in-sheet pattern: `onRowActivate` plus a named button in a quiet link. Here clicking a row does nothing (verified), and the name is plain text. Keyboard users reach edit only through the pencil icon, and the tab order per row is Copy, Edit, More with no stop on the app itself. Sibling list pages (log streams, cert manager alerts) open their sheet from the row.
- **Fix:** Pass `onRowActivate={canEdit ? onEdit : undefined}`. Render the name as `<Button variant="link" underline="hover" onClick={() => onEdit(client)}>` when `canEdit`, and plain text otherwise. Keep the inline Edit action and the More menu.

### 6. The rotate confirmation understates what happens to token-exchange apps

- **Severity:** Medium
- **Where:** `OauthApplicationsPage.tsx` 257-261.
- **What's wrong:** It says only that the current secret stops working. For a token-exchange app, the backend also revokes every session issued through it (`rotateOauthClientSecret` calls `revokeSessionsByUserAgent` when the app uses token exchange), so every user signed in through that integration is signed out. An admin who reads this dialog won't expect that.
- **Fix:** For token-exchange apps, add a clause: "Everyone signed in through {name} is signed out." Keep the current sentence for authorization code apps.

### 7. Flow is the deciding choice but sits below token lifetime

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` 318-387.
- **What's wrong:** The flow decides half the form (redirect URIs and PKCE, or audience, MFA and the OIDC prerequisite), yet it comes after the lifetime block. People fill in the lifetime before learning what kind of app they're making, and on switching to token exchange the fields below the radio reshuffle out of view.
- **Fix:** Order it Name, Description, Flow, then the flow's own fields, then Access token lifetime last as a shared setting.

### 8. Token lifetime is hand-built from two fields instead of Cipher's DurationInput

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` 62-85 (unit table and converters), 319-352.
- **What's wrong:** A number input and a separate "Time unit" select with its own label re-implement `@infisical/cipher/ui/duration-input`, which has the same s, m, h, d and w units. The range error lands only under the half-width number field and wraps to two lines ("must be / between 1 minute and 90 days"), although the unit is equally at fault. The select's "Select time unit" placeholder can never show.
- **Fix:** Use `DurationInput` under one "Access token lifetime" field, convert its `ms()`-style string to seconds on submit, and delete `TTL_UNITS`, `ttlToSeconds` and `secondsToTtl` in favor of `ms`.

### 9. Length limits surface raw Zod messages

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` 96-97.
- **What's wrong:** `.max(64)` and `.max(256)` have no messages, so a long name shows "String must contain at most 64 character(s)" (verified). The inputs don't set `maxLength` either.
- **Fix:** Use `.max(64, "Name must be 64 characters or fewer")` and the same for the description, or set `maxLength` on the inputs so the limit can't be hit.

### 10. Rotate and Delete confirm buttons don't show they're working

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` 239-248, 266-273.
- **What's wrong:** The content gets `pending`, but `AlertDialogAction` gets no `loading`, so the button shows no spinner during the request. The `event.preventDefault()` handler works around the auto-close that `loading` already handles.
- **Fix:** Pass `loading={pending}` to each `AlertDialogAction` and drop the `preventDefault` wrappers. Cipher documents that a host passing `loading` owns closing.

### 11. Copy client ID buttons share one accessible name and report "copied" inline

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` 128.
- **What's wrong:** Every row's button is named "Copy client ID". In a screen reader's button list they're indistinguishable, while the neighbouring actions say "Edit for Backstage portal". A copy shows only an icon swap with no toast, against the rule that copied feedback is always a toast.
- **Fix:** Use `label={\`Copy client ID for ${client.name}\`}` and an `onCopy` that calls `saved("Client ID copied")`. If the icon swap is meant to replace the toast app-wide, fix it once in Cipher's `CopyButton` instead.

### 12. Flow radio names run together for screen readers

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` 365-382.
- **What's wrong:** The whole card is the radio's label, and the RFC span follows the title with no separator. The computed names are "Authorization codeRFC 6749The user signs in..." and "Token exchangeRFC 8693The application presents...", one run-on string that includes the full description.
- **Fix:** Name the radio by the title alone (`aria-labelledby` on the `FieldTitle`), attach the description through `aria-describedby`, and put a space or `aria-hidden` on the RFC tag.

### 13. The empty state repeats the page lede and gives no next step

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` 216-221.
- **What's wrong:** "Add an application to let an external platform access Infisical on a user's behalf via OAuth 2.0." restates the lede directly above it. The empty state also has no action, although DESIGN.md says empty states name what's missing and then the next action.
- **Fix:** Title "No OAuth applications yet". Drop the description and put an Add application button in the empty state, gated the same way as the header button.

### 14. Description is write-only, and search ignores client IDs

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` 77 (search filter), 111-118 (Name column).
- **What's wrong:** The description an admin enters appears nowhere outside the edit sheet, so it can't help anyone tell similar apps apart. Search matches the name only. Client IDs are what turn up in audit logs and in the external platform's config, so pasting one finds nothing.
- **Fix:** Show the description as the Name cell's muted secondary line when set (the rules allow secondary lines that carry a value), and match `clientId` in the filter.

### 15. Dead and misleading code

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` 87-88 and 220-222; `OauthApplicationsPage.tsx` 46-52; `route.tsx` 10.
- **What's wrong:** The comment says "The API lets a client hold several grants", but `assertValidOauthClientGrantConfig` rejects authorization code combined with token exchange. The comment misleads the next editor, and `flowLabel`'s `join(", ")` handles a case that can't happen. `validateSearch` declares a `selectedTab` param that nothing reads. The reset effect lists only `[open]` while reading `client` and `reset`.
- **Fix:** Drop the comment, or reword it to say the API also allows one flow per application. Make `flowLabel` a single lookup. Remove `validateSearch` from the route. Reset from the `onOpenChange` and open handlers instead of an effect, or key the sheet body on `client?.id`.

### 16. Toast copy doesn't follow the voice rules

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` 84, 102; `OauthClientSheet.tsx` 246, 253.
- **What's wrong:** "Successfully created OAuth application" and similar toasts don't name the resource. DESIGN.md asks for past tense and specific: `Secret "API_KEY" created`. After a rotate, the toast and the credentials dialog appear together, and the toast doesn't say which app.
- **Fix:** Use `Application "${name}" created`, `... updated`, `... deleted` and `Secret rotated for "${name}"`.

## What the page does well

- Permissions are handled visibly: blocked actions stay in place, disabled with a reason, and the list falls back to `AccessRestricted` instead of an empty table. Sub-organizations are redirected, because apps only live on the root org.
- The one-time secret is treated carefully. The dialog can't be dismissed by Escape or an outside click, it warns that the secret is shown once, and both values sit in copyable Snippets.
- Delete names the app, states the real consequence (tokens revoked, which matches the backend), and requires typing the name.
- Validation goes where the problem is. Field errors show on the field, including the textarea, and focus moves to the first one. Backend failures go to a toast, and the footer error slot is unused.
- Client-side redirect URI rules (https, or http only on loopback) mirror the backend's `isAllowedRedirectUri`, so errors show up before a round trip.
- The list follows the current table rules: one inline non-destructive action plus More, FilterBar with the capped search width, mono only on the client ID, and clean rendering in both Light and Dark.
