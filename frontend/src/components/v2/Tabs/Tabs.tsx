import { useState } from "react";
import { faArrowUpRightFromSquare, faCheck, faClipboard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as Tabs from "@radix-ui/react-tabs";

export type TabsProps = Tabs.TabsProps & {};

function copyToClipboard(id: string, setState: (value: boolean) => void) {
  // Get the text field
  const copyText = document.getElementById(id) as HTMLInputElement;

  // Select the text field
  copyText.select();
  copyText.setSelectionRange(0, 99999); // For mobile devices

  // Copy the text inside the text field
  navigator.clipboard.writeText(copyText.value);

  setState(true);
  setTimeout(() => setState(false), 2000);
  // Alert the copied text
  // alert("Copied the text: " + copyText.value);
}

const CodeItem = ({
  isCopied,
  setIsCopied,
  textExplanation,
  code,
  id
}: {
  isCopied: boolean;
  setIsCopied: (value: boolean) => void;
  textExplanation: string;
  code: string;
  id: string;
}) => {
  return (
    <>
      <p className="mb-2 mt-4 text-bunker-300 text-sm leading-normal">{textExplanation}</p>
      <div className="font-mono text-sm px-3 py-2 bg-bunker rounded-md border border-mineshaft-600 flex flex-row items-center justify-between">
        <input disabled value={code} id={id} className="w-full bg-transparent text-bunker-200" />
        <button
          type="button"
          onClick={() => copyToClipboard(id, setIsCopied)}
          className="h-full pl-3.5 pr-2 text-bunker-300 hover:text-primary-200 duration-200"
        >
          {isCopied ? (
            <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
          ) : (
            <FontAwesomeIcon icon={faClipboard} />
          )}
        </button>
      </div>
    </>
  );
};

export const TabsObject = () => {
  const [downloadCodeCopied, setDownloadCodeCopied] = useState(false);
  const [downloadCode2Copied, setDownloadCode2Copied] = useState(false);
  const [loginCodeCopied, setLoginCodeCopied] = useState(false);
  const [initCodeCopied, setInitCodeCopied] = useState(false);
  const [runCodeCopied, setRunCodeCopied] = useState(false);

  return (
    <Tabs.Root
      className="flex flex-col w-full cursor-default border border-mineshaft-600 rounded-md"
      defaultValue="tab1"
    >
      <Tabs.List
        className="shrink-0 flex border-b border-mineshaft-600"
        aria-label="Manage your account"
      >
        <Tabs.Trigger
          className="bg-bunker-700 px-5 h-10 flex-1 flex items-center justify-center text-sm leading-none text-bunker-300 select-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:focus:relative data-[state=active]:border-b data-[state=active]:border-primary outline-none cursor-default"
          value="tab1"
        >
          MacOS
        </Tabs.Trigger>
        <Tabs.Trigger
          className="bg-bunker-700 px-5 h-10 flex-1 flex items-center justify-center text-sm leading-none text-bunker-300 select-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:focus:relative data-[state=active]:border-b data-[state=active]:border-primary outline-none cursor-default"
          value="tab2"
        >
          Windows
        </Tabs.Trigger>
        {/* <Tabs.Trigger
        className="bg-bunker-700 px-5 h-10 flex-1 flex items-center justify-center text-sm leading-none text-bunker-300 select-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:focus:relative data-[state=active]:border-b data-[state=active]:border-primary outline-none cursor-default"
        value="tab3"
      >
        Arch Linux
      </Tabs.Trigger> */}
        <a
          target="_blank"
          rel="noopener noreferrer"
          className="bg-bunker-700 hover:text-bunker-100 duration-200 px-5 h-10 flex-1 flex items-center justify-center text-sm leading-none text-bunker-300 select-none first:rounded-tl-md last:rounded-tr-md data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:focus:relative data-[state=active]:border-b data-[state=active]:border-primary outline-none cursor-default"
          href="https://infisical.com/docs/cli/overview"
        >
          Other Platforms <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-2" />
        </a>
      </Tabs.List>
      <Tabs.Content
        className="grow p-5 pt-0 bg-bunker-700 rounded-b-md outline-none cursor-default"
        value="tab1"
      >
        <CodeItem
          isCopied={downloadCodeCopied}
          setIsCopied={setDownloadCodeCopied}
          textExplanation="1. Download CLI"
          code="brew install infisical/get-cli/infisical"
          id="downloadCode"
        />
        <CodeItem
          isCopied={loginCodeCopied}
          setIsCopied={setLoginCodeCopied}
          textExplanation="2. Login"
          code="infisical login"
          id="loginCode"
        />
        <CodeItem
          isCopied={initCodeCopied}
          setIsCopied={setInitCodeCopied}
          textExplanation="3. Choose Project"
          code="infisical init"
          id="initCode"
        />
        <CodeItem
          isCopied={runCodeCopied}
          setIsCopied={setRunCodeCopied}
          textExplanation="4. Done! Now, you can prepend your usual start script with:"
          code="infisical run -- [YOUR USUAL CODE START SCRIPT GOES HERE]"
          id="runCode"
        />
        <p className="text-bunker-300 text-sm mt-2">
          You can find example of start commands for different frameworks{" "}
          <a
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/integrations/overview"
          >
            here
          </a>
          .{" "}
        </p>
      </Tabs.Content>
      <Tabs.Content className="grow p-5 pt-0 bg-bunker-700 rounded-b-md outline-none" value="tab2">
        <CodeItem
          isCopied={downloadCodeCopied}
          setIsCopied={setDownloadCodeCopied}
          textExplanation="1. Download CLI"
          code="scoop bucket add org https://github.com/Infisical/scoop-infisical.git"
          id="downloadCodeW"
        />
        <div className="font-mono text-sm px-3 py-2 mt-2 bg-bunker rounded-md border border-mineshaft-600 flex flex-row items-center justify-between">
          <input
            disabled
            value="scoop install infisical"
            id="downloadCodeW2"
            className="w-full bg-transparent text-bunker-200"
          />
          <button
            type="button"
            onClick={() => copyToClipboard("downloadCodeW2", setDownloadCode2Copied)}
            className="h-full pl-3.5 pr-2 text-bunker-300 hover:text-primary-200 duration-200"
          >
            {downloadCode2Copied ? (
              <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
            ) : (
              <FontAwesomeIcon icon={faClipboard} />
            )}
          </button>
        </div>
        <CodeItem
          isCopied={loginCodeCopied}
          setIsCopied={setLoginCodeCopied}
          textExplanation="2. Login"
          code="infisical login"
          id="loginCodeW"
        />
        <CodeItem
          isCopied={initCodeCopied}
          setIsCopied={setInitCodeCopied}
          textExplanation="3. Choose Project"
          code="infisical init"
          id="initCodeW"
        />
        <CodeItem
          isCopied={runCodeCopied}
          setIsCopied={setRunCodeCopied}
          textExplanation="4. Done! Now, you can prepend your usual start script with:"
          code="infisical run -- [YOUR USUAL CODE START SCRIPT GOES HERE]"
          id="runCodeW"
        />
        <p className="text-bunker-300 text-sm mt-2">
          You can find example of start commands for different frameworks{" "}
          <a
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
            href="https://infisical.com/docs/integrations/overview"
          >
            here
          </a>
          .{" "}
        </p>
      </Tabs.Content>
    </Tabs.Root>
  );
};
