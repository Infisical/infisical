import { faCheck, faFolder, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Td, Tr } from "@app/components/v2";

type Props = {
  folderName: string;
  environments: { name: string; slug: string }[];
  isFolderPresentInEnv: (name: string, env: string) => boolean;
  onClick: (path: string) => void;
};

export const SecretOverviewFolderRow = ({
  folderName,
  environments = [],
  isFolderPresentInEnv,
  onClick
}: Props) => {
  return (
    <Tr isHoverable isSelectable className="group" onClick={() => onClick(folderName)}>
      <Td className="sticky left-0 z-10 border-x border-mineshaft-700 bg-mineshaft-800 bg-clip-padding py-3 group-hover:bg-mineshaft-600">
        <div className="flex items-center space-x-4">
          <div className="text-primary">
            <FontAwesomeIcon icon={faFolder} />
          </div>
          <div>{folderName}</div>
        </div>
      </Td>
      {environments.map(({ slug }, i) => {
        const isPresent = isFolderPresentInEnv(folderName, slug);
        return (
          <Td
            key={`sec-overview-${slug}-${i + 1}-folder`}
            className={twMerge(
              "border-x border-mineshaft-700 py-3",
              isPresent ? "text-green-600" : "text-red-800"
            )}
          >
            <div className="flex justify-center">
              <FontAwesomeIcon icon={isPresent ? faCheck : faXmark} />
            </div>
          </Td>
        );
      })}
    </Tr>
  );
};
