# AWS App Connection provisioning

How Infisical helps a user create, and later extend, the IAM role behind an AWS App Connection.

## Language

**Launch Stack**:
The flow that opens a prefilled AWS CloudFormation quick-create page so the user creates a new IAM role without writing a policy by hand.
_Avoid_: Quick create, one-click setup

**Update Stack**:
The flow that guides a user through changing the permissions of the role a Launch Stack created, by updating the same CloudFormation stack in the AWS console.
_Avoid_: Re-launch, redeploy, edit policy

**Stack-managed connection**:
An AWS App Connection whose IAM role was created by Launch Stack. Only these can use Update Stack.
_Avoid_: Provisioned connection, launched connection

**Use case**:
A named Infisical feature (for example an AWS Parameter Store sync) that the role is given permissions for. A role holds one permission set per selected use case.
_Avoid_: Permission, scope, capability

**Provisioning template**:
The versioned CloudFormation template Infisical publishes that Launch Stack and Update Stack point the user at.
_Avoid_: Stack template, blueprint

**Mark as updated**:
The user's statement that they finished an Update Stack in AWS. Infisical records the new use cases on trust and does not verify them.
_Avoid_: Sync, verify, confirm stack
