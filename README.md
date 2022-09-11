## Infisical

Infisical is a simple, end-to-end encrypted secrets manager for your .env files. It enables teams to securely sync and manage .env files in seconds.

## What's New

Infisical combines simplicity with security. With git-like commands and end-to-end encryption, Infisical is easy to use and super secure — no one (not even us) can read your dearest secrets.

## Usage

Head over to https://infisical.com/ to make an account and shared workspace for your team.

Login via CLI:

```
npx infisical login
```

Connect the folder containing your .env file to the workspace:

```
npx infisical connect [workspace id]
```

Push your .env file to the workspace:

```
npx infisical push [environment]
```

Pull the latest .env file from the workspace:

```
npx infisical pull [environment]
```

Note that the environment argument for the push/pull commands accepts 3 possible inputs: dev, staging, and prod

Voila!

## How It Works

Infisical uses end-to-end encryption to securely store and share secrets. It uses secure remote password (SRP) to handle authentication and public-key cryptography for secret sharing and syncing; your secrets are symmetrically encrypted at rest by keys decryptable-only by intended parties in your team. Put simply, rest-assured we've put measures in place so that secrets remain your-eyes-only - all while making minimal user-experience trade-offs.

For a fuller discussion on how it works, head to our website: https://infisical.com/ 
