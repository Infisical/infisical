import type { ReactNode } from "react";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Meta } from "@infisical/cipher/ui/text";

import { useV4Adapter } from "../data/adapters";
import { useV4Session } from "../data/session/contract";

import styles from "./shell.module.css";

export type ResourceName = { id: string; name?: string; pending: boolean };

export const useProjectName = (projectId: string): ResourceName => {
  const { projects } = useV4Session();
  const query = useV4Adapter("access").useProject(projectId);
  const name = projects.find((entry) => entry.id === projectId)?.name ?? query.data?.name;
  return { id: projectId, name, pending: !name && query.isPending };
};

// Cipher gap: BreadcrumbCrumb has no `loading` state or muted tone, so the label carries them until it does.
export const nameLabel = ({ id, name, pending }: ResourceName, noun: string): ReactNode => {
  if (name) return name;
  if (pending)
    return (
      <>
        <Skeleton className={styles.nameSkeleton} />
        <span className="sr-only">Loading {noun}</span>
      </>
    );
  return (
    <Meta truncate className={styles.nameFallback}>
      {id}
    </Meta>
  );
};
