import { PencilIcon } from "lucide-react";

import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";

import { ROTATION_POLICY_TYPE_MAP, RotationPolicy } from "../../PamRotationsPage/mock-data";

type Props = {
  policy: RotationPolicy;
};

export const RotationDetailsSection = ({ policy }: Props) => {
  const typeInfo = ROTATION_POLICY_TYPE_MAP[policy.type];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
        <UnstableIconButton variant="ghost" size="xs">
          <PencilIcon />
        </UnstableIconButton>
      </div>
      <DetailGroup>
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{policy.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Type</DetailLabel>
          <DetailValue>{typeInfo.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Status</DetailLabel>
          <DetailValue>
            <Badge variant={policy.status === "active" ? "success" : "neutral"}>
              {policy.status}
            </Badge>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Schedule</DetailLabel>
          <DetailValue>Every {policy.scheduleDays} days</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Last Run</DetailLabel>
          <DetailValue>{policy.lastRun}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Next Run</DetailLabel>
          <DetailValue>{policy.nextRun}</DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  );
};
