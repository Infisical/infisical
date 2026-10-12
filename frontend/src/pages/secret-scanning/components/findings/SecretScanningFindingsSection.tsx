import { ComponentProps } from "react";

import { useProject } from "@app/context";
import { useListSecretScanningFindings } from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingsTable } from "./SecretScanningFindingsTable";

type Props = Omit<ComponentProps<typeof SecretScanningFindingsTable>, "findings" | "isPending">;

export const SecretScanningFindingsSection = (props: Props) => {
  const { currentProject } = useProject();

  const { data: findings = [], isPending } = useListSecretScanningFindings(currentProject.id, {
    refetchInterval: 30000
  });

  return <SecretScanningFindingsTable findings={findings} isPending={isPending} {...props} />;
};
