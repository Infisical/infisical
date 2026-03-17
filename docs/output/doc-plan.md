## Doc Plan

### Diataxis Classification
**How-to guide** — a single document guiding the reader through a specific integration task with clear steps and outcomes.

### Outline

1. **Frontmatter** (title, sidebarTitle, description)
2. **Intro paragraph** — What this guide covers, when to use ESO vs. the Infisical Kubernetes Operator
3. **Prerequisites** section
   - Infisical account with a project and secrets
   - Kubernetes cluster (v1.16+)
   - Helm installed
   - kubectl access
4. **Step 1: Create a Machine Identity with Kubernetes Auth**
   - Create the identity in Infisical (Org Settings > Access Control > Identities)
   - Configure Kubernetes Auth on the identity (fields: K8s host, token reviewer JWT, allowed SA names, allowed namespaces)
   - Add the identity to the target project with appropriate role
   - Note the identity ID for later use
5. **Step 2: Set Up the Token Reviewer** (collapsible options)
   - Option A: Dedicated reviewer service account (create SA, bind system:auth-delegator, create long-lived token Secret)
   - Option B: Client JWT as reviewer (bind system:auth-delegator to ESO's service account, leave Token Reviewer JWT empty)
   - Brief note about Gateway option (enterprise) with link
6. **Step 3: Install External Secrets Operator**
   - Helm commands to install ESO
7. **Step 4: Create the Kubernetes Secret for Identity Credentials**
   - YAML for the Secret containing `identityId`
8. **Step 5: Create the SecretStore**
   - Full YAML with Kubernetes Auth config
   - Field reference table for secretsScope
   - Note on ClusterSecretStore variant
   - Self-hosted note about hostAPI
9. **Step 6: Create the ExternalSecret**
   - Example: fetch individual secrets
   - Example: fetch all secrets with dataFrom
   - Example: fetch secrets by path filter
10. **Verify It Works** section
    - kubectl commands to check ExternalSecret status and resulting Secret
11. **Related Resources** — cards linking to Kubernetes Auth docs, Machine Identities, Infisical K8s Operator, CSI provider

### Linking Map
- Intro → Infisical Kubernetes Operator overview (as alternative)
- Step 1 → Kubernetes Auth doc (for full field reference)
- Step 1 → Machine Identities doc
- Step 2 → Kubernetes Auth doc (token reviewer section)
- Step 2 → Gateway overview (for gateway option)
- Related → Kubernetes Auth, Machine Identities, K8s Operator overview, CSI provider, Fetching Secrets overview
