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

// Each role is listed for what it allows on its own. A deny in another role a member holds still wins for that
// member, which a list of roles can't show. On a service or skill, that deny only stops picking it on its own: an access
// bundle that holds it still gives it.
const OPEN_A_ROLE = "Open a role to change what it allows or who holds it.";
const DENIED_ITEM_ELSEWHERE = (noun: string) =>
  `A holder who also has a role that denies Use on it can't pick the ${noun} on its own, but still gets it from an access bundle they can use that holds it. ${OPEN_A_ROLE}`;

const COPY: Record<TWhoCanUseTarget["kind"], { noun: string; description: string }> = {
  accessBundle: {
    noun: "bundle",
    description: `These roles allow starting sessions from this bundle, with the services and skills in it. A holder who also has a role that denies Use on it still can't use it. ${OPEN_A_ROLE}`
  },
  service: {
    noun: "service",
    description: `These roles allow putting this service in a session, directly or through an access bundle that holds it. ${DENIED_ITEM_ELSEWHERE("service")}`
  },
  skill: {
    noun: "skill",
    description: `These roles allow putting this skill in a session, directly or through an access bundle that holds it. ${DENIED_ITEM_ELSEWHERE("skill")}`
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
