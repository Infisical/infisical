import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v3";

const PREVIEW_COUNT = 10;

export const ExpandableValueList = ({
  values,
  className
}: {
  values: string[];
  className?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shown = isExpanded ? values : values.slice(0, PREVIEW_COUNT);
  const hidden = values.length - shown.length;
  return (
    <span className={twMerge("min-w-0", className)}>
      {shown.map((value, index) => (
        <Fragment key={value}>
          <span className="whitespace-nowrap">{value}</span>
          {index < shown.length - 1 ? ", " : ""}
        </Fragment>
      ))}
      {hidden > 0 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1.5 align-baseline text-xs"
          onClick={() => setIsExpanded(true)}
        >
          +{hidden} more
        </Button>
      )}
    </span>
  );
};
