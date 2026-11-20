import { Badge } from "@infisical/cipher/ui/badge";
import { Inline } from "@infisical/cipher/ui/layout";

import { CommitType } from "@app/hooks/api/secretApprovalRequest/types";

import { plural } from "./parts";

const changeKinds = [
  { ops: [CommitType.CREATE, CommitType.ADD], label: "Add", tone: "ok" },
  { ops: [CommitType.UPDATE], label: "Update", tone: "warn" },
  { ops: [CommitType.DELETE], label: "Delete", tone: "bad" }
] as const;

export const ChangeSummary = ({
  commits,
  isReplicated
}: {
  commits: { op: CommitType }[];
  isReplicated?: boolean;
}) => {
  if (isReplicated)
    return <Badge tone="info">{`${plural(commits.length, "secret")} pending import`}</Badge>;
  return (
    <Inline gap={4}>
      {changeKinds.map(({ ops, label, tone }) => {
        const count = commits.filter(({ op }) =>
          (ops as readonly CommitType[]).includes(op)
        ).length;
        return count ? (
          <Badge key={label} tone={tone}>
            {`${label} ${count}`}
          </Badge>
        ) : null;
      })}
    </Inline>
  );
};
