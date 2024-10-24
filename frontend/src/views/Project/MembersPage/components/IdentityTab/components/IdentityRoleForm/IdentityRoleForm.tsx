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
      <Alert
        title="Additional privileges have been moved and now offer full permission customization."
        className="mt-4 border-primary/50 bg-primary/10"
      >
        <AlertDescription>
          <Link
            href={`/project/${currentWorkspace?.id || ""}/identities/${
              identityProjectMember?.identity?.id
            }`}
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
