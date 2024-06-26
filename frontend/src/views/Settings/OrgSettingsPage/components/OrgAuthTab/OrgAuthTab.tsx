import { useCallback } from "react";

import { OrgPermissionActions, OrgPermissionSubjects, useServerConfig } from "@app/context";
import { withPermission } from "@app/hoc";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgOIDCSection } from "./OrgOIDCSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    const {
      config: { enabledLoginMethods }
    } = useServerConfig();

    const shouldDisplaySection = useCallback(
      (method: LoginMethod) => !enabledLoginMethods || enabledLoginMethods.includes(method),
      [enabledLoginMethods]
    );

    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        {shouldDisplaySection(LoginMethod.SAML) && (
          <>
            <OrgGeneralAuthSection />
            <OrgSSOSection />
          </>
        )}
        {shouldDisplaySection(LoginMethod.OIDC) && <OrgOIDCSection />}
        {shouldDisplaySection(LoginMethod.LDAP) && <OrgLDAPSection />}
        <OrgScimSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
