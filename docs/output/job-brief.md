## Job Brief

**Topic:** How to integrate Infisical with the External Secrets Operator (ESO) using Kubernetes Auth as the authentication method.
**Scope:** Include: (1) configuring a Machine Identity with Kubernetes Auth on the Infisical platform, (2) deploying ESO into a Kubernetes cluster, (3) creating a SecretStore or ClusterSecretStore YAML pointing to Infisical, (4) creating an ExternalSecret YAML to sync individual secrets. Exclude: other auth methods (Universal Auth, AWS Auth, etc.), the Infisical Kubernetes Operator (separate product), CSI driver integration, Agent-based injection.
**Implied Diataxis Type:** How-to guide
**Target Audience:** Platform engineers and DevOps engineers who manage Kubernetes clusters and need to sync secrets from Infisical into Kubernetes workloads using ESO.
**Known Resources:**
- Infisical Kubernetes Auth docs: `documentation/platform/identities/kubernetes-auth.mdx`
- Infisical Machine Identities docs: `documentation/platform/identities/machine-identities.mdx`
- Infisical identity overview: `documentation/platform/identities/overview.mdx`
- ESO official Infisical provider docs: https://external-secrets.io/latest/provider/infisical/
- Kubernetes Auth API endpoints: `api-reference/endpoints/kubernetes-auth/`
- Existing references to ESO in: `documentation/platform/secrets-mgmt/concepts/secrets-delivery.mdx`, `documentation/getting-started/concepts/client-integrations.mdx`
**Constraints:** Use repo sources only for Infisical product behavior. Use official external docs (external-secrets.io, kubernetes.io) for ESO and Kubernetes concepts. Tag external sources appropriately.
