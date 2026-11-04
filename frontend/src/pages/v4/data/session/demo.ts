import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import type { V4Session } from "./contract";

export const demoSession: V4Session = {
  user: { name: "Sarah Lin", email: "sarah@acme.dev" },
  organization: { id: V4_DEMO_ORG_ID, name: "Acme Corp", isSubOrganization: false },
  organizations: [
    { id: V4_DEMO_ORG_ID, name: "Acme Corp", group: "Current organization" },
    { id: "acme-eu", name: "acme-eu", group: "Sub-organizations" },
    { id: "acme-labs", name: "acme-labs", group: "Sub-organizations" },
    { id: "globex", name: "Globex", group: "Other organizations" },
    { id: "initech", name: "Initech", group: "Other organizations" }
  ],
  projects: [
    { id: "payments-api", name: "payments-api", type: ProjectType.SecretManager },
    { id: "web-dashboard", name: "web-dashboard", type: ProjectType.SecretManager },
    { id: "platform-core", name: "platform-core", type: ProjectType.SecretManager },
    { id: "kms-keys", name: "kms-keys", type: ProjectType.KMS },
    { id: "secret-scanning", name: "secret-scanning", type: ProjectType.SecretScanning },
    { id: "internal-pki", name: "internal-pki", type: ProjectType.CertificateManager }
  ]
};
