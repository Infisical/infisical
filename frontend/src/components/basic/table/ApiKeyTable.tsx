import { faX } from "@fortawesome/free-solid-svg-icons";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";

import deleteAPIKey from "../../../pages/api/apiKey/deleteAPIKey";
import guidGenerator from "../../utilities/randomId";
import Button from "../buttons/Button";

interface TokenProps {
  _id: string;
  name: string;
  expiresAt: string;
}

interface ServiceTokensProps {
  data: TokenProps[];
  setApiKeys: (value: TokenProps[]) => void;
}

/**
 * This is the component that we utilize for the api key table
 * @param {object} obj
 * @param {any[]} obj.data - current state of the api key table
 * @param {function} obj.setApiKeys - updating the state of the api key table
 * @returns
 */
const ApiKeyTable = ({ data, setApiKeys }: ServiceTokensProps) => {
  const { createNotification } = useNotificationContext();
  return (
    <div className="table-container w-full bg-bunker rounded-md mb-6 border border-mineshaft-700 relative mt-1">
      <div className="absolute rounded-t-md w-full h-12 bg-white/5" />
      <table className="w-full my-1">
        <thead className="text-bunker-300 text-sm font-light">
          <tr>
            <th className="text-left pl-6 pt-2.5 pb-2">API KEY NAME</th>
            <th className="text-left pl-6 pt-2.5 pb-2">VALID UNTIL</th>
            <th aria-label="button" />
          </tr>
        </thead>
        <tbody>
          {data?.length > 0 ? (
            data?.map((row) => (
              <tr
                key={guidGenerator()}
                className="bg-bunker-800 hover:bg-bunker-800/5 duration-100"
              >
                <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                  {row.name}
                </td>
                <td className="pl-6 py-2 border-mineshaft-700 border-t text-gray-300">
                  {new Date(row.expiresAt).toUTCString()}
                </td>
                <td className="py-2 border-mineshaft-700 border-t">
                  <div className="opacity-50 hover:opacity-100 duration-200 flex items-center">
                    <Button
                      onButtonPressed={() => {
                        deleteAPIKey({ apiKeyId: row._id });
                        setApiKeys(data.filter((token) => token._id !== row._id));
                        createNotification({
                          text: `'${row.name}' API key has been revoked.`,
                          type: "error"
                        });
                      }}
                      color="red"
                      size="icon-sm"
                      icon={faX}
                    />
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="text-center pt-7 pb-5 text-bunker-300 text-sm">
                No API keys yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ApiKeyTable;
