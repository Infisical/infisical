import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { TSecretFolder } from "../../../../hooks/api/secretFolders/types";


interface Folder {
    name: string;
    id: string;
    folders?: Folder[];
}

interface DirectorySelectorProps {
    directoryData: {
        dir: TSecretFolder[];
        folders: TSecretFolder[];
    } | undefined;
    onSelect: (selectedPath: string, folderId: string) => void;
}

const DirectorySelector: React.FC<DirectorySelectorProps> = ({ directoryData, onSelect }) => {
    const [selectedPath, setSelectedPath] = useState("");
    const [directoryTree, setDirectoryTree] = useState<TSecretFolder[]>([])
    const [selectedFolder, setSelectedFolder] = useState<string>("")

    const router = useRouter();
    const { query } = router;
    const queryFolderId = query.folderId;

    useEffect(() => {
        if ((directoryData?.dir && directoryData?.dir.length > 0)) {
            const directoryDataCopy = [...directoryData.dir]
            const $directoryTree: TSecretFolder[] = [];

            let i = 0;

            while (i < directoryDataCopy.length) {
                const currentItem = directoryDataCopy[i];
                const parentItem = directoryDataCopy[i - 1];

                if (parentItem) {
                    if (!parentItem.folders) {
                        parentItem.folders = [];
                    }
                    if (currentItem.id !== queryFolderId) {
                        if (!parentItem.folders.find(folder => folder.id === currentItem.id)) {
                            parentItem.folders.push(currentItem);
                        }
                    }

                } else if (currentItem.id !== queryFolderId) {
                    $directoryTree.push(currentItem);
                }

                i += 1;
            }
            setDirectoryTree(() => $directoryTree)
        }
    }, [directoryData])

    const handlePathSelection = (path: string, folderId: string) => {
        setSelectedFolder(folderId)
        setSelectedPath(path);
        onSelect(path, folderId);
    };


    const renderRootDirectory = (folders: Folder[] | undefined, currentPath: string, depth = 0) => {
        if (!folders) return null;

        const indentation = depth * 20;

        return (
            <ul style={{ marginLeft: `${indentation}px` }}>
                {folders.map((folder) => (
                    <li key={Math.floor(Math.random() * 50000) + 1}>
                        <button
                            className={`py-1 px-2 bg-mineshaft-500 hover:bg-mineshaft-600 mb-2 rounded-md ${currentPath ? `ml-${depth * 4} ${(selectedFolder === folder.id) ? "bg-mineshaft-300 hover:bg-mineshaft-300 text-black" : "text-gray-400"}` : "font-semibold"
                                }`}
                            onClick={() => handlePathSelection(`${currentPath}/${folder.name}`, folder.id)}
                            type="submit"
                        >
                            {folder.name}
                        </button>
                        {folder.folders && renderRootDirectory(folder.folders, `${currentPath}/${folder.name}`, depth + 1)}
                    </li>
                ))}
            </ul>
        );
    };

    const renderCurrentDirectory = (folders: Folder[] | undefined, currentPath: string) => {
        if (!folders) return null;

        return (
            <ul className="mt-3">
                {folders.map((folder) => (
                    <li key={folder.id}>
                        <button
                            className="py-1 px-2 bg-mineshaft-500 mb-2 hover:bg-mineshaft-600 text-gray-400 rounded-md"
                            onClick={() => handlePathSelection(`${currentPath}/${folder.name}`, folder.id)}
                            type="submit"
                        >
                            {folder.name}
                        </button>
                    </li>
                ))}
            </ul>
        );
    };

    const adjustedPath = selectedPath.replace(/\/root/g, "/").replace(/\/{2,}/g, "/");


    return (
        <div className="p-4 border border-mineshaft-600 rounded-lg shadow-md">
            {
                (directoryTree.length > 0) && (
                    <div>
                        <h2 className="text-md font-semibold  text-gray-300">Select a folder path within the root directory:</h2>
                        {renderRootDirectory(directoryTree, "")}
                    </div>
                )
            }

            {
                (directoryData?.folders && directoryData?.folders.length > 0) && (
                    <div>
                        <h2 className="text-md font-semibold text-gray-300">Select a folder within current directory:</h2>
                        {renderCurrentDirectory(directoryData?.folders, "")}
                    </div>
                )
            }
            <p className="text-sm mt-2 text-gray-300">Selected folder path: <span className="rounded-md bg-mineshaft-600 py-1.5 px-2 ml-2">{adjustedPath}</span></p>
        </div>
    );
};

export default DirectorySelector;




