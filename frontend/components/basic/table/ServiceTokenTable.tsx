import { faX } from '@fortawesome/free-solid-svg-icons';

import { useNotificationContext } from '~/components/context/Notifications/NotificationProvider';

import deleteServiceToken from "../../../pages/api/serviceToken/deleteServiceToken";
import { reverseEnvMapping } from '../../../public/data/frequentConstants';
import guidGenerator from '../../utilities/randomId';
import Button from '../buttons/Button';

interface TokenProps {
  _id: string;
  name: string;
  environment: string;
  expiresAt: string;
}

interface ServiceTokensProps {
  data: TokenProps[];
  workspaceName: string;
  setServiceTokens: (value: TokenProps[]) => void;
}

/**
 * This is the component that we utilize for the service token table
 * #TODO: add the possibility of choosing and doing operations on multiple users.
 * @param {object} obj
 * @param {any[]} obj.data - current state of the service token table
 * @param {string} obj.workspaceName - name of the current project
 * @param {function} obj.setServiceTokens - updating the state of the service token table
 * @returns
 */
const ServiceTokenTable = ({ data, workspaceName, setServiceTokens }: ServiceTokensProps) => {
  const { createNotification } = useNotificationContext();

  return (
    <div className="table-container w-full bg-bunker rounded-md mb-6 border border-mineshaft-700 relative mt-1">
      <div className="absolute rounded-t-md w-full h-12 bg-white/5"></div>
      <table className="w-full my-1">
        <thead className="text-bunker-300 text-sm font-light">
          <tr>
            <th className="text-left pl-6 pt-2.5 pb-2">TOKEN NAME</th>
            <th className="text-left pl-6 pt-2.5 pb-2">PROJECT</th>
            <th className="text-left pl-6 pt-2.5 pb-2">ENVIRONMENT</th>
            <th className="text-left pl-6 pt-2.5 pb-2">VAILD UNTIL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.length > 0 ? (
            data?.map((row) => {
              return (
                <tr
                  key={guidGenerator()}
                  className="bg-bunker-800 hover:bg-bunker-800/5 duration-100"
                >
                  <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                    {row.name}
                  </td>
                  <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                    {workspaceName}
                  </td>
                  <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                    {reverseEnvMapping[row.environment]}
                  </td>
                  <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                    {new Date(row.expiresAt).toUTCString()}
                  </td>
                  <td className="py-2 border-mineshaft-700 border-t">
                    <div className="opacity-50 hover:opacity-100 duration-200 flex items-center">
                      <Button
                        onButtonPressed={() => {
                          deleteServiceToken({ serviceTokenId: row._id} );
                          setServiceTokens(data.filter(token => token._id != row._id));
                          createNotification({
                            text: `'${row.name}' token has been revoked.`,
                            type: 'error'
                          });
                        }}
                        color="red"
                        size="icon-sm"
                        icon={faX}
                      />
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} className="text-center pt-7 pb-5 text-bunker-300 text-sm">
                No service tokens yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ServiceTokenTable;
