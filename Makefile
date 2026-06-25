.PHONY: build push up-dev up-dev-ldap up-dev-metrics up-prod down reviewable-ui reviewable-api reviewable up-dev-sso go-generate validate-upgrade-impact generate-upgrade-impact generate-upgrade-impact-dry-run

build:
	docker-compose -f docker-compose.yml build

push:
	docker-compose -f docker-compose.yml push

up-dev:
	docker compose -f docker-compose.dev.yml up --build

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

up-dev-oidc:
	docker compose -f docker-compose.dev.yml --profile oidc up --build

up-dev-ldap:
	docker compose -f docker-compose.dev.yml --profile ldap up --build

up-dev-saml:
	docker compose -f docker-compose.dev.yml --profile saml up --build

up-dev-pingfed:
	docker compose -f docker-compose.dev.yml --profile pingfed up --build

up-dev-ad:
	docker compose -f docker-compose.dev.yml --profile ad up --build

seed-dev-ad:
	docker compose -f docker-compose.dev.yml exec samba-ad bash -c '\
	  samba-tool domain trust namespaces --add-upn-suffix=infisical.com 2>/dev/null || true; \
	  samba-tool user delete jdoe 2>/dev/null || true; \
	  samba-tool user delete asmith 2>/dev/null || true; \
	  samba-tool group delete infisical-users 2>/dev/null || true; \
	  samba-tool user create jdoe "password123!" --given-name=John --surname=Doe --mail-address=jdoe@infisical.com; \
	  samba-tool user create asmith "password123!" --given-name=Alice --surname=Smith --mail-address=asmith@infisical.com; \
	  samba-tool user rename jdoe --upn=jdoe@infisical.com; \
	  samba-tool user rename asmith --upn=asmith@infisical.com; \
	  samba-tool group add infisical-users; \
	  samba-tool group addmembers infisical-users jdoe,asmith \
	'

seed-dev-ldap:
	# Seeds OpenLDAP entries (idempotent) and the Infisical side for LDAP SSO testing: an
	# ldap@infisical.com admin, a verified domain, and an active LDAP config. With ORG_ID=<uuid>
	# it configures that org; otherwise it bootstraps a dedicated `ldap` org. Needs the stack up
	# (`make up-dev-ldap`).
	@docker compose -f docker-compose.dev.yml exec -T openldap \
	  ldapadd -c -x -D "cn=admin,dc=ldap,dc=com" -w admin < docker/openldap/bootstrap.ldif; \
	  status=$$?; \
	  if [ $$status -ne 0 ] && [ $$status -ne 68 ]; then exit $$status; fi; \
	  if [ $$status -eq 68 ]; then echo "LDAP entries already exist, continuing."; fi
	docker compose -f docker-compose.dev.yml exec -T backend npx tsx ./src/db/seed-ldap.ts $(ORG_ID)

seed-dev-oidc:
	# Sets up the Infisical side for OIDC SSO testing: an oidc@infisical.com admin, a verified
	# domain, and an active OIDC config. With ORG_ID=<uuid> it configures that existing org;
	# otherwise it bootstraps a dedicated `oidc` org. Needs the stack up (`make up-dev-oidc`).
	docker compose -f docker-compose.dev.yml exec -T backend npx tsx ./src/db/seed-oidc.ts $(ORG_ID)

seed-dev-saml:
	# Sets up SAML SSO + real SCIM provisioning against the local Authentik IdP. Bootstraps a
	# dedicated `saml` org (admin@saml.com, verified saml.com domain, active SAML config, SCIM token),
	# configures Authentik (SAML + SCIM providers, app, john/alice@saml.com), and provisions those
	# users into Infisical via SCIM. Needs the stack up (`make up-dev-saml`).
	docker compose -f docker-compose.dev.yml exec -T backend npx tsx ./src/db/seed-saml.ts


# Golang commands
go-generate:
	cd backend-go && \
	goa gen github.com/infisical/api/internal/server/design -o ./internal/server/

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
