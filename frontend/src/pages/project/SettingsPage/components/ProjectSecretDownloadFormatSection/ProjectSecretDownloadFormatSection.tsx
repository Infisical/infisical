import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@app/components/v3";
import { useProject } from "@app/context";

export const ProjectSecretDownloadFormatSection = () => {
  const { currentProject } = useProject();
  const [downloadFormat, setDownloadFormat] = useState<"env" | "appsettings">("env");

  useEffect(() => {
    if (currentProject?.id) {
      const savedFormat = localStorage.getItem(`infisical-secret-download-format-${currentProject.id}`);
      if (savedFormat === "appsettings") {
        setDownloadFormat("appsettings");
      } else {
        setDownloadFormat("env");
      }
    }
  }, [currentProject]);

  const handleFormatChange = (value: string) => {
    if (!currentProject?.id) return;
    localStorage.setItem(`infisical-secret-download-format-${currentProject.id}`, value);
    setDownloadFormat(value as "env" | "appsettings");
    createNotification({
      text: `Successfully updated default download format to ${value === "env" ? ".env" : "appsettings.json"}`,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <p className="text-xl font-medium text-mineshaft-100">Secret Download Preferences</p>
        <p className="text-sm text-mineshaft-300">
          Configure the default file format when downloading secrets for this project.
        </p>
      </div>
      <div className="max-w-md">
        <Select value={downloadFormat} onValueChange={handleFormatChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="env">Environment Variables (.env)</SelectItem>
            <SelectItem value="appsettings">ASP.NET Core (appsettings.json)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
