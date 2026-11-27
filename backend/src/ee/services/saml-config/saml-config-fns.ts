import { getConfig } from "@app/lib/config/env";

export const buildSamlAcsUrl = (samlConfigId: string) => `${getConfig().SITE_URL}/api/v1/sso/saml2/${samlConfigId}`;

export const getSamlSpEntityId = () => getConfig().SITE_URL || "";
