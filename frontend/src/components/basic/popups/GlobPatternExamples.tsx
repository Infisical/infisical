import { useState } from "react";
import { faInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2/Tooltip";

const GlobPatternExamples = () => {
  const [showTip, setShowTip] = useState<boolean>(false);

  return (
    <Tooltip
      isOpen={showTip}
      onOpenChange={setShowTip}
      content={
        <div>
          <h4 className="mb-2">Here are some examples of glob patterns:</h4>
          <div className="ol-listStyleType">
            <li>
              <code className="text-primary">/</code> - Matches all files and directories in the
              current directory
            </li>
            <li>
              <code className="text-primary">**/*</code> - Matches all files and directories in the
              current directory and its subdirectories
            </li>
            <li>
              <code className="text-primary">{"/{dir1,dir2}"}</code> - Matches all files and
              directories in dir1 and dir2
            </li>
          </div>
        </div>
      }
      position="right"
      className="text-xs"
    >
      <div
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[1px] border-mineshaft-300"
        onMouseEnter={() => setShowTip(true)}
      >
        <FontAwesomeIcon icon={faInfo} className="h-2 w-2" />
      </div>
    </Tooltip>
  );
};

export default GlobPatternExamples;
