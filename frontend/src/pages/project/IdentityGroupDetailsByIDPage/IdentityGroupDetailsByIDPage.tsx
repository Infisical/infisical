import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { EmptyState, PageHeader, Spinner } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetWorkspaceIdentityGroupMembershipDetails } from "@app/hooks/api/workspace";

import { IdentityGroupDetailsSection } from "./components/IdentityGroupDetailsSection";
import { IdentityGroupIdentitiesSection } from "./components/IdentityGroupIdentitiesSection";

const Page = () => {
  const identityGroupId = useParams({
    strict: false,
    select: (el) => el.identityGroupId as string
  });

  const { currentWorkspace } = useWorkspace();

  const { data: identityGroupMembership, isPending } =
    useGetWorkspaceIdentityGroupMembershipDetails(currentWorkspace.id, identityGroupId);

  if (isPending)
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {identityGroupMembership ? (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={identityGroupMembership.group.name} />
          <div className="flex">
            <div className="mr-4 w-96">
              <IdentityGroupDetailsSection identityGroupMembership={identityGroupMembership} />
            </div>
            <IdentityGroupIdentitiesSection identityGroupMembership={identityGroupMembership} />
          </div>
        </div>
      ) : (
        <EmptyState title="Error: Unable to find the identity group." className="py-12" />
      )}
    </div>
  );
};

export const IdentityGroupDetailsByIDPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
        <link rel="icon" type="image/svg+xml" href="/infisical.svg" />
      </Helmet>
      <Page />
    </>
  );
};
