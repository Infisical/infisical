import {
  FieldDescription,
  FieldError,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type Props = {
  lines: string[];
  isError?: boolean;
};

/**
 * A policy constraint can list many patterns, and a single pattern can be long, so the message is
 * kept to one line under the input and the full text is read from the tooltip, where each
 * constraint gets its own paragraph.
 */
export const PolicyRowMessage = ({ lines, isError }: Props) => {
  if (lines.length === 0) return null;

  const message = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block truncate">{lines.join("; ")}</span>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-sm flex-col gap-1.5 break-words">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );

  return isError ? (
    <FieldError className="mt-1.5">{message}</FieldError>
  ) : (
    <FieldDescription className="mt-1.5">{message}</FieldDescription>
  );
};
