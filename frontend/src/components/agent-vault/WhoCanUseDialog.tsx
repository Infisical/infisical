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
  useListAgentVaultServiceRoles,
  useListAgentVaultSkillRoles
} from "@app/hooks/api/agentVault";

import { RolesThatCanUseTable } from "./RolesThatCanUseTable";

export type TWhoCanUseTarget = { kind: "service" | "skill"; id: string; name: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Kept by the caller after closing, so the dialog keeps its title while it closes.
  target: TWhoCanUseTarget | null;
};

export const WhoCanUseDialog = ({ isOpen, onOpenChange, target }: Props) => {
  const { projectId } = useProject();
  const isService = target?.kind === "service";
  const serviceRoles = useListAgentVaultServiceRoles(
    projectId,
    isService ? target.id : "",
    isOpen && isService
  );
  const skillRoles = useListAgentVaultSkillRoles(
    projectId,
    target?.kind === "skill" ? target.id : "",
    isOpen && target?.kind === "skill"
  );
  const { data: roles, isPending, isError, refetch } = isService ? serviceRoles : skillRoles;
  const noun = isService ? "service" : "skill";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Who Can Use {target?.name}</DialogTitle>
          <DialogDescription>
            Holders of these roles can put this {noun} in a session, directly or through an access
            bundle that holds it. Open a role to change what it allows or who holds it.
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <div className="flex flex-col items-start gap-2 text-sm text-muted">
            Couldn&apos;t load the roles that can use this {noun}.
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
