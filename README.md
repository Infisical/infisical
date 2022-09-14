## Infisical

Infisical is a simple, end-to-end encrypted (E2EE) platform that enables dev teams to sync and manage their environment variables.

## What’s New

Infisical enables dev teams to pull and inject environment variables directly from the platform into their local processes just by modifying their start/dev scripts. This provides the following benefits:

It also supports git-like pull/push commands to sync and share .env files manually via CLI if needed.

## Usage

Head over to **[https://infisical.com](https://infisical.com/)** to make an account and create a workspace for your project. Once you've made an account, populate the workspace with your environment variables and invite your team.

Once you’ve done that, return here to pull and inject secrets from the workspace to your local process/project.

### Step 1: Modify your dev script

Infisical works with many commands including node, nodemon, next, etc. by pulling and injecting secrets into your local environment during development. Assuming that you’ve nodemon installed, go ahead and modify the dev script in your package.json as follows:

```
"scripts": {
	...
	"dev": "npx infisical dev nodemon index.js"
}
```

Note: You can specify which environment you wish to pull and inject your variables from; options include dev, staging, and prod.

### Step 2: Run your dev process

Next, start your dev process. If it’s your first time, then follow the prompt to log in and connect the project to your workspace:

```
npm run dev
```

Voila, you’re now automatically pulling and injecting secrets into your local environment every time you run your dev script!

Feel free to check out the full usage documentation and list of commands [here](https://infisical.com/docs/gettingStarted).

## How it Works

Infisical uses end-to-end encryption to securely store and share secrets. It uses secure remote password (SRP) to handle authentication and public-key cryptography for secret sharing and syncing; your secrets are symmetrically encrypted at rest by keys decryptable-only by intended parties in your team. Put simply, we've put measures in place so that secrets remain your-eyes-only - all while making minimal user-experience trade-offs.

For a fuller discussion on how it works, head to our website: **[https://infisical.com](https://infisical.com)**
