import { type ChangeEvent, type DragEvent, useState } from 'react';
import Image from 'next/image';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../basic/buttons/Button';
import Error from '../basic/Error';
import parse from '../utilities/file';
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

  // This function function immediately parses the file after it is dropped
  const handleDrop = async (e: DragEvent) => {
    setLoading(true);
    setTimeout(() => setLoading(false), 5000);
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';

    const file = e.dataTransfer.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      if (event.target === null || event.target.result === null) return;
      // parse function's argument looks like to be ArrayBuffer
      const keyPairs = parse(event.target.result as Buffer);
      const newData = Object.keys(keyPairs).map((key, index) => [
        guidGenerator(),
        numCurrentRows + index,
        key,
        keyPairs[key as keyof typeof keyPairs],
        'shared'
      ]);
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
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target === null || event.target.result === null) return;
      const { result } = event.target;
      if (typeof result === 'string') {
        const newData = result
          .split('\n')
          .map((line: string, index: number) => [
            guidGenerator(),
            numCurrentRows + index,
            line.split('=')[0],
            line.split('=').slice(1, line.split('=').length).join('='),
            'shared'
          ]);
        setData(newData);
        setButtonReady(true);
      }
    };
    reader.readAsText(file);
  };

  return loading ? (
    <div className="flex items-center justify-center pt-16 mb-16">
      <Image
        src="/images/loading/loading.gif"
        height={70}
        width={120}
        alt="google logo"
      ></Image>
    </div>
  ) : keysExist ? (
    <div
      className="opacity-60 hover:opacity-100 duration-200 relative bg-bunker outline max-w-[calc(100%-1rem)] w-full outline-dashed outline-gray-600 rounded-md outline-2 flex flex-col items-center justify-center mb-16 mx-auto mt-1 py-8 px-2"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id="fileSelect"
        type="file"
        className="opacity-0 absolute w-full h-full"
        accept=".txt,.env"
        onChange={handleFileSelect}
      />
      {errorDragAndDrop ? (
        <div className="my-3 max-w-xl opacity-80"></div>
      ) : (
        <div className=""></div>
      )}
      <div className="flex flex-row">
        <FontAwesomeIcon
          icon={faUpload}
          className="text-gray-300 text-3xl mr-6"
        />
        <p className="text-gray-300 mt-1">
          Drag and drop your .env file here to add more keys.
        </p>
      </div>
      {errorDragAndDrop ? (
        <div className="mt-8 max-w-xl opacity-80">
          <Error text="Something went wrong! Make sure you drag the file directly from the folder in which it is located (e.g., not VS code). Tip: click 'Reveal in Finder/Explorer'" />
        </div>
      ) : (
        <></>
      )}
    </div>
  ) : (
    <div
      className="opacity-80 hover:opacity-100 duration-200 relative bg-bunker outline max-w-2xl w-full outline-dashed outline-gray-700 rounded-md outline-2 flex flex-col items-center justify-center pt-16 mb-16 px-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FontAwesomeIcon icon={faUpload} className="text-7xl mb-8" />
      <p className="">Drag and drop your .env file here.</p>
      <input
        id="fileSelect"
        type="file"
        className="opacity-0 absolute w-full h-full"
        accept=".txt,.env"
        onChange={handleFileSelect}
      />
      <div className="flex flex-row w-full items-center justify-center mb-6 mt-5">
        <div className="border-t border-gray-700 w-1/5"></div>
        <p className="text-gray-400 text-xs mx-4">OR</p>
        <div className="border-t border-gray-700 w-1/5"></div>
      </div>
      <div className="z-10 mb-6">
        <Button
          color="mineshaft"
          text="Create a new .env file"
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
