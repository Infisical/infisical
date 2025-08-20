/* eslint-disable react/button-has-type */
/* eslint-disable no-nested-ternary */
import React, { useCallback, useEffect, useState } from "react";
import { faExternalLinkAlt, faFileAlt, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface DocumentationPanelProps {
  url?: string;
  content?: string; // HTML content if directly provided
}

const DocumentationPanel: React.FC<DocumentationPanelProps> = ({ url, content }) => {
  const [htmlSource, setHtmlSource] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch simple HTML content from proxy endpoint
  const fetchProxyContent = useCallback(async (targetUrl?: string) => {
    if (!targetUrl) return; // do nothing if no URL provided
    setIsLoading(true);
    setError(null);

    try {
      const proxyUrl = `/api/v1/proxy-docs?url=${encodeURIComponent(targetUrl)}`;

      const response = await fetch(proxyUrl, { headers: { Accept: "text/html,*/*" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const htmlContent = await response.text();
      setHtmlSource(htmlContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load content when URL or content changes
  useEffect(() => {
    if (content) setHtmlSource(content);
    else if (url) fetchProxyContent(url);
    else setHtmlSource("");
  }, [url, content, fetchProxyContent]);

  // Refresh content
  const handleRefresh = () => {
    if (content) return;
    if (url) fetchProxyContent(url);
  };

  // Open documentation in new tab
  const openInNewTab = () => {
    if (url) window.open(url, "_blank");
  };

  const mainView = (
    <>
      {htmlSource ? (
        <div className="h-full overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="p-4 text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
                <p className="text-gray-600">Loading documentation...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="p-4 text-center">
                <div className="mx-auto mb-4 h-12 w-12 text-red-500">⚠️</div>
                <p className="text-red-600">Failed to load documentation</p>
                <p className="mt-2 text-sm text-gray-500">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-4">
              <div
                className="prose-sm prose max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlSource }}
              />
            </div>
          )}
        </div>
      ) : (
        // No content or URL provided
        <div className="flex h-full items-center justify-center">
          <div className="p-4 text-center">
            <FontAwesomeIcon icon={faFileAlt} className="mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-600">No documentation content available</p>
            <p className="mt-2 text-sm text-gray-500">
              Provide a URL or content to display documentation
            </p>
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon icon={faFileAlt} className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Documentation</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Refresh"
          >
            <FontAwesomeIcon icon={faRefresh} className="h-4 w-4" />
          </button>
          {url && (
            <button
              onClick={openInNewTab}
              className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              title="Open in new tab"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="p-4 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-gray-600">Loading documentation...</p>
            </div>
          </div>
        ) : (
          mainView
        )}
      </div>
    </div>
  );
};

export default DocumentationPanel;
