import { DownloadIcon, FileTextIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
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
    <Card>
      <CardHeader>
        <CardTitle>
          <FileTextIcon />
          Offline Usage Reports
        </CardTitle>
        <CardDescription>
          Generate secure usage reports for offline license compliance and billing verification.
        </CardDescription>
        <CardAction>
          <Button
            variant="neutral"
            onClick={handleGenerateReport}
            isPending={generateUsageReport.isPending}
          >
            <DownloadIcon />
            Generate Report
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
};
