import { Fragment, ReactNode } from "react";
import { Info } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  variables: string[];
  descriptions: Record<string, string>;
  footer: ReactNode;
};

export const HostCommandVariablesTooltip = ({ variables, descriptions, footer }: Props) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info />
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={8} collisionPadding={16} className="max-w-md">
      <p className="mb-2 font-medium">Available variables</p>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {variables.map((variable) => (
          <Fragment key={variable}>
            <Badge variant="neutral" className="font-mono">
              {`{{${variable}}}`}
            </Badge>
            <span>{descriptions[variable]}</span>
          </Fragment>
        ))}
      </div>
      <p className="mt-2">{footer}</p>
    </TooltipContent>
  </Tooltip>
);
