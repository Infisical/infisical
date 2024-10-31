import { useCallback } from "react";

export const useFileDownload = () => {
  return useCallback((content: string, filename: string) => {
    const downloadUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);
};
