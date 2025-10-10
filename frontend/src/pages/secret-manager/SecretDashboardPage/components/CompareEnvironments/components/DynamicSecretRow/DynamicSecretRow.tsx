import { faFingerprint } from "@fortawesome/free-solid-svg-icons";

import { Tr } from "@app/components/v2";

import { EnvironmentStatusCell, ResourceNameCell } from "../shared";

type Props = {
  dynamicSecretName: string;
  environments: { name: string; slug: string }[];
  isDynamicSecretInEnv: (name: string, env: string) => boolean;
  colWidth: number;
};

export const DynamicSecretRow = ({
  dynamicSecretName,
  environments = [],
  isDynamicSecretInEnv,
  colWidth
}: Props) => {
  return (
    <Tr isHoverable className="group border-mineshaft-500">
      <ResourceNameCell
        label={dynamicSecretName}
        icon={faFingerprint}
        colWidth={colWidth}
        iconClassName="text-yellow-700"
      />
      {environments.map(({ slug }, i) => {
        const isPresent = isDynamicSecretInEnv(dynamicSecretName, slug);

        return (
          <EnvironmentStatusCell
            isLast={i === environments.length - 1}
            status={isPresent ? "present" : "missing"}
            key={`dynamic-secret-${dynamicSecretName}-${i + 1}-value`}
          />
        );
      })}
    </Tr>
  );
};
