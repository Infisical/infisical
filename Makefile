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
	find . -type f -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" | \
	while read img; do \
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
	find . -type f \( -name "*.mdx" -o -name "*.json" \) -print0 | \
	xargs -0 -I{} grep -o -E "(\.\./)+images/[^\"')]*\.(png|jpg|jpeg|gif|svg)" {} 2>/dev/null | \
	sort -u | while read -r img_ref; do \
		base_img_name=$$(basename "$$img_ref"); \
		if [ -f "$$(echo "$$img_ref" | sed 's|\(\.\./\)*|./|')" ]; then \
			continue; \
		fi; \
		img_path=$$(echo "$$img_ref" | sed 's|\(\.\./\)*|../|'); \
		if [ ! -f "$$img_path" ]; then \
			echo "Missing image: $$img_ref"; \
		fi; \
	done
