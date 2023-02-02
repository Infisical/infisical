/* eslint-disable no-nested-ternary */
import { type ChangeEvent, type DragEvent, useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { parseDocument, Scalar, YAMLMap } from 'yaml';

import Button from '../basic/buttons/Button';
import Error from '../basic/Error';
import { parseDotEnv } from '../utilities/parseDotEnv';
import guidGenerator from '../utilities/randomId';

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
    e.dataTransfer.dropEffect = 'copy';
  };

  const [loading, setLoading] = useState(false);

  const getSecrets = (file: ArrayBuffer, fileType: string) => {
    let secrets;
    switch (fileType) {
      case 'env': {
        const keyPairs = parseDotEnv(file);
        secrets = Object.keys(keyPairs).map((key, index) => ({
          id: guidGenerator(),
          pos: numCurrentRows + index,
          key,
          value: keyPairs[key as keyof typeof keyPairs].value,
          comment: keyPairs[key as keyof typeof keyPairs].comments.join('\n'),
          type: 'shared'
        }));
        break;
      }
      case 'yml': {
        const parsedFile = parseDocument(file.toString());
        const keyPairs = parsedFile.contents!.toJSON();

        secrets = Object.keys(keyPairs).map((key, index) => {
          const fileContent = parsedFile.contents as YAMLMap<Scalar, Scalar>;
          const comment =
            fileContent!.items
              .find((item) => item.key.value === key)
              ?.key?.commentBefore?.split('\n')
              .map((cmnt) => cmnt.trim())
              .join('\n') ?? '';
          return {
            id: guidGenerator(),
            pos: numCurrentRows + index,
            key,
            value: keyPairs[key as keyof typeof keyPairs]?.toString() ?? '',
            comment,
            type: 'shared'
          };
        });
        break;
      }
      default:
        secrets = '';
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
    e.dataTransfer.dropEffect = 'copy';

    const file = e.dataTransfer.files[0];
    const reader = new FileReader();
    const fileType = file.name.split('.')[1];

    reader.onload = (event) => {
      if (event.target === null || event.target.result === null) return;
      // parse function's argument looks like to be ArrayBuffer
      const newData = getSecrets(event.target.result as ArrayBuffer, fileType);
      setData(newData);
      setButtonReady(true);
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
    const fileType = file.name.split('.')[1];
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
    <div className="flex items-center justify-center pt-16 mb-16">
      <Image src="/images/loading/loading.gif" height={70} width={120} alt="google logo" />
    </div>
  ) : keysExist ? (
    <div
      className="opacity-60 hover:opacity-100 duration-200 relative bg-mineshaft-900 max-w-[calc(100%-1rem)] w-full outline-dashed outline-chicago-600 rounded-md outline-2 flex flex-col items-center justify-center mb-16 mx-auto mt-1 py-8 px-2"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id="fileSelect"
        type="file"
        className="opacity-0 absolute w-full h-full"
        accept=".txt,.env,.yml"
        onChange={handleFileSelect}
      />
      {errorDragAndDrop ? <div className="my-3 max-w-xl opacity-80" /> : <div className="" />}
      <div className="flex flex-row">
        <FontAwesomeIcon icon={faUpload} className="text-bunker-300 text-3xl mr-6" />
        <p className="text-bunker-300 mt-1">{t('common:drop-zone-keys')}</p>
      </div>
      {errorDragAndDrop && (
        <div className="mt-8 max-w-xl opacity-80">
          <Error text="Something went wrong! Make sure you drag the file directly from the folder in which it is located (e.g., not VS code). Tip: click 'Reveal in Finder/Explorer'" />
        </div>
      )}
    </div>
  ) : (
    <div
      className="opacity-80 hover:opacity-100 duration-200 relative bg-bunker max-w-2xl w-full outline-dashed outline-gray-700 rounded-md outline-2 flex flex-col items-center justify-center pt-16 mb-16 px-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FontAwesomeIcon icon={faUpload} className="text-7xl mb-8" />
      <p className="">{t('common:drop-zone')}</p>
      <input
        id="fileSelect"
        type="file"
        className="opacity-0 absolute w-full h-full"
        accept=".txt,.env,.yml"
        onChange={handleFileSelect}
      />
      <div className="flex flex-row w-full items-center justify-center mb-6 mt-5">
        <div className="border-t border-gray-700 w-1/5" />
        <p className="text-gray-400 text-xs mx-4">OR</p>
        <div className="border-t border-gray-700 w-1/5" />
      </div>
      <div className="z-10 mb-6">
        <Button
          color="mineshaft"
          text={String(t('dashboard:add-secret'))}
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
