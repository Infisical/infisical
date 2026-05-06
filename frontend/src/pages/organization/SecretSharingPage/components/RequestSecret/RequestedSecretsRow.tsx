import { format } from "date-fns";
import {
  CheckIcon,
  ClockAlertIcon,
  Copy,
  Ellipsis,
  EyeIcon,
  GlobeIcon,
  HourglassIcon,
  Trash2
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  OrgIcon,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  SecretSharingAccessType,
  TSharedSecret,
  useRevealSecretRequestValue
} from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const RequestedSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TSharedSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSecretRequestConfirmation", "revealSecretRequestValue"]>,
    data: unknown
  ) => void;
}) => {
  const { mutateAsync: revealSecretValue, isPending } = useRevealSecretRequestValue();

  let isExpired = false;
  if (row.expiresAt !== null && new Date(row.expiresAt) < new Date()) {
    isExpired = true;
  }

  return (
    <TableRow key={row.id}>
      <TableCell isTruncatable>{row.name || <span className="text-muted">&mdash;</span>}</TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge
                variant={row.accessType === SecretSharingAccessType.Anyone ? "neutral" : "org"}
              >
                {row.accessType === SecretSharingAccessType.Anyone ? <GlobeIcon /> : <OrgIcon />}
                {row.accessType === SecretSharingAccessType.Anyone ? "Anyone" : "Organization"}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {row.accessType === SecretSharingAccessType.Anyone
              ? "Anyone can input the secret."
              : "Only members of the organization can input the secret."}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>{format(new Date(row.createdAt), "MMM d, yyyy h:mm a")}</TableCell>
      <TableCell>
        {row.expiresAt ? (
          format(new Date(row.expiresAt), "MMM d, yyyy h:mm a")
        ) : (
          <span className="text-muted">&mdash;</span>
        )}
      </TableCell>
      <TableCell>
        {isExpired && !row.encryptedSecret ? (
          <Badge variant="danger">
            <ClockAlertIcon />
            Expired
          </Badge>
        ) : (
          <Badge variant={row.encryptedSecret ? "success" : "warning"}>
            {row.encryptedSecret ? <CheckIcon /> : <HourglassIcon />}
            {row.encryptedSecret ? "Secret Provided" : "Pending Secret"}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-x-4">
          {row.encryptedSecret && (
            <Button
              onClick={async () => {
                const secretRequest = await revealSecretValue({ id: row.id });
                handlePopUpOpen("revealSecretRequestValue", {
                  secretValue: secretRequest.secretValue,
                  secretRequestName: secretRequest.name
                });
              }}
              isPending={isPending}
              variant="ghost"
              size="xs"
            >
              <EyeIcon /> Reveal Secret
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton className="ml-auto" variant="ghost" size="xs" aria-label="actions">
                <Ellipsis className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                isDisabled={Boolean(row.encryptedSecret) || isExpired}
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/secret-request/secret/${row.id}`
                  );
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
                  handlePopUpOpen("deleteSecretRequestConfirmation", {
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
        </div>
      </TableCell>
    </TableRow>
  );
};
