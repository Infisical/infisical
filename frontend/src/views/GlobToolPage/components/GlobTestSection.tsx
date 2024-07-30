import { useState, ChangeEvent } from 'react';
import picomatch from "picomatch";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input, TextArea, Tooltip, TooltipProvider } from "@app/components/v2";

export const GlobTestSection = () => {
  const [path, setPath] = useState<string>('');
  const [textStrings, setTextStrings] = useState<string>('');
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

  const handlePathChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPath(e.target.value);
    validateStrings(path, textStrings)
  };

  const handleGlobChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setTextStrings(e.target.value);
  };

  const validateStrings = (glob: string, testStrings: string) => {
    if (!glob || !testStrings) return;

    const matcher = picomatch(glob, { dot: true });
    const lines = testStrings.split('\n')

    console.log(lines)

    const output = lines.map(line => {
      const isMatch = matcher(line);
      return `${line} - ${isMatch ? 'Match' : 'No Match'}`;
    });

    setOutput(output.join('\n'));
  };

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
              value={textStrings}
              onChange={handleGlobChange}
            />
          </div>

          <div className="flex flex-col gap-3">
            <p>Output</p>
            <TextArea value={output}/>
          </div>
        </div>
      </div>
    </div>
  );
};
