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

const getStatusLabel = ({
  isTimeExpired,
  isViewsExhausted
}: {
  isTimeExpired: boolean;
  isViewsExhausted: boolean;
}) => {
  if (isViewsExhausted) return "Views Used";
  if (isTimeExpired) return "Expired";
  return "Active";
};

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

  const isViewsExhausted = row.expiresAfterViews !== null && row.expiresAfterViews <= 0;
  const isTimeExpired = row.expiresAt !== null && new Date(row.expiresAt) < new Date();
  const isExpired = isViewsExhausted || isTimeExpired;

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
      <TableCell>{row.name || <span className="text-muted">Unnamed secret</span>}</TableCell>

      <TableCell>{format(new Date(row.createdAt), "MMM d, yyyy h:mm a")}</TableCell>
      <TableCell>{format(new Date(row.expiresAt), "MMM d, yyyy h:mm a")}</TableCell>
      <TableCell>
        {row.expiresAfterViews !== null ? (
          row.expiresAfterViews
        ) : (
          <span className="text-muted">Unlimited</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={isExpired ? "danger" : "success"}>
          {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
          {getStatusLabel({ isTimeExpired, isViewsExhausted })}
        </Badge>
      </TableCell>
      <TableCell>
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
            {!isExpired && (
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/shared/secret/${row.id}`
                    );
                    createNotification({
                      text: "Shared secret link copied to clipboard.",
                      type: "success"
                    });
                  } catch {
                    createNotification({
                      text: "Could not copy the link. Your browser blocked clipboard access.",
                      type: "error"
                    });
                  }
                }}
              >
                <Copy />
                Copy Link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="danger"
              onClick={() =>
                handlePopUpOpen("deleteSharedSecretConfirmation", {
                  name: row.name || "this secret",
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
