import { useProject } from "@app/context";
import { useGetIdentityPermissionAudit } from "@app/hooks/api/projects/queries";
import { PermissionAuditSheet } from "@app/views/PermissionAuditSheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  targetName: string;
};

export const IdentityPermissionAuditSheet = ({
  open,
  onOpenChange,
  identityId,
  targetName
}: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";

  const { data, isLoading } = useGetIdentityPermissionAudit(projectId, identityId);

  return (
    <PermissionAuditSheet
      open={open}
      onOpenChange={onOpenChange}
      targetName={targetName}
      targetType="identity"
      sources={data?.sources}
      isLoading={isLoading}
    />
  );
};
