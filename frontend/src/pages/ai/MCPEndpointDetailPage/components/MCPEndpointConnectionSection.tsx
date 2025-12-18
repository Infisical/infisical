import { useEffect, useState } from "react";
import { faCheck, faCopy, faKey, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  GenericFieldLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
};

type AuthToken = {
  id: string;
  name: string;
  token: string;
  createdAt: string;
};

const STORAGE_KEY_PREFIX = "mcp_endpoint_tokens_";

const SHOW_AUTH_TOKENS_SECTION = false;

export const MCPEndpointConnectionSection = ({ endpoint }: Props) => {
  const [isCopied, setIsCopied] = useToggle(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useToggle(false);
  const [tokenName, setTokenName] = useState("");
  const [authTokens, setAuthTokens] = useState<AuthToken[]>([]);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const endpointUrl = `${window.location.origin}/api/v1/ai/mcp/endpoints/${endpoint.id}/connect`;
  const storageKey = `${STORAGE_KEY_PREFIX}${endpoint.id}`;

  // Load tokens from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setAuthTokens(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored tokens", e);
      }
    }
    setHasLoaded(true);
  }, [storageKey]);

  // Save tokens to localStorage whenever they change (after initial load)
  useEffect(() => {
    if (hasLoaded) {
      localStorage.setItem(storageKey, JSON.stringify(authTokens));
    }
  }, [authTokens, storageKey, hasLoaded]);

  const handleCopy = () => {
    navigator.clipboard.writeText(endpointUrl);
    setIsCopied.on();
    createNotification({
      text: "Endpoint URL copied to clipboard",
      type: "info"
    });
    setTimeout(() => setIsCopied.off(), 2000);
  };

  const generateToken = () => {
    const prefix = "mcp_";
    const randomPart =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return `${prefix}${randomPart}`;
  };

  const handleCreateToken = () => {
    if (!tokenName.trim()) {
      createNotification({
        text: "Please enter a token name",
        type: "error"
      });
      return;
    }

    const newToken: AuthToken = {
      id: Math.random().toString(36).substring(2, 15),
      name: tokenName.trim(),
      token: generateToken(),
      createdAt: new Date().toISOString()
    };

    setAuthTokens([newToken, ...authTokens]);
    setTokenName("");
    setIsCreateModalOpen.off();

    createNotification({
      text: "Authentication token created successfully",
      type: "success"
    });
  };

  const handleDeleteToken = (tokenId: string) => {
    setAuthTokens(authTokens.filter((t) => t.id !== tokenId));
    createNotification({
      text: "Authentication token deleted",
      type: "info"
    });
  };

  const handleCopyToken = (token: string, tokenId: string) => {
    navigator.clipboard.writeText(token);
    setCopiedTokenId(tokenId);
    createNotification({
      text: "Token copied to clipboard",
      type: "info"
    });
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  const truncateToken = (token: string) => {
    if (token.length <= 12) return token;
    return `${token.substring(0, 12)}...`;
  };

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Connection</h3>
        </div>
        <div className="space-y-3">
          <GenericFieldLabel label="Endpoint">
            <div className="flex items-center gap-2">
              <div className="flex-1 overflow-hidden rounded border border-mineshaft-500 bg-mineshaft-700">
                <code className="block overflow-x-auto px-3 py-2 font-mono text-sm whitespace-nowrap text-mineshaft-200">
                  {endpointUrl}
                </code>
              </div>
              <Tooltip content={isCopied ? "Copied!" : "Copy URL"}>
                <IconButton
                  ariaLabel="Copy endpoint URL"
                  variant="outline_bg"
                  size="sm"
                  onClick={handleCopy}
                >
                  <FontAwesomeIcon icon={isCopied ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </GenericFieldLabel>

          {SHOW_AUTH_TOKENS_SECTION && (
            <div className="space-y-3 border-t border-mineshaft-500 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-mineshaft-300">
                  <FontAwesomeIcon icon={faKey} className="text-xs" />
                  <span>Authentication Tokens</span>
                </div>
                <Button
                  variant="outline_bg"
                  size="xs"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={setIsCreateModalOpen.on}
                >
                  Create
                </Button>
              </div>

              {authTokens.length > 0 && (
                <div className="space-y-2">
                  {authTokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between rounded border border-mineshaft-600 bg-mineshaft-800 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="truncate text-sm font-medium text-mineshaft-100">
                            {token.name}
                          </h4>
                          <Tooltip content="Delete token">
                            <IconButton
                              ariaLabel="Delete token"
                              variant="plain"
                              size="xs"
                              onClick={() => handleDeleteToken(token.id)}
                              className="text-red-500 hover:text-red-400"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </Tooltip>
                        </div>
                        <p className="mt-0.5 text-xs text-mineshaft-400">
                          Created {formatDate(token.createdAt)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="font-mono text-xs text-mineshaft-300">
                            {truncateToken(token.token)}
                          </code>
                          <Tooltip content={copiedTokenId === token.id ? "Copied!" : "Copy token"}>
                            <button
                              type="button"
                              onClick={() => handleCopyToken(token.token, token.id)}
                              className="text-mineshaft-400 transition-colors hover:text-mineshaft-200"
                            >
                              <FontAwesomeIcon
                                icon={copiedTokenId === token.id ? faCheck : faCopy}
                                className="text-xs"
                              />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {authTokens.length === 0 && (
                <p className="py-2 text-xs text-mineshaft-400 italic">
                  No authentication tokens created yet
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onOpenChange={(open) => !open && setIsCreateModalOpen.off()}
      >
        <ModalContent
          title="Create Authentication Token"
          subTitle="Create a new token for MCP clients without OAuth support"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateToken();
            }}
          >
            <FormControl label="Token Name" isRequired>
              <Input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="e.g., Production AI Agent"
                autoFocus
              />
            </FormControl>
            <div className="mt-6 flex items-center gap-2">
              <Button type="submit" colorSchema="primary" isDisabled={!tokenName.trim()}>
                Create Token
              </Button>
              <Button variant="outline_bg" onClick={setIsCreateModalOpen.off}>
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
