# Update Stack for AWS App Connections

## Problem Statement

A user creates an AWS App Connection with Launch Stack and gets an IAM role that has permissions for only the use cases they picked. Later they want to use the same connection for something else, such as an AWS Parameter Store sync on a connection created for Secrets Manager. Today Infisical gives them no way to grow the role's permissions. They have to work out the missing IAM policy by hand and edit the CloudFormation stack themselves, or create a second connection and role. Nothing in the sync form tells them the role may be missing a permission, so they find out when the sync fails.

## Solution

An Update Stack flow in the Edit Credentials sheet for Stack-managed connections. The user picks the use cases they want the role to cover, with the same picker and policy preview Launch Stack uses, starting from the use cases already recorded. Infisical then opens the stack's update wizard in the AWS console with the current Provisioning template already selected, and lists the toggles to change. The user sets the toggles in AWS, submits the update and selects Mark as updated, and Infisical records the new use cases.

Where a feature already knows which use case it needs (secret syncs, PKI syncs and Agent Vault session logs), picking a Stack-managed connection whose recorded use cases lack it shows an advisory hint. The hint opens the Update Stack section with that use case already selected.

Infisical never calls CloudFormation itself (see ADR 0002).

## User Stories

1. As an organization member who can edit an AWS App Connection, I want an Update Stack section in the Edit Credentials sheet, so that I can add permissions to the role without writing IAM policies by hand.
2. As a user, I want Update Stack to appear only for Stack-managed connections, so that I'm not offered a flow that can't work for a role Infisical didn't create.
3. As a user with a manually created role or an Access Key connection, I want the Edit Credentials sheet to look exactly as it does today, so that nothing confusing appears for me.
4. As a user, I want the use-case picker to start with the use cases already recorded for this connection, so that I only have to add what's new.
5. As a user, I want to see the policy that my selection produces, so that I know what permissions I'm granting before I touch AWS.
6. As a user, I want to remove a use case I no longer need, so that the role follows least privilege.
7. As a user removing a use case, I want a warning that features relying on that permission will fail, so that I don't break a sync by accident.
8. As a user, I want the steps to list only the toggles that change, so that I don't have to work out which of the template's many parameters matter.
9. As a user, I want to be told to leave every other parameter on its existing value, so that I don't overwrite the External ID, trusted account, role name or my bucket names.
10. As a user, I want the stack name and region shown with a link to the stack in the AWS console, so that I can find the right stack quickly.
11. As a user, I want the Provisioning template URL to be copyable, so that I can paste it into "Replace existing template" in the console.
12. As a user, I want the template to always be the current version, so that I get the latest permission definitions without choosing a version.
13. As a user, I want a Mark as updated button after I finish in AWS, so that Infisical's record matches what I did.
14. As a user, I want nothing to be saved if I close the sheet without selecting Mark as updated, so that I can look at the steps without committing to anything.
15. As a user, I want the button to say Mark as updated rather than verify or confirm, so that I understand Infisical isn't checking AWS.
16. As a user creating an AWS Parameter Store sync, I want a hint when the selected connection may lack Parameter Store permissions, so that I find out before the sync fails.
17. As a user creating a PKI sync (AWS Certificate Manager, Elastic Load Balancer or Secrets Manager), I want the same hint, so that certificate syncs get the same warning.
18. As an Agent Vault user choosing a connection for session logs, I want the same hint, so that I find out the role may not be able to write the logs.
19. As a user who sees the hint, I want to open Update Stack with the missing use case already selected, so that I don't have to find the right section.
20. As a user who sees the hint, I want to carry on creating the sync anyway, so that a role I already extended by hand isn't blocked by a stale record.
21. As a user, I want the hint to say a permission "may be missing" rather than "is missing", so that the wording matches what Infisical actually knows.
22. As a user without edit permission on the connection, I want no hint that I can't act on, so that I'm not shown a dead end.
23. As a user, I want a real AWS permission error to still surface through the normal sync error path, so that a wrong record doesn't hide a real failure.
24. As an admin, I want only users who can edit a connection to fetch its Update Stack details, so that the flow can't be used by someone who couldn't change the connection anyway.
25. As an admin, I want a connection's recorded use cases saved through the existing update path, so that the change appears in the existing audit log for the connection.
26. As a user, I want saving a different Role ARN to stop the connection being treated as Stack-managed, so that Infisical doesn't point me at a stack that isn't the role's.
27. As a user, I want a clear message when Infisical can't prepare Update Stack for a connection, so that I know to follow the manual documentation instead.
28. As a user of a Stack-managed connection missing its stack region, I want to be asked for the region, so that I'm not sent to the wrong place in the console.
29. As a user of the commercial AWS partition, I want Update Stack to work, so that it matches the partition Launch Stack supports.
30. As a user of another AWS partition, I want a manual-setup fallback, so that I'm not offered a link that doesn't exist.
31. As a self-hosting administrator, I want Update Stack to use the same template location setting as Launch Stack, so that I don't configure a second one.
32. As a product owner, I want an analytics event when someone starts an Update Stack, so that I can see whether use-case expansion is being used.
33. As a developer adding another feature to the hint, I want a shared hint that takes use case IDs, so that I don't rebuild the logic per surface.
34. As a developer, I want Update Stack to extend the Provisioning template registry, so that I don't add a one-off route for it.
35. As a docs reader, I want the AWS App Connection documentation to explain how to add permissions to an existing connection, so that I can do it without the UI.

## Implementation Decisions

- **Eligibility:** a connection can use Update Stack only when its recorded provisioning information says it was created with Launch Stack. Manual-role and Access Key connections are never eligible and see no change.
- **Recorded provisioning information:** add the stack region and the role name to what a connection stores about how its role was created. The branch that introduced Launch Stack is unreleased, so no existing connection needs a backfill. If an eligible connection still lacks a region, the flow asks the user to choose one.
- **Update API:** expose the connection's configuration on the AWS update schema so it can be saved without credentials. A save replaces the whole configuration object. The existing update path already audits and encrypts it.
- **Role ARN changes:** saving a Role ARN that doesn't belong to the recorded stack's role clears the provisioning information, so the connection stops being Stack-managed. Only a new Launch Stack can set it again. The check has to be applied on the update path, which today only exists in the create form.
- **Provisioning template registry:** add a second template kind for CloudFormation updates alongside the existing launch kind. The AWS provider returns it. It carries the stack name, region, partition, template URL, template version, an update link and the parameter toggles that changed between the recorded use cases and the requested ones. The update link opens the console's update wizard for the stack by name, with the template prefilled. The search link to the stack stays as a fallback.
- **Update details route:** a read-only, connection-scoped route under the AWS App Connection routes, taking the requested use cases. It is gated on the Edit permission for that specific connection, not on Create, and needs no External ID because the existing stack keeps its own. It returns null for connections that aren't Stack-managed or aren't in the commercial partition, and the frontend falls back to the manual documentation. It uses the read rate limit.
- **Template location:** use the same template base URL setting and current template version as Launch Stack.
- **Edit Credentials sheet:** a Role permissions card placed above the Role ARN field, shown only for eligible connections. It lists the recorded use cases and has a Customize button that opens the use-case sheet and policy preview from Launch Stack, preselected from the recorded use cases. Role ARN, STS endpoint and the Update Credentials button keep their current meaning and are not affected. The card can start with a use case already added.
- **Removing use cases:** allowed, with an inline warning. Infisical can't know which features rely on a permission, so it doesn't block.
- **What the card shows:** badges for the recorded use cases, with added use cases in a success style and removed ones struck through. Once the selection differs from the record, the card lists only the parameters that changed, named as the template labels them, and an Update stack in AWS button. If the selection matches the record again, the card says the role already has these permissions. If Infisical can't build the link, the card shows a short notice that links to the manual steps.
- **Mark as updated:** enabled only after the user has opened the update link. It saves the new use cases to the connection's recorded provisioning information through the update API. It is the only action that changes the record, so leaving the sheet without selecting it saves nothing. The record is a statement by the user, not verified AWS state.
- **Hint:** a shared advisory hint component that takes the use case IDs a surface already knows. It is wired into secret syncs, PKI syncs and Agent Vault session logs, which are the three surfaces that already pass a use case. It shows when a Stack-managed connection's recorded use cases lack a needed one and the user can edit that connection. It never blocks selecting the connection or creating the sync. It opens the Update Stack section with the missing use case selected.
- **Available-connections list:** return only the recorded use case IDs for AWS connections in the list the pickers use. No other provisioning detail is exposed there. Before changing it, check what that response already returns, because it may already carry the full configuration.
- **Hint visibility rule:** a single pure function decides whether the hint shows, given the connection's recorded use cases, the feature's use cases and whether the user may edit the connection.
- **Partition:** commercial AWS only, matching Launch Stack.
- **Analytics:** one frontend event for the Update Stack click, with the scope and the number of use cases, mirroring the Launch Stack click event. Read `ANALYTICS.md` and define its owner, dimensions and firing condition before implementing.
- **Domain documents:** `GLOSSARY.md` and ADR 0002 are written. ADR 0001 notes the new template kind.
- **Documentation:** add an "update the stack" section to the AWS App Connection page and to the shared Launch Stack steps. Use the `docs-style` skill, and run `make lint-docs-branch`.
- **Quality gates:** check backend changes against `backend/CODE_QUALITY.md`: a readable message for every refusal, explicit validation on the new route's inputs, REST-aligned design, and no 500 for a connection that simply isn't eligible. Then run `make reviewable-api` and `make reviewable-ui`.

## Testing Decisions

- **What makes a good test:** it exercises behaviour a user or API client can see, such as a response, a stored value or what is shown, and does not depend on how the code is arranged inside.
- **Seam A, the HTTP API through the Go blackbox suite:**
  - the update details route returns the changed toggles when use cases are added;
  - it returns the changed toggles when use cases are removed;
  - it returns null for a manual-role connection;
  - it returns null for an Access Key connection;
  - it refuses a user who can't edit the connection;
  - saving configuration through the update endpoint changes the recorded use cases and is audited;
  - saving a different Role ARN clears the provisioning information;
  - saving the same stack's Role ARN keeps it;
  - the available-connections list returns the recorded use cases and nothing else from provisioning.
- **Seam B, one pure frontend function for hint visibility:** a unit test beside the existing use-case helper tests covers the hint showing, not showing for a manual connection, not showing when the use case is already recorded, not showing without edit permission, and a feature that needs several use cases.
- **Not tested:** the Edit Credentials sheet and the hint components themselves. The existing Launch Stack sheet has no UI tests either.
- **Prior art:** the Go suite files for the AWS provisioning template and for Role ARN handling in the app connections suite, and the existing use-case helper test on the frontend.

## Out of Scope

- A banner or notice when the Provisioning template version is out of date. The motivation is permissions, not version.
- Infisical calling CloudFormation, or any role or credential set up for that purpose (see ADR 0002).
- Verifying the stack or the role's real permissions in AWS.
- Hints or Update Stack for manual-role or Access Key connections.
- New use-case mappings for rotation, honey tokens, PAM recording, Private CA and ACME, which don't pass a use case today. They can adopt the shared hint later.
- AWS partitions other than commercial.
- Alerts, emails or a badge in the App Connections table about missing permissions.
- Changes to the create-time Launch Stack flow, other than storing the extra provisioning fields.

## Further Notes

- AWS documents a quick-create link for new stacks but no console link for updates. The console's update route accepts the stack name and `templateURL`, but it ignores `param_` values, so the user still sets the toggles in AWS. The route is undocumented, which is why the manual steps stay available (see ADR 0002).
- The recorded use cases are advisory. A role edited by hand drifts from the record, which is why the hint is advisory and the wording says "may be missing".
- Implementation checks to make first: what the available-connections list returns today, and whether the Role ARN comparison can be reused from the create form on the update path.
