import { Avatar, AvatarFallback, AvatarGroup } from "@infisical/cipher/ui/avatar";
import { Count } from "@infisical/cipher/ui/badge";
import { Icon } from "@infisical/cipher/ui/icon";
import { List, ListRow, ListSection } from "@infisical/cipher/ui/list";
import { NameLine } from "@infisical/cipher/ui/name-line";
import { Meta } from "@infisical/cipher/ui/text";

export type ApprovalStep = {
  id: string;
  name?: string | null;
  requiredApprovals: number;
  approvers: { id: string; name: string; kind: "user" | "group" }[];
};

export const ApprovalSteps = ({ steps }: { steps: ApprovalStep[] }) => (
  <List label="Approval steps" variant="divided" size="sm">
    <ListSection label="Approval steps">
      {steps.map((step, index) => {
        const number = index + 1;
        const name = step.name || `Step ${number}`;
        return (
          <ListRow
            key={step.id}
            value={String(number)}
            label={name}
            title={name}
            selectable={false}
            media={<Count tone="neutral">{number}</Count>}
            description={
              step.approvers.length ? (
                <NameLine
                  media={
                    <AvatarGroup max={3} label={`Approvers for ${name}`}>
                      {step.approvers.map((approver) =>
                        approver.kind === "group" ? (
                          <Avatar key={approver.id} label={`${approver.name}, group`}>
                            <AvatarFallback>
                              <Icon name="users" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <Avatar key={approver.id} name={approver.name} />
                        )
                      )}
                    </AvatarGroup>
                  }
                >
                  {step.approvers.map((approver) => approver.name).join(", ")}
                </NameLine>
              ) : (
                <Meta mono={false}>No approvers</Meta>
              )
            }
            meta={<Meta mono={false}>{`${step.requiredApprovals} required`}</Meta>}
          />
        );
      })}
    </ListSection>
  </List>
);
