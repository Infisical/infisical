import { DownloadIcon, FileTextIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
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
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>
          <FileTextIcon />
          Offline Usage Reports
        </CardTitle>
        <CardDescription>
          Generate secure usage reports for offline license compliance and billing verification.
        </CardDescription>
      </CardHeader>
      <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
        <Button
          variant="neutral"
          onClick={handleGenerateReport}
          isPending={generateUsageReport.isPending}
        >
          <DownloadIcon />
          Generate Report
        </Button>
      </CardFooter>
    </Card>
  );
};
