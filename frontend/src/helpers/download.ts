import FileSaver from "file-saver";

export const downloadTxtFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  FileSaver.saveAs(blob, filename);
};
