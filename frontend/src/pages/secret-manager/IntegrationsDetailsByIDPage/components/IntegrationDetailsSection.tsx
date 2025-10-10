import { faCalendarCheck, faCheckCircle, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";

import { integrationSlugNameMapping } from "../IntegrationsDetailsByIDPage.utils";

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationDetailsSection = ({ integration }: Props) => {
  return (
    <div>
      <div className="border-mineshaft-600 bg-mineshaft-900 w-full rounded-lg border p-4">
        <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
          <h3 className="text-mineshaft-100 text-lg font-medium">Integration Details</h3>
        </div>
        <div className="mt-4">
          <div className="space-y-3">
            <div>
              <p className="text-mineshaft-300 text-sm font-medium">Name</p>
              <p className="text-mineshaft-300 text-sm">
                {integrationSlugNameMapping[integration.integration]}
              </p>
            </div>
            <div>
              <p className="text-mineshaft-300 text-sm font-medium">Sync Status</p>
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
                <p className="text-mineshaft-300 text-sm font-medium">Latest Successful Sync</p>
                <div className="text-mineshaft-300 flex items-center gap-2 text-sm">
                  {format(new Date(integration.lastUsed), "yyyy-MM-dd, hh:mm aaa")}
                  <FontAwesomeIcon icon={faCalendarCheck} className="pr-2 pt-0.5 text-sm" />
                </div>
              </div>
            )}

            <div>
              {!integration.isSynced && integration.syncMessage && (
                <>
                  <p className="text-mineshaft-300 text-sm font-medium">Latest Sync Error</p>
                  <p className="text-mineshaft-300 text-sm">{integration.syncMessage}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
