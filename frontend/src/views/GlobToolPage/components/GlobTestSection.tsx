import { useState, useCallback, ChangeEvent } from 'react';
import picomatch from "picomatch";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faBarcodeRead } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input, TextArea, Tooltip, TooltipProvider, Button } from "@app/components/v2";

export const GlobTestSection = () => {
  const [path, setPath] = useState<string>('');
  const [glob, setGlob] = useState<string>('');
  const [output, setOutput] = useState<string>('');

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

  const validateStrings = useCallback((glob: string, testStrings: string) => {
    if (!glob || !testStrings) return;

    const matcher = picomatch(glob, { dot: true });
    const lines = testStrings.split('\n')

    const output = lines.map(line => {
      const isMatch = matcher(line);
      return `${line} - ${isMatch ? 'Match' : 'No Match'}`;
    }).join('\n');

    setOutput(output)
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
              rows={5}
            />
          </div>

          <div className="flex flex-col gap-3">
            <p>Output</p>
            <TextArea 
              value={output}
              rows={5}
            />
          </div>

          <div>
            <Button
                variant="solid"
                type="btn"
                leftIcon={<FontAwesomeIcon icon={faBarcodeRead} />}
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
