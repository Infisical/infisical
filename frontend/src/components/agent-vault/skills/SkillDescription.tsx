import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

/**
 * A skill's description cut to one line, with the full text on hover. A tooltip trigger sits above a linked
 * row's link so it can be hovered, which also takes the row's click, so it opens the skill itself. Keyboard
 * users reach the skill through the row's link.
 */
export const SkillDescription = ({
  description,
  onOpen
}: {
  description: string;
  onOpen: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <span className="block cursor-pointer truncate text-sm" onClick={onOpen}>
        {description}
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-md">{description}</TooltipContent>
  </Tooltip>
);
