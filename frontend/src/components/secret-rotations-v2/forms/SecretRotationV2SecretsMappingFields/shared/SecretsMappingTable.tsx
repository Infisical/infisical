import { ReactNode } from "react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { KeyIcon } from "lucide-react";

import { FormLabel } from "@app/components/v2";
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
            <th className="whitespace-nowrap">
              <FormLabel label="Rotated Credentials" />
            </th>
            <th />
            <th>
              <FormLabel
                tooltipClassName="max-w-sm"
                tooltipText="The name of the secret that the active credentials will be mapped to."
                label="Secret Name"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ name, input }) => (
            <tr key={name}>
              <td className="whitespace-nowrap">
                <div className="mb-4 flex h-full items-start justify-center">
                  {/* TODO(scott): probably shouldn't be a badge */}
                  <Badge variant="neutral" className="h-[36px] w-full justify-center text-xs">
                    <KeyIcon />
                    {name}
                  </Badge>
                </div>
              </td>
              <td className="pr-5 pl-5 whitespace-nowrap">
                <div className="mb-4 flex items-center justify-center">
                  <FontAwesomeIcon className="text-mineshaft-400" icon={faArrowRight} />
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
