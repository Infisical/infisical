import { useState } from "react";

import {
  EditHoneyTokenModal,
  HoneyTokenDetailsDrawer,
  RevokeHoneyTokenModal,
  ViewHoneyTokenCredentialsModal
} from "@app/components/honey-tokens";
import { useProject } from "@app/context";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

import { HoneyTokenItem } from "./HoneyTokenItem";

type Props = {
  honeyTokens?: TDashboardHoneyToken[];
};

export const HoneyTokenListView = ({ honeyTokens }: Props) => {
  const { projectId } = useProject();

  const [revokeTarget, setRevokeTarget] = useState<TDashboardHoneyToken>();
  const [editTarget, setEditTarget] = useState<TDashboardHoneyToken>();
  const [credentialsTarget, setCredentialsTarget] = useState<TDashboardHoneyToken>();
  const [detailsHoneyTokenId, setDetailsHoneyTokenId] = useState<string | null>(null);
  const [selectedHoneyTokenIds, setSelectedHoneyTokenIds] = useState<Record<string, boolean>>({});

  const toggleHoneyTokenSelect = (honeyTokenId: string) => {
    setSelectedHoneyTokenIds((prev) => ({
      ...prev,
      [honeyTokenId]: !prev[honeyTokenId]
    }));
  };

  return (
    <>
      {honeyTokens?.map((honeyToken) => (
        <HoneyTokenItem
          key={honeyToken.id}
          honeyToken={honeyToken}
          isSelected={Boolean(selectedHoneyTokenIds[honeyToken.id])}
          onToggleSelect={() => toggleHoneyTokenSelect(honeyToken.id)}
          onEdit={() => setEditTarget(honeyToken)}
          onRevoke={() => setRevokeTarget(honeyToken)}
          onViewCredentials={() => setCredentialsTarget(honeyToken)}
          onViewDetails={() => setDetailsHoneyTokenId(honeyToken.id)}
        />
      ))}
      <EditHoneyTokenModal
        isOpen={Boolean(editTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditTarget(undefined);
        }}
        honeyToken={editTarget}
      />
      <RevokeHoneyTokenModal
        isOpen={Boolean(revokeTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRevokeTarget(undefined);
        }}
        honeyToken={revokeTarget}
      />
      <ViewHoneyTokenCredentialsModal
        isOpen={Boolean(credentialsTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setCredentialsTarget(undefined);
        }}
        honeyToken={credentialsTarget}
        projectId={projectId}
      />
      <HoneyTokenDetailsDrawer
        projectId={projectId}
        honeyTokenId={detailsHoneyTokenId}
        onClose={() => setDetailsHoneyTokenId(null)}
      />
    </>
  );
};
