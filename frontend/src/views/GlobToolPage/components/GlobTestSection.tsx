import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input, TextArea, Tooltip, TooltipProvider } from "@app/components/v2";

const patterns = [
  { title: 'Zero or More Chars', wildcard: '*' },
  { title: 'One Char', wildcard: '?' },
  { title: 'Recursive (globstar)', wildcard: '**' },
  { title: 'List', wildcard: '{a,b,c}' },
  { title: 'Range', wildcard: '[abc]' },
  { title: 'Not in Range', wildcard: '[!abc]' },
  { title: 'Not Patterns', wildcard: '!(a|b)' },
  { title: 'Zero or One Pattern', wildcard: '?(a|b)' },
  { title: 'Zero or More Patterns', wildcard: '*(a|b)' },
  { title: 'One or More Patterns', wildcard: '+(a|b)' },
  { title: 'Exactly One Pattern', wildcard: '@(a|b)' },
];

const splitIntoAmount = (array: any, num: number) => {
  const chunkSize = Math.ceil(array.length / num);
  const result = [];

  for (let i = 0; i < 4; i++) {
    result.push(array.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  return result;
};

const handleCopySecretToClipboard = async (value: string) => {
  if (value) {
    try {
      await window.navigator.clipboard.writeText(value);
      createNotification({ type: "success", text: "Copied secret to clipboard" });
    } catch (error) {
      console.log(error);
      createNotification({ type: "error", text: "Failed to copy secret to clipboard" });
    }
  }
};

const columns = splitIntoAmount(patterns, 3);

export const GlobTestSection = () => {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex flex-col gap-4 w-full max-w-7xl">
        <p className="text-xl font-semibold text-mineshaft-100">Glob Tool</p>

        <div className="flex gap-4">
          <p>Examples</p>

          <div className="grid grid-cols-4 gap-4">
            {columns.map((column, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-2">
                {column.map((item, idx) => (
                  <div key={idx + item.wildcard} className="grid grid-cols-2 gap-2">
                    <span className="text-nowrap">{item.title}</span>
                    <span className="bg-mineshaft-600 border-mineshaft-500 border rounded-md whitespace-nowrap text-center p-1">
                      {item.wildcard}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex gap-1">
            <Input rightIcon={
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
            <p>Test String</p>
            <TextArea />
          </div>
        </div>
      </div>
    </div>
  );
};
