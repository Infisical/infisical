# Update Stack is a guided console step, not an Infisical-run CloudFormation update

Users who want to reuse a stack-managed connection for another use case need the role's permissions to grow. Infisical opens the stack's update wizard in the AWS console with the current template selected, lists the toggles to change, and the user sets them and submits the update in the console. The user then selects Mark as updated, and Infisical records the new use cases without verifying them.

Infisical never calls CloudFormation `UpdateStack`. Its assumed role would need CloudFormation permissions, which would let the role rewrite its own policy, and a connection that can widen its own permissions is a privilege-escalation path. AWS documents no console link for updates, unlike `quickcreate` for Launch Stack. The console's `#/stacks/update` route accepts the stack name in `stackId` and prefills `templateURL`, but ignores `param_` values, so the user still sets the toggles and the flow can't be one click.

## Considered options

- **Infisical calls `UpdateStack` through the connection.** Rejected: it needs CloudFormation write access on the role, which defeats least privilege and lets the role change itself.
- **A separate, more privileged "provisioner" role used only for updates.** Rejected: it adds a second credential to set up and rotate for a flow users run rarely.
- **Verify the update with `DescribeStacks` before recording it.** Rejected for now: it needs CloudFormation read access on the role. The stored use cases are advisory, and the sync and PKI sync forms say a permission "may be missing" rather than "is missing".

## Consequences

- The stored use cases are what the user told Infisical, not AWS state. A role changed by hand drifts from the record, so nothing may block a feature on them.
- Only connections with `configuration.provisioning.launchMethod` set to `launch-stack` are eligible. Saving a different Role ARN clears `provisioning`. The server compares the new Role ARN with the recorded stack: it belongs when it is the Role ARN the connection already holds, or when its partition is the recorded partition, its account is the existing Role ARN's account and its role is `role/<roleName>`. A record without `roleName` cannot be verified, so any Role ARN other than the one already held clears it.
- Update Stack always points at the current Provisioning template version.
- The update link depends on an undocumented console route. If Infisical can't build it, the card links to the manual steps in the documentation.
- The template labels every parameter (`ParameterLabels`, generated from the use-case list) so the console shows the same names that the card lists.
