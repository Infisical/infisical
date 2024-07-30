import { useState, ChangeEvent } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input, TextArea, Tooltip, TooltipProvider } from "@app/components/v2";

const handleCopySecretToClipboard = async (value: string) => {
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

export const GlobTestSection = () => {
  const [path, setPath] = useState('')

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    setPath(e.target.value)
  }

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex flex-col gap-4 w-full max-w-7xl">
        <p className="text-xl font-semibold text-mineshaft-100">Glob Tool</p>

        <div className="flex flex-col gap-6 mt-4">
            <div className="flex flex-col gap-1">
              <span>Path</span>
              <Input value={path} onChange={handleInputChange} rightIcon={
                <TooltipProvider >
                  <Tooltip content="Copy Path">
                    <IconButton
                      ariaLabel="copy-value"
                      onClick={handleCopySecretToClipboard}
                      variant="plain"
                      className="h-full"
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </IconButton>
                  </Tooltip>
                </TooltipProvider>
              }/>
            </div>

            <div className="flex flex-col gap-3">
              <p>Test Strings</p>
              <TextArea />
            </div>
        </div>
      </div>
    </div>
  );
};
