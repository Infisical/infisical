import { LockIcon } from "lucide-react";

import { TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { ResourceEnvironmentStatusCell } from "../ResourceEnvironmentStatusCell";

type Props = {
  environments: { name: string; slug: string }[];
  count: number;
};

export const SecretNoAccessTableRow = ({ environments = [], count }: Props) => {
  return (
    <>
      {Array.from(Array(count)).map((_, j) => (
        <TableRow key={`no-access-secret-overview-${j + 1}`} className="group">
          <TableCell className="sticky left-0 z-10 bg-container transition-all duration-75 group-hover:bg-container-hover">
            <Tooltip>
              <TooltipTrigger asChild>
                <LockIcon className="text-secret/50" />
              </TooltipTrigger>
              <TooltipContent>You do not have permission to view this secret</TooltipContent>
            </Tooltip>
          </TableCell>
          <TableCell className="sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover">
            <div className="flex w-80 grow items-center py-1 pr-2 pl-0" tabIndex={0} role="button">
              <span className="blur-sm">xxxxxxxxxxxx</span>
            </div>
          </TableCell>
          {environments.map(({ slug }, i) => {
            return (
              <ResourceEnvironmentStatusCell
                key={`no-access-${slug}-${i + 1}`}
                status="no-access"
              />
            );
          })}
        </TableRow>
      ))}
    </>
  );
};
