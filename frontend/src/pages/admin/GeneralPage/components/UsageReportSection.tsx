import { useState } from "react";
import { useForm } from "react-hook-form";
import { faDownload, faFileAlt, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Card, CardTitle } from "@app/components/v2";
import { apiRequest } from "@app/config/request";

const formSchema = z.object({});

type TUsageReportForm = z.infer<typeof formSchema>;

export const UsageReportSection = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TUsageReportForm>({
    resolver: zodResolver(formSchema)
  });

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

  const onSubmit = async () => {
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

  const isLoading = isSubmitting || isGenerating;

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Button
          type="submit"
          isLoading={isLoading}
          leftIcon={<FontAwesomeIcon icon={isLoading ? faSpinner : faDownload} />}
        >
          {isLoading ? "Generating..." : "Generate Report"}
        </Button>
      </form>
    </Card>
  );
};
