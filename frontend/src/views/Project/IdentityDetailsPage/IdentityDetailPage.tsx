import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, EmptyState, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useDeleteIdentityFromWorkspace,
  useGetWorkspaceIdentityMembershipDetails
} from "@app/hooks/api";

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

    const { mutateAsync: deleteMutateAsync, isLoading: isDeletingIdentity } =
      useDeleteIdentityFromWorkspace();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "deleteIdentity",
      "upgradePlan"
    ] as const);

    const onRemoveIdentitySubmit = async () => {
      try {
        await deleteMutateAsync({
          identityId,
          workspaceId
        });
        createNotification({
          text: "Successfully removed identity from project",
          type: "success"
        });
        handlePopUpClose("deleteIdentity");
        router.push(`/${currentWorkspace?.type}/${workspaceId}/members?selectedTab=identities`);
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to remove identity from project";

        createNotification({
          text,
          type: "error"
        });
      }
    };

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
              router.push(
                `/${currentWorkspace?.type}/${workspaceId}/members?selectedTab=identities`
              );
            }}
            className="mb-4"
          >
            {currentWorkspace?.type ? getProjectTitle(currentWorkspace?.type) : "Project"} Access
            Control
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
                      a={subject(ProjectPermissionSub.Identity, {
                        identityId: identityMembershipDetails?.identity?.id
                      })}
                      renderTooltip
                      allowedLabel="Remove from project"
                    >
                      {(isAllowed) => (
                        <Button
                          colorSchema="danger"
                          variant="outline_bg"
                          size="xs"
                          isDisabled={!isAllowed}
                          isLoading={isDeletingIdentity}
                          onClick={() => handlePopUpOpen("deleteIdentity")}
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
            <DeleteActionModal
              isOpen={popUp.deleteIdentity.isOpen}
              title={`Are you sure want to remove ${identityMembershipDetails?.identity?.name} from the project?`}
              onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
              deleteKey="remove"
              onDeleteApproved={() => onRemoveIdentitySubmit()}
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
