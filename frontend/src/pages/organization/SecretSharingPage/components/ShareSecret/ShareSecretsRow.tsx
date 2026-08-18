import { useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { ClockAlertIcon, ClockIcon, Copy, Ellipsis, Mail, MailOpen, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  const subOrganization = useSearch({
    strict: false,
    select: (el) => el?.subOrganization
  });

  const sharedSecretUrl = new URL(`${window.location.origin}/shared/secret/${row.id}`);
  if (subOrganization) {
    sharedSecretUrl.searchParams.set("subOrganization", subOrganization);
  }

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
    <TableRow>
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
      <TableCell className="max-w-56 break-words whitespace-normal">
        {row.name || <span className="text-muted">&mdash;</span>}
      </TableCell>

      <TableCell className="text-label">
        {format(new Date(row.createdAt), "MMM d, yyyy h:mm a")}
      </TableCell>
      <TableCell className="text-label">
        {format(new Date(row.expiresAt), "MMM d, yyyy h:mm a")}
      </TableCell>
      <TableCell>
        {row.expiresAfterViews !== null ? (
          row.expiresAfterViews
        ) : (
          <span className="text-muted">&mdash;</span>
        )}
      </TableCell>
      <TableCell>
        <Badge className="whitespace-nowrap" variant={isExpired ? "danger" : "success"}>
          {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
          {isExpired ? "Expired" : "Active"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label={`Actions for ${row.name || "shared secret"}`}
              >
                <Ellipsis className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(sharedSecretUrl.toString());
                  createNotification({
                    text: "Shared secret link copied to clipboard.",
                    type: "success"
                  });
                }}
              >
                <Copy />
                Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="danger"
                onClick={() =>
                  handlePopUpOpen("deleteSharedSecretConfirmation", {
                    name: row.name || "shared secret",
                    id: row.id
                  })
                }
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
