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
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Simulate realistic loading progress
  useEffect(() => {
    if (!isLoading) {
      setLoadingProgress(0);
      return;
    }

    const totalDuration = 50000 + Math.random() * 20000; // 50-70 seconds
    const startTime = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / totalDuration) * 100, 99); // Cap at 99% until actual load completes

      // Add some realistic variance - slow down in middle, speed up at end
      let adjustedProgress = progress;
      if (progress < 30) {
        adjustedProgress = progress * 0.8; // Slower start
      } else if (progress > 70) {
        adjustedProgress = progress * 1.2; // Faster finish
      }

      setLoadingProgress(Math.min(adjustedProgress, 99));

      if (progress < 99) {
        // Use more consistent intervals to prevent glitching
        const interval = 200 + Math.random() * 100; // 200-300ms intervals
        setTimeout(updateProgress, interval);
      }
    };

    updateProgress();
  }, [isLoading]);

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
      setLoadingProgress(100); // Complete the progress bar
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

  const LoadingBar = () => (
    <div className="w-full max-w-md">
      <div className="mb-2 flex justify-between text-xs text-gray-400">
        <span>Loading documentation...</span>
        <span>{Math.round(loadingProgress)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-mineshaft-600">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${loadingProgress}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-gray-400">
        {loadingProgress < 25 && "Initializing..."}
        {loadingProgress >= 25 && loadingProgress < 50 && "Fetching content..."}
        {loadingProgress >= 50 && loadingProgress < 75 && "Processing data..."}
        {loadingProgress >= 75 && loadingProgress < 95 && "Rendering content..."}
        {loadingProgress >= 95 && loadingProgress < 99 && "Finalizing..."}
        {loadingProgress >= 99 && "Finalizing..."}
      </div>
    </div>
  );

  const mainView = (
    <>
      {htmlSource ? (
        <div className="h-full overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="p-4 text-center">
                <LoadingBar />
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="p-4 text-center">
                <div className="mx-auto mb-4 h-12 w-12 text-red-400">⚠️</div>
                <p className="text-red-400">Failed to load documentation</p>
                <p className="mt-2 text-sm text-gray-400">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-black hover:bg-primary-600"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-4">
              <div
                className="prose-sm prose-invert prose max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlSource }}
              />
            </div>
          )}
        </div>
      ) : (
        // No content or URL provided
        <div className="flex h-full items-center justify-center">
          <div className="p-4 text-center">
            <FontAwesomeIcon icon={faFileAlt} className="mb-4 h-12 w-12 text-gray-500" />
            <p className="text-gray-300">No documentation content available</p>
            <p className="mt-2 text-sm text-gray-400">
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
      <div className="flex items-center justify-between border-b border-mineshaft-600 bg-mineshaft-700 px-4 py-3">
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon icon={faFileAlt} className="h-4 w-4 text-gray-300" />
          <span className="text-sm font-medium text-gray-200">Documentation</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="rounded-md p-2 text-bunker-400 transition-colors hover:bg-mineshaft-600 hover:text-bunker-200"
            title="Refresh"
          >
            <FontAwesomeIcon icon={faRefresh} className="h-4 w-4" />
          </button>
          {url && (
            <button
              onClick={openInNewTab}
              className="rounded-md p-2 text-bunker-400 transition-colors hover:bg-mineshaft-600 hover:text-bunker-200"
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
              <LoadingBar />
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
