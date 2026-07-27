import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreateProjectIdentityForm } from "./CreateProjectIdentityForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreateProjectIdentitySheet = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const canGrantPrivileges =
    permission.can(ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity) &&
    permission.can(
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionSub.Identity
    );

  const productLabel =
    currentProject.type === ProjectType.CertificateManager ? "Certificate Manager" : "Project";

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{`Add Machine Identity to ${productLabel}`}</SheetTitle>
          <SheetDescription>
            Create a new machine identity or assign an existing one
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <CreateProjectIdentityForm
            projectId={currentProject.id}
            projectType={currentProject.type}
            canGrantPrivileges={canGrantPrivileges}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
