import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { BanIcon } from "lucide-react";

import { Button, UnstablePageLoader } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { PAM_RESOURCE_TYPE_MAP, useGetPamAccountById } from "@app/hooks/api/pam";

import { useWebAccessSession } from "./useWebAccessSession";

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({
    strict: false
  }) as {
    accountId?: string;
    projectId?: string;
    orgId?: string;
    resourceType?: string;
    resourceId?: string;
  };

  const { accountId, projectId, resourceType, resourceId } = params;

  const { data: account, isPending } = useGetPamAccountById(accountId);

  const [sessionEnded, setSessionEnded] = useState(false);

  const { containerRef, isConnected, disconnect, reconnect } = useWebAccessSession({
    accountId: accountId!,
    projectId: projectId!,
    onSessionEnd: () => setSessionEnded(true)
  });

  const handleReconnect = () => {
    setSessionEnded(false);
    reconnect();
  };

  if (isPending) {
    return <UnstablePageLoader />;
  }

  if (!account) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <div className="flex flex-col items-center gap-2">
          <BanIcon className="size-8 text-muted" />
          <p className="text-muted">Could not find PAM Account with ID {accountId}</p>
        </div>
      </div>
    );
  }

  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId",
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        resourceType: resourceType!,
        resourceId: resourceId!,
        accountId: accountId!
      }
    });
  };

  let statusLabel = "Connecting";
  let statusDotClass = "bg-yellow-500";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-green-500";
  } else if (sessionEnded) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-mineshaft-400";
  }

  return (
    <div className="flex h-full flex-col px-6 py-6 text-mineshaft-50">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm text-bunker-300 hover:text-primary-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        Back to account
      </button>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <img
              alt={resourceTypeInfo.name}
              src={`/images/integrations/${resourceTypeInfo.image}`}
              className="size-6"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">Web Access</h1>
            <p className="text-sm text-bunker-300">Access {resourceTypeInfo.name} account</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isConnected && (
            <Button variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          )}
          {sessionEnded && (
            <Button variant="neutral" onClick={handleReconnect}>
              Reconnect
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-mineshaft-600">
          <div
            className="flex-1 overflow-hidden bg-[#0d1117] p-2 [&_.xterm-viewport]:thin-scrollbar"
            style={{ minHeight: "300px" }}
          >
            <div ref={containerRef} className="h-full w-full" />
          </div>
          <div className="flex items-center justify-between border-t border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
              <span className="text-mineshaft-300">{statusLabel}</span>
            </span>
            <div className="flex items-center gap-4">
              <span>
                <span className="text-mineshaft-400">Resource:</span>{" "}
                <span className="text-mineshaft-300">{account.resource.name}</span>
              </span>
              <span className="text-mineshaft-500">|</span>
              <span>
                <span className="text-mineshaft-400">Account:</span>{" "}
                <span className="text-mineshaft-300">{account.name}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PamAccountAccessPage = () => {
  return (
    <>
      <Helmet>
        <title>Web Access | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
