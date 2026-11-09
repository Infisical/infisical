# mobile

Infisical's mobile companion for approvals: an Expo (React Native) app with a Needs you inbox, request detail with approve and deny, and a history of decisions. With no session it opens on a sign-in screen that offers a live instance or the demo.

- Sessions live in `src/auth/session.tsx`: `signed-out`, `demo` (fixtures in `src/data/fixtures.ts`), or `live` against one instance. Live sign-in is OAuth 2.0 authorization code with PKCE (S256) through the system browser (`expo-auth-session`), as a public client: `OAUTH_CLIENT_ID` in `src/auth/config.ts`, no secret, redirect `com.infisical.mobile:/oauth`, scope `approvals:review`. Before opening the browser the app calls `/api/v1/oauth/authorize/info`, so an unreachable or unsupported instance fails on the sign-in screen with a readable reason. Tokens and the mode are in `expo-secure-store`; a 401 refreshes once, then signs out with a notice.
- Screens read one `Store` (`src/data/store.tsx`) and never branch on mode. `DemoStoreProvider` serves fixtures; `LiveStoreProvider` (`src/data/live-store.tsx`) calls `src/data/api.ts`: the inbox is `GET /api/v1/pam/access-requests/pending-my-approval`, decisions are `POST /api/v1/approval-policies/pam-access/requests/:id/approve|reject`. Differences are expressed as store capabilities: `undo` is absent in live mode because the API cannot take a decision back, and `historyComplete` is false because live history only holds this session's decisions. PAM has no project, so the folder fills `scopeName`; keep the word "project" out of PAM copy.
- Errors shown to users come from `src/auth/http.ts` and say what failed and what to do; don't surface raw status codes or stack text.

- Styling comes from the Infisical 2.0 tokens in `frontend/src/components/v4/tokens.json`, mirrored by hand in `src/theme/tokens.ts`. Corners are square everywhere. Ink is the default action fill; the yellow accent is only for approve and grant moments. Status always travels with an icon and words (`StatusText`).
- Icons are the 2.0 line set, copied from `frontend/src/components/v4/ui/icon-data.ts` into `src/ui/icon-data.ts`. Do not add another icon library.
- Lists follow the 2.0 List variants in `src/ui/List.tsx`: Needs you is segmented, History and approval steps are divided, and request facts use the compact DataList.
- Resolved requests stay in the inbox with a past-tense status until the app restarts, with Undo in demo mode only; a failed decision shows what broke and Retry.
- Approve asks for Face ID or Touch ID when the device has it enrolled.
- `npm run type:check` before pushing. There is no native folder in git: builds run `npx expo prebuild` then `xcodebuild` (or Gradle) on a clean runner.
- `.npmrc` holds the same 7-day minimum release age as `backend/` and `frontend/`.
