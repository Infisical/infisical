# Audit: v4 OAuth applications page

Scope: `frontend/src/pages/v4/organization/OauthApplicationsPage` (list, add and edit sheet, client credentials dialog, delete and rotate confirmations). Reviewed running in demo mode (`/v4/organizations/demo/oauth-applications`) in Light and Dark at 1440, 1280 and 1024 px, and by reading the code. Worst-case data was entered through the page's own form (a 58-character name, a long redirect URI, a real-length client ID); no code was changed.

Paths below are relative to that folder unless they start with `backend/`.

## Ranked findings

### 1. Existing token exchange applications cannot be edited when OIDC SSO is off

- **Severity:** High
- **Where:** Edit sheet, Save button and Audience field. `OauthClientSheet.tsx:217-218`, `:441`, `:482-484`
- **What is wrong:** `isMissingOidcSso` is true whenever the flow is Token exchange and the org has no active OIDC config, and it both hides the Audience and MFA fields and disables Save. That rule is meant to stop creating a new token exchange app, but it also applies to apps that already exist. In demo mode, opening Edit on "CI token broker" shows no Audience field and a disabled "Save changes", so an admin cannot rename it, fix its description, shorten its token lifetime, or see what audience it uses. This is exactly the moment (SSO was turned off or is being migrated) when an admin most needs to inspect or tighten the app.
- **Fix:** Gate only the transition into token exchange, not the existing state. Always render the Audience and MFA fields when the flow is Token exchange, keep the warning Alert, and set `disabledReason` only when `!isEditing || client.grantTypes` did not already include token exchange.

| Before | After | Why |
| --- | --- | --- |
| `flow === TokenExchange && !isMissingOidcSso && (<Audience …/>)` | `flow === TokenExchange && (<Audience …/>)` | The saved audience stays visible and editable |
| `disabledReason={isMissingOidcSso ? … : undefined}` | `disabledReason={isMissingOidcSso && !wasTokenExchange ? … : undefined}` | Renaming or tightening an existing app is never blocked |

### 2. Real client IDs push Flow, PKCE and Created out of view

- **Severity:** Medium
- **Where:** List, Name and Client ID columns. `OauthApplicationsPage.tsx:111-131`
- **What is wrong:** Both Name and Client ID are `grow` columns that never truncate, and the Client ID is rendered in full in a monospace face. Real IDs are `oauth_client_` plus 32 hex characters, 45 characters in total (`backend/src/services/oauth-client/oauth-client-service.ts:321`); the demo fixtures use 18-character IDs like `ic_backstageportal`, which hides the problem. With one realistic row the table scrolls sideways at 1440 px and the Created date is clipped under the sticky actions column; at 1280 px PKCE and Created are off-screen, and at 1024 px Flow is cut off too. The columns an admin scans to compare apps are the ones that disappear.
- **Fix:** Let only Name grow and truncate it with the full value in a tooltip. Give Client ID a fixed width and truncate it in the middle (`oauth_client_…d79980ba`) because IDs differ at the end; the copy button still copies the full value. Add a demo fixture with a real-length ID so the next layout change is checked against it.

| Before | After | Why |
| --- | --- | --- |
| `{ id: "clientId", mono: true, grow: true }` | `{ id: "clientId", mono: true, width: 260 }` with middle truncation and `title` | IDs share a prefix and differ at the end |
| Name: `grow: true`, no truncation | Name: `grow: true`, `min-width: 0`, ellipsis + tooltip | One long name should not widen the table |

### 3. The credentials dialog describes the integration backwards

- **Severity:** Medium
- **Where:** Client credentials dialog, description. `OauthClientSecretDialog.tsx:37-39`
- **What is wrong:** It says "Use these credentials to register {name} as an OAuth provider on the external platform." Infisical is the OAuth provider; the application named here is the client, and the external platform is where that client lives. Rendered with a long name it reads "register Konstantin's internal developer portal for EU platform eng as an OAuth provider", which is wrong and hard to parse. This is the only time the secret is shown, so the instruction next to it needs to be right.
- **Fix:** "Enter this client ID and secret in {name} to connect it to Infisical." Keep the once-only warning.

### 4. PKCE is off by default for new applications

- **Severity:** Medium
- **Where:** Add sheet, "Require PKCE (S256)" checkbox. `OauthClientSheet.tsx:179`
- **What is wrong:** `requirePkce: client?.requirePkce ?? false` starts every new authorization code app with PKCE optional. Current OAuth guidance (OAuth 2.1 and the OAuth security BCP) recommends PKCE for every client, and most platforms that integrate today send it. For a secrets manager, the safe choice should be the default, and an admin should have to opt out of it deliberately.
- **Fix:** Default to `true` for new apps (keep the saved value when editing), and reword the description so turning it off reads as the exception: "Recommended. Turn off only if the platform cannot send a PKCE code challenge."

### 5. Switching the flow of an existing application silently drops its configuration

- **Severity:** Medium
- **Where:** Edit sheet, Flow radio group. `OauthClientSheet.tsx:225-236`, `:358-387`
- **What is wrong:** In edit mode the Flow choice looks as casual as it does on create. Saving after switching an authorization code app to token exchange sends `redirectUris: []` and new grant types, so the redirect URIs are deleted and the connected platform stops working, with no warning. The code comment at `:87-88` already says the UI treats an app as one flow; the edit form does not reflect that.
- **Fix:** In edit mode, show the flow as read-only (title plus description, no radio), with a short note that a different flow needs a new application. If switching must stay possible, show a warn Alert under the radio group as soon as the value differs from the saved one, naming what will be removed.

### 6. Validation messages are raw or don't say how to fix the input

- **Severity:** Medium
- **Where:** Add and edit sheet, Name, Description, Audience and Redirect URIs errors. `OauthClientSheet.tsx:96-97`, `:108`, `:128`
- **What is wrong:** A 66-character name shows Zod's default "String must contain at most 64 character(s)" because `.max(64)` has no message, and the input has no `maxLength`, so the limit is only discovered on submit. Description (256) and Audience (255) behave the same way. An `http://` redirect URI shows "Invalid redirect URI: http://…", which does not say what is wrong; the backend's own message says it (`backend/src/server/routes/v1/oauth-router.ts:35`: https only, http only for loopback).
- **Fix:** Give each `.max()` a message ("Use 64 characters or fewer") and set matching `maxLength` on the inputs. Change the redirect message to "{uri} must use https:// (http:// is allowed only for localhost)".

### 7. Flow radios announce title, RFC and description as one run-on name

- **Severity:** Medium
- **Where:** Flow radio cards. `OauthClientSheet.tsx:365-382`
- **What is wrong:** Each `RadioGroupItem` is labelled by the whole `FieldLabel`, so its accessible name is the title, the RFC tag and the full description concatenated with no separators. The accessibility tree reads "Authorization codeRFC 6749The user signs in and approves the application in their browser…". Screen reader users hear a paragraph as the control's name, and the words run together.
- **Fix:** Name the radio with the title only and describe it with the description: `aria-labelledby` on the `FieldTitle` id and `aria-describedby` on the `FieldDescription` id. Put the RFC in the description or add a separating space so it is not glued to the title.

### 8. Long redirect URIs wrap and look like two URIs

- **Severity:** Medium
- **Where:** Redirect URIs textarea. `OauthClientSheet.tsx:418-423`
- **What is wrong:** The field's rule is "One URI per line", but the textarea soft-wraps, so a normal callback such as `https://backstage.acme.com/api/auth/infisical/handler/frame` breaks onto a second line ("…/handler/fr" / "ame") in the 470 px sheet. The user can't tell a wrapped URI from two entries, which is the one thing this field has to make clear. The placeholder is also a complete URL in the same monospace face, so an empty field looks filled in.
- **Fix:** Set `wrap="off"` so each URI stays on one line and scrolls sideways, or replace the textarea with a list of single-line inputs with Add and Remove (it also gives each URI its own error). Shorten the placeholder to `https://example.com/callback`.

### 9. Token lifetime silently truncates decimals and its parts aren't grouped

- **Severity:** Medium
- **Where:** Access token lifetime and Time unit. `OauthClientSheet.tsx:318-357`
- **What is wrong:** `parseInt(event.target.value, 10)` turns "1.5" into 1 without an error, so "1.5 days" saves as 1 day and the user never knows. The two controls also read as separate fields: "Time unit" has its own visible label, and the shared description below the grid is not connected to either control, so screen reader users never hear it.
- **Fix:** Parse with `Number()` and let the existing `.int()` reject fractions with a message ("Use a whole number, or pick a smaller unit"). Wrap both controls in one `Field group` labelled "Access token lifetime" with the description attached, and give the unit Select an `aria-label` instead of a visible label.

### 10. Token lifetime comes before Flow, the choice that shapes the form

- **Severity:** Low
- **Where:** Add sheet field order. `OauthClientSheet.tsx:318-387`
- **What is wrong:** Flow decides which fields appear and whether the app can be created at all, yet it sits below the token lifetime, a secondary setting most admins leave at the default. Users fill in a detail before making the decision that frames it, and choosing Token exchange then rearranges everything below.
- **Fix:** Order the form Name, Description, Flow, then the flow's own fields, then Access token lifetime last.

### 11. Every row's copy button has the same accessible name

- **Severity:** Low
- **Where:** List, Client ID copy button. `OauthApplicationsPage.tsx:128`
- **What is wrong:** Each row renders `label="Copy client ID"`, so a screen reader user browsing buttons hears "Copy client ID" three times with no app name. The row actions already avoid this ("Edit for Backstage portal").
- **Fix:** `label={`Copy client ID for ${client.name}`}`.

### 12. Search matches the name only

- **Severity:** Low
- **Where:** List, search input. `OauthApplicationsPage.tsx:77`
- **What is wrong:** Admins often start from a client ID copied from logs or from the external platform, but pasting one returns "No OAuth applications match search".
- **Fix:** Match on `clientId` as well as `name`, and have the empty result name the query: "No applications match "{query}"".

### 13. A success toast stacks on top of the credentials dialog

- **Severity:** Low
- **Where:** Create and rotate success. `OauthClientSheet.tsx:253`, `OauthApplicationsPage.tsx:102`
- **What is wrong:** After Create or Rotate, "Successfully created OAuth application" appears beside the credentials dialog that already confirms it, competing for attention while the user should be copying the secret. "Successfully …" is also filler in every toast on the page (`OauthApplicationsPage.tsx:84`, `OauthClientSheet.tsx:246`).
- **Fix:** Skip the toast when the credentials dialog opens. Shorten the rest to "Application deleted" and "Changes saved".

### 14. Form reset logic is spread across three places

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx:220-222`, `:257`, `:277-280`
- **What is wrong:** The form resets in an effect on `open` (which leaves `client` out of its dependencies), again in `onOpenChange`, and again after submit. The post-submit and on-close `reset()` calls reset to blank create values while the edit sheet is still running its exit animation. The effect alone is enough, and the missing dependency means the form would not refresh if the client changed while open.
- **Fix:** Keep one reset: `useEffect(() => { if (open) reset(toFormValues(client)); }, [open, client, reset])`, and remove the other two calls. Alternatively, remount the form with `key={client?.id ?? "new"}`.

### 15. Dead code around the list

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx:188-202`, `route.tsx:10`
- **What is wrong:** `FilterBar` is given `fields={[]}`, `value={[]}` and a no-op `onChange` only to host the search input, and the route validates a `selectedTab` search param that the page never reads. Both suggest behavior that doesn't exist and make the next reader look for it.
- **Fix:** Render the search `Input` directly (or use the toolbar slot Cipher provides for a lone search), and drop `validateSearch` from the route.

## What the page does well

- Delete asks the admin to type the application name, and both confirmations say what breaks ("existing tokens will be revoked", "stops working immediately").
- The credentials dialog cannot be dismissed by Escape or an outside click, and it says plainly that the secret is shown once.
- Permission-gated actions stay visible with a reason instead of disappearing, and a missing read permission shows an explanation rather than an empty table.
- Client-side redirect URI validation matches the backend rule exactly (`isAllowedRedirectUri`), so valid input is never rejected on one side only.
- The flow descriptions state the security consequence that matters ("the token carries that user's full permissions"), and the OIDC dependency is surfaced with a direct link to SSO settings.
- Row actions have specific accessible names ("Edit for Backstage portal"), and the page renders cleanly in both Light and Dark with no theme-specific contrast problems found.
