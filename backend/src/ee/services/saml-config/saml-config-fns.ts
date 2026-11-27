import { getConfig } from "@app/lib/config/env";
import { sanitizeUrlForLog } from "@app/lib/logger/sanitize-url";

import { TSamlConfigAuditFields } from "./saml-config-types";

export const buildSamlAcsUrl = (samlConfigId: string) => `${getConfig().SITE_URL}/api/v1/sso/saml2/${samlConfigId}`;

export const getSamlSpEntityId = () => getConfig().SITE_URL || "";

// The entry point can carry tokens in its path or query
export const sanitizeSamlConfigAuditFields = <T extends Partial<TSamlConfigAuditFields>>(fields: T): T =>
  fields.entryPoint ? { ...fields, entryPoint: sanitizeUrlForLog(fields.entryPoint) } : fields;
