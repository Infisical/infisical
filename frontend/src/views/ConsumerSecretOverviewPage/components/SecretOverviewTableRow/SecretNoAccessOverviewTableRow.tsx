import { faCircle } from "@fortawesome/free-regular-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Td, Tooltip, Tr } from "@app/components/v2";

type Props = {
  environments: { name: string; slug: string }[];
  count: number;
};

export const SecretNoAccessOverviewTableRow = ({ environments = [], count }: Props) => {
  return (
    <>
      {Array.from(Array(count)).map((_, j) => (
        <Tr key={`no-access-secret-overview-${j + 1}`} isHoverable isSelectable className="group">
          <Td className="sticky left-0 z-10 bg-mineshaft-800 bg-clip-padding py-0 px-0 group-hover:bg-mineshaft-700">
            <div className="h-full w-full border-r border-mineshaft-600 py-2.5 px-5">
              <Tooltip
                asChild
                content="You do not have permission to view this secret"
                className="max-w-sm"
              >
                <div className="flex items-center space-x-5">
                  <div className="text-bunker-300">
                    <FontAwesomeIcon className="block" icon={faLock} />
                  </div>
                  <div className="blur-sm">NO ACCESS</div>
                </div>
              </Tooltip>
            </div>
          </Td>
          {environments.map(({ slug }, i) => {
            return (
              <Td
                key={`sec-overview-${slug}-${i + 1}-value`}
                className="py-0 px-0 group-hover:bg-mineshaft-700"
              >
                <div className="h-full w-full border-r border-mineshaft-600 py-[0.85rem] px-5">
                  <div className="flex justify-center">
                    <FontAwesomeIcon icon={faCircle} />
                  </div>
                </div>
              </Td>
            );
          })}
        </Tr>
      ))}
    </>
  );
};
