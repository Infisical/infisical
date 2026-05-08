import { useMemo, useState } from "react";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { faTerminal, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { PamResourceType, TPamAccount } from "@app/hooks/api/pam";
import {
  PamDomainType,
  TPamDomainRelatedResource,
  useGetPamDomainById
} from "@app/hooks/api/pamDomain";

import { PamAwsIamAccessSection } from "./PamAwsIamAccessSection";

type Props = {
  account?: TPamAccount;
  // Required for domain accounts; local accounts fall back to account.resource.
  resource?: TPamDomainRelatedResource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  reason?: string;
};

export const PamAccessAccountModal = ({
  isOpen,
  onOpenChange,
  account,
  resource: selectedResource,
  projectId,
  reason
}: Props) => {
  const { currentOrg } = useOrganization();
  const [duration, setDuration] = useState("4h");

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const isDurationValid = useMemo(() => duration && ms(duration || "1s") > 0, [duration]);

  const cliDuration = useMemo(() => {
    if (!duration) return duration;

    const unit = duration.replace(/[\d\s.-]/g, "");

    const dayOrLargerUnits = [
      "d",
      "day",
      "days",
      "w",
      "week",
      "weeks",
      "y",
      "yr",
      "yrs",
      "year",
      "years"
    ];

    // ms library does not handle months (M) so we do it separately
    if (unit === "M") {
      const value = parseInt(duration, 10);
      if (!Number.isNaN(value) && value > 0) {
        const hours = value * 30 * 24;
        return `${hours}h`;
      }
    } else if (dayOrLargerUnits.includes(unit.toLowerCase())) {
      const valueInMs = ms(duration);
      const oneHourInMs = 1000 * 60 * 60;

      if (typeof valueInMs === "number" && valueInMs > 0) {
        const hours = Math.floor(valueInMs / oneHourInMs);
        return `${hours}h`;
      }
    }

    return duration;
  }, [duration]);

  const targetResource = selectedResource ?? account?.resource;

  // Domain accounts need the AD FQDN to disambiguate from a like-named local
  // account on the same resource. The list-accounts payload only carries the
  // domain slug; fetch the full domain row to read connectionDetails.domain.
  const { data: domain } = useGetPamDomainById(
    account?.domain?.domainType ?? PamDomainType.ActiveDirectory,
    account?.domainId || undefined,
    { enabled: !!account?.domainId }
  );

  const command = useMemo(() => {
    if (!account || !targetResource) return "";
    // For AD-domain accounts the wire identity is `<fqdn>:<slug>` so the
    // backend routes to the domain bucket; local accounts pass just `<slug>`.
    const accountArg =
      account.domainId && domain?.connectionDetails.domain
        ? `${domain.connectionDetails.domain}:${account.name}`
        : account.name;
    const base = (verb: string) =>
      `infisical pam ${verb} access --resource ${targetResource.name} --account ${accountArg} --project-id ${projectId} --duration ${cliDuration} --domain ${siteURL}`;

    switch (targetResource.resourceType) {
      case PamResourceType.Postgres:
      case PamResourceType.MySQL:
      case PamResourceType.MsSQL:
      case PamResourceType.MongoDB:
        return base("db");
      case PamResourceType.Redis:
        return base("redis");
      case PamResourceType.SSH:
        return base("ssh");
      case PamResourceType.Kubernetes:
        return base("kubernetes");
      case PamResourceType.Windows:
        return base("rdp");
      default:
        return "";
    }
  }, [account, targetResource, domain, projectId, cliDuration, siteURL]);

  if (!account) return null;

  const isAwsIam = targetResource?.resourceType === PamResourceType.AwsIam;

  const showWebAccess =
    targetResource?.resourceType === PamResourceType.Postgres ||
    targetResource?.resourceType === PamResourceType.SSH ||
    targetResource?.resourceType === PamResourceType.Redis;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl pb-2"
        title="Access Account"
        subTitle={`Connect to ${account.name}`}
      >
        {isAwsIam ? (
          <PamAwsIamAccessSection
            account={account}
            projectId={projectId}
            reason={reason}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <div className="py-1">
              <p className="text-sm font-medium text-mineshaft-400">Terminal</p>
              <p className="mb-2 text-xs text-mineshaft-400">Connect using the Infisical CLI</p>
              <FormLabel
                label="Duration"
                tooltipText="The maximum duration of your session. Ex: 1h, 3w, 30d"
              />
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="permanent"
                isError={!isDurationValid}
              />
              <FormLabel label="CLI Command" className="mt-4" />
              <div className="flex gap-2">
                <Input value={command} isDisabled />
                <IconButton
                  ariaLabel="copy"
                  variant="outline_bg"
                  colorSchema="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(command);

                    createNotification({
                      text: "Command copied to clipboard",
                      type: "info"
                    });

                    onOpenChange(false);
                  }}
                  className="w-10"
                >
                  <FontAwesomeIcon icon={faCopy} />
                </IconButton>
              </div>
              <a
                href="https://infisical.com/docs/cli/overview"
                target="_blank"
                className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
                rel="noreferrer"
              >
                <span>Install the Infisical CLI</span>
                <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
              </a>
            </div>
            {showWebAccess && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-mineshaft-600" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-mineshaft-800 px-2 text-mineshaft-400">OR</span>
                  </div>
                </div>
                <div className="py-1">
                  <p className="text-sm font-medium text-mineshaft-400">Browser</p>
                  <p className="mb-2 text-xs text-mineshaft-400">
                    Connect directly from your browser
                  </p>
                  <div className="flex gap-2">
                    <Link
                      to={ROUTE_PATHS.Pam.PamAccountAccessPage.path}
                      params={{
                        orgId: currentOrg.id,
                        projectId,
                        resourceType: targetResource?.resourceType ?? "",
                        resourceId: targetResource?.id ?? "",
                        accountId: account.id
                      }}
                      target="_blank"
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-primary/80"
                    >
                      <FontAwesomeIcon icon={faTerminal} />
                      Connect in Browser
                    </Link>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
