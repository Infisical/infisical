import { faEnvelope, faEnvelopeOpen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
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
  // const [isRowExpanded, setIsRowExpanded] = useToggle();
  const lastViewedAt = row.lastViewedAt
    ? format(new Date(row.lastViewedAt), "yyyy-MM-dd - HH:mm a")
    : undefined;

  let isExpired = false;
  if (row.expiresAfterViews !== null && row.expiresAfterViews <= 0) {
    isExpired = true;
  }

  if (row.expiresAt !== null && new Date(row.expiresAt) < new Date()) {
    isExpired = true;
  }

  return (
    <Tr
      key={row.id}
      // className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
      // onClick={() => setIsRowExpanded.toggle()}
    >
      <Td>
        <Tooltip content={lastViewedAt ? `Last opened at ${lastViewedAt}` : "Not yet opened"}>
          <FontAwesomeIcon icon={lastViewedAt ? faEnvelopeOpen : faEnvelope} />
        </Tooltip>
      </Td>
      <Td>{row.name ? `${row.name}` : "-"}</Td>
      <Td>
        <Badge variant={isExpired ? "danger" : "success"}>{isExpired ? "Expired" : "Active"}</Badge>
      </Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>{format(new Date(row.expiresAt), "yyyy-MM-dd - HH:mm a")}</Td>
      <Td>{row.expiresAfterViews !== null ? row.expiresAfterViews : "-"}</Td>
      <Td>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePopUpOpen("deleteSharedSecretConfirmation", {
              name: "delete",
              id: row.id
            });
          }}
          variant="plain"
          ariaLabel="delete"
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </Td>
    </Tr>
  );
};
