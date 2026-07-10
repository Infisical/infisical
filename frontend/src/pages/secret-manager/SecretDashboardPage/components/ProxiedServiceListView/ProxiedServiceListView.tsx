import { useState } from "react";

import {
  DeleteProxiedServiceModal,
  EditProxiedServiceModal
} from "@app/components/proxied-services";
import { useProject } from "@app/context";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

import { ProxiedServiceItem } from "./ProxiedServiceItem";

type Props = {
  proxiedServices?: TDashboardProxiedService[];
};

export const ProxiedServiceListView = ({ proxiedServices }: Props) => {
  const { projectId } = useProject();

  const [editTarget, setEditTarget] = useState<TDashboardProxiedService>();
  const [deleteTarget, setDeleteTarget] = useState<TDashboardProxiedService>();

  return (
    <>
      {proxiedServices?.map((proxiedService) => (
        <ProxiedServiceItem
          key={proxiedService.id}
          proxiedService={proxiedService}
          onEdit={() => setEditTarget(proxiedService)}
          onDelete={() => setDeleteTarget(proxiedService)}
        />
      ))}
      <EditProxiedServiceModal
        isOpen={Boolean(editTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditTarget(undefined);
        }}
        proxiedService={editTarget}
        projectId={projectId}
      />
      <DeleteProxiedServiceModal
        isOpen={Boolean(deleteTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(undefined);
        }}
        proxiedService={deleteTarget}
      />
    </>
  );
};
