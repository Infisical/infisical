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

validate-upgrade-impact:
	cd upgrade-impact && \
	npm run type:check && \
	npm test && \
	npm run validate

generate-upgrade-impact:
ifndef TAG
	$(error TAG is required. Usage: make generate-upgrade-impact TAG=v0.159.23)
endif
	cd upgrade-impact && \
	npm run generate -- --tag $(TAG)

generate-upgrade-impact-dry-run:
ifndef TAG
	$(error TAG is required. Usage: make generate-upgrade-impact-dry-run TAG=v0.159.23)
endif
	cd upgrade-impact && \
	npm run generate:dry-run -- --tag $(TAG)
