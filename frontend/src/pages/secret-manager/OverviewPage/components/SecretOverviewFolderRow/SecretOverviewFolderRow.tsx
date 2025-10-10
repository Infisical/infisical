import { useState } from "react";
import { faCheck, faFolder, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Checkbox, IconButton, Td, Tr } from "@app/components/v2";

type Props = {
  folderName: string;
  environments: { name: string; slug: string }[];
  isFolderPresentInEnv: (name: string, env: string) => boolean;
  onClick: (path: string) => void;
  isSelected: boolean;
  onToggleFolderSelect: (folderName: string) => void;
  onToggleFolderEdit: (name: string) => void;
};

export const SecretOverviewFolderRow = ({
  folderName,
  environments = [],
  isFolderPresentInEnv,
  isSelected,
  onToggleFolderSelect,
  onToggleFolderEdit,
  onClick
}: Props) => {
  const [isClicking, setIsClicking] = useState(false);
  const handleClick = () => {
    if (isClicking) return;

    setIsClicking(true);
    onClick(folderName);
    setTimeout(() => setIsClicking(false), 1000);
  };
  return (
    <Tr isHoverable isSelectable className="group" onClick={handleClick}>
      <Td className="bg-mineshaft-800 group-hover:bg-mineshaft-700 sticky left-0 z-10 border-0 bg-clip-padding p-0">
        <div className="border-mineshaft-600 flex items-center space-x-5 border-r px-5 py-2.5">
          <div className="text-yellow-700">
            <Checkbox
              id={`checkbox-${folderName}`}
              isChecked={isSelected}
              onCheckedChange={() => {
                onToggleFolderSelect(folderName);
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className={twMerge("hidden group-hover:flex", isSelected && "flex")}
            />
            <FontAwesomeIcon
              className={twMerge("block group-hover:!hidden", isSelected && "!hidden")}
              icon={faFolder}
            />
          </div>
          <div>{folderName}</div>
          <IconButton
            ariaLabel="edit-folder"
            variant="plain"
            size="sm"
            className="p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              onToggleFolderEdit(folderName);
              e.stopPropagation();
            }}
          >
            <FontAwesomeIcon icon={faPencil} size="sm" />
          </IconButton>
        </div>
      </Td>
      {environments.map(({ slug }, i) => {
        const isPresent = isFolderPresentInEnv(folderName, slug);

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
