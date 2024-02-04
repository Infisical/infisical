/* eslint-disable no-nested-ternary */
import { type ChangeEvent, type DragEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import Image from "next/image";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { parseDocument, Scalar, YAMLMap } from "yaml";

import Button from "../basic/buttons/Button";
import Error from "../basic/Error";
import { useNotificationContext } from "../context/Notifications/NotificationProvider";
import { parseDotEnv } from "../utilities/parseDotEnv";
import guidGenerator from "../utilities/randomId";

interface DropZoneProps {
  // TODO: change Data type from any
  setData: (data: any) => void;
  setErrorDragAndDrop: (hasError: boolean) => void;
  createNewFile: () => void;
  errorDragAndDrop: boolean;
  setButtonReady: (isReady: boolean) => void;
  keysExist: boolean;
  numCurrentRows: number;
}

const DropZone = ({
  setData,
  setErrorDragAndDrop,
  createNewFile,
  errorDragAndDrop,
  setButtonReady,
  keysExist,
  numCurrentRows
}: DropZoneProps) => {
  const { t } = useTranslation();
  const { createNotification } = useNotificationContext();

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // set dropEffect to copy i.e copy of the source item
    e.dataTransfer.dropEffect = "copy";
  };

  const [loading, setLoading] = useState(false);

  const getSecrets = (file: ArrayBuffer, fileType: string) => {
    let secrets;
    switch (fileType) {
      case "env": {
        const keyPairs = parseDotEnv(file);
        secrets = Object.keys(keyPairs).map((key, index) => ({
          id: guidGenerator(),
          pos: numCurrentRows + index,
          key,
          value: keyPairs[key as keyof typeof keyPairs].value,
          comment: keyPairs[key as keyof typeof keyPairs].comments.join("\n"),
          type: "shared",
          tags: []
        }));
        break;
      }
      case "json": {
        const keyPairs = JSON.parse(String(file));
        secrets = Object.keys(keyPairs).map((key, index) => ({
          id: guidGenerator(),
          pos: numCurrentRows + index,
          key,
          value: keyPairs[key as keyof typeof keyPairs],
          comment: "",
          type: "shared",
          tags: []
        }));
        break;
      }
      case "yml": {
        const parsedFile = parseDocument(file.toString());
        const keyPairs = parsedFile.contents!.toJSON();

        secrets = Object.keys(keyPairs).map((key, index) => {
          const fileContent = parsedFile.contents as YAMLMap<Scalar, Scalar>;
          const comment =
            fileContent!.items
              .find((item) => item.key.value === key)
              ?.key?.commentBefore?.split("\n")
              .map((cmnt) => cmnt.trim())
              .join("\n") ?? "";
          return {
            id: guidGenerator(),
            pos: numCurrentRows + index,
            key,
            value: keyPairs[key as keyof typeof keyPairs]?.toString() ?? "",
            comment,
            type: "shared",
            tags: []
          };
        });
        break;
      }
      default:
        secrets = "";
        createNotification({
          text: "The file you are dropping should have one of the following extensions: .env, .yml, .json.",
          type: "error"
        });
        break;
    }
    return secrets;
  };

  // This function function immediately parses the file after it is dropped
  const handleDrop = async (e: DragEvent) => {
    setLoading(true);
    setTimeout(() => setLoading(false), 5000);
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";

    const file = e.dataTransfer.files[0];
    const reader = new FileReader();
    if (file === undefined) {
      createNotification({
        text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
        type: "error",
        timeoutMs: 10000
      });
      setLoading(false);
      return;
    }
    const fileType = file.name.split(".")[1];

    reader.onload = (event) => {
      if (event.target === null || event.target.result === null) return;
      // parse function's argument looks like to be ArrayBuffer
      try {
        const newData = getSecrets(event.target.result as ArrayBuffer, fileType);
        setData(newData);
        setButtonReady(true);
      } catch (error) {
        console.log("Error while dropping the file: ", error);
      }
    };

    // If something is wrong show an error
    try {
      reader.readAsText(file);
      setLoading(false);
    } catch (error) {
      setErrorDragAndDrop(true);
      setLoading(false);
    }
  };

  // This function is used when the user manually selects a file from the in-browser dircetory (not drag and drop)
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setLoading(true);
    setTimeout(() => setLoading(false), 5000);
    if (e.currentTarget.files === null) return;
    const file = e.currentTarget.files[0];
    const fileType = file.name.split(".")[1];
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target === null || event.target.result === null) return;
      const { result } = event.target;
      const newData = getSecrets(result as ArrayBuffer, fileType);
      setData(newData);
      setButtonReady(true);
    };
    reader.readAsText(file);
  };

  return loading ? (
    <div className="mb-16 flex items-center justify-center pt-16">
      <Image src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
    </div>
  ) : keysExist ? (
    <div
      className="relative mx-auto mb-4 mt-1 flex w-full max-w-[calc(100%-1rem)] flex-col items-center justify-center rounded-md bg-mineshaft-900 py-8 px-2 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id="fileSelect"
        type="file"
        className="absolute h-full w-full opacity-0"
        accept=""
        onChange={handleFileSelect}
      />
      {errorDragAndDrop ? <div className="my-3 max-w-xl opacity-80" /> : <div className="" />}
      <div className="flex flex-row">
        <FontAwesomeIcon icon={faUpload} className="mr-6 text-3xl text-bunker-300" />
        <p className="mt-1 text-bunker-300">{t("common.drop-zone-keys")}</p>
      </div>
      {errorDragAndDrop && (
        <div className="mt-8 max-w-xl opacity-80">
          <Error text="Something went wrong! Make sure you drag the file directly from the folder in which it is located (e.g., not VS code). Tip: click 'Reveal in Finder/Explorer'" />
        </div>
      )}
    </div>
  ) : (
    <div
      className="relative mb-16 flex w-full max-w-2xl flex-col items-center justify-center rounded-md bg-bunker px-4 pt-16 opacity-80 outline-dashed outline-2 outline-gray-700 duration-200 hover:opacity-100"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FontAwesomeIcon icon={faUpload} className="mb-8 text-7xl" />
      <p className="">{t("common.drop-zone")}</p>
      <input
        id="fileSelect"
        type="file"
        className="absolute h-full w-full opacity-0"
        accept=".txt,.env,.yml"
        onChange={handleFileSelect}
      />
      <div className="mb-6 mt-5 flex w-full flex-row items-center justify-center">
        <div className="w-1/5 border-t border-gray-700" />
        <p className="mx-4 text-xs text-gray-400">OR</p>
        <div className="w-1/5 border-t border-gray-700" />
      </div>
      <div className="z-10 mb-6">
        <Button
          color="mineshaft"
          text={String(t("dashboard.add-secret"))}
          onButtonPressed={createNewFile}
          size="md"
        />
      </div>
      {errorDragAndDrop ? (
        <div className="opacity-80">
          <Error text="Something went wrong! Make sure you drag the file directly from the folder in which it is located (e.g., not VS code). Tip: click 'Reveal in Finder/Explorer'" />
        </div>
      ) : (
        <div className="py-3">
          {/* <p className="text-xs text-gray-500"> If you are expecting to see a file here, contact your administrator for permission. </p> */}
        </div>
      )}
    </div>
  );
};

export default DropZone;
