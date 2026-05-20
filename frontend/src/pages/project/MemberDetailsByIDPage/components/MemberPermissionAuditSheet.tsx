import { useProject } from "@app/context";
import { useGetMembershipPermissionAudit } from "@app/hooks/api/projects/queries";
import { PermissionAuditSheet } from "@app/views/PermissionAuditSheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string;
  targetName: string;
};

export const MemberPermissionAuditSheet = ({
  open,
  onOpenChange,
  membershipId,
  targetName
}: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "";

  const { data, isLoading } = useGetMembershipPermissionAudit(projectId, membershipId);

  return (
    <PermissionAuditSheet
      open={open}
      onOpenChange={onOpenChange}
      targetName={targetName}
      targetType="user"
      sources={data?.sources}
      isLoading={isLoading}
    />
  );
};
