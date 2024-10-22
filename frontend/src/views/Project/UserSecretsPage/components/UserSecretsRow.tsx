import { format } from "date-fns";

import { Td, Tr } from "@app/components/v2";
import { SecretV3RawSanitized } from "@app/hooks/api/types";

export const UserSecretsRow = ({ row }: { row: SecretV3RawSanitized }) => {
  const data = JSON.parse(row.value ?? "{}");

  return (
    <Tr
      key={row.id}
      // className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
      // onClick={() => setIsRowExpanded.toggle()}
    >
      <Td>{row.value}</Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>{data.type}</Td>
    </Tr>
  );
};
