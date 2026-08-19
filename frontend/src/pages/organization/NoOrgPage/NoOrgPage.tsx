import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { ContentLoader } from "@app/components/v2";
import {
  fetchOrganizations,
  organizationKeys,
  useCreateOrg,
  useSelectOrganization
} from "@app/hooks/api";

const PERSONAL_ORG_NAME = "Personal Org";
// A useRef gate resets on a full unmount/remount; this sessionStorage flag survives it, so an
// interrupted-then-remounted page can't fire a second createOrg and leave a duplicate org behind.
const CREATION_STARTED_KEY = "personalOrgCreationStarted";

const generatePersonalOrgName = (existingNames: string[]) => {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const isTaken = (candidate: string) => taken.has(candidate.trim().toLowerCase());

  if (!isTaken(PERSONAL_ORG_NAME)) return PERSONAL_ORG_NAME;

  let suffix = 1;
  while (isTaken(`${PERSONAL_ORG_NAME} ${suffix}`)) {
    suffix += 1;
  }
  return `${PERSONAL_ORG_NAME} ${suffix}`;
};

export const NoOrgPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mutateAsync: createOrg } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrg } = useSelectOrganization();

  // Guards against React strict-mode's double-invoke (and re-renders) creating two orgs.
  const hasRun = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (hasRun.current) return;

    hasRun.current = true;

    if (sessionStorage.getItem(CREATION_STARTED_KEY)) return;
    sessionStorage.setItem(CREATION_STARTED_KEY, "true");

    const createPersonalOrg = async () => {
      const existingOrgs = await fetchOrganizations().catch(() => []);
      const orgName = generatePersonalOrgName(existingOrgs.map((org) => org.name));

      let organization;
      try {
        organization = await createOrg({ name: orgName });
      } catch {
        // Nothing was created, so reset both guards and let the user create an org manually.
        createNotification({
          text: "Couldn't create your organization automatically. Please create one below.",
          type: "error"
        });
        setFailed(true);
        hasRun.current = false;
        sessionStorage.removeItem(CREATION_STARTED_KEY);
        return;
      }

      try {
        await selectOrg({ organizationId: organization.id });

        localStorage.setItem("orgData.id", organization.id);

        navigate({
          to: "/organizations/$orgId/projects",
          params: { orgId: organization.id }
        });
      } catch {
        // The org was created but selecting it failed. Showing CreateOrgModal here would create a
        // second, orphaned org, so refresh the cached org list and hand off to the org picker,
        // which auto-selects the now-existing single org and finishes login.
        createNotification({
          text: "Created your organization, but couldn't open it automatically. Redirecting...",
          type: "error"
        });
        await queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
        navigate({ to: "/login/select-organization" });
      } finally {
        sessionStorage.removeItem(CREATION_STARTED_KEY);
      }
    };

    createPersonalOrg();
  }, [createOrg, selectOrg, navigate, queryClient]);

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="min-h-screen bg-background">
        {failed ? (
          <CreateOrgModal isOpen logoutOnClose />
        ) : (
          <ContentLoader text="Setting up your organization..." />
        )}
      </div>
    </>
  );
};
