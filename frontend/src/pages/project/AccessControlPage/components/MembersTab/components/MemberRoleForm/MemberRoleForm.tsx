import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { TWorkspaceUser } from "@app/hooks/api/types";

import { MemberRbacSection } from "./MemberRbacSection";

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: (title: string) => void;
};
export const MemberRoleForm = ({ projectMember, onOpenUpgradeModal }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  return (
    <div>
      <MemberRbacSection projectMember={projectMember} onOpenUpgradeModal={onOpenUpgradeModal} />
      <Alert
        title="Additional privileges have been moved and now offer full permission customization."
        className="mt-4 border-primary/50 bg-primary/10"
      >
        <AlertDescription>
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/members/$membershipId` as const}
            params={{
              orgId: currentOrg.id,
              projectId: currentProject.id,
              membershipId: projectMember.id
            }}
          >
            <span className="cursor-pointer text-primary underline underline-offset-2">
              Click here to access them now
            </span>
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
};
