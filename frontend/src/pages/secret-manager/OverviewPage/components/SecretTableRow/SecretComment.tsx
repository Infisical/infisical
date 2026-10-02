import { useState } from "react";
import { subject } from "@casl/ability";
import { MessageSquareIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

type Props = {
  secret?: Pick<SecretV3RawSanitized, "comment" | "tags" | "revokedProjectFolderGrant">;
  secretName: string;
  environment: string;
  environmentName: string;
  secretPath: string;
  importSource?: { environmentName: string; secretPath: string };
};

export const SecretComment = ({
  secret,
  secretName,
  environment,
  environmentName,
  secretPath,
  importSource
}: Props) => {
  const { permission } = useProjectPermission();
  const [isOpen, setIsOpen] = useState(false);
  const canRead = importSource
    ? permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
      )
    : hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment,
          secretPath,
          secretName,
          secretTags: secret?.tags?.map(({ slug }) => slug) ?? []
        }
      );

  if (!canRead || secret?.revokedProjectFolderGrant) {
    return <span className="text-xs text-muted">Access denied</span>;
  }

  if (!secret) return <span className="text-xs text-muted">No secret</span>;
  if (secret.comment === undefined) {
    return <span className="text-xs text-muted">Comment unavailable</span>;
  }
  if (!secret.comment) return <span className="text-xs text-muted">No comment</span>;

  return (
    <div className="min-w-0 space-y-1 text-left text-sm text-foreground">
      <p className="line-clamp-3 break-words whitespace-pre-wrap">{secret.comment}</p>
      {importSource && (
        <p className="text-xs break-words text-import">
          Imported from {importSource.environmentName} · {importSource.secretPath}
        </p>
      )}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            size="xs"
            variant="link"
            aria-label={`Read full comment for ${secretName} in ${environmentName}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <MessageSquareIcon />
            Read Full Comment
          </Button>
        </DialogTrigger>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Secret Comment</DialogTitle>
            <DialogDescription className="break-words">
              {secretName} · {environmentName} · {secretPath}
            </DialogDescription>
          </DialogHeader>
          <DialogBody tabIndex={0} role="document">
            {importSource && (
              <p className="mb-3 text-xs break-words text-import">
                Imported from {importSource.environmentName} · {importSource.secretPath}
              </p>
            )}
            <p className="break-words whitespace-pre-wrap">{secret.comment}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
