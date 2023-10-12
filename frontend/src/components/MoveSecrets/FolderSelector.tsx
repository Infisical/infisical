import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { faFolder } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { TSecretFolder } from "~/hooks/api/types";



interface FolderSelectorProps {
    folders: TSecretFolder[] | undefined;
    onSelect: (selectedPath: string, folderId: string) => void;
    checkedSecrets: { _id: string }[];
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({ folders, onSelect, checkedSecrets }) => {
    const [selectedPath, setSelectedPath] = useState("");
    const [selectedFolder, setSelectedFolder] = useState<string>("")

    const handlePathSelection = (path: string, folderId: string) => {
        setSelectedFolder(folderId)
        setSelectedPath(path);
        onSelect(path, folderId);
    };


    const adjustedPath = selectedPath.replace(/\/root/g, "/").replace(/\/{2,}/g, "/");

    return (
        <div className="p-4 border border-mineshaft-600 rounded-lg shadow-md">

            {
                (folders && folders.length > 0) && (
                    <div>
                        <h2 className="text-md font-semibold text-gray-300 mt-3">Select a folder within current directory:</h2>
                        {
                            (
                                <ul className="mt-3">
                                    {folders.map((folder) => (
                                        <li key={folder.id}>
                                            <button
                                                className={twMerge("py-1 px-2 bg-mineshaft-500  hover:bg-mineshaft-600 mb-2 rounded-md", selectedFolder === folder.id && "bg-mineshaft-400 hover:bg-mineshaft-400")}
                                                onClick={() => handlePathSelection(`${""}/${folder.name}`, folder.id)}
                                                type="submit"
                                            >
                                                <span>
                                                    <FontAwesomeIcon icon={faFolder} className="text-yellow-700 mr-2" />
                                                </span>
                                                {folder.name}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )
                        }
                    </div>
                )
            }
            {
                folders && folders.length > 0 ? (
                    (
                        <p className="text-sm  text-gray-300 mt-5">Selected folder path: <span className="rounded-md bg-mineshaft-600 py-1 px-1.5 ml-2">{adjustedPath}</span></p>
                    )
                ) : (
                    <p className="text-sm text-center text-gray-300 py-5">{`No folder to move ${checkedSecrets.length > 1 ? "secrets" : "secret"} to`}   </p>
                )
            }

        </div>
    );
};