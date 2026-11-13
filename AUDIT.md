# Audit: v4 OAuth Applications page

Scope: `frontend/src/pages/v4/organization/OauthApplicationsPage` (list, add and edit sheet, client secret dialog, delete and rotate confirmations), reviewed in demo mode at `/v4/organizations/demo/oauth-applications` in Light and Dark at 1440x900, plus a read of all five files. Paths below are relative to that folder.

Ranked most important first.

## 1. Editing a token exchange application is locked when OIDC SSO is off

- **Severity:** High
- **Where:** Edit sheet, token exchange fields and the Save Changes button. `OauthClientSheet.tsx` lines 217-218, 388-405, 441-475 and 479-485.
- **What is wrong:** `isMissingOidcSso` is computed the same way for create and edit. Open Edit on "CI token broker" in demo (no active OIDC config) and the sheet hides the Audience and "Identity provider enforces MFA" fields and disables Save Changes. So an admin cannot rename the app, change its description or shorten its token lifetime, and cannot even see the audience it was configured with. The warning tells them to set up SSO "first", which is wrong for an app that already exists. This bites hardest in the case that needs action most: SSO was turned off and the admin wants to inspect or retire the app. Deleting it still works, so the only available "edit" is destructive.
- **Fix:** Apply the OIDC gate only when creating, or when an existing app is being switched to token exchange. In edit mode always render the audience and MFA fields with their stored values, keep Save Changes enabled, and show the warning as information ("Token exchange stops working until OIDC SSO is active again") rather than as a blocker.

## 2. The add and edit sheet discards unsaved work on Escape, outside click and Cancel

- **Severity:** High
- **Where:** `OauthClientSheet.tsx` lines 275-282 (`Sheet onOpenChange` calls `reset()` straight away) and 488-490 (Cancel).
- **What is wrong:** I filled in Name, lifetime and a redirect URI and pressed Escape: the sheet closed and everything was gone, with no prompt. This form is long (flow cards, URI list, TTL) and easy to dismiss by accident with an outside click. The guidance is explicit that a layer holding unsaved work refuses dismissal and asks first, and Cipher ships the pieces for it: `useDiscardChangesGuard` and `DiscardChangesAlertDialog`, already used by `cert-manager/SettingsPage/alert-sheet.tsx` and `organization/AuditLogsPage/streams/stream-sheet.tsx`.
- **Fix:** Wire `useDiscardChangesGuard({ isDirty: formState.isDirty, onDiscard: () => onOpenChange(false) })`, route Escape, outside press, the close button and Cancel through `requestDiscard`, and render `DiscardChangesAlertDialog` with `discardDialogProps`.

## 3. Delete and rotate actions show no busy state and can fire twice

- **Severity:** Medium
- **Where:** `OauthApplicationsPage.tsx` lines 72, 79-108, 229/255 (`pending` on `AlertDialogContent`) and 239-247, 265-273 (`AlertDialogAction` without `loading`).
- **What is wrong:** The page tracks `pending` by hand and passes it to the dialog content, which blocks Escape and Cancel, but the action button itself never gets `loading`. So while the request runs the button shows no spinner and stays clickable, and a second click calls `deleteOauthClient` or `rotateOauthClientSecret` again. A double rotate issues two secrets and shows the user the second one only after the first was already invalidated; a double delete ends in a "Failed to delete" toast right after the success toast. Cipher's `AlertDialogAction` documents exactly this: `loading` shows the spinner, keeps the button focusable, ignores repeat activations and marks the dialog pending. Sibling pages use it (`SsoPage/provisioning/scim.tsx`, `SsoPage/provisioning/github-sync.tsx`).
- **Fix:** Pass `loading={deleteOauthClient.isPending}` and `loading={rotateOauthClientSecret.isPending}` to the two actions, drop the shared `pending` state, the `pending` props on `AlertDialogContent` and the `finally` blocks.

## 4. Copy in the credentials dialog is wrong, and wrong again after a rotation

- **Severity:** Medium
- **Where:** `OauthClientSecretDialog.tsx` lines 36-40 (title and description), used for both create (`OauthApplicationsPage.tsx` line 326) and rotate (line 101).
- **What is wrong:** The description reads "Use these credentials to register CI token broker as an OAuth provider on the external platform." The application is the OAuth client and Infisical is the provider, so this tells the admin to do something that doesn't exist. After a rotation it is doubly wrong: nothing needs registering, the admin needs to replace the old secret, which just stopped working. The dialog never says which of the two events happened.
- **Fix:** Pass the reason in (`"created" | "rotated"`) and word each case: on create, "Enter these in {name} to connect it to Infisical."; on rotate, title "New client secret" and "Replace the secret in {name}. The old secret no longer works." Keep the warning about the secret being shown once.

## 5. Validation reports errors in two rounds

- **Severity:** Medium
- **Where:** `OauthClientSheet.tsx` lines 94-149 (`z.object(...).superRefine(...)`).
- **What is wrong:** Zod skips `superRefine` while any base field fails. Submitting the empty form shows only "Name is required" and the lifetime error; the redirect URI, lifetime range and audience checks only appear on the second submit. The user fixes what they were shown, presses Create Application again, and gets a new set of errors. Confirmed in the browser: the first submit showed no redirect URI error with the field empty.
- **Fix:** Validate the flow-specific fields in the base shape instead of the refinement, for example a `z.discriminatedUnion("flow", ...)` with one branch per flow, so every error surfaces on the first submit. The TTL range check can stay as a refinement on the two TTL fields.

## 6. Switching an existing application's flow silently wipes its configuration

- **Severity:** Medium
- **Where:** Edit sheet, Flow radio group. `OauthClientSheet.tsx` lines 227-236 and 358-387.
- **What is wrong:** In edit mode the user can move an authorization code app to token exchange. On save, `redirectUris` is sent as `[]` and `requirePkce` as `false`, so the live integration breaks and its redirect URIs are lost with no warning. Token exchange also issues tokens with the user's full permissions (the card says so), so this is a security-relevant change made with one radio click.
- **Fix:** Either make the flow read-only when editing (show it as text, as the list already does), or when the flow differs from the saved one, show an inline warning naming what will be cleared and confirm on save.

## 7. Per-row copy buttons all have the same name

- **Severity:** Medium
- **Where:** Client ID column. `OauthApplicationsPage.tsx` line 128.
- **What is wrong:** Every row's button is named "Copy client ID" (confirmed in the accessibility tree), so a screen reader's button list or a voice-control user sees identical controls. The row actions next to it get it right ("Edit for Backstage portal", "More actions for Backstage portal").
- **Fix:** set `label` to `` `Copy client ID for ${client.name}` ``.

## 8. Flow radios announce their whole description as their name

- **Severity:** Medium
- **Where:** Flow cards. `OauthClientSheet.tsx` lines 364-383.
- **What is wrong:** Each `RadioGroupItem` sits inside a `FieldLabel` that wraps the title, the RFC tag and the description, so the radio's accessible name is "Authorization codeRFC 6749The user signs in and approves the application in their browser. The token is…" (run together, as read from the accessibility tree). That is long, it has no word breaks between the parts, and the description is announced as the name instead of as a description.
- **Fix:** Name the radio with the title only (`aria-labelledby` pointing at the `FieldTitle`) and attach the description with `aria-describedby`. Mark the RFC tag `aria-hidden` or move it into the description.

## 9. The lifetime help text is not tied to its inputs, and the pair reads as two fields

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` lines 318-357.
- **What is wrong:** The lifetime is split into two separately labelled fields, "Access token lifetime" and "Time unit", and the explanation of how it interacts with the session length is a `FieldDescription` in a sibling `Stack`, outside both `Field`s, so neither input references it. Screen reader users never hear it, and an error under the number input pushes the description away from the select.
- **Fix:** Render one `Field group label="Access token lifetime" description="..."` containing the number input and the unit select, with the select named "Unit" through `aria-label`. The error then belongs to the group.

## 10. The redirect URI error doesn't say what's allowed

- **Severity:** Low
- **Where:** `OauthClientSheet.tsx` lines 123-130 and the field description at line 414.
- **What is wrong:** `ftp://bad` gets "Invalid redirect URI: ftp://bad", and the error replaces the field description, so the user is never told the rule (https, or http only on localhost, 127.0.0.1 or ::1).
- **Fix:** Put the rule in the description ("One URI per line. Use https, or http for localhost.") and make the error state it: "ftp://bad must use https, or http on localhost".

## 11. Columns jump when a search matches nothing

- **Severity:** Low
- **Where:** List table. `OauthApplicationsPage.tsx` lines 110-152 and 203-224.
- **What is wrong:** With rows, Client ID starts at x=546 and Flow at x=939; type "zzz" and they move to x=652 and x=1132 because the auto-sized columns lose their content. The headers shift under the user's eyes while they type. Search also matches the name only, so pasting a client ID (the one value the table makes copyable) finds nothing.
- **Fix:** Give Flow, PKCE and Created fixed widths like Created already has, so empty results keep the layout. Match the query against `clientId` as well as `name`.

## 12. Empty states don't offer the next step

- **Severity:** Low
- **Where:** `OauthApplicationsPage.tsx` lines 212-223.
- **What is wrong:** The no-results state has no way to clear the search, and its title "No OAuth applications match search" is missing a word. The first-run state explains what an application is but has no Add Application action, so the user has to look back up to the header.
- **Fix:** Add a Clear Search button to the no-results state, retitle it "No applications match your search", and add an Add Application button (same permission gate) to the first-run state.

## 13. Credentials dialog blocks Escape but closes freely on the X and Done

- **Severity:** Low
- **Where:** `OauthClientSecretDialog.tsx` lines 31-34 and 61-65, plus the built-in close button.
- **What is wrong:** Escape and outside press are prevented so the one-time secret isn't lost by accident, but the X button and Done close it immediately. Those two are the deliberate paths anyway, so the block mostly makes Escape feel broken. The redundant "Successfully rotated client secret" toast (line 102) also lands behind the dialog that already shows the result.
- **Fix:** Keep outside press blocked, allow Escape, and if accidental loss is the worry, gate Done behind having copied the secret or a "Have you stored the secret?" step. Drop the success toast on rotate and create, since the dialog is the confirmation.

## 14. Button labels are sentence case

- **Severity:** Low
- **Where:** "Add application" (`OauthApplicationsPage.tsx` line 308), "Delete application" (246), "Rotate secret" (171, 272), "Create application" and "Save changes" (`OauthClientSheet.tsx` line 486).
- **What is wrong:** The convention for this work is Title Case for button labels and sentence case for dialog titles and messages.
- **Fix:** "Add Application", "Delete Application", "Rotate Secret", "Create Application", "Save Changes". The rest of v4 uses sentence case too, so do this in one sweep rather than only here.

## 15. Small code issues

- **Severity:** Low
- **Where and what:**
  - `route.tsx` line 10 validates a `selectedTab` search param nothing on the page reads. Remove `validateSearch`.
  - `OauthApplicationsPage.tsx` lines 188-202 mount `FilterBar` with `fields={[]}`, `value={[]}` and a no-op `onChange` only to host the search box. Render the `Input` on its own (or a search-only part if Cipher adds one); the same pattern repeats across `pages/v4/access`.
  - `OauthApplicationsPage.tsx` line 195 puts a decorative search icon inside the input. Drop `icon="search"`; the placeholder and label already say it is a search.
  - `OauthClientSheet.tsx` lines 220-222 reset the form in an effect keyed on `open` only, with `client` read but missing from the dependencies, and line 279 resets again on close. Reset once, when the sheet opens, by keying the form on the client id (`key={client?.id ?? "new"}`) and passing `toFormValues(client)` as `defaultValues`.
  - `OauthApplicationsPage.tsx` lines 84, 102 and `OauthClientSheet.tsx` lines 246, 253 use "Successfully ..." toasts that don't name the app. Use the app name, as the cert-manager alert sheet does: `Deleted "Backstage portal"`.

## What the page does well

- Permissions are handled throughout: the add button, inline Edit and menu items carry a visible reason when restricted, and an org without read access gets `AccessRestricted` instead of an empty table.
- Delete asks the user to type the application name and says what happens to existing tokens; rotate states that the old secret stops working immediately.
- The one-time secret is shown with `Snippet` copy fields and a clear warning, and rotate flows straight into it.
- Row actions are named per row ("Edit for CI token broker"), the table has a label and a live row count, and errors set `aria-invalid` on every field including the textarea.
- The flow cards explain the security trade-off of token exchange in plain words, and the SSO warning links straight to the page that fixes it.
- Both themes hold up: body and muted text measured 6.9:1 or better in Light, and nothing breaks between Light and Dark.
