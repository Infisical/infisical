import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";

import { useDialogPortalContainer } from "./useDialogPortalContainer";

export const FilterValueBadges = ({ values }: { values: string[] }) => {
  const { ref: rootRef, portalContainer } = useDialogPortalContainer<HTMLDivElement>();

  if (values.length === 0) return null;

  const [first, ...rest] = values.map((value, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <Badge key={`${value}-${index}`} variant="neutral" isTruncatable className="max-w-[12rem]">
      <span>{value}</span>
    </Badge>
  ));

  return (
    <div ref={rootRef} className="flex min-w-0 flex-wrap items-center gap-1">
      {first}
      {rest.length > 0 && (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <Badge variant="neutral" className="cursor-pointer hover:bg-neutral/35">
              +{rest.length}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent
            container={portalContainer}
            className="flex max-h-64 w-auto max-w-xs flex-wrap gap-1.5 overflow-y-auto"
          >
            {rest}
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
};
