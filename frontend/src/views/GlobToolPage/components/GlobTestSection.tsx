import { ReactNode, useState, useEffect, useCallback, ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import picomatch from "picomatch";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from '@app/components/notifications';
import { IconButton, Input, TextArea, Tooltip, TooltipProvider, Button } from '@app/components/v2';

export const GlobTestSection = () => {
  const [path, setPath] = useState<string>('');
  const [glob, setGlob] = useState<string>('');
  const [output, setOutput] = useState<ReactNode>(null);

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

  const handleGlobChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setGlob(e.target.value);
  }, []);

  const validateStrings = useCallback((secret: string, testStrings: string) => {
    if (!secret || !testStrings) return;

    const matcher = picomatch(secret, { dot: true });
    const patterns = testStrings.split('\n');

    const newOutput = patterns.map((pattern) => {
      const isMatch = matcher(pattern);
      const color = isMatch ? 'text-green-500' : 'text-red-500';

      return (
        <div key={pattern} className={color}>
          {isMatch ? "✓" : "✕"} - {pattern}
        </div>
      )
    })

    setOutput(newOutput)
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

          <div className="flex flex-col gap-3">
            <p>Test Strings</p>
            <TextArea
              value={glob}
              onChange={handleGlobChange}
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-3">
            <p>Output</p>
            <div className="rounded-md w-full p-2 border border-solid border-mineshaft-400 bg-bunker-800 text-gray-400 font-inter whitespace-pre-wrap h-24 overflow-y-auto">
              {output}
            </div>
          </div>

          <div>
            <Button
                variant="solid"
                type="button"
                onClick={() => validateStrings(path, glob)}
                className="mb-4"
              >
                Validate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
