import { ReactNode } from "react";
import { faArrowRight, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, FormLabel } from "@app/components/v2";

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
                  <Badge className="pointer-events-none flex h-[36px] w-full items-center justify-center gap-1.5 whitespace-nowrap border border-mineshaft-600 bg-mineshaft-600 text-bunker-200">
                    <FontAwesomeIcon icon={faKey} />
                    <span>{name}</span>
                  </Badge>
                </div>
              </td>
              <td className="whitespace-nowrap pl-5 pr-5">
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
