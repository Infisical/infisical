import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { useRouter } from 'next/router';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from '@app/components/notifications';
import { IconButton, Input, Tooltip, TooltipProvider } from '@app/components/v2';

import { GlobToolFormSection } from './GlobToolFormSection';

export const GlobTestSection = () => {
  const [path, setPath] = useState<string>('');

  const router = useRouter();
  const { query } = router;
  const secretPath = decodeURIComponent(query.secretPath as string ?? '');

  useEffect(() => {
    if (secretPath) {
      setPath(secretPath)
    }
  }, [secretPath]);

  const handleCopyPathToClipboard = async (value: string) => {
    if (value) {
      try {
        await window.navigator.clipboard.writeText(value);
        createNotification({ type: "success", text: "Copied path to clipboard" });
      } catch (error) {
        console.log(error);
        createNotification({ type: "error", text: "Failed to copy path to clipboard" });
      }
    }
  };

  const handlePathChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPath(e.target.value);
  }, []);

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex flex-col gap-4 w-full max-w-7xl">
        <p className="text-xl font-semibold text-mineshaft-100">Glob Tool</p>

        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-3">
            <span>Path</span>
            <Input
              value={path}
              onChange={handlePathChange}
              rightIcon={
                <TooltipProvider>
                  <Tooltip content="Copy Path">
                    <IconButton
                      ariaLabel="copy-value"
                      onClick={() => handleCopyPathToClipboard(path)}
                      variant="plain"
                      className="h-full"
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </IconButton>
                  </Tooltip>
                </TooltipProvider>
              }
            />
          </div>

          <GlobToolFormSection path={path} />
        </div>
      </div>
    </div>
  );
};
