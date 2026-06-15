import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { ContentLoader } from "@app/components/v2";
import { useCreateOrg, useSelectOrganization } from "@app/hooks/api";

const PERSONAL_ORG_NAME = "Personal Org";

export const NoOrgPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutateAsync: createOrg } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrg } = useSelectOrganization();

  // Guards against React strict-mode's double-invoke (and re-renders) creating two orgs.
  const hasRun = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const createPersonalOrg = async () => {
      try {
        const organization = await createOrg({ name: PERSONAL_ORG_NAME });

        await selectOrg({ organizationId: organization.id });

        localStorage.setItem("orgData.id", organization.id);

        navigate({
          to: "/organizations/$orgId/projects",
          params: { orgId: organization.id }
        });
      } catch {
        createNotification({
          text: "Couldn't create your organization automatically. Please create one below.",
          type: "error"
        });
        setFailed(true);
      }
    };

    createPersonalOrg();
  }, [createOrg, selectOrg, navigate]);

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="min-h-screen bg-bunker-800">
        {failed ? (
          <CreateOrgModal isOpen logoutOnClose />
        ) : (
          <ContentLoader text="Setting up your organization..." />
        )}
      </div>
    </>
  );
};
