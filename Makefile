build:
	docker-compose -f docker-compose.yml build

push:
	docker-compose -f docker-compose.yml push

up-dev:
	docker compose -f docker-compose.dev.yml up --build

up-dev-ldap:
	docker compose -f docker-compose.dev.yml --profile ldap up --build

up-dev-metrics:
	docker compose -f docker-compose.dev.yml --profile metrics up --build

up-prod:
	docker compose -f docker-compose.prod.yml up --build

down:
	docker compose -f docker-compose.dev.yml down

reviewable-ui:
	cd frontend && \
	npm run lint:fix && \
	npm run type:check

reviewable-api:
	cd backend && \
	npm run lint:fix && \
	npm run type:check

reviewable: reviewable-ui reviewable-api

diff-reviewable-api:
	@changed_files=$$(git diff --name-only --diff-filter=d main -- 'backend/src/**/*.ts' | sed 's|^backend/||'); \
	if [ -z "$$changed_files" ]; then echo "No changed backend files."; exit 0; fi; \
	cd backend && \
	node --max-old-space-size=8192 ./node_modules/.bin/eslint --fix --max-warnings 0 $$changed_files && \
	npm run type:check

diff-reviewable-ui:
	@changed_files=$$(git diff --name-only --diff-filter=d main -- 'frontend/src/**/*.ts' 'frontend/src/**/*.tsx' | sed 's|^frontend/||'); \
	if [ -z "$$changed_files" ]; then echo "No changed frontend files."; exit 0; fi; \
	cd frontend && \
	node --max-old-space-size=8192 ./node_modules/.bin/eslint --fix --max-warnings 0 $$changed_files && \
	npm run type:check

diff-reviewable: diff-reviewable-api diff-reviewable-ui

up-dev-sso:
	docker compose -f docker-compose.dev.yml --profile sso up --build
