import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import { TPamResource } from "@app/hooks/api/pam";
import { useGetPamRotationRules } from "@app/hooks/api/pam/queries";

type Props = {
  resource: TPamResource;
  onEdit: VoidFunction;
};

const UNIT_LABELS: Record<string, string> = {
  s: "second",
  m: "minute",
  h: "hour",
  d: "day",
  w: "week",
  y: "year"
};

const formatInterval = (seconds: number) => {
  const { value, unit } = getObjectFromSeconds(seconds);
  const label = UNIT_LABELS[unit] ?? unit;
  return `${value} ${label}${value !== 1 ? "s" : ""}`;
};

export const PamResourceRotationPolicySection = ({ resource, onEdit }: Props) => {
  const { data: rules = [] } = useGetPamRotationRules(resource.id);

  const enabledRules = rules.filter((r) => r.enabled);
  const hasRotationCredentials =
    "rotationAccountCredentials" in resource && !!resource.rotationAccountCredentials;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Rotation Policy</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>

      <DetailGroup>
        <Detail>
          <DetailLabel>Credentials</DetailLabel>
          <DetailValue>
            {hasRotationCredentials ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <span className="text-muted">None</span>
            )}
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Rules</DetailLabel>
          <DetailValue>
            {rules.length > 0 ? (
              <span>
                {rules.length} total ({enabledRules.length} active)
              </span>
            ) : (
              <span className="text-muted">None</span>
            )}
          </DetailValue>
        </Detail>
        {enabledRules.length > 0 && (
          <Detail>
            <DetailLabel>Active Rules</DetailLabel>
            <DetailValue>
              <div className="flex flex-col gap-1">
                {enabledRules.slice(0, 3).map((rule) => (
                  <div key={rule.id} className="flex items-center gap-1.5 text-xs">
                    <code className="rounded bg-mineshaft-600 px-2 py-0.5">{rule.namePattern}</code>
                    {rule.intervalSeconds && (
                      <span className="text-muted">
                        every {formatInterval(rule.intervalSeconds)}
                      </span>
                    )}
                  </div>
                ))}
                {enabledRules.length > 3 && (
                  <span className="text-xs text-muted">+{enabledRules.length - 3} more</span>
                )}
              </div>
            </DetailValue>
          </Detail>
        )}
      </DetailGroup>
    </div>
  );
};
