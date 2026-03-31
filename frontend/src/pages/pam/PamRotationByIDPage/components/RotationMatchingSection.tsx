import { PencilIcon } from "lucide-react";

import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";

import { RotationPolicy, RotationPolicyType } from "../../PamRotationsPage/mock-data";

type Props = {
  policy: RotationPolicy;
  onEdit: VoidFunction;
};

export const RotationMatchingSection = ({ policy, onEdit }: Props) => {
  const isDomain = policy.type === RotationPolicyType.DomainWindows;

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
          <DetailLabel>Account Names</DetailLabel>
          <DetailValue>
            <code className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs">
              {policy.allowPattern.accountNames || "*"}
            </code>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>{isDomain ? "Domain Names" : "Resource Names"}</DetailLabel>
          <DetailValue>
            <code className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs">
              {isDomain
                ? policy.allowPattern.domainName || "*"
                : policy.allowPattern.resourceNames || "*"}
            </code>
          </DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  );
};
