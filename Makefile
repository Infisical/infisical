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

up-dev-sso:
	docker compose -f docker-compose.dev.yml --profile sso up --build
