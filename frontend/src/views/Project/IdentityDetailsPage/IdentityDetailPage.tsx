import { useRouter } from "next/router";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, EmptyState, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { useGetWorkspaceIdentityMembershipDetails } from "@app/hooks/api";

import { IdentityProjectAdditionalPrivilegeSection } from "./components/IdentityProjectAdditionalPrivilegeSection";
import { IdentityRoleDetailsSection } from "./components/IdentityRoleDetailsSection";

export const IdentityDetailsPage = withProjectPermission(
  () => {
    const router = useRouter();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?.id || "";
    const identityId = router.query.identityId as string;

    const { data: identityMembershipDetails, isLoading: isMembershipDetailsLoading } =
      useGetWorkspaceIdentityMembershipDetails(workspaceId, identityId);

    if (isMembershipDetailsLoading) {
      return (
        <div className="flex w-full items-center justify-center p-24">
          <Spinner />
        </div>
      );
    }

    return (
      <div className="container mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 p-6 text-white">
        <div className="mb-4">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() => {
              router.push(`/project/${workspaceId}/members?selectedTab=identities`);
            }}
            className="mb-4"
          >
            Project Access Control
          </Button>
        </div>
        {identityMembershipDetails ? (
          <>
            <div className="mb-4">
              <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                <div className="mb-4 flex items-center justify-between ">
                  <h3 className="text-xl font-semibold text-mineshaft-100">
                    Project Identity Access
                  </h3>
                  <div>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Identity}
                      renderTooltip
                      allowedLabel="Remove from project"
                    >
                      {(isAllowed) => (
                        <Button
                          colorSchema="danger"
                          variant="outline_bg"
                          size="xs"
                          isDisabled={!isAllowed}
                        >
                          Remove Identity
                        </Button>
                      )}
                    </ProjectPermissionCan>
                  </div>
                </div>
                <div className="flex gap-12">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">Name</span>
                    {identityMembershipDetails && (
                      <p className="text-lg capitalize">
                        {identityMembershipDetails?.identity?.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-400">
                  Joined on{" "}
                  {identityMembershipDetails?.createdAt &&
                    format(new Date(identityMembershipDetails?.createdAt || ""), "yyyy-MM-dd")}
                </div>
              </div>
            </div>
            <IdentityRoleDetailsSection
              identityMembershipDetails={identityMembershipDetails}
              isMembershipDetailsLoading={isMembershipDetailsLoading}
            />
            <IdentityProjectAdditionalPrivilegeSection
              identityMembershipDetails={identityMembershipDetails}
            />
          </>
        ) : (
          <EmptyState title="Error: Unable to find the identity." className="py-12" />
        )}
      </div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Identity
  }
);
