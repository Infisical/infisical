import Link from "next/link";

import { Alert, AlertDescription } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { IdentityMembership } from "@app/hooks/api/identities/types";

import { IdentityRbacSection } from "./IdentityRbacSection";

type Props = {
  identityProjectMember: IdentityMembership;
  onOpenUpgradeModal: (title: string) => void;
};
export const IdentityRoleForm = ({ identityProjectMember, onOpenUpgradeModal }: Props) => {
  const { currentWorkspace } = useWorkspace();

  return (
    <div>
      <IdentityRbacSection
        identityProjectMember={identityProjectMember}
        onOpenUpgradeModal={onOpenUpgradeModal}
      />
      <Alert className="mt-4">
        <AlertDescription>
          Additional privileges now offer full permissions and have been moved to a new screen.
          <br />
          <Link
            href={`/project/${currentWorkspace?.id || ""}/identitiesq/${
              identityProjectMember?.identity?.id
            }`}
          >
            <span className="cursor-pointer text-primary">Click here to access them.</span>
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
};
