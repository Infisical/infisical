import { PencilIcon } from "lucide-react";

import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";

import {
  MatchingPattern,
  RotationPolicy,
  RotationPolicyType
} from "../../PamRotationsPage/mock-data";

type Props = {
  policy: RotationPolicy;
  onEdit: VoidFunction;
};

const formatPattern = (pattern: MatchingPattern, type: RotationPolicyType) => {
  if (type === RotationPolicyType.DomainWindows) {
    return `${pattern.domainName || "*"} / ${pattern.accountNames}`;
  }
  return `${pattern.resourceNames || "*"} / ${pattern.accountNames}`;
};

export const RotationMatchingSection = ({ policy, onEdit }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Matching</h3>
        <UnstableIconButton variant="ghost" size="xs" onClick={onEdit}>
          <PencilIcon />
        </UnstableIconButton>
      </div>
      <DetailGroup>
        <Detail>
          <DetailLabel>Rotation Interval</DetailLabel>
          <DetailValue>{policy.rotationIntervalDays} days</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Allow Patterns ({policy.allowPatterns.length})</DetailLabel>
          <DetailValue>
            {policy.allowPatterns.length > 0 ? (
              <div className="flex flex-col gap-1">
                {policy.allowPatterns.map((pattern, i) => (
                  <code
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400"
                  >
                    {formatPattern(pattern, policy.type)}
                  </code>
                ))}
              </div>
            ) : (
              <span className="text-muted">None</span>
            )}
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Deny Patterns ({policy.denyPatterns.length})</DetailLabel>
          <DetailValue>
            {policy.denyPatterns.length > 0 ? (
              <div className="flex flex-col gap-1">
                {policy.denyPatterns.map((pattern, i) => (
                  <code
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
                  >
                    {formatPattern(pattern, policy.type)}
                  </code>
                ))}
              </div>
            ) : (
              <span className="text-muted">None</span>
            )}
          </DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  );
};
