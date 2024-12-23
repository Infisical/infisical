import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl } from "@app/components/v2";

type Props = {
  label: string;
  value: string;
  isRevealed: boolean;
  hiddenDisplay?: string;
};

export const CopyableField = ({ label, value, isRevealed, hiddenDisplay = "••••••••" }: Props) => {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      createNotification({
        text: `${label} copied to clipboard`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to copy to clipboard",
        type: "error"
      });
    }
  };

  return (
    <FormControl label={label}>
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate font-mono">
          {isRevealed ? value : hiddenDisplay}
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={copyToClipboard}
        >
          <FontAwesomeIcon icon={faCopy} />
        </Button>
      </div>
    </FormControl>
  );
}; 