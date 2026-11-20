import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useListAgentVaultAccessBundleRoles,
  useListAgentVaultServiceRoles,
  useListAgentVaultSkillRoles
} from "@app/hooks/api/agentVault";

import { RolesThatCanUseTable } from "./RolesThatCanUseTable";

export type TWhoCanUseTarget = {
  kind: "accessBundle" | "service" | "skill";
  id: string;
  name: string;
};

const COPY: Record<TWhoCanUseTarget["kind"], { noun: string; description: string }> = {
  accessBundle: {
    noun: "bundle",
    description:
      "Holders of these roles can start sessions from this bundle, with every service and skill in it. Open a role to change what it allows or who holds it."
  },
  service: {
    noun: "service",
    description:
      "Holders of these roles can put this service in a session, directly or through an access bundle that holds it. Open a role to change what it allows or who holds it."
  },
  skill: {
    noun: "skill",
    description:
      "Holders of these roles can put this skill in a session, directly or through an access bundle that holds it. Open a role to change what it allows or who holds it."
  }
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Kept by the caller after closing, so the dialog keeps its title while it closes.
  target: TWhoCanUseTarget | null;
};

export const WhoCanUseDialog = ({ isOpen, onOpenChange, target }: Props) => {
  const { projectId } = useProject();
  const kind = target?.kind ?? "service";
  const queries = {
    accessBundle: useListAgentVaultAccessBundleRoles(
      projectId,
      target?.kind === "accessBundle" ? target.id : "",
      isOpen && target?.kind === "accessBundle"
    ),
    service: useListAgentVaultServiceRoles(
      projectId,
      target?.kind === "service" ? target.id : "",
      isOpen && target?.kind === "service"
    ),
    skill: useListAgentVaultSkillRoles(
      projectId,
      target?.kind === "skill" ? target.id : "",
      isOpen && target?.kind === "skill"
    )
  };
  const { data: roles, isPending, isError, refetch } = queries[kind];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Who Can Use {target?.name}</DialogTitle>
          <DialogDescription>{COPY[kind].description}</DialogDescription>
        </DialogHeader>
        {isError ? (
          <div className="flex flex-col items-start gap-2 text-sm text-muted">
            Couldn&apos;t load the roles that can use this {COPY[kind].noun}.
            <Button variant="outline" size="xs" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : (
          <RolesThatCanUseTable roles={roles} isPending={isPending} />
        )}
      </DialogContent>
    </Dialog>
  );
};
