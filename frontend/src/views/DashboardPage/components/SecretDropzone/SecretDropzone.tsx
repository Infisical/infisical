import { ChangeEvent, DragEvent } from 'react';
import { useTranslation } from 'next-i18next';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { twMerge } from 'tailwind-merge';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionalityj
import { parseDotEnv } from '@app/components/utilities/parseDotEnv';
import { Button } from '@app/components/v2';
import { useToggle } from '@app/hooks/useToggle';

type Props = {
  isSmaller: boolean;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  onAddNewSecret?: () => void;
};

export const SecretDropzone = ({ isSmaller, onParsedEnv, onAddNewSecret }: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isDragActive, setDragActive] = useToggle();
  const [isLoading, setIsLoading] = useToggle();
  const { createNotification } = useNotificationContext();

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive.on();
    } else if (e.type === 'dragleave') {
      setDragActive.off();
    }
  };

  const parseFile = (file?: File) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: `You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.`,
        type: 'error',
        timeoutMs: 10000
      });
      return;
    }
    // const fileType = file.name.split('.')[1];
    setIsLoading.on();
    reader.onload = (event) => {
      if (!event?.target?.result) return;
      // parse function's argument looks like to be ArrayBuffer
      const env = parseDotEnv(event.target.result as ArrayBuffer);
      setIsLoading.off();
      onParsedEnv(env);
    };

    // If something is wrong show an error
    try {
      reader.readAsText(file);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) {
      return;
    }

    e.dataTransfer.dropEffect = 'copy';
    setDragActive.off();
    parseFile(e.dataTransfer.files[0]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0]);
  };

  return (
    <div className="mx-1">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={twMerge(
          'relative mb-4 mt-4 max-w-[calc(100vw-292px)] flex w-full cursor-pointer text-mineshaft-200 items-center py-8 justify-center space-x-2 rounded-md bg-mineshaft-900 px-2 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100',
          isDragActive && 'opacity-100',
          !isSmaller && 'flex-col space-y-4 max-w-3xl py-20',
          isLoading && 'bg-bunker-800'
        )}
      >
        {isLoading ? (
          <div className="mb-16 flex items-center justify-center pt-16">
            <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
          </div>
        ) : (
          <>
            <div>
              <FontAwesomeIcon icon={faUpload} size={isSmaller ? '2x' : '5x'} />
            </div>
            <div>
              <p className="">{t(isSmaller ? 'common:drop-zone-keys' : 'common:drop-zone')}</p>
            </div>
            <input
              id="fileSelect"
              type="file"
              className="absolute h-full w-full cursor-pointer opacity-0"
              accept=".txt,.env,.yml,.yaml"
              onChange={handleFileUpload}
            />
            {!isSmaller && (
              <>
                <div className="flex w-full flex-row items-center justify-center py-4">
                  <div className="w-1/5 border-t border-mineshaft-700" />
                  <p className="mx-4 text-xs text-mineshaft-400">OR</p>
                  <div className="w-1/5 border-t border-mineshaft-700" />
                </div>
                <div>
                  <Button variant="star" onClick={onAddNewSecret}>
                    Add a new secret
                  </Button>
                </div>
              </>
            )}{' '}
          </>
        )}
      </div>
    </div>
  );
};
