import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
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

  const {
    data,
    isLoading,
    isError,
    refetch: refetchPermissionAudit
  } = useGetMembershipPermissionAudit(projectId, membershipId);

  if (isError) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full flex-col gap-y-0 p-0 sm:max-w-6xl">
          <SheetHeader className="border-b">
            <SheetTitle>Permission Audit</SheetTitle>
            <SheetDescription>Review effective access for {targetName}</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>Could not load permission audit</AlertTitle>
              <AlertDescription>
                <span>Retry to load this user&apos;s effective permissions.</span>
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() => refetchPermissionAudit().catch(() => undefined)}
                >
                  <RefreshCwIcon />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

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
