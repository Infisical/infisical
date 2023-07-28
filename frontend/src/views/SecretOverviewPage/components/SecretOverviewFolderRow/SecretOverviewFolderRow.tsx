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
      <Td className="sticky left-0 z-10 border-0 bg-mineshaft-800 bg-clip-padding p-0 group-hover:bg-mineshaft-700">
        <div className="flex items-center space-x-5 border-r border-mineshaft-600 px-5 py-2.5">
          <div className="text-yellow-700">
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
              "border-r border-mineshaft-600 py-3 group-hover:bg-mineshaft-700",
              isPresent ? "text-green-600" : "text-red-600"
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
