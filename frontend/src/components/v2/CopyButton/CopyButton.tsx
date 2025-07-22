import { faCheck, faCopy, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useTimedReset } from "@app/hooks";

import { IconButton } from "../IconButton";
import { Tooltip } from "../Tooltip";

export type CopyButtonProps = {
  value: string;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "solid" | "outline" | "plain" | "star" | "outline_bg";
  color?: string;
  name?: string;
  icon?: IconDefinition;
};

export const CopyButton = ({
  value,
  size = "sm",
  variant = "solid",
  color,
  name,
  icon = faCopy
}: CopyButtonProps) => {
  const [copyText, isCopying, setCopyText] = useTimedReset<string>({
    initialState: name ? `Copy ${name}` : "Copy to clipboard"
  });

  async function handleCopyText() {
    setCopyText("Copied");
    navigator.clipboard.writeText(value);
  }

  return (
    <div>
      <Tooltip content={copyText} size={size === "xs" || size === "sm" ? "sm" : "md"}>
        <IconButton
          ariaLabel={copyText}
          variant={variant}
          className={twMerge("group relative", color)}
          size={size}
          onClick={(e) => {
            e.stopPropagation();
            handleCopyText();
          }}
        >
          <FontAwesomeIcon icon={isCopying ? faCheck : icon} />
        </IconButton>
      </Tooltip>
    </div>
  );
};

CopyButton.displayName = "CopyButton";
