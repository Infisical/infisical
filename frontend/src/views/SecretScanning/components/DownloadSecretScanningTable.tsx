import { FC, useState } from "react";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";

interface DownloadSecretScanningTableProps {
  filteredRisks: Record<string, any>[];
}
  
export const DownloadSecretScanningTable: FC<DownloadSecretScanningTableProps> = ({ filteredRisks }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { createNotification } = useNotificationContext();

  const generateCSV = (data: Record<string, any>[]): string => {
    if (!Array.isArray(data) || data.length === 0) {
      return "";
    }

    const headers = Object.keys(data[0]);

    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((header) => JSON.stringify(row[header])).join(",")
      )
    ].join("\n");

    return csvContent;
  };

  const downloadTable = (): void => {
    try {
      setIsLoading(true);
      if (filteredRisks) {
        const csvText = generateCSV(filteredRisks);
        const blob = new Blob([csvText], { type: "text/csv" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", "infisical-scan-report.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        createNotification({
          text: "Successfully downloaded Infisical scan report",
          type: "success"
        });
      }
    } catch (err) {
      console.error("Error downloading Infisical scan report", err);
      createNotification({
        text: "Failed to download Infisical scan report. Please try again.",
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.SecretScanning}>
      {(isAllowed) => (
        <Button
          disabled={!isAllowed || isLoading}
          isLoading={false}
          colorSchema="primary"
          variant="outline_bg"
          type="button"
          leftIcon={<FontAwesomeIcon icon={faDownload} className="mr-2" />}
          onClick={() => downloadTable()}
        >
          Download (.csv)
        </Button>
      )}
    </OrgPermissionCan>
  );
};