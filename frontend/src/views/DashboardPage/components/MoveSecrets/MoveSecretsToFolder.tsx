// import { useForm } from "react-hook-form";
import {useState} from "react"
import { twMerge } from "tailwind-merge";

// import { yupResolver } from "@hookform/resolvers/yup";
// import * as yup from "yup";
import {
  Button, ModalClose,
  // Select, SelectItem 
} from "@app/components/v2";

import { TSecretFolder } from "../../../../hooks/api/secretFolders/types";
import DirectorySelector from "./DirectorySelector";



type Props = {
  checkedSecrets: { _id: string, isChecked: string | boolean }[],
  // onMoveSecrets: (selectedPath: string, folderId: string, checkedSecrets: {_id: string, isChecked: string | boolean}[]) => void;
  folderData: {
    dir: TSecretFolder[];
    folders: TSecretFolder[];
  } | undefined
};


export const MoveSecretsToFolder = ({ folderData, checkedSecrets}: Props): JSX.Element => {
  const directoryData = folderData 
  const [selectedPath, setSelecctedPath] = useState<string>("")

  const handleSelectPath = ($selectedPath: string,  folderId: string) => {
    setSelecctedPath($selectedPath)
    // onMoveSecrets(selectedPath, folderId, checkedSecrets)
    console.log("34 Selected Path:", selectedPath, folderId);
    console.log("35 folderData:", folderData, checkedSecrets);
  };


  return (
    <>
      <DirectorySelector directoryData={directoryData} onSelect={handleSelectPath} />
      <div className="mt-8 flex items-center">
        <Button className={twMerge(`mr-4 ${!selectedPath ? "bg-gray-500 border-none text-gray-900 hover:bg-gray-500" : ""}`)} type="submit" disabled={!selectedPath}>
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
