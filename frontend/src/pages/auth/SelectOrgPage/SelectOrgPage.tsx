import { useNavigate, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import { Mfa } from "@app/components/auth/Mfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { ROUTE_PATHS } from "@app/const/routes";
import { MfaMethod } from "@app/hooks/api/auth/types";

import { navigateUserToOrg } from "../LoginPage/Login.utils";
import { SelectOrganizationSection } from "./SelectOrgSection";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useUser } from "@app/context";

export const SelectOrganizationPage = () => {
  const search = useSearch({ from: ROUTE_PATHS.Auth.SelectOrgPage.id });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useUser();

  // IdP MFA redirect: backend sends mfaToken + mfaMethod when org-scoped SSO requires MFA
  const { mfaToken, mfaMethod } = search;

  if (mfaToken && mfaMethod) {
    SecurityClient.setMfaToken(mfaToken);

    // Decode the MFA token to get the organizationId for post-MFA navigation
    const decoded = jwtDecode(mfaToken) as { organizationId?: string };

    return (
      <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Helmet>
          <title>MFA | Infisical</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
          <meta property="og:title" content={t("login.og-title") ?? ""} />
          <meta name="og:description" content={t("login.og-description") ?? ""} />
        </Helmet>
        <Mfa
          email={user?.email || ""}
          method={mfaMethod as MfaMethod}
          successCallback={async () => {
            if (decoded.organizationId) {
              localStorage.setItem("orgData.id", decoded.organizationId);
              navigateUserToOrg({ navigate, organizationId: decoded.organizationId });
            } else {
              navigate({ to: "/login/select-organization", search: {}, replace: true });
            }
          }}
        />
      </div>
    );
  }

  return <SelectOrganizationSection />;
};
