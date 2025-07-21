<h1 align="center">
  <img width="300" src="/img/logoname-white.svg#gh-dark-mode-only" alt="infisical">
</h1>
<p align="center">
  <p align="center"><b>The open-source secret management platform</b>: Sync secrets/configs across your team/infrastructure and prevent secret leaks.</p>
</p>

<h4 align="center">
  <a href="https://infisical.com/slack">Slack</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">Self-Hosting</a> |
  <a href="https://infisical.com/docs/documentation/getting-started/introduction">Docs</a> |
  <a href="https://www.infisical.com">Website</a> |
  <a href="https://infisical.com/careers">Hiring (Remote/SF)</a>
</h4>

<h4 align="center">
  <a href="https://github.com/Infisical/infisical/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Infisical is released under the MIT license." />
  </a>
  <a href="https://github.com/infisical/infisical/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs welcome!" />
  </a>
  <a href="https://github.com/Infisical/infisical/issues">
    <img src="https://img.shields.io/github/commit-activity/m/infisical/infisical" alt="git commit activity" />
  </a>
  <a href="https://cloudsmith.io/~infisical/repos/">
    <img src="https://img.shields.io/badge/Downloads-6.95M-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://infisical.com/slack">
    <img src="https://img.shields.io/badge/chat-on%20Slack-blueviolet" alt="Slack community channel" />
  </a>
  <a href="https://twitter.com/infisical">
    <img src="https://img.shields.io/twitter/follow/infisical?label=Follow" alt="Infisical Twitter" />
  </a>
</h4>

<img src="/img/infisical_github_repo2.png" width="100%" alt="Dashboard" />

## Introduction

**[Infisical](https://infisical.com)** is the open source secret management platform that teams use to centralize their application configuration and secrets like API keys and database credentials as well as manage their internal PKI.

We're on a mission to make security tooling more accessible to everyone, not just security teams, and that means redesigning the entire developer experience from ground up.

## Features

### Secrets Management:

- **[Dashboard](https://infisical.com/docs/documentation/platform/project)**: Manage secrets across projects and environments (e.g. development, production, etc.) through a user-friendly interface.
- **[Native Integrations](https://infisical.com/docs/integrations/overview)**: Sync secrets to platforms like [GitHub](https://infisical.com/docs/integrations/cicd/githubactions), [Vercel](https://infisical.com/docs/integrations/cloud/vercel), [AWS](https://infisical.com/docs/integrations/cloud/aws-secret-manager), and use tools like [Terraform](https://infisical.com/docs/integrations/frameworks/terraform), [Ansible](https://infisical.com/docs/integrations/platforms/ansible), and more.
- **[Secret versioning](https://infisical.com/docs/documentation/platform/secret-versioning)** and **[Point-in-Time Recovery](https://infisical.com/docs/documentation/platform/pit-recovery)**: Keep track of every secret and project state; roll back when needed.
- **[Secret Rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview)**: Rotate secrets at regular intervals for services like [PostgreSQL](https://infisical.com/docs/documentation/platform/secret-rotation/postgres-credentials), [MySQL](https://infisical.com/docs/documentation/platform/secret-rotation/mysql), [AWS IAM](https://infisical.com/docs/documentation/platform/secret-rotation/aws-iam), and more.
- **[Dynamic Secrets](https://infisical.com/docs/documentation/platform/dynamic-secrets/overview)**: Generate ephemeral secrets on-demand for services like [PostgreSQL](https://infisical.com/docs/documentation/platform/dynamic-secrets/postgresql), [MySQL](https://infisical.com/docs/documentation/platform/dynamic-secrets/mysql), [RabbitMQ](https://infisical.com/docs/documentation/platform/dynamic-secrets/rabbit-mq), and more.
- **[Secret Scanning and Leak Prevention](https://infisical.com/docs/cli/scanning-overview)**: Prevent secrets from leaking to git.
- **[Infisical Kubernetes Operator](https://infisical.com/docs/documentation/getting-started/kubernetes)**: Deliver secrets to your Kubernetes workloads and automatically reload deployments.
- **[Infisical Agent](https://infisical.com/docs/infisical-agent/overview)**: Inject secrets into applications without modifying any code logic.

### Infisical (Internal) PKI:

- **[Private Certificate Authority](https://infisical.com/docs/documentation/platform/pki/private-ca)**: Create CA hierarchies, configure [certificate templates](https://infisical.com/docs/documentation/platform/pki/certificates#guide-to-issuing-certificates) for policy enforcement, and start issuing X.509 certificates.
- **[Certificate Management](https://infisical.com/docs/documentation/platform/pki/certificates)**: Manage the certificate lifecycle from [issuance](https://infisical.com/docs/documentation/platform/pki/certificates#guide-to-issuing-certificates) to [revocation](https://infisical.com/docs/documentation/platform/pki/certificates#guide-to-revoking-certificates) with support for CRL.
- **[Alerting](https://infisical.com/docs/documentation/platform/pki/alerting)**: Configure alerting for expiring CA and end-entity certificates.
- **[Infisical PKI Issuer for Kubernetes](https://infisical.com/docs/documentation/platform/pki/pki-issuer)**: Deliver TLS certificates to your Kubernetes workloads with automatic renewal.
- **[Enrollment over Secure Transport](https://infisical.com/docs/documentation/platform/pki/est)**: Enroll and manage certificates via EST protocol.

### Infisical Key Management System (KMS):

- **[Cryptographic Keys](https://infisical.com/docs/documentation/platform/kms)**: Centrally manage keys across projects through a user-friendly interface or via the API.
- **[Encrypt and Decrypt Data](https://infisical.com/docs/documentation/platform/kms#guide-to-encrypting-data)**: Use symmetric keys to encrypt and decrypt data.

### Infisical SSH

- **[Signed SSH Certificates](https://infisical.com/docs/documentation/platform/ssh)**: Issue ephemeral SSH credentials for secure, short-lived, and centralized access to infrastructure.

### General Platform:

- **Authentication Methods**: Authenticate machine identities with Infisical using a cloud-native or platform agnostic authentication method ([Kubernetes Auth](https://infisical.com/docs/documentation/platform/identities/kubernetes-auth), [GCP Auth](https://infisical.com/docs/documentation/platform/identities/gcp-auth), [Azure Auth](https://infisical.com/docs/documentation/platform/identities/azure-auth), [AWS Auth](https://infisical.com/docs/documentation/platform/identities/aws-auth), [OIDC Auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general), [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth)).
- **[Access Controls](https://infisical.com/docs/documentation/platform/access-controls/overview)**: Define advanced authorization controls for users and machine identities with [RBAC](https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls), [additional privileges](https://infisical.com/docs/documentation/platform/access-controls/additional-privileges), [temporary access](https://infisical.com/docs/documentation/platform/access-controls/temporary-access), [access requests](https://infisical.com/docs/documentation/platform/access-controls/access-requests), [approval workflows](https://infisical.com/docs/documentation/platform/pr-workflows), and more.
- **[Audit logs](https://infisical.com/docs/documentation/platform/audit-logs)**: Track every action taken on the platform.
- **[Self-hosting](https://infisical.com/docs/self-hosting/overview)**: Deploy Infisical on-prem or cloud with ease; keep data on your own infrastructure.
- **[Infisical SDK](https://infisical.com/docs/sdks/overview)**: Interact with Infisical via client SDKs ([Node](https://infisical.com/docs/sdks/languages/node), [Python](https://github.com/Infisical/python-sdk-official?tab=readme-ov-file#infisical-python-sdk), [Go](https://infisical.com/docs/sdks/languages/go), [Ruby](https://infisical.com/docs/sdks/languages/ruby), [Java](https://infisical.com/docs/sdks/languages/java), [.NET](https://infisical.com/docs/sdks/languages/csharp))
- **[Infisical CLI](https://infisical.com/docs/cli/overview)**: Interact with Infisical via CLI; useful for injecting secrets into local development and CI/CD pipelines.
- **[Infisical API](https://infisical.com/docs/api-reference/overview/introduction)**: Interact with Infisical via API.

## Getting started

Check out the [Quickstart Guides](https://infisical.com/docs/getting-started/introduction)

| Use Infisical Cloud                                                                                                                                     | Deploy Infisical on premise                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The fastest and most reliable way to <br> get started with Infisical is signing up <br> for free to [Infisical Cloud](https://app.infisical.com/login). | <br> View all [deployment options](https://infisical.com/docs/self-hosting/overview) |

### Run Infisical locally

To set up and run Infisical locally, make sure you have Git and Docker installed on your system. Then run the command for your system:

Linux/macOS:

```console
git clone https://github.com/Infisical/infisical && cd "$(basename $_ .git)" && cp .env.example .env && docker compose -f docker-compose.prod.yml up
```

Windows Command Prompt:

```console
git clone https://github.com/Infisical/infisical && cd infisical && copy .env.example .env && docker compose -f docker-compose.prod.yml up
```

Create an account at `http://localhost:80`

### Scan and prevent secret leaks

On top managing secrets with Infisical, you can also [scan for over 140+ secret types]() in your files, directories and git repositories.

To scan your full git history, run:

```
infisical scan --verbose
```

Install pre commit hook to scan each commit before you push to your repository

```
infisical scan install --pre-commit-hook
```

Learn about Infisical's code scanning feature [here](https://infisical.com/docs/cli/scanning-overview)

## Open-source vs. paid

This repo available under the [MIT expat license](https://github.com/Infisical/infisical/blob/main/LICENSE), with the exception of the `ee` directory which will contain premium enterprise features requiring a Infisical license.

If you are interested in managed Infisical Cloud of self-hosted Enterprise Offering, take a look at [our website](https://infisical.com/) or [book a meeting with us](https://infisical.cal.com/vlad/infisical-demo).

## Security

Please do not file GitHub issues or post on our public forum for security vulnerabilities, as they are public!

Infisical takes security issues very seriously. If you have any concerns about Infisical or believe you have uncovered a vulnerability, please get in touch via the e-mail address security@infisical.com. In the message, try to provide a description of the issue and ideally a way of reproducing it. The security team will get back to you as soon as possible.

Note that this security address should be used only for undisclosed vulnerabilities. Please report any security problems to us before disclosing it publicly.

## Contributing

Whether it's big or small, we love contributions. Check out our guide to see how to [get started](https://infisical.com/docs/contributing/getting-started).

Not sure where to get started? You can:

- Join our <a href="https://infisical.com/slack">Slack</a>, and ask us any questions there.

## We are hiring!

If you're reading this, there is a strong chance you like the products we created.

You might also make a great addition to our team. We're growing fast and would love for you to [join us](https://infisical.com/careers).
