<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/img/logoname-white.svg">
    <img width="300" src="/img/logoname-black.svg" alt="infisical">
  </picture>
</h1>
<p align="center">
  <p align="center"><b>The open-source security infrastructure platform</b>: Manage secrets, certificates, keys, privileged access, and AI agent access in one platform.</p>
</p>

<h4 align="center">
  <a href="https://community.infisical.com/">Community</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">Self-Hosting</a> |
  <a href="https://infisical.com/docs/documentation/getting-started/introduction">Docs</a> |
  <a href="https://www.infisical.com">Website</a> |
  <a href="https://x.com/infisical">X</a> |
  <a href="https://infisical.com/careers">Hiring (Remote/SF)</a>
</h4>

<h4 align="center">
  <a href="https://github.com/Infisical/infisical/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Infisical is released under the MIT license." />
  </a>
  <a href="https://github.com/Infisical/infisical/releases">
    <img src="https://img.shields.io/github/v/release/Infisical/infisical?label=Release&color=brightgreen" alt="Latest Infisical release" />
  </a>
  <a href="https://cloudsmith.io/~infisical/repos/">
    <img src="https://img.shields.io/badge/Downloads-6.95M-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://community.infisical.com/">
    <img src="https://img.shields.io/badge/community-forum-blueviolet" alt="Infisical community forum" />
  </a>
</h4>

<img src="/img/infisical_github_repo4.png" width="100%" alt="Infisical secrets management dashboard" />

## Introduction

**[Infisical](https://infisical.com)** is the open source security infrastructure platform that teams use for secrets, certificates, privileged access management, and AI agent access.

We're on a mission to make security tooling more accessible to everyone, not just security teams, and that means redesigning the entire developer experience from ground up.

## Features

### Secrets Management

Centralize your application secrets and configuration across every environment, with versioning, rotation, and leak prevention built in.

- **[Dashboard](https://infisical.com/docs/documentation/platform/project)**: Manage secrets across projects and environments (e.g. development, production, etc.) through a user-friendly interface.
- **[Secret Syncs](https://infisical.com/docs/integrations/secret-syncs/overview)**: Sync secrets to platforms like [GitHub](https://infisical.com/docs/integrations/secret-syncs/github), [Vercel](https://infisical.com/docs/integrations/secret-syncs/vercel), [AWS](https://infisical.com/docs/integrations/secret-syncs/aws-secrets-manager), and use tools like [Terraform](https://infisical.com/docs/integrations/frameworks/terraform), [Ansible](https://infisical.com/docs/integrations/platforms/ansible), and more.
- **[Secret versioning](https://infisical.com/docs/documentation/platform/secret-versioning)** and **[Point-in-Time Recovery](https://infisical.com/docs/documentation/platform/pit-recovery)**: Keep track of every secret and project state; roll back when needed.
- **[Secret Rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview)**: Rotate secrets at regular intervals for services like [PostgreSQL](https://infisical.com/docs/documentation/platform/secret-rotation/postgres-credentials), [MySQL](https://infisical.com/docs/documentation/platform/secret-rotation/mysql-credentials), [AWS IAM](https://infisical.com/docs/documentation/platform/secret-rotation/aws-iam-user-secret), and more.
- **[Dynamic Secrets](https://infisical.com/docs/documentation/platform/dynamic-secrets/overview)**: Generate ephemeral secrets on-demand for services like [PostgreSQL](https://infisical.com/docs/documentation/platform/dynamic-secrets/postgresql), [MySQL](https://infisical.com/docs/documentation/platform/dynamic-secrets/mysql), [RabbitMQ](https://infisical.com/docs/documentation/platform/dynamic-secrets/rabbit-mq), and more.
- **[Secret Sharing](https://infisical.com/docs/documentation/platform/secret-sharing)**: Share a secret with anyone through a link that expires after a set time or number of views.
- **[Infisical Kubernetes Operator](https://infisical.com/docs/documentation/guides/kubernetes-operator)**: Deliver secrets to your Kubernetes workloads and automatically reload deployments.
- **[Infisical Agent](https://infisical.com/docs/integrations/platforms/infisical-agent)**: Inject secrets into applications without modifying any code logic.
- **[Honey Tokens](https://infisical.com/docs/documentation/platform/honey-tokens/overview)**: Plant decoy credentials alongside your real secrets, and get an alert as soon as someone tries to use them.

### Secret Scanning

Find secrets that were committed to your code, and block commits that add new ones.

- **[Repository Scanning](https://infisical.com/docs/documentation/platform/secret-scanning/scan-repositories)**: Scan the full history of your [GitHub](https://infisical.com/docs/documentation/platform/secret-scanning/github), [GitLab](https://infisical.com/docs/documentation/platform/secret-scanning/gitlab), and [Bitbucket](https://infisical.com/docs/documentation/platform/secret-scanning/bitbucket) repositories and each new push, then review the [findings](https://infisical.com/docs/documentation/platform/secret-scanning/findings) in Infisical.
- **[Local Scanning](https://infisical.com/docs/documentation/platform/secret-scanning/scan-locally)**: Scan files, directories, and git history from the CLI, and install a [pre-commit hook](https://infisical.com/docs/documentation/platform/secret-scanning/pre-commit-hook) that blocks any commit containing a secret.

### Certificate Management

Issue, track, and renew X.509 certificates from internal or external CAs, and sign software artifacts.

- **[Internal CA](https://infisical.com/docs/documentation/platform/pki/ca/private-ca)**: Create and manage a private CA hierarchy directly within Infisical.
- **[External CA](https://infisical.com/docs/documentation/platform/pki/ca/external-ca)**: Integrate with third-party certificate authorities such as Let’s Encrypt, DigiCert, Microsoft AD CS, and more to leverage existing PKI infrastructure or issue publicly trusted certificates.
- **[Certificate Lifecycle Management](https://infisical.com/docs/documentation/platform/pki/applications/certificates)**: Create certificate [profiles](https://infisical.com/docs/documentation/platform/pki/settings/profiles) and [policies](https://infisical.com/docs/documentation/platform/pki/settings/policies) to control how certificates are issued, including [enrollment methods](https://infisical.com/docs/documentation/platform/pki/applications/enrollment-methods/overview) such as API, ACME, EST, or SCEP. Manage the full lifecycle from issuance to renewal and [revocation](https://infisical.com/docs/documentation/platform/pki/applications/certificates#revocation) with CRL and inventory tracking.
- **[Certificate Discovery](https://infisical.com/docs/documentation/platform/pki/discovery/overview)**: Scan your network to find certificates and track them in Infisical.
- **[Certificate Syncs](https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/overview)**: Sync certificates to external platforms like [AWS Certificate Manager](https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/aws-certificate-manager) and [Azure Key Vault](https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/azure-key-vault).
- **[Alerting](https://infisical.com/docs/documentation/platform/pki/applications/alerting/overview)**: Get notified when certificates are issued, renewed, revoked, or about to expire.
- **[Code Signing](https://infisical.com/docs/documentation/platform/pki/code-signing/overview)**: Sign software artifacts like containers, installers, and packages with managed code-signing certificates, central approval, and a full audit trail.

### Infisical Key Management System (KMS)

Keep cryptographic keys in Infisical and use them through the API, so your applications never hold the keys.

- **[Cryptographic Keys](https://infisical.com/docs/documentation/platform/kms/keys)**: Create keys in the Infisical UI or through the API, then [rotate](https://infisical.com/docs/documentation/platform/kms/key-rotation), [import, and export](https://infisical.com/docs/documentation/platform/kms/export-import) them.
- **Cryptographic Operations**: [Encrypt and decrypt](https://infisical.com/docs/documentation/platform/kms/encrypt-decrypt) data, [sign data and verify signatures](https://infisical.com/docs/documentation/platform/kms/sign-verify), and [generate and verify MACs](https://infisical.com/docs/documentation/platform/kms/mac).
- **[KMIP](https://infisical.com/docs/documentation/platform/kms/kmip)**: Let storage arrays, databases, and other KMIP clients manage their keys in Infisical.
- **Integrations**: Use your keys for [Kubernetes encryption at rest](https://infisical.com/docs/documentation/platform/kms/kubernetes-encryption) and [Sigstore Cosign](https://infisical.com/docs/documentation/platform/kms/sigstore-cosign) signing.

### Privileged Access Management (PAM)

Manage and secure access to critical infrastructure like databases and servers with policy-based controls, approvals, and full session visibility.

- **[Privileged Access Management](https://infisical.com/docs/documentation/platform/pam/overview)**: Decouple user identity from infrastructure credentials. Users authenticate with their SSO identity while Infisical brokers just-in-time access to resources like [PostgreSQL](https://infisical.com/docs/documentation/platform/pam/accounts/postgresql), [SSH servers](https://infisical.com/docs/documentation/platform/pam/accounts/ssh), [Kubernetes](https://infisical.com/docs/documentation/platform/pam/accounts/kubernetes), [Active Directory](https://infisical.com/docs/documentation/platform/pam/accounts/windows-ad), and more.
- **[Session Recording](https://infisical.com/docs/documentation/platform/pam/sessions/session-recording)**: Capture and replay privileged sessions for audit and compliance.
- **[Credential Rotation](https://infisical.com/docs/documentation/platform/pam/product-reference/credential-rotation/overview)**: Rotate the passwords of your PAM accounts on a fixed schedule.
- **[Web Access](https://infisical.com/docs/documentation/platform/pam/accounts/overview#web-access)**: Connect from the browser to SSH servers, Windows servers over RDP, and databases such as PostgreSQL, MySQL, and Redis.
- **[Access Requests](https://infisical.com/docs/documentation/platform/pam/access-requests/overview)**: Require approval before a member can use a sensitive account.
- **[Discovery](https://infisical.com/docs/documentation/platform/pam/discovery/overview)**: Scan Active Directory, databases, and Unix servers for privileged accounts and import them into PAM.

### Agent Vault

Give AI agents access to the APIs they call, like LLM providers, GitHub, and Slack, without ever handing them a real credential.

- **[Agent Vault](https://infisical.com/docs/documentation/platform/agent-vault/overview)**: Agents send requests through a proxy that attaches the real credential at the network boundary, so a prompt-injected agent has no secret to leak. Works with any agent, including [Claude Code](https://infisical.com/docs/documentation/platform/agent-vault/guides/claude-code), [Codex](https://infisical.com/docs/documentation/platform/agent-vault/guides/codex), [OpenCode](https://infisical.com/docs/documentation/platform/agent-vault/guides/opencode), and [agents you build yourself](https://infisical.com/docs/documentation/platform/agent-vault/guides/custom-agent).
- **[Access Bundles](https://infisical.com/docs/documentation/platform/agent-vault/access-bundles)**: Group the [services](https://infisical.com/docs/documentation/platform/agent-vault/services) an agent can call, each with its host, authentication method, and credential.
- **[Sessions](https://infisical.com/docs/documentation/platform/agent-vault/sessions)**: Issue time-bound grants scoped to one access bundle, from the [CLI](https://infisical.com/docs/documentation/platform/agent-vault/sessions-cli) for cron jobs, containers, and CI, or from the [API](https://infisical.com/docs/documentation/platform/agent-vault/sessions-api) for each run of your own code.
- **[Session Logs](https://infisical.com/docs/documentation/platform/agent-vault/session-logs)**: Keep an encrypted record of every request an agent makes, stored in your own Amazon S3 bucket.

### General Platform

Capabilities that span every Infisical product.

- **User Authentication**: Sign users in with [SSO](https://infisical.com/docs/documentation/platform/sso/overview) or [LDAP](https://infisical.com/docs/documentation/platform/ldap/overview), and provision them with [SCIM](https://infisical.com/docs/documentation/platform/scim/overview).
- **Machine Authentication Methods**: Authenticate machine identities with Infisical using a cloud-native or platform agnostic authentication method ([Kubernetes Auth](https://infisical.com/docs/documentation/platform/identities/kubernetes-auth), [GCP Auth](https://infisical.com/docs/documentation/platform/identities/gcp-auth), [Azure Auth](https://infisical.com/docs/documentation/platform/identities/azure-auth), [AWS Auth](https://infisical.com/docs/documentation/platform/identities/aws-auth), [OIDC Auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general), [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth)).
- **[Access Controls](https://infisical.com/docs/documentation/platform/access-controls/overview)**: Define advanced authorization controls for users and machine identities with [RBAC](https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls), [additional privileges](https://infisical.com/docs/documentation/platform/access-controls/additional-privileges), [temporary access](https://infisical.com/docs/documentation/platform/access-controls/temporary-access), [access requests](https://infisical.com/docs/documentation/platform/access-controls/access-requests), [approval workflows](https://infisical.com/docs/documentation/platform/pr-workflows), and more.
- **[Audit logs](https://infisical.com/docs/documentation/platform/audit-logs)**: Track every action taken on the platform, with optional [audit log streaming](https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams) to external logging providers.
- **[Gateway](https://infisical.com/docs/documentation/platform/gateways/overview)**: Securely reach private network resources from Infisical without opening inbound connections to your environment.
- **[Self-hosting](https://infisical.com/docs/self-hosting/overview)**: Deploy Infisical on-prem or cloud with ease; keep data on your own infrastructure.
- **[Infisical SDK](https://infisical.com/docs/sdks/overview)**: Interact with Infisical via client SDKs ([Node](https://infisical.com/docs/sdks/languages/node), [Python](https://infisical.com/docs/sdks/languages/python), [Go](https://infisical.com/docs/sdks/languages/go), [Ruby](https://infisical.com/docs/sdks/languages/ruby), [Java](https://infisical.com/docs/sdks/languages/java), [.NET](https://infisical.com/docs/sdks/languages/dotnet), [PHP](https://infisical.com/docs/sdks/languages/php), [Rust](https://infisical.com/docs/sdks/languages/rust), [C++](https://infisical.com/docs/sdks/languages/cpp)).
- **[Infisical CLI](https://infisical.com/docs/cli/overview)**: Interact with Infisical via CLI; useful for injecting secrets into local development and CI/CD pipelines.
- **[Infisical API](https://infisical.com/docs/api-reference/overview/introduction)**: Interact with Infisical via API.

## Getting started

Check out the [Quickstart Guides](https://infisical.com/docs/documentation/getting-started/overview)

| Use Infisical Cloud                                                                                                                                     | Deploy Infisical on premise                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The fastest and most reliable way to <br> get started with Infisical is signing up <br> for free to [Infisical Cloud](https://app.infisical.com/login). | <br> View all [deployment options](https://infisical.com/docs/self-hosting/overview) <br><br> Already self-hosting? Plan version upgrades with the [Infisical Upgrade Tool](https://upgrade.infisical.com/). |

### Run Infisical locally

To set up and run Infisical locally, make sure you have [Git](https://git-scm.com/downloads) and [Docker](https://www.docker.com/get-started/) installed on your system.

**Linux/macOS:**

```console
git clone https://github.com/Infisical/infisical && cd "$(basename $_ .git)" && cp .env.example .env && docker compose -f docker-compose.prod.yml up
```

**Windows (Command Prompt):**

```console
git clone https://github.com/Infisical/infisical && cd infisical && copy .env.example .env && docker compose -f docker-compose.prod.yml up
```

Once running, create an account at [http://localhost:80](http://localhost:80).

> **Contributing?** Check out our guide to see how to [get started](https://infisical.com/docs/contributing/getting-started/overview).

### Scan and prevent secret leaks

With the [Infisical CLI](https://infisical.com/docs/cli/overview), you can [scan for 140+ secret types](https://infisical.com/docs/documentation/platform/secret-scanning/scan-locally) in your files, directories, and git repositories.

To scan your full git history, run:

```console
infisical scan --verbose
```

To block any commit that contains a secret, install a pre-commit hook:

```console
infisical scan install --pre-commit-hook
```

To scan every push to your GitHub, GitLab, and Bitbucket repositories, see [Secret Scanning](https://infisical.com/docs/documentation/platform/secret-scanning/overview).

## Open-source vs. paid

This repo is available under the [MIT expat license](https://github.com/Infisical/infisical/blob/main/LICENSE), with the exception of the `ee` directories, which contain premium enterprise features requiring an Infisical license.

If you are interested in managed Infisical Cloud or self-hosted Enterprise Offering, take a look at [our website](https://infisical.com/) or [book a meeting with us](https://infisical.cal.com/vlad/infisical-demo).

## Security

Please do not file GitHub issues or post on our public forum for security vulnerabilities, as they are public!

Infisical takes security issues very seriously. If you have any concerns about Infisical or believe you have uncovered a vulnerability, please report it privately through our vulnerability disclosure policy at <https://infisical.com/vulnerability-disclosure>. Scope, safe harbour and disclosure terms are all set out there. See also [SECURITY.md](./SECURITY.md).

Please report any security problems to us before disclosing them publicly. For compliance documentation and security questionnaires, use security@infisical.com instead.

## Contributing

Whether it's big or small, we love contributions. Check out our guide to see how to [get started](https://infisical.com/docs/contributing/getting-started/overview).

Not sure where to get started? You can:

- Join our <a href="https://community.infisical.com/">community</a>, and ask us any questions there.

## We are hiring!

If you're reading this, there is a strong chance you like the products we created.

You might also make a great addition to our team. We're growing fast and would love for you to [join us](https://infisical.com/careers).
