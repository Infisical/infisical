import { useState } from "react";
import { faCheck, faCopy, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import type { DomainSsoConnector } from "@app/hooks/api/domainSsoConnector";
import {
  useClaimDomain,
  useDeleteDomainConnector,
  useTakeoverDomain,
  useVerifyDomain
} from "@app/hooks/api/domainSsoConnector";

type Props = {
  isSamlActive: boolean;
  isOidcActive: boolean;
  isLdapActive: boolean;
};

export const OrgGeneralAuthSection = ({ isSamlActive, isOidcActive, isLdapActive }: Props) => {
  const [newDomain, setNewDomain] = useState("");
  const [connectors, setConnectors] = useState<DomainSsoConnector[]>([]);

  const claimDomain = useClaimDomain();
  const verifyDomain = useVerifyDomain();
  const takeoverDomain = useTakeoverDomain();
  const deleteDomainConnector = useDeleteDomainConnector();

  const getSsoType = () => {
    if (isOidcActive) return "oidc";
    if (isSamlActive) return "saml";
    if (isLdapActive) return "ldap";
    return "oidc";
  };

  const handleClaimDomain = async () => {
    if (!newDomain.trim()) return;

    try {
      const connector = await claimDomain.mutateAsync({
        domain: newDomain.trim().toLowerCase(),
        type: getSsoType()
      });
      setConnectors((prev) => [...prev, connector]);
      setNewDomain("");
      createNotification({
        type: "success",
        text: `Domain "${connector.domain}" claimed. Add the DNS TXT record to verify.`
      });
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.response?.data?.message || "Failed to claim domain"
      });
    }
  };

  const handleVerifyDomain = async (connector: DomainSsoConnector) => {
    try {
      const updated = await verifyDomain.mutateAsync({ connectorId: connector.id });
      setConnectors((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      createNotification({ type: "success", text: `Domain "${connector.domain}" verified.` });
    } catch (err: any) {
      createNotification({
        type: "error",
        text:
          err?.response?.data?.message ||
          "DNS verification failed. Make sure the TXT record is set."
      });
    }
  };

  const handleTakeover = async (connector: DomainSsoConnector) => {
    try {
      await takeoverDomain.mutateAsync({ connectorId: connector.id });
      createNotification({
        type: "success",
        text: `Domain takeover complete. All users on "${connector.domain}" must now use SSO.`
      });
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.response?.data?.message || "Failed to take over domain"
      });
    }
  };

  const handleDelete = async (connector: DomainSsoConnector) => {
    try {
      await deleteDomainConnector.mutateAsync({ connectorId: connector.id });
      setConnectors((prev) => prev.filter((c) => c.id !== connector.id));
      createNotification({ type: "success", text: `Domain "${connector.domain}" released.` });
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.response?.data?.message || "Failed to delete domain connector"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ type: "success", text: "Copied to clipboard" });
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div className="mb-4">
        <p className="text-xl font-medium text-gray-200">Domain SSO Enforcement</p>
        <p className="mt-1 text-sm text-gray-400">
          Claim and verify your email domains to enforce SSO for all users on those domains. Once a
          domain is verified and taken over, users on that domain can only authenticate through your
          configured SSO provider.
        </p>
      </div>

      <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Sso}>
        {(isAllowed) => (
          <>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="company-a.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleClaimDomain()}
                disabled={!isAllowed}
                className="flex-1 rounded border border-mineshaft-500 bg-mineshaft-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary/50 focus:outline-none"
              />
              <Button
                onClick={handleClaimDomain}
                isDisabled={!isAllowed || !newDomain.trim()}
                isLoading={claimDomain.isPending}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                size="sm"
              >
                Claim Domain
              </Button>
            </div>

            {connectors.length > 0 && (
              <div className="space-y-3">
                {connectors.map((connector) => (
                  <div
                    key={connector.id}
                    className="flex items-center justify-between rounded border border-mineshaft-600 bg-mineshaft-800 px-4 py-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-200">{connector.domain}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            connector.verificationStatus === "verified"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {connector.verificationStatus}
                        </span>
                        <span className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs text-gray-400">
                          {connector.type}
                        </span>
                      </div>

                      {connector.verificationStatus === "pending" && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-400">
                            Add this DNS TXT record to verify domain ownership:
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <code className="rounded bg-mineshaft-700 px-2 py-1 text-xs text-gray-300">
                              {connector.verificationToken}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(connector.verificationToken)}
                              className="text-gray-400 hover:text-gray-200"
                            >
                              <FontAwesomeIcon icon={faCopy} size="sm" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {connector.verificationStatus === "pending" && (
                        <Button
                          onClick={() => handleVerifyDomain(connector)}
                          isLoading={verifyDomain.isPending}
                          isDisabled={!isAllowed}
                          size="xs"
                          variant="outline_bg"
                          leftIcon={<FontAwesomeIcon icon={faCheck} />}
                        >
                          Verify
                        </Button>
                      )}
                      {connector.verificationStatus === "verified" && (
                        <Button
                          onClick={() => handleTakeover(connector)}
                          isLoading={takeoverDomain.isPending}
                          isDisabled={!isAllowed}
                          size="xs"
                          colorSchema="primary"
                        >
                          Enforce SSO
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDelete(connector)}
                        isLoading={deleteDomainConnector.isPending}
                        isDisabled={!isAllowed}
                        size="xs"
                        colorSchema="danger"
                        variant="outline_bg"
                        leftIcon={<FontAwesomeIcon icon={faTrash} />}
                      >
                        Release
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </OrgPermissionCan>
    </div>
  );
};
