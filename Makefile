build:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

push:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml push

up-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

up-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build

down:
	docker-compose down