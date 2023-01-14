build:
	docker-compose -f docker-compose.yml build

push:
	docker-compose -f docker-compose.yml push

up-dev:
	docker-compose -f docker-compose.dev.yml up --build

i-dev:
	infisical export && infisical export > .env && docker-compose -f docker-compose.dev.yml up --build

up-prod:
	docker-compose -f docker-compose.yml up --build

down:
	docker-compose down
