import { ConfirmationAlertDialog } from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  isOpen: boolean;
  roleName: string;
  confirmationKey: string;
  isPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
};

export const DeleteProjectRoleDialog = ({
  isOpen,
  roleName,
  confirmationKey,
  isPending,
  onOpenChange,
  onConfirm
}: Props) => {
  const { currentProject } = useProject();

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete "${roleName}"?`}
      description={`This ${currentProject.type === ProjectType.CertificateManager ? "role" : "project role"} and its policies will be deleted. This action cannot be undone.`}
      confirmKey={confirmationKey}
      confirmLabel="Delete Role"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
};
