import { faCheck, faFingerprint, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tr } from "@app/components/v2";

type Props = {
  dynamicSecretName: string;
  environments: { name: string; slug: string }[];
  isDynamicSecretInEnv: (name: string, env: string) => boolean;
};

export const SecretOverviewDynamicSecretRow = ({
  dynamicSecretName,
  environments = [],
  isDynamicSecretInEnv
}: Props) => {
  return (
    <Tr isHoverable isSelectable className="group">
      <Td className="sticky left-0 z-10 border-0 bg-surface-raised bg-clip-padding p-0 group-hover:bg-surface-hover">
        <div className="flex items-center space-x-5 border-r border-border-control px-5 py-2.5">
          <div className="text-warning">
            <FontAwesomeIcon icon={faFingerprint} />
          </div>
          <div>{dynamicSecretName}</div>
        </div>
      </Td>
      {environments.map(({ slug }, i) => {
        const isPresent = isDynamicSecretInEnv(dynamicSecretName, slug);

        return (
          <Td
            key={`sec-overview-${slug}-${i + 1}-folder`}
            className={twMerge(
              "border-r border-border-control py-3 group-hover:bg-surface-hover",
              isPresent ? "text-success" : "text-danger"
            )}
          >
            <div className="mx-auto flex w-[0.03rem] justify-center">
              <FontAwesomeIcon
                // eslint-disable-next-line no-nested-ternary
                icon={isPresent ? faCheck : faXmark}
              />
            </div>
          </Td>
        );
      })}
    </Tr>
  );
};
