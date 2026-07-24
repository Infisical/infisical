import { useNavigate } from "@tanstack/react-router";
import { FileKeyIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetTemplateUsages } from "@app/hooks/api/identityAuthTemplates";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
};

export const MachineAuthTemplateUsagesModal = ({
  isOpen,
  onClose,
  templateId,
  templateName
}: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();

  const organizationId = currentOrg?.id || "";

  const { data: usages = [], isPending } = useGetTemplateUsages({
    templateId,
    organizationId
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usages for Identity Auth Template: {templateName}</DialogTitle>
        </DialogHeader>
        {isPending || usages.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity Name</TableHead>
                <TableHead>Identity ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={`template-usage-skeleton-${index + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-56" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                usages.map((usage) => (
                  <TableRow
                    key={`usage-${usage.identityId}`}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/identities/$identityId",
                        params: { identityId: usage.identityId, orgId: organizationId }
                      })
                    }
                  >
                    <TableCell>{usage.identityName}</TableCell>
                    <TableCell className="text-muted">{usage.identityId}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileKeyIcon />
              </EmptyMedia>
              <EmptyTitle>This template is not currently being used by any identities</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </DialogContent>
    </Dialog>
  );
};
