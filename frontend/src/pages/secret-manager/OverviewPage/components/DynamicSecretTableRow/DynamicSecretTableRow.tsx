import { FingerprintIcon } from "lucide-react";

import { UnstableTableCell, UnstableTableRow } from "@app/components/v3";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

type Props = {
  dynamicSecretName: string;
  environments: { name: string; slug: string }[];
  isDynamicSecretInEnv: (name: string, env: string) => boolean;
};

export const DynamicSecretTableRow = ({
  dynamicSecretName,
  environments = [],
  isDynamicSecretInEnv
}: Props) => {
  return (
    <UnstableTableRow className="group">
      <UnstableTableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
        <FingerprintIcon className="text-dynamic-secret" />
      </UnstableTableCell>
      <UnstableTableCell className="sticky left-10 z-10 truncate border-r bg-container transition-colors duration-75 group-hover:bg-container-hover">
        {dynamicSecretName}
      </UnstableTableCell>
      {environments.map(({ slug }, i) => {
        const isPresent = isDynamicSecretInEnv(dynamicSecretName, slug);

        return (
          <ResourceEnvironmentStatusCell
            key={`sec-overview-${slug}-${i + 1}-dynamic-secret`}
            status={isPresent ? "present" : "missing"}
          />
        );
      })}
    </UnstableTableRow>
  );
};
