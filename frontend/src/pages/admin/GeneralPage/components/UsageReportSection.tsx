import { useState } from "react";
import { faDownload, faFileAlt, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, Card, CardTitle } from "@app/components/v2";
import { apiRequest } from "@app/config/request";

export const UsageReportSection = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadFile = (content: string, filename: string, mimeType: string = "text/csv") => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);

      const response = await apiRequest.post("/api/v1/admin/usage-report/generate", {});
      const { csvContent, filename } = response.data;

      downloadFile(csvContent, filename, "text/csv");

      createNotification({
        text: `Usage report downloaded: "${filename}"`,
        type: "success"
      });
    } catch (error) {
      console.error("Failed to generate usage report:", error);
      createNotification({
        text: "Failed to generate usage report. Please try again.",
        type: "error"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="p-6">
      <CardTitle className="mb-4 flex items-center gap-3">
        <FontAwesomeIcon icon={faFileAlt} />
        Offline Usage Reports
      </CardTitle>

      <div className="mb-4 text-sm text-gray-400">
        Generate tamper-proof, cryptographically signed usage reports to ensure offline license
        compliance and accurate billing verification. Reports capture user counts, machine
        identities, project details, and secrets metadata, providing a secure and verifiable audit
        trail.
      </div>

      <Button
        onClick={handleGenerateReport}
        className="w-fit"
        isLoading={isGenerating}
        leftIcon={<FontAwesomeIcon icon={isGenerating ? faSpinner : faDownload} />}
      >
        {isGenerating ? "Generating..." : "Generate Report"}
      </Button>
    </Card>
  );
};
