import { Button } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { useGetWorkspaceUserDetails } from "@app/hooks/api";
import { faChevronLeft, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";

export const MemberDetailsPage = withProjectPermission(
  () => {
    const router = useRouter();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?.id || "";
    const membershipId = router.query.membershipId as string;

    const { data: membershipDetails, isLoading: isMembershipDetailsLoading } =
      useGetWorkspaceUserDetails(workspaceId, membershipId);

    return (
      <div className="container mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 p-6 text-white">
        <div className="mb-4">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() => {
              router.push(`/project/${workspaceId}/members`);
            }}
            className="mb-4"
          >
            Project Access Control
          </Button>
        </div>
        <div className="mb-4">
          <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-center justify-between ">
              <h3 className="text-lg font-semibold text-mineshaft-100">Project User Management</h3>
              <div>
                <Button colorSchema="danger" variant="outline_bg" size="xs">
                  Remove
                </Button>
              </div>
            </div>
            <div className="">
              {membershipDetails && (
                <p className="capitalize">
                  {membershipDetails.user.firstName || membershipDetails.user.lastName
                    ? `${membershipDetails.user.firstName} ${membershipDetails.user.lastName}`
                    : "-"}
                </p>
              )}
              <div className="mt-2 text-sm text-gray-400">
                Joined on{" "}
                {membershipDetails?.createdAt &&
                  format(new Date(membershipDetails?.createdAt || ""), "yyyy-MM-dd")}
              </div>
            </div>
          </div>
        </div>
        <MemberRoleDetailsSection
          membershipDetails={membershipDetails}
          isMembershipDetailsLoading={isMembershipDetailsLoading}
        />
      </div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Member
  }
);
