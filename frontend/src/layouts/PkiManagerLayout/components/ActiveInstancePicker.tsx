import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageLoader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  useCertManagerLegacyInstances,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";

type Props = {
  onChanged?: () => void;
};

export const ActiveInstancePicker = ({ onChanged }: Props) => {
  const { data, isPending } = useCertManagerLegacyInstances();
  const setActive = useSetCertManagerActiveProject();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (isPending || !data) {
    return (
      <div className="h-32">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  if (data.instances.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No Certificate Manager instances</EmptyTitle>
          <EmptyDescription>
            Create a Certificate Manager project from the organization to get started.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const active = data.instances.find((i) => i.isActive);

  const handleChange = async (projectId: string) => {
    if (active?.id === projectId) return;
    const next = data.instances.find((i) => i.id === projectId);
    if (!next) return;
    setPendingId(projectId);
    try {
      await setActive.mutateAsync(projectId);
      createNotification({
        type: "success",
        text: `${next.name} is now the active Certificate Manager instance`
      });
      onChanged?.();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to switch active instance.";
      createNotification({ type: "error", text: detail });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Select value={active?.id ?? ""} onValueChange={handleChange} disabled={Boolean(pendingId)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select active instance" />
      </SelectTrigger>
      <SelectContent>
        {data.instances.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            <div className="flex w-full items-center gap-2">
              <span className="font-medium">{i.name}</span>
              <span className="font-mono text-xs text-accent">{i.slug}</span>
              <span className="ml-auto text-xs text-muted">
                {i.certificateCount} cert{i.certificateCount === 1 ? "" : "s"} · {i.syncCount} sync
                {i.syncCount === 1 ? "" : "s"} · {i.alertCount} alert
                {i.alertCount === 1 ? "" : "s"}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
