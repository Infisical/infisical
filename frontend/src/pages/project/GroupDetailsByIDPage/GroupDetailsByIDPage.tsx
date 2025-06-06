import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, PageHeader, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useGetWorkspaceGroupMembershipDetails } from "@app/hooks/api/workspace/queries";

import { GroupDetailsSection } from "./components/GroupDetailsSection";
import { GroupMembersSection } from "./components/GroupMembersSection";

const Page = () => {
  const groupId = useParams({
    strict: false,
    select: (el) => el.groupId as string
  });

  const { currentWorkspace } = useWorkspace();

  const { data: groupMembership, isPending } = useGetWorkspaceGroupMembershipDetails(
    currentWorkspace.id,
    groupId
  );

  if (isPending)
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {groupMembership ? (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={groupMembership.group.name} />
          <div className="flex">
            <div className="mr-4 w-96">
              <GroupDetailsSection groupMembership={groupMembership} />
            </div>
            <GroupMembersSection groupMembership={groupMembership} />
          </div>
        </div>
      ) : (
        <EmptyState title="Error: Unable to find the group." className="py-12" />
      )}
    </div>
  );
};

export const GroupDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Project Group" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Groups}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
