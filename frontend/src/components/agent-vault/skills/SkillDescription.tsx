import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

/** A skill's description cut to one line, with the full text on hover. */
export const SkillDescription = ({ description }: { description: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="block truncate text-sm">{description}</span>
    </TooltipTrigger>
    <TooltipContent className="max-w-md">{description}</TooltipContent>
  </Tooltip>
);
