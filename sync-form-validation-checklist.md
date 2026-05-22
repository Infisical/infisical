# Secret Sync Form Validation

Tracking checklist for the "Add Secret Sync" flow on every provider, validated against the dummy app connections seeded by `backend/src/db/seeds/6-app-connections.ts`.

## How to test

1. From `backend/`, run `npm run seed-dev` — dummy connections with IDs `00000000-0000-0000-0000-000000000NNN` appear in the seed org.
2. Log in to the frontend as `test@localhost.local`.
3. For each row below: navigate to **Add Secret Sync**, pick the provider, fill the form, submit.
4. Expected: a sync record is created. The background sync job will fail — that's fine, we're only testing the form flow.
5. Tick the box once form submission succeeds (or note the failure inline).

## Known caveats

- **Azure Entra ID SCIM** — form submit is expected to throw because the provider's `preSaveTransformDestinationConfig` calls Microsoft Graph live, which the stub layer can't intercept.
- **OVH, Devin** — no list-resource endpoints exist for these providers, so destination-config fields are manual text entry only (no stubbed dropdowns).

## Cloud secret stores

- [ ] AWS Parameter Store
- [ ] AWS Secrets Manager
- [ ] GCP Secret Manager
- [ ] Azure Key Vault
- [ ] Azure App Configuration
- [ ] Hashicorp Vault
- [ ] OCI Vault
- [ ] 1Password

## Source control / CI

- [ ] GitHub
- [ ] GitLab
- [ ] Bitbucket
- [ ] Azure DevOps
- [ ] CircleCI
- [ ] Travis CI
- [ ] TeamCity
- [ ] Octopus Deploy

## Hosting / PaaS

- [ ] Vercel
- [ ] Heroku
- [ ] Render
- [ ] Fly.io
- [ ] Netlify
- [ ] Cloudflare Pages
- [ ] Cloudflare Workers
- [ ] Digital Ocean App Platform
- [ ] Railway
- [ ] Northflank
- [ ] Supabase
- [ ] Laravel Forge

## Configuration / Infrastructure

- [ ] Terraform Cloud
- [ ] Databricks
- [ ] Humanitec
- [ ] Camunda
- [ ] Windmill
- [ ] Chef
- [ ] Zabbix
- [ ] Snowflake

## Identity / Miscellaneous

- [ ] Azure Entra ID SCIM — submit expected to fail
- [ ] External Infisical
- [ ] OVH — manual text entry only
- [ ] Devin — manual text entry only
- [ ] Ona
- [ ] Checkly

---

**Total: 42 sync providers** (8 cloud secret stores + 8 source/CI + 12 hosting + 8 config/infra + 6 identity/misc)
