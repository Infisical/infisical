import { faCalendarCheck, faCheckCircle, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { integrationSlugNameMapping } from "public/data/frequentConstants";
import { twMerge } from "tailwind-merge";

import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationDetailsSection = ({ integration }: Props) => {
  return (
    <div>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <h3 className="text-lg font-semibold text-mineshaft-100">Integration Details</h3>
        </div>
        <div className="mt-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-mineshaft-300">Name</p>
              <p className="text-sm text-mineshaft-300">
                {integrationSlugNameMapping[integration.integration]}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-mineshaft-300">Sync Status</p>
              <div className="flex items-center">
                <p
                  className={twMerge(
                    "mr-2 text-sm font-medium",
                    integration.isSynced ? "text-green-500" : "text-red-500"
                  )}
                >
                  {integration.isSynced ? "Synced" : "Not Synced"}
                </p>
                <FontAwesomeIcon
                  size="sm"
                  className={twMerge(integration.isSynced ? "text-green-500" : "text-red-500")}
                  icon={integration.isSynced ? faCheckCircle : faCircleXmark}
                />
              </div>
            </div>
            {integration.lastUsed && (
              <div>
                <p className="text-sm font-semibold text-mineshaft-300">Latest Successful Sync</p>
                <div className="flex items-center gap-2 text-sm text-mineshaft-300">
                  {format(new Date(integration.lastUsed), "yyyy-MM-dd, hh:mm aaa")}
                  <FontAwesomeIcon icon={faCalendarCheck} className="pt-0.5 pr-2 text-sm" />
                </div>
              </div>
            )}

            <div>
              {!integration.isSynced && integration.syncMessage && (
                <>
                  <p className="text-sm font-semibold text-mineshaft-300">Latest Sync Error</p>
                  <p className="text-sm text-mineshaft-300">{integration.syncMessage}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
