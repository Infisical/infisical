import { useState } from "react";
import { EyeIcon, MoreHorizontalIcon, PlusIcon, TrashIcon } from "lucide-react";

import { CreateSkillSheet } from "@app/components/agent-vault/skills/CreateSkillSheet";
import { SkillDescription } from "@app/components/agent-vault/skills/SkillDescription";
import { SkillSheet } from "@app/components/agent-vault/skills/SkillSheet";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  RowLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission
} from "@app/context";
import {
  useAddAgentVaultAccessBundleSkill,
  useListAgentVaultAccessBundleSkills,
  useRemoveAgentVaultAccessBundleSkill
} from "@app/hooks/api/agentVault";
import { TAgentVaultBundleSkill, TAgentVaultSkillSummary } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { AddBundleSkillDialog } from "./AddBundleSkillDialog";

type Props = {
  accessBundleId: string;
  accessBundleName: string;
  canManage: boolean;
};

export const SkillsCard = ({ accessBundleId, accessBundleName, canManage }: Props) => {
  const { permission } = useProjectPermission();
  const { openSheet } = useAgentVaultSheetState("skillId");
  const { currentOrg } = useOrganization();
  const canCreateSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Create,
    ProjectPermissionSub.AgentVaultSkills
  );
  const { data: bundleSkills = [], isPending } =
    useListAgentVaultAccessBundleSkills(accessBundleId);
  const addSkill = useAddAgentVaultAccessBundleSkill();
  const removeSkill = useRemoveAgentVaultAccessBundleSkill();
  const [skillToRemove, setSkillToRemove] = useState<TAgentVaultBundleSkill | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [createName, setCreateName] = useState<string | null>(null);

  const addCreated = async (skill: TAgentVaultSkillSummary) => {
    try {
      await addSkill.mutateAsync({ accessBundleId, skillId: skill.id });
      createNotification({
        text: `Skill "${skill.name}" created and added to this access bundle`,
        type: "success"
      });
    } catch {
      // The add error is already a toast; this one says the skill itself exists now
      createNotification({ text: `Skill "${skill.name}" created`, type: "info" });
    }
  };

  const handleRemove = async () => {
    if (!skillToRemove) return;
    try {
      await removeSkill.mutateAsync({ accessBundleId, skillId: skillToRemove.id });
    } catch {
      return;
    }
    createNotification({ text: `Skill "${skillToRemove.name}" removed`, type: "success" });
    setSkillToRemove(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Skills
          <DocumentationLinkBadge href={AgentVaultDocsUrls.skills} />
        </CardTitle>
        <CardDescription>
          Agents running with this bundle get these skills, at their latest version, when they
          start.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="av" isDisabled={isPending} onClick={() => setIsAddOpen(true)}>
              <PlusIcon />
              Add Skills
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {!isPending && bundleSkills.length === 0 ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No skills yet</EmptyTitle>
              <EmptyDescription>
                Add skills to give agents running with this bundle instructions for their tasks.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-1/3">
                Name
              </TableHead>
              <TableHead isTruncatable>Description</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 2 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TableRow key={`bundle-skill-skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell variant="action" />
                </TableRow>
              ))}
            {!isPending &&
              bundleSkills.map((skill) => (
                <TableRow key={skill.id} linked>
                  <TableCell isTruncatable>
                    <RowLink
                      to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                      params={{ orgId: currentOrg.id, accessBundleId }}
                      search={(prev) => ({ ...prev, skillId: skill.id })}
                      title={skill.name}
                    >
                      {skill.name}
                    </RowLink>
                  </TableCell>
                  <TableCell isTruncatable>
                    <SkillDescription description={skill.description} />
                  </TableCell>
                  <TableCell variant="action">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label="Open skill actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        sideOffset={2}
                        align="end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => openSheet(skill.id)}>
                          <EyeIcon />
                          View Skill
                        </DropdownMenuItem>
                        {canManage && (
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => setSkillToRemove(skill)}
                          >
                            <TrashIcon />
                            Remove From Bundle
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <AddBundleSkillDialog
        accessBundleId={accessBundleId}
        bundleSkillIds={bundleSkills.map((skill) => skill.id)}
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        canCreateSkills={canCreateSkills}
        onCreateNew={setCreateName}
      />

      <CreateSkillSheet
        isOpen={createName !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setCreateName(null);
        }}
        initialName={createName ?? ""}
        description="The new skill is added to this access bundle once it is created."
        onCreated={addCreated}
        shouldNotify={false}
      />

      <ConfirmationAlertDialog
        isOpen={Boolean(skillToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSkillToRemove(null);
        }}
        title={`Remove "${skillToRemove?.name}" From "${accessBundleName}"`}
        description="The skill itself is not deleted."
        confirmKey={skillToRemove?.name ?? ""}
        confirmLabel="Remove"
        isPending={removeSkill.isPending}
        onConfirm={handleRemove}
      />

      <SkillSheet />
    </Card>
  );
};
