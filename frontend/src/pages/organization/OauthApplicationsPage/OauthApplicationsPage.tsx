import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { OrgOauthClientsTab } from "@app/pages/organization/SettingsPage/components/OrgOauthClientsTab";

export const OauthApplicationsPage = () => {
  const { isSubOrganization } = useOrganization();

  return (
    <>
      <PageTitle title="OAuth Applications" />
      <link rel="icon" href="/infisical.ico" />
      <meta property="og:image" content="/images/message.png" />
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="flex w-full max-w-8xl flex-col">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="OAuth Applications"
            description="Control how external platforms access Infisical on behalf of your users via OAuth 2.0."
          />
          <OrgOauthClientsTab />
        </div>
      </div>
    </>
  );
};
