This is the client repository for Infisical.

## Before you get started with development locally

Please ensure you have Docker and Docker Compose installed for your OS.

### Steps to start server

- `CD` into the repo
- run command `docker-compose -f docker-compose.dev.yml up --build --force-recreate`
- Visit localhost:3000 and the website should be live

### Steps to shutdown this Docker compose

- `CD` into this repo
- run command `docker-compose -f docker-compose.dev.yml down`

### Notes

Any changes made to local files in the `/components`, `/pages`, `/styles` will be hot reloaded. If would like like to watch for other files or folders live, please add them to the docker volume.

You will also need to ensure that a .env.local file exists with all required environment variables
