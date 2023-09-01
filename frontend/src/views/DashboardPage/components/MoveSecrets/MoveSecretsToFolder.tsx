import { useState } from "react"
import { twMerge } from "tailwind-merge";

import {
  Button, ModalClose,
} from "@app/components/v2";

import { TSecretFolder } from "../../../../hooks/api/secretFolders/types";
import DirectorySelector from "./DirectorySelector";

type Props = {
  checkedSecrets: { _id: string, isChecked: string | boolean }[],
  onMoveSecrets: (folderId: string, checkedSecrets: { _id: string, isChecked: string | boolean }[]) => void;
  folderData: {
    dir: TSecretFolder[];
    folders: TSecretFolder[];
  } | undefined
};

export const MoveSecretsToFolder = ({ folderData, checkedSecrets, onMoveSecrets }: Props): JSX.Element => {
  const directoryData = folderData
  const [selectedPath, setSelecctedPath] = useState<string>("")
  const [folderId, setFolderId] = useState<string>("")

  const handleSelectPath = ($selectedPath: string, $folderId: string) => {
    setSelecctedPath($selectedPath)
    setFolderId($folderId)
  };

  return (
    <>
      <DirectorySelector directoryData={directoryData} onSelect={handleSelectPath} />
      <div className="mt-8 flex items-center">
        <Button className={twMerge(`mr-4 ${!selectedPath ? "bg-gray-500 border-none text-gray-900 hover:bg-gray-500" : ""}`)} type="submit" disabled={!selectedPath} onClick={() => onMoveSecrets(folderId, checkedSecrets)}>
          Create
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>

  );
};
