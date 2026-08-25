import { ReactNode } from "react";
import { ArrowRightIcon, KeyIcon } from "lucide-react";

import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Badge } from "@app/components/v3";

type Props = {
  items: { name: string; input: ReactNode }[];
};

export const SecretsMappingTable = ({ items }: Props) => {
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto">
        <thead>
          <tr className="text-left">
            <th className="pb-2 whitespace-nowrap">
              <FieldLabelWithTooltip>Rotated Credentials</FieldLabelWithTooltip>
            </th>
            <th />
            <th className="pb-2">
              <FieldLabelWithTooltip tooltip="The name of the secret that the active credentials will be mapped to.">
                Secret Name
              </FieldLabelWithTooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ name, input }) => (
            <tr key={name}>
              <td className="whitespace-nowrap">
                <div className="mb-4 flex h-full items-start justify-center">
                  <Badge variant="neutral" className="h-9 w-full justify-center text-xs">
                    <KeyIcon />
                    {name}
                  </Badge>
                </div>
              </td>
              <td className="px-5 whitespace-nowrap">
                <div className="mb-4 flex items-center justify-center">
                  <ArrowRightIcon className="size-4 text-muted" />
                </div>
              </td>
              <td className="w-full">{input}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
