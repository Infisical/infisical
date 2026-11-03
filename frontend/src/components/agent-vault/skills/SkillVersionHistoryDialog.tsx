import { useState } from "react";
import { format } from "date-fns";
import { HistoryIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { formatSkillBytes } from "@app/helpers/agentVaultSkills";
import {
  useListAgentVaultSkillVersions,
  useRestoreAgentVaultSkillVersion
} from "@app/hooks/api/agentVault";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

import { RollBackSkillAlertDialog } from "./RollBackSkillAlertDialog";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  skill: Pick<TAgentVaultSkill, "id" | "name" | "latestVersion">;
  viewedVersion: number;
  canRollBack: boolean;
  onView: (version: number) => void;
  onRolledBack: () => void;
};

export const SkillVersionHistoryDialog = ({
  isOpen,
  onOpenChange,
  skill,
  viewedVersion,
  canRollBack,
  onView,
  onRolledBack
}: Props) => {
  const { data: versions = [], isPending } = useListAgentVaultSkillVersions(isOpen ? skill.id : "");
  const restoreVersion = useRestoreAgentVaultSkillVersion();
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);

  const handleRollBack = async (version: number) => {
    setRollingBack(version);
    try {
      const { version: restored, unchanged } = await restoreVersion.mutateAsync({
        skillId: skill.id,
        version
      });
      createNotification(
        unchanged
          ? { text: "This version already matches the latest.", type: "info" }
          : {
              text: `Rolled "${skill.name}" back to version ${version} as version ${restored.version}`,
              type: "success"
            }
      );
      onRolledBack();
      onOpenChange(false);
    } catch {
      // The global mutation handler shows the server's message.
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" isPending={rollingBack !== null}>
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Agents get the latest version when they start. Select a version to see its files.
            Rolling back publishes a copy of an older version as the latest.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] thin-scrollbar overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Size</TableHead>
                <TableHead variant="action" className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 3 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={`version-skeleton-${index}`}>
                    {Array.from({ length: 4 }).map((__, cell) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableCell key={`version-skeleton-${index}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                    <TableCell variant="action" />
                  </TableRow>
                ))}
              {!isPending &&
                versions.map((version) => {
                  const isLatest = version.version === skill.latestVersion;
                  const view = () => {
                    onView(version.version);
                    onOpenChange(false);
                  };
                  return (
                    <TableRow
                      key={version.id}
                      data-state={version.version === viewedVersion ? "selected" : undefined}
                      tabIndex={0}
                      onClick={view}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          view();
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>v{version.version}</span>
                          {isLatest && <Badge variant="success">Latest</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell>{version.fileCount}</TableCell>
                      <TableCell>{formatSkillBytes(version.sizeBytes)}</TableCell>
                      <TableCell variant="action">
                        {canRollBack && !isLatest && (
                          <Button
                            variant="ghost"
                            size="xs"
                            isPending={rollingBack === version.version}
                            isDisabled={rollingBack !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmVersion(version.version);
                            }}
                          >
                            <HistoryIcon />
                            Roll Back
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        <RollBackSkillAlertDialog
          version={confirmVersion}
          onOpenChange={(open) => !open && setConfirmVersion(null)}
          onConfirm={(version) => {
            setConfirmVersion(null);
            handleRollBack(version);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
