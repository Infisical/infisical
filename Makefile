build:
	docker-compose -f docker-compose.yml build

push:
	docker-compose -f docker-compose.yml push

up-dev:
	docker-compose -f docker-compose.dev.yml up

up-prod:
	docker-compose -f docker-compose.yml up

down:
	docker-compose down