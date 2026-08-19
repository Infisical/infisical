import { ClipboardCheckIcon, CopyIcon, InfoIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  statement: string;
};

export const CreateUserStatementAlert = ({ statement }: Props) => {
  const [, isCopied, setCopyState] = useTimedReset({ initialState: false });

  const handleCopy = () => {
    navigator.clipboard.writeText(statement);
    setCopyState(true);
  };

  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>Example Create User Statement</AlertTitle>
      <AlertDescription className="gap-3">
        <p>Infisical requires two database users to be created for rotation.</p>
        <p>
          These users are intended to be solely managed by Infisical. Altering their login after
          rotation may cause unexpected failure.
        </p>
        <p>
          Below is an example statement for creating the required users. You may need to modify it
          to suit your needs.
        </p>
        <div className="relative w-full">
          <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-3 pr-10 font-mono text-sm break-words whitespace-pre-wrap text-foreground">
            {statement}
          </pre>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                type="button"
                variant="ghost"
                size="xs"
                className="absolute top-2 right-2 text-muted hover:text-foreground"
                aria-label={isCopied ? "Copied" : "Copy statement"}
                onClick={handleCopy}
              >
                {isCopied ? <ClipboardCheckIcon /> : <CopyIcon />}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{isCopied ? "Copied" : "Copy statement"}</TooltipContent>
          </Tooltip>
        </div>
      </AlertDescription>
    </Alert>
  );
};
