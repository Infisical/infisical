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
	docker-compose -f docker-compose.prod.yml up --build

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

# Remove any unused images in docs | WARNING: Only verifies image existence in .md, .mdx, and .json
# To see every file type in docs, run: find ./docs -type f -name "*.*" | grep -o '\.[^./]*$' | sort -u
clean-docs-images:
	cd docs && \
	find . -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.gif" -o -iname "*.svg" \) -print0 | \
	while IFS= read -r -d '' img; do \
 		img_name=$$(basename "$$img"); \
 		img_path=$${img#./}; \
 		if ! grep -r --include="*.md" --include="*.mdx" --include="*.json" -e "$$img_name" -e "$$img_path" . > /dev/null; then \
 			echo "Removing unused image: $$img"; \
 			rm "$$img"; \
 		fi; \
 	done

# Verifies that any images referenced in any ./docs files actually exist
verify-image-refs:
	cd docs && \
	find . -type f \( -iname "*.md" -o -iname "*.mdx" -o -iname "*.json" \) -print0 | \
	xargs -0 -I{} grep -o -E "\([^()\"']*\.(png|jpg|jpeg|gif|svg)[^()\"']*\)" {} 2>/dev/null | \
	sort -u | while read -r img_ref; do \
		img_ref=$$(echo "$$img_ref" | sed 's/^(\(.*\))$$/\1/'); \
		if [[ "$$img_ref" == /* ]]; then \
			real_path="./$$img_ref"; \
		else \
			real_path=$$(echo "$$img_ref" | sed 's|\(\.\./\)*|./|'); \
		fi; \
		if [ ! -f "$$real_path" ]; then \
			echo "Missing image: $$img_ref"; \
		fi; \
	done
