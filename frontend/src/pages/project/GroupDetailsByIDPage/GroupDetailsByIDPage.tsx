import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, PageHeader, Spinner } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { useGetWorkspaceGroupMembershipDetails } from "@app/hooks/api/projects/queries";
import { ProjectAccessControlTabs } from "@app/types/project";

import { GroupDetailsSection } from "./components/GroupDetailsSection";
import { GroupMembersSection } from "./components/GroupMembersSection";

const Page = () => {
  const groupId = useParams({
    strict: false,
    select: (el) => el.groupId as string
  });

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: groupMembership, isPending } = useGetWorkspaceGroupMembershipDetails(
    currentProject.id,
    groupId
  );

  if (isPending)
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {groupMembership ? (
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId: currentProject.id,
              orgId: currentOrg.id
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Groups
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Project Groups
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={groupMembership.group.name}
            description={`Group joined on ${formatRelative(new Date(groupMembership.createdAt || ""), new Date())}`}
          />
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
