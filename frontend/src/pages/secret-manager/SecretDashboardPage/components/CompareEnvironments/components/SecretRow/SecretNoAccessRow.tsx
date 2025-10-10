import { faLock } from "@fortawesome/free-solid-svg-icons";

import { Tr } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";

import { EnvironmentStatusCell, ResourceNameCell } from "../shared";

type Props = {
  environments: { name: string; slug: string }[];
  count: number;
  colWidth: number;
};

export const SecretNoAccessRow = ({ environments = [], count, colWidth }: Props) => {
  return (
    <>
      {Array.from(Array(count)).map((_, j) => (
        <Tr
          key={`no-access-secret-${j + 1}`}
          isHoverable
          isSelectable
          className="border-mineshaft-500 group"
        >
          <ResourceNameCell
            label={<Blur />}
            iconClassName="text-bunker-400"
            icon={faLock}
            colWidth={colWidth}
            tooltipContent="You do not have permission to view this secret"
          />
          {environments.map(({ slug }, i) => {
            return (
              <EnvironmentStatusCell
                isLast={i === environments.length - 1}
                status="no-access"
                key={`no-access-sec--${slug}-${i + 1}-value`}
              />
            );
          })}
        </Tr>
      ))}
    </>
  );
};
