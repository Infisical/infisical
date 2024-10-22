import { format } from "date-fns";

import { Button, Td, Tr } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { SecretV3RawSanitized } from "@app/hooks/api/types";

import { EditUserSecretModal } from "./EditUserSecretModal";

export const UserSecretsRow = ({ row }: { row: SecretV3RawSanitized }) => {
  const data = JSON.parse(row.value ?? "{}");
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["editUserSecret"] as const);

  return (
    <Tr key={row.id}>
      <Td>{row.key}</Td>
      <Td>{data.type}</Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>
        <Button onClick={() => handlePopUpOpen("editUserSecret")}>Edit</Button>
      </Td>
      <EditUserSecretModal secret={row} popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </Tr>
  );
};
