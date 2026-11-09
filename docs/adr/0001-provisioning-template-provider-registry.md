# Provisioning template provider registry with a kind-discriminated response

Launch Stack needs the backend to compute a link that opens a pre-filled AWS CloudFormation stack, and other apps will want a similar "set this up for me" link. We added one registry in `backend/src/services/app-connection/provisioning-template/`, keyed by app connection type, where each provider implements `getTemplate` and returns a `kind`-discriminated union (today only `cloudformation-launch`: launch URL, template URL, parameters, output key). A typed `GET` route per app serves it (`/api/v1/app-connections/aws/provisioning-template` for AWS), so a new app registers a provider instead of adding a new API shape, and a new kind of template (a Terraform link, for example) extends the union instead of breaking existing clients.

The route is a `GET` because it only computes a URL and changes nothing. The service, not the provider, checks the app connection Create permission and works out the External ID (the Project ID, or the Organization ID for Certificate Manager projects), so a provider can't skip the check or return a template for the wrong scope. Each provider takes its own typed query, so AWS-only inputs such as Partition and region don't leak into the shared contract.

## Considered options

- **A per-app route with its own response shape.** Rejected: every new app would add a new API shape, and the frontend would need separate handling for each.
- **A single response type with CloudFormation fields at the top level.** Rejected: the first non-CloudFormation provider would have to make most fields optional or break the response.
- **A `POST` route.** Rejected: nothing is created, and a `GET` can use the read rate limit.

## Consequences

- When a second `kind` exists, the frontend must switch on `kind` before it reads the launch fields.
- A provider returns `null` when it can't offer a launch for the request, such as a Partition other than the commercial one. The route returns that `null`, and the frontend falls back to manual setup.
- Enabling another AWS Partition means changing the Partition map in `aws/aws-partitions.ts`, not the route or the response.
- Update Stack adds a second `kind`, `cloudformation-update`, to the union, served by a connection-scoped `GET` that checks the Edit permission on that connection rather than Create. See ADR 0002.
