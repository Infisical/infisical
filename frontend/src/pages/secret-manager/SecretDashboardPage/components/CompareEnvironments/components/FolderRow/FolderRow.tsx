import { faFolder } from "@fortawesome/free-solid-svg-icons";

import { Tr } from "@app/components/v2";

import { EnvironmentStatusCell, ResourceNameCell } from "../shared";

type Props = {
  folderName: string;
  environments: { name: string; slug: string }[];
  isFolderPresentInEnv: (name: string, env: string) => boolean;
  colWidth: number;
};

export const FolderRow = ({
  folderName,
  environments = [],
  isFolderPresentInEnv,
  colWidth
}: Props) => {
  return (
    <Tr isHoverable className="group border-mineshaft-500">
      <ResourceNameCell
        label={folderName}
        icon={faFolder}
        iconClassName="text-yellow-700"
        colWidth={colWidth}
      />
      {environments.map(({ slug }, i) => {
        const isPresent = isFolderPresentInEnv(folderName, slug);

        return (
          <EnvironmentStatusCell
            isLast={i === environments.length - 1}
            status={isPresent ? "present" : "missing"}
            key={`folder-${slug}-${i + 1}-value`}
          />
        );
      })}
    </Tr>
  );
};
