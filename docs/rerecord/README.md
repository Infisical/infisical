# Docs screenshots

The screenshots in `docs/images/platform/agent-vault/` are drawn by [rerecord](https://www.npmjs.com/package/rerecord)
from the scenes in `scenes/agent-vault/`. A scene is the source of truth for its images: edit the
scene, not the PNG.

Each scene is a folder with two files:

- `scene.json`: the steps through the UI (go to a page, click, type, take a shot) and the file name of each shot
- `network.har`: the API answers the app got while the scene was recorded

Redrawing a scene needs no backend. rerecord serves the frontend build, answers every API call from
`network.har`, runs the steps, and writes each shot to `docs/images/platform/<shot>`.

The images are committed too, so the docs build doesn't depend on rerecord, and so images that have
no scene (a vendor's console, or a screen rerecord can't replay) sit next to the drawn ones.

## Redraw the screenshots

```bash
cd docs/rerecord
npm ci
npx playwright install chromium
npx rerecord rerecord                 # every scene
npx rerecord rerecord agent-vault/variables   # one scene
```

`rerecord rerecord` builds the frontend first. Pass `--no-build` to reuse an existing `frontend/dist`.

The `Rerecord docs screenshots` workflow runs the same command on every pull request that changes
`frontend/src` or a scene, and commits any image that changed back to the pull request. It renders in
the `mcr.microsoft.com/playwright` image, and a redraw on macOS draws fonts slightly differently, so
let the workflow commit the images rather than committing ones drawn on your machine.

## When a scene fails

A scene fails when the UI no longer matches its steps, or when the app makes an API call the scene
never recorded. The error names the step or the call:

- **A renamed button or field:** edit the target in `scene.json`
- **A new API call:** add its answer to `network.har`, or record the scene again
- **A bigger change:** record the scene again

## Demo data

Every scene shows the same fictional organization, so the images read as one product. Keep new scenes
consistent with it:

- **Organization:** Acme
- **Agent Vault projects:** Engineering Agents (most scenes), Customer Support (the `support-triage` bundle),
  and Growth Experiments (one the recorder isn't a member of, for **Join as Admin**)
- **People:** Alex Rivera (the admin who records), Marcus Chen, Priya Patel, Sam Okafor, Dana Kim,
  Jordan Lee, and Taylor (a pending invitation)
- **Emails:** `<first name>@example.com`; never a domain someone can register (`example.com`, `example.org`
  and `.example` are reserved for documentation)
- **Machine identities:** `github-actions`, `release-bot`, `support-agent`
- **Groups:** Platform Team, Support
- **Access bundles:** `code-review`, `on-call`, `release-notes` in Engineering Agents; `support-triage` in Customer Support
- **Proxies:** `prod-proxy`, `staging-proxy`, `laptop-dev` in Engineering Agents; `support-proxy` in Customer Support
- **AWS:** account `123456789012`, the AWS documentation example
- **IP addresses:** the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`
- **Secret values:** made up, in the vendor's format so the screen looks real (`ghp_…`, `xoxb-…`), and never a
  key that was ever issued

Before you commit a scene, search its files for your own name, email, IP address, and any real token. Use
real vendor hosts (`api.github.com`) and paths, since the product brokers those, but keep the account and
repository names fictional.

## Record a scene

Record against a local instance with demo data only. rerecord removes cookies and auth headers and
refuses a recording that sends a password, but it saves every other answer as it was, names and
emails included, and the scene is committed.

1. Start the app (`make up-dev`) and log in at `http://localhost:8080`.
2. Run `npx rerecord record agent-vault/<scene-name> --url /organizations/<org-id>/agent-vault/<page>`.
   Set `RERECORD_APP_URL` if the app isn't on `http://localhost:8080`.
3. In the window that opens, go through the flow, and select **📸 Shot** for each image (**⏱ 5s**
   gives you time to open a tooltip or menu first). Close the window to save the scene.
4. In `scene.json`, rename each shot from its timestamp to `agent-vault/<image-name>.png`, then run
   `npx rerecord rerecord agent-vault/<scene-name>` and check the images.

Every scene starts with an empty browser, so its first steps close the **Introducing Agent Vault**
dialog. Keep those steps when you record a scene again.

## Scenes that need more than the app

- **Session logs:** the browser downloads session logs straight from S3, which isn't the app's own API, so `rerecord record`
  can't capture them. The `sessions`, `settings` and `variables` scenes were recorded against S3-compatible storage, and
  each S3 answer was saved into `network.har` under `http://localhost:39999/api/__object-storage/`, with the links in the
  app's API answers rewritten to match. To record one of these scenes again, do the same, or the logs view shows its
  download error.
- **The page's own address:** the **Proxy Token** and **Session Created** dialogs print the page's address as `--domain`,
  so their images show `http://localhost:39999`, the address rerecord serves the app on. For the same reason, there's no
  image of the OAuth form that shows a redirect URI.

Images of other vendors' consoles, such as the AWS console, live outside `images/platform/agent-vault/` and are committed
directly.
