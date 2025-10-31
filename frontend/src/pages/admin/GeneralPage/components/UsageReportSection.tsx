import { faDownload, faFileAlt, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, Card, CardTitle } from "@app/components/v2";
import { downloadFile } from "@app/helpers/download";
import { useGenerateUsageReport } from "@app/hooks/api/admin/mutation";

export const UsageReportSection = () => {
  const generateUsageReport = useGenerateUsageReport();

  const handleGenerateReport = async () => {
    const response = await generateUsageReport.mutateAsync();
    const { csvContent, filename } = response;

    downloadFile(csvContent, filename, "text/csv");

    createNotification({
      text: `Usage report downloaded: "${filename}"`,
      type: "success"
    });
  };

  return (
    <Card className="p-6">
      <CardTitle className="mb-4 flex items-center gap-3">
        <FontAwesomeIcon icon={faFileAlt} />
        Offline Usage Reports
      </CardTitle>

      <div className="mb-4 text-sm text-gray-400">
        Generate secure usage reports for offline license compliance and billing verification.
      </div>

      <Button
        onClick={handleGenerateReport}
        className="w-fit"
        isLoading={generateUsageReport.isPending}
        leftIcon={<FontAwesomeIcon icon={generateUsageReport.isPending ? faSpinner : faDownload} />}
      >
        {generateUsageReport.isPending ? "Generating..." : "Generate Report"}
      </Button>
    </Card>
  );
};
