# Audit: v4 OAuth applications page

Scope: `frontend/src/pages/v4/organization/OauthApplicationsPage` (list, add and edit sheet, client secret dialog, delete and rotate confirmations), checked running in demo mode (`/v4/organizations/demo/oauth-applications`) in Light and Dark at 1706x971 and 390px, and read against the v4 design rules, `DESIGN.md`, Cipher 0.1.1 and the backend service the page calls (`backend/src/services/oauth-client/`).

Paths below are relative to `frontend/src/pages/v4/organization/OauthApplicationsPage/` unless they start with `frontend/` or `backend/`.

## Findings, most important first

### 1. Any edit to a token exchange application is blocked or fails when it shouldn't be

- **Severity:** High
- **Where:** Edit sheet for a token exchange application. `OauthClientSheet.tsx:217-218` (`isMissingOidcSso`), `:227-245` (update payload), `:441` (fields hidden), `:479-485` (Save disabled).
- **What's wrong:** The update payload always re-sends `grantTypes`, `tokenExchangeAudience` and `tokenExchangeIdpSatisfiesMfa`, even when the user only renamed the application or changed its lifetime. The backend treats any of those fields as "establishing token exchange trust" (`backend/src/services/oauth-client/oauth-client-service.ts:274-295`), so the request needs an active OIDC SSO config and SSO-config edit permission on top of OAuth edit. The sheet mirrors the first half of that: when OIDC SSO is not active it hides Audience and the MFA checkbox and disables Save. Reproduced in demo: Edit on "CI token broker" shows an empty sheet below the flow picker and a disabled "Save changes", so the user can't rename it, change its lifetime, or even see its audience. In live mode, a member who can edit OAuth applications but not SSO gets a 403 toast for a plain rename. Disabling SSO, or splitting admin roles, quietly freezes every token exchange application.
- **Fix:** On update, send only fields the user changed (`formState.dirtyFields`), so a rename sends `name` alone and the backend's narrower check applies. In edit mode with OIDC SSO inactive, keep Audience and MFA visible but read-only, keep Save enabled for the other fields, and show the OIDC warning only when the user changes the flow, audience or MFA setting. Block Save only in that case, with the existing `disabledReason`.

### 2. Saves and rotations that revoke every session go through without warning

- **Severity:** High
- **Where:** Edit sheet Save (`OauthClientSheet.tsx:238-257`) and the rotate confirmation (`OauthApplicationsPage.tsx:251-276`).
- **What's wrong:** For a token exchange application, the backend revokes every session issued to it when an edit changes the audience, turns off "Identity provider enforces MFA", or switches the flow to authorization code (`backend/src/services/oauth-client/oauth-client-fns.ts:119-125`, applied at `oauth-client-service.ts:383-414`). Rotating its secret does the same (`oauth-client-service.ts:461-463`). The sheet saves these changes with a generic "Successfully updated OAuth application" toast. The rotate dialog only says "The current client secret stops working immediately", which is the smaller half of what happens. Switching an authorization code application to token exchange also discards its redirect URIs on save (`OauthClientSheet.tsx:232`), again silently. Admins will cut off users in production without having been told.
- **Fix:** Compute the same trust-withdrawal rule in the sheet and, when it holds, route Save through an `AlertDialog` (tone danger) that names the consequence, for example: "Save and sign out every user of "CI token broker"? Changing the audience revokes all sessions this application holds." For rotation, branch the description on the flow: for token exchange add "Every user session issued through this application is revoked too."

### 3. Closing the edit sheet throws away unsaved changes

- **Severity:** Medium
- **Where:** `OauthClientSheet.tsx:275-281` (sheet `onOpenChange` resets the form).
- **What's wrong:** Escape, a click on the scrim, the close button and Cancel all close the sheet and call `reset()` with no check. The form has nine inputs, including a multi-line redirect URI list, so one stray click outside loses real work. Other v4 sheets guard this (`cert-manager/ApprovalsPage/policy-sheet.tsx` uses `DiscardChangesAlertDialog`).
- **Fix:** When `formState.isDirty`, intercept the close and open Cipher's `DiscardChangesAlertDialog`; reset only on Discard, as `policy-sheet.tsx` does.

### 4. Rows don't follow the row-in-sheet pattern

- **Severity:** Medium
- **Where:** Name column and DataTable, `OauthApplicationsPage.tsx:111-118`, `:203-224`.
- **What's wrong:** The application name is plain text, the row isn't activatable, and the only way into the sheet is the small pencil button at the far right. The table rules fix one row-in-sheet pattern: `onRowActivate` plus a named quiet-link button, no chevron. Other v4 lists that open a sheet already do this (`cert-manager/ApprovalsPage/policies-tab.tsx:75`, `:130`; `organization/AuditLogsPage/streams/streams.tsx:148`, `:231`).
- **Fix:** Render the name as `<Button variant="link" underline="hover" onClick={() => onEdit(client)}>`, pass `onRowActivate={canEdit ? onEdit : undefined}`, and keep inline Edit plus More as they are.

### 5. Access token lifetime hand-rolls a split duration control

- **Severity:** Medium
- **Where:** `OauthClientSheet.tsx:62-85` (unit table and conversions) and `:318-357` (two fields and a loose description).
- **What's wrong:** One value is split into two labelled fields, "Access token lifetime" and "Time unit". The helper text sits under the grid as a bare `FieldDescription` tied to neither control, so screen readers never announce the session-length caveat. The range error renders under the number half only and pushes the helper text down (seen with 100 days). Cipher ships `DurationInput` for exactly this (amount plus unit, one label, `aria-describedby`), and v4 already uses it (`secret-manager/SecretApprovalsPage/access-requests/RequestAccessSheet.tsx`). The field also sits between Description and Flow, although Flow decides what the rest of the form looks like.
- **Fix:** Replace the grid with one `Field label="Access token lifetime" description="..." error={...}` that wraps `DurationInput`. Convert its `ms()` string to seconds on submit, and delete `TTL_UNITS`, `ttlToSeconds` and `secondsToTtl`. Move the field below the flow-specific fields, so the form reads name, flow, flow settings, then lifetime.

### 6. Every row's copy button has the same accessible name

- **Severity:** Low
- **Where:** Client ID cell, `OauthApplicationsPage.tsx:128`.
- **What's wrong:** Each row's copy button is announced as "Copy client ID". Tabbing through the table gives "Copy client ID, Edit for Backstage portal, More actions for Backstage portal, Copy client ID, ..." (checked with keyboard focus), so a screen reader user can't tell which ID they're copying. The neighbouring row actions already include the name.
- **Fix:** Set the label per row: `label={"Copy client ID for " + client.name}`.

### 7. The description is collected but never shown, and search only matches names

- **Severity:** Low
- **Where:** Name column `OauthApplicationsPage.tsx:111-118`, filter `:77`.
- **What's wrong:** The sheet asks for "What this application is used for", but the list never shows it, so it's only visible again in the edit sheet. Search matches the name only, and the usual lookup comes the other way round: a client ID copied from a log or the external platform's config.
- **Fix:** Show the description as the row's secondary line, truncated, since the rules allow secondary lines that carry a value. Match the search against `name`, `clientId` and `description`.

### 8. Copy that's generic, doubled or ungrammatical

- **Severity:** Low
- **Where:** Toasts `OauthApplicationsPage.tsx:84`, `:102` and `OauthClientSheet.tsx:246`, `:253`; empty state `OauthApplicationsPage.tsx:216-221`; alert `OauthClientSheet.tsx:395`; secret dialog `OauthClientSecretDialog.tsx:36-40`.
- **What's wrong:**
  - The toasts read "Successfully created OAuth application" and similar. `DESIGN.md` section 8 asks for past tense and specific: name the application. Deleting three applications stacks three identical toasts (seen in the run).
  - The empty-state description repeats the page lede almost word for word.
  - "Disabling OIDC SSO stops token exchange working" is missing "from".
  - The secret dialog title "OAuth client credentials" doesn't say which application, and the subtitle then spends a sentence on it.
- **Fix:**
  - Toasts: `OAuth application "Coder" created` / `updated` / `deleted`, and `Client secret for "Backstage portal" rotated`.
  - Empty state: title "No OAuth applications yet" with no description, because the lede and the header button already say what to do.
  - Alert: "...stops token exchange from working."
  - Secret dialog: title `Credentials for "Coder"`, and drop the subtitle or cut it to "Register these on the external platform."

### 9. The secret dialog's dismissal guard is half on

- **Severity:** Low
- **Where:** `OauthClientSecretDialog.tsx:31-34`.
- **What's wrong:** Escape and outside clicks are blocked so the shown-once secret isn't lost by accident, but the header close button still dismisses the dialog the same way. The guard protects nothing, and it's the kind of Escape override `frontend/AGENTS.md` asks callers to leave out unless it's product behavior.
- **Fix:** Keep the guard and make it real: `showCloseButton={false}`, so "Done" is the one deliberate exit. Otherwise drop both overrides.

### 10. PKCE takes a whole column to say "Not applicable"

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx:46-52`, `:137-145`.
- **What's wrong:** PKCE only applies to authorization code, so every token exchange row spends a column on muted "Not applicable". The flow is the main fact here, and PKCE refines it.
- **Fix:** Drop the PKCE column and fold it into Flow: "Authorization code · PKCE required" or "Authorization code · PKCE optional" as a secondary line, and "Token exchange" alone.

### 11. Code hygiene in the sheet and list

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx:87-88`, `:220-222`; `OauthApplicationsPage.tsx:72`, `:188-202`.
- **What's wrong:**
  - The comment says "The API lets a client hold several grants", but the backend refuses to mix authorization code and token exchange (`backend/src/services/oauth-client/oauth-client-fns.ts:159-163`), so it misleads the next editor.
  - The reset effect depends on `[open]` only, reads `client`, and React Doctor will flag it.
  - The `pending` state duplicates the mutations' own `isPending`.
  - `FilterBar` is fed `fields={[]}`, `value={[]}` and a no-op `onChange` just to host the search box.
- **Fix:**
  - Reword the comment to "An application uses one flow; the API refuses to combine them."
  - Reset the form where the sheet is opened, or key `OauthClientSheet` on `client?.id ?? "new"` and drop the effect.
  - Use `deleteOauthClient.isPending` and `rotateOauthClientSecret.isPending`.
  - If `FilterBar` requires those props, leave a short note. Otherwise omit them.

### 12. Demo fixtures misrepresent new applications

- **Severity:** Low
- **Where:** `frontend/src/pages/v4/data/sso/demo.ts:173` (`createdAt: at`), `:48` (OIDC fixture `null`).
- **What's wrong:** Every application created in demo mode gets the fixed fixture date (Sep 2, 2026), so a just-created row looks two months old in demos and screenshots. The demo org also has a token exchange application but no OIDC SSO config, a state the backend refuses to create. It happens to reproduce finding 1, but it isn't a believable starting state.
- **Fix:** Stamp `createdAt` and `updatedAt` with `new Date().toISOString()` in `useCreateOauthClient`, and seed an active OIDC config. Keep the "OIDC disabled after the fact" case reachable by turning it off on the SSO page.

### 13. Page title breaks mid-word on narrow screens

- **Severity:** Low
- **Where:** Page header at 390px wide (`OauthApplicationsPage.tsx:298-300`, rendered by Cipher `PageHeader`).
- **What's wrong:** The display-size title wraps as "applicatio / ns" because the title breaks anywhere instead of between words.
- **Fix:** In Cipher's `PageHeader`, use `overflow-wrap: break-word` (not `anywhere`) and step the title down a size at narrow widths. This is a Cipher PR and release, not a page change.

## What the page does well

- Permissions are handled precisely: Add, Edit, Rotate and Delete each check their own action and show a "restricted" reason instead of vanishing. A missing read permission gets a proper `AccessRestricted` state, and sub-organizations redirect away.
- Validation lives on the fields. Name, redirect URIs (https, or http only on loopback) and lifetime range show an error state and message on the field, focus moves to the first invalid field, and backend failures go to a toast, as the Nov 13 form-error rule asks.
- The shown-once secret is handled with care: a warning alert, copyable snippets for both values, and a success toast alongside rather than instead.
- Delete requires typing the application's name, and its description names the real consequence (tokens revoked).
- The flow picker explains the security difference between the two flows, including that token exchange carries the user's full permissions, and links to SSO and provisioning when OIDC is missing.
- The list follows the table rules: FilterBar search capped at 720px with a clear gap before the header action, one inline action plus More, mono only on the client ID, distinct empty states for "none yet" and "no match", and it reads cleanly in both Light and Dark.
