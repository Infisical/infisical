import { LockIcon } from "lucide-react";

import {
  Blur,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

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
          <TableCell className="sticky left-0 z-10 w-10 max-w-10 min-w-10 bg-container p-0 transition-all duration-75 group-hover:bg-container-hover">
            <div className="flex h-full items-center justify-center [&>svg]:size-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <LockIcon className="text-secret/50" />
                </TooltipTrigger>
                <TooltipContent>You do not have permission to view this secret</TooltipContent>
              </Tooltip>
            </div>
          </TableCell>
          <TableCell className="sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover">
            <Blur className="pl-0" />
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
