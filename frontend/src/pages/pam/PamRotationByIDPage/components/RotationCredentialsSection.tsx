import { PencilIcon } from "lucide-react";

import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";

import { RotationPolicy } from "../../PamRotationsPage/mock-data";

type Props = {
  policy: RotationPolicy;
};

export const RotationCredentialsSection = ({ policy }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Credentials</h3>
        <UnstableIconButton variant="ghost" size="xs">
          <PencilIcon />
        </UnstableIconButton>
      </div>
      <DetailGroup>
        {policy.credentials ? (
          <>
            <Detail>
              <DetailLabel>Username</DetailLabel>
              <DetailValue>{policy.credentials.username}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Password</DetailLabel>
              <DetailValue>
                <span className="font-mono tracking-wider">********</span>
              </DetailValue>
            </Detail>
          </>
        ) : (
          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              <span className="text-muted">Not configured</span>
            </DetailValue>
          </Detail>
        )}
      </DetailGroup>
    </div>
  );
};
