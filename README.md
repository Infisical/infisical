## Infisical

---

[Infisical](https://infisical.com/) is a simple, end-to-end encrypted (E2EE) platform that enables dev teams to sync and manage their environment variables.

Infisical enables dev teams to pull and inject environment variables directly from the platform into their local processes just by modifying their start/dev scripts.

It also supports git-like pull/push commands to sync and share .env files manually via CLI if needed.

![alt text](/img/dashboard.png)

## Usage

---

For a quick tutorial, check out our getting started video [here](https://www.youtube.com/watch?v=fgNTyZdHiQQ).

Head over to [Infisical](https://infisical.com/) to make an account and create a project for your app. Once you've made an account, populate the project with your environment variables and invite your team.

Once you’ve done that, return here to pull and inject secrets from the project to your local process/project.

### Step 1: Modify your dev script

Infisical works with leading JS tools and frameworks to pull and inject secrets into your local environment during development. This includes Express, Fastify, Koa (+/- nodemon) as well as Create-React-App, Next.js, NestJS, and Gatsby.

Navigate to your root project folder; feel free to delete your local .env file as it won’t be needed anymore. Now, prepend the Infisical command before whatever dev command you're using in your package.json dev script. This should take the following form where the environment argument is the environment (options are dev, staging, and prod) that you wish to pull from:

```jsx
"scripts": {
	...
	"dev": "npx infisical [environment] [start/dev command]"
}
```

Examples:

**Express, Fastify, Koa (+ nodemon)**

```jsx
"scripts": {
	...
	"dev": "npx infisical dev nodemon index.js"
}
```

**Next.js**

```jsx
"scripts": {
	...
	"dev": "npx infisical dev next dev"
}
```

**NestJS**

```jsx
"scripts": {
	...
	"start:dev": "npx infisical dev nest start --watch"
}
```

**Gatsby**

```jsx
"scripts": {
	...
	"dev": "npx infisical dev gatsby develop"
}
```

### Step 2: Run your dev process

Next, start your dev process. If it’s your first time, then follow the prompt to log in and connect to the project:

```
npm run dev
```

Voila, you’re now automatically pulling and injecting secrets into your local environment every time you run your dev script!

Feel free to check out the full usage documentation and list of commands [here](https://infisical.com/docs/gettingStarted).

## How it Works

---

Infisical uses end-to-end encryption to securely store and share secrets. It uses secure remote password (SRP) to handle authentication and public-key cryptography for secret sharing and syncing; your secrets are symmetrically encrypted at rest by keys decryptable-only by intended parties in your team. Put simply, we've put measures in place so that secrets remain your-eyes-only - all while making minimal user-experience trade-offs.

For a fuller discussion on how it works, head to: [Infisical](https://infisical.com)
