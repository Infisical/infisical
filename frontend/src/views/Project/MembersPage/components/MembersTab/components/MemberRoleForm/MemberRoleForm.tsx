import Link from "next/link";

import { Alert, AlertDescription } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { TWorkspaceUser } from "@app/hooks/api/types";

import { MemberRbacSection } from "./MemberRbacSection";

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: (title: string) => void;
};
export const MemberRoleForm = ({ projectMember, onOpenUpgradeModal }: Props) => {
  const { currentWorkspace } = useWorkspace();
  return (
    <div>
      <MemberRbacSection projectMember={projectMember} onOpenUpgradeModal={onOpenUpgradeModal} />
      <Alert className="mt-4">
        <AlertDescription>
          Additional privileges now offer full permissions and have been moved to a new screen.
          <br />
          <Link href={`/project/${currentWorkspace?.id || ""}/members/${projectMember?.id}`}>
            <span className="cursor-pointer text-primary">Click here to access them.</span>
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
};
