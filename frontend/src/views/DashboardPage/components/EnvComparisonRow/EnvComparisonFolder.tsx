/* eslint-disable react/jsx-no-useless-fragment */
import { faAngleRight, faFolder } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

type Props = {
  folderName: string;
};

export const EnvComparisonFolder = ({
  folderName,
}: Props): JSX.Element => {
  // const [isOpen, setIsOpen] = useState(true);

  // const getSecretByEnv = useCallback(
  //   (secEnv: string, secs?: any[]) => secs?.find(({ env }) => env === secEnv),
  //   []
  // );

  return (
    <tr className="group flex min-w-full flex-row items-center hover:bg-mineshaft-800">
      <td className="flex h-10 w-14 items-center justify-center border-none">
        <div className="text-center text-xs flex itesm-center flex-row pr-4">
          <FontAwesomeIcon icon={faAngleRight} className="w-3.5 h-3.5 text-bunker-400 pl-6 pt-[0.05rem]" />
          <FontAwesomeIcon icon={faFolder} className="w-4 h-4 text-yellow-400/50 pl-1" />
        </div>
      </td>
      <td className="flex h-full min-w-[200px] flex-row items-center justify-between lg:min-w-[220px] xl:min-w-[250px]">
        <div className="flex h-8 cursor-default flex-row items-center truncate">
          {folderName}
        </div>
      </td>
      {/* {userAvailableEnvs?.map(({ slug }) => (
        <DashboardInput
          isReadOnly={isReadOnly}
          key={`row-${folderName || ''}-${slug}`}
          isOverridden={false}
          secret={getSecretByEnv(slug, folderName)}
          isSecretValueHidden={areValuesHiddenThisRow && isSecretValueHidden}
        />
      ))} */}
    </tr>
  );
};
