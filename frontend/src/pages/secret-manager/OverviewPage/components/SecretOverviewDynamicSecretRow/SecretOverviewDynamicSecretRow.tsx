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
      <Td className="bg-mineshaft-800 group-hover:bg-mineshaft-700 sticky left-0 z-10 border-0 bg-clip-padding p-0">
        <div className="border-mineshaft-600 flex items-center space-x-5 border-r px-5 py-2.5">
          <div className="text-yellow-700">
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
              "border-mineshaft-600 group-hover:bg-mineshaft-700 border-r py-3",
              isPresent ? "text-green-600" : "text-red-600"
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
