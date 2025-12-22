import { useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChevronDownIcon, ShieldIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input } from "@app/components/v2";
import { getAuthToken } from "@app/hooks/api/reactQuery";

type Props = {
  resourceId: string;
  isOptional?: boolean;
  className?: string;
};

export const SshCaSetupSection = ({ resourceId, isOptional = false, className }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [cmdOpen, setCmdOpen] = useState(false);

  const setupSshCaCommand = `curl -H "Authorization: Bearer ${getAuthToken()}" "${siteURL}/api/v1/pam/resources/ssh/${resourceId}/ssh-ca-setup" | sudo bash`;

  return (
    <button
      type="button"
      onClick={() => setCmdOpen(!cmdOpen)}
      className={twMerge(
        "flex w-full cursor-pointer flex-col rounded-md border border-mineshaft-500 bg-mineshaft-700 p-3 text-sm hover:bg-mineshaft-600",
        className
      )}
    >
      <div className="flex gap-2.5">
        <ShieldIcon className="mt-0.5 size-6 shrink-0 text-info" />
        <div className="flex w-full flex-col">
          <div className="flex justify-between gap-2 pr-1">
            <div className="flex flex-col text-left">
              <span className="text-base">Certificate-Based Authentication</span>
              <span className="text-sm text-mineshaft-300">
                {isOptional
                  ? "Optional: Install CA certificate if you plan to use certificate authentication for user accounts"
                  : "Required: Install CA certificate on the target host for certificate authentication"}
              </span>
            </div>
            <ChevronDownIcon
              className={twMerge(
                "shrink-0 text-mineshaft-400 transition-transform duration-200 ease-in-out",
                cmdOpen && "rotate-180"
              )}
            />
          </div>
          <div
            className={twMerge(
              "grid transition-all duration-200 ease-in-out",
              cmdOpen ? "mt-2 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]"
            )}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col text-left">
                <span className="mt-2 text-sm text-mineshaft-300">
                  Run this command on the target host:
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <Input value={setupSshCaCommand} isDisabled />
                  <IconButton
                    ariaLabel="copy"
                    variant="plain"
                    colorSchema="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(setupSshCaCommand);
                      createNotification({
                        text: "Command copied to clipboard",
                        type: "info"
                      });
                    }}
                    className="size-8 shrink-0"
                  >
                    <FontAwesomeIcon icon={faCopy} className="text-mineshaft-200" />
                  </IconButton>
                </div>
                <div className="mt-4 flex flex-col gap-1 text-xs text-mineshaft-300">
                  <span>This command will:</span>
                  <span>• Install the resource CA certificate</span>
                  <span>• Configure SSH to trust certificate-based authentication</span>
                  <span>• Enable seamless access for authorized users</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};
