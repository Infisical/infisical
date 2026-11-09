# Update Stack is a guided console step, not an Infisical-run CloudFormation update

Users who want to reuse a stack-managed connection for another use case need the role's permissions to grow. Infisical shows the stack name, region, template URL and the toggles to change, and the user updates the stack in the AWS console. The user then selects Mark as updated, and Infisical records the new use cases without verifying them.

Infisical never calls CloudFormation `UpdateStack`. Its assumed role would need CloudFormation permissions, which would let the role rewrite its own policy, and a connection that can widen its own permissions is a privilege-escalation path. AWS also documents no console link that opens Update stack with a template and parameters prefilled, unlike `quickcreate` for Launch Stack, so the flow can't be one click.

## Considered options

- **Infisical calls `UpdateStack` through the connection.** Rejected: it needs CloudFormation write access on the role, which defeats least privilege and lets the role change itself.
- **A separate, more privileged "provisioner" role used only for updates.** Rejected: it adds a second credential to set up and rotate for a flow users run rarely.
- **Verify the update with `DescribeStacks` before recording it.** Rejected for now: it needs CloudFormation read access on the role. The stored use cases are advisory, and the sync and PKI sync forms say a permission "may be missing" rather than "is missing".

## Consequences

- The stored use cases are what the user told Infisical, not AWS state. A role changed by hand drifts from the record, so nothing may block a feature on them.
- Only connections with `configuration.provisioning.launchMethod` set to `launch-stack` are eligible. Saving a different Role ARN clears `provisioning`.
- Update Stack always points at the current Provisioning template version.
