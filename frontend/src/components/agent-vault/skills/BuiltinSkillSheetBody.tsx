import { useMemo, useState } from "react";
import { DownloadIcon, RotateCwIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner
} from "@app/components/v3";
import { useProject } from "@app/context";
import { toDraftFiles } from "@app/helpers/agentVaultSkills";
import { useGetAgentVaultBuiltinSkill } from "@app/hooks/api/agentVault";

import { BuiltinSkillBadge } from "./BuiltinSkillBadge";
import { downloadSkillFiles } from "./downloadSkillVersion";
import { SkillFilesEditor } from "./SkillFilesEditor";

export const BuiltinSkillSheetBody = () => {
  const { projectId } = useProject();
  const { data: skill, isPending, isFetching, refetch } = useGetAgentVaultBuiltinSkill(projectId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const files = useMemo(() => toDraftFiles(skill?.files ?? []), [skill]);

  if (isPending) {
    return (
      <Empty className="m-4 border">
        <EmptyHeader>
          <Spinner size="sm" variant="av" />
        </EmptyHeader>
      </Empty>
    );
  }

  if (!skill) {
    return (
      <Empty className="m-4 border">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load this skill</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="xs" isPending={isFetching} onClick={() => refetch()}>
            <RotateCwIcon />
            Try Again
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      <SheetHeader className="pr-12">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <SheetTitle className="flex items-center gap-2">
              <span className="truncate">{skill.name}</span>
              <BuiltinSkillBadge />
            </SheetTitle>
            <SheetDescription className="line-clamp-2" title={skill.description}>
              {skill.description}
            </SheetDescription>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => downloadSkillFiles(skill.name, skill.files)}
          >
            <DownloadIcon />
            Download
          </Button>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Alert variant="info">
          <AlertDescription>
            <p>
              Agent Vault gives this skill to every agent, and Infisical keeps it up to date, so it
              can&apos;t be edited. To start an agent without it, pass{" "}
              <code className="font-mono">--no-agent-vault-skill</code> to{" "}
              <code className="font-mono">infisical agent-vault run</code>.
            </p>
          </AlertDescription>
        </Alert>

        <SkillFilesEditor
          files={files}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          isEditing={false}
          className="min-h-96 flex-1"
        />
      </div>
    </>
  );
};
