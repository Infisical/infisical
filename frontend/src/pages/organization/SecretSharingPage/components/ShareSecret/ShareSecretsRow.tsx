import { format } from "date-fns";
import { ClockAlertIcon, ClockIcon, Ellipsis, Mail, MailOpen, Trash2 } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const ShareSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TSharedSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
}) => {
  const lastViewedAt = row.lastViewedAt
    ? format(new Date(row.lastViewedAt), "MMM d, yyyy h:mm a")
    : undefined;

  let isExpired = false;
  if (row.expiresAfterViews !== null && row.expiresAfterViews <= 0) {
    isExpired = true;
  }

  if (row.expiresAt !== null && new Date(row.expiresAt) < new Date()) {
    isExpired = true;
  }

  return (
    <TableRow key={row.id}>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            {lastViewedAt ? (
              <MailOpen className="size-4 text-accent" />
            ) : (
              <Mail className="size-4 text-accent" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {lastViewedAt ? `Last opened at ${lastViewedAt}` : "Not yet opened"}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>{row.name || <span className="text-muted">&mdash;</span>}</TableCell>

      <TableCell>{format(new Date(row.createdAt), "MMM d, yyyy h:mm a")}</TableCell>
      <TableCell>{format(new Date(row.expiresAt), "MMM d, yyyy h:mm a")}</TableCell>
      <TableCell>
        {row.expiresAfterViews !== null ? (
          row.expiresAfterViews
        ) : (
          <span className="text-muted">&mdash;</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={isExpired ? "danger" : "success"}>
          {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
          {isExpired ? "Expired" : "Active"}
        </Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="actions">
              <Ellipsis className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="danger"
              onClick={() =>
                handlePopUpOpen("deleteSharedSecretConfirmation", {
                  name: "delete",
                  id: row.id
                })
              }
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
