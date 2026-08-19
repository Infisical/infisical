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
      <div className="w-full rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Integration Details</h3>
        </div>
        <div className="mt-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-label">Name</p>
              <p className="text-sm text-label">
                {integrationSlugNameMapping[integration.integration]}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-label">Sync Status</p>
              <div className="flex items-center">
                <p
                  className={twMerge(
                    "mr-2 text-sm font-medium",
                    integration.isSynced ? "text-success" : "text-danger"
                  )}
                >
                  {integration.isSynced ? "Synced" : "Not Synced"}
                </p>
                <FontAwesomeIcon
                  size="sm"
                  className={twMerge(integration.isSynced ? "text-success" : "text-danger")}
                  icon={integration.isSynced ? faCheckCircle : faCircleXmark}
                />
              </div>
            </div>
            {integration.lastUsed && (
              <div>
                <p className="text-sm font-medium text-label">Latest Successful Sync</p>
                <div className="flex items-center gap-2 text-sm text-label">
                  {format(new Date(integration.lastUsed), "yyyy-MM-dd, hh:mm aaa")}
                  <FontAwesomeIcon icon={faCalendarCheck} className="pt-0.5 pr-2 text-sm" />
                </div>
              </div>
            )}

            <div>
              {!integration.isSynced && integration.syncMessage && (
                <>
                  <p className="text-sm font-medium text-label">Latest Sync Error</p>
                  <p className="text-sm text-label">{integration.syncMessage}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
