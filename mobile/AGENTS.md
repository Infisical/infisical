# mobile

Infisical's mobile companion for approvals: an Expo (React Native) app with a Needs you inbox, request detail with approve and deny, and a history of decisions. It runs on demo fixtures (`src/data/fixtures.ts`) shaped like the `/api/v1/approval-policies/<type>/requests` responses; no live sign-in exists yet.

- Styling comes from the Infisical 2.0 tokens in `frontend/src/components/v4/tokens.json`, mirrored by hand in `src/theme/tokens.ts`. Corners are square everywhere. Ink is the default action fill; the yellow accent is only for approve and grant moments. Status always travels with an icon and words (`StatusText`).
- Icons are the 2.0 line set, copied from `frontend/src/components/v4/ui/icon-data.ts` into `src/ui/icon-data.ts`. Do not add another icon library.
- Resolved requests stay in the inbox with a past-tense status and Undo until the app restarts; a failed decision shows what broke and Retry.
- Approve asks for Face ID or Touch ID when the device has it enrolled.
- `npm run type:check` before pushing. There is no native folder in git: builds run `npx expo prebuild` then `xcodebuild` (or Gradle) on a clean runner.
- `.npmrc` holds the same 7-day minimum release age as `backend/` and `frontend/`.
