# Infisical Stripe app

Stripe does not let any API key create another API key. The only principal that can is an
installed Stripe App holding the `api_key_write` permission, so Stripe API key rotation requires
Infisical to be a Stripe app vendor. This directory is that app.

The app has no UI (`extensions` is `null`) and no dependencies. It exists purely to carry the
permission grant and the OAuth redirect URIs, so `stripe-app.json` is the whole thing.

## The manifest is the source of truth

`stripe-app.json` is not editable in the Stripe dashboard. Stripe stores whatever the CLI last
uploaded, as an immutable version. To change anything, including a redirect URI, edit the file,
bump `version`, and upload:

```bash
$ cd stripe-app
$ stripe apps upload --api-key=<secret key of the account that owns the app>
```

For a public app, point "External test version" at the new version afterwards in the Stripe
dashboard under Apps > Created.

## Redirect URIs

Stripe requires HTTPS on every entry, including for local development, so `http://localhost:8080`
is not an option. The entry here is one developer's ngrok host, which means changing developer means
editing this file, bumping the version and re-uploading. A shared redirect URI that every developer
can use is still an open decision.

The URI has to match what the browser sends exactly. The frontend builds it from
`window.location.origin`, so `SITE_URL` and the ngrok host have to agree with this file or Stripe
rejects the authorize request before the user sees a consent screen.

The path is the app connection callback the frontend already registers for every OAuth connection.
It carries no organization ID and forwards `code` and `state` into the org-scoped page
(`frontend/src/routes.ts`, `frontend/src/pages/redirects/oauth-callback-redirect.tsx`).

## Account setup

Getting an account into a state where it can publish this app and call the Managed API Keys API
takes a sequence of steps that are mostly undocumented by Stripe, including a private-then-public
upload dance and two separate manual gating requests. Those are written up in the
[Stripe secret rotation setup doc](https://app.notion.com/p/infisical/Stripe-secret-rotation-setup-3d8564692229802f9082f2aa848b5eea).
Ask Daniel for access to a gated sandbox rather than trying to gate a new one.
