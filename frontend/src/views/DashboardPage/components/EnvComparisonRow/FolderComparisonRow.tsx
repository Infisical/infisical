import { faCheck, faFolder, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

type Props = {
  folderInEnv: Record<string, boolean>;
  userAvailableEnvs?: Array<{ slug: string; name: string }>;
  folderName: string;
  onClick: (folderName: string) => void;
};

export const FolderComparisonRow = ({
  folderInEnv = {},
  userAvailableEnvs = [],
  folderName,
  onClick
}: Props) => (
  <tr
    className="group flex min-w-full cursor-pointer flex-row items-center hover:bg-mineshaft-800"
    onClick={() => onClick(folderName)}
  >
    <td className="flex h-10 w-10 items-center justify-center border-none px-4">
      <div className="w-10 text-center text-xs text-bunker-400">
        <FontAwesomeIcon icon={faFolder} className="text-primary-700" />
      </div>
    </td>
    <td className="flex h-full min-w-[200px] flex-row items-center justify-between lg:min-w-[200px] xl:min-w-[250px]">
      <div className="flex h-8 cursor-default flex-row items-center truncate">{folderName}</div>
    </td>
    {userAvailableEnvs?.map(({ slug }) => (
      <td
        className={`flex h-10 w-full cursor-default flex-row items-center justify-center ${
          folderInEnv[slug]
            ? 'bg-mineshaft-900/30 text-green-500/80'
            : 'bg-red-800/10 text-red-500/80'
        }`}
        key={`${folderName}-${slug}`}
      >
        <FontAwesomeIcon icon={folderInEnv[slug] ? faCheck : faX} />
      </td>
    ))}
  </tr>
);
