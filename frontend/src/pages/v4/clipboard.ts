import { copyToClipboard } from "@app/helpers/clipboard";

import { toast } from "./access/toast";

export const copyText = async (text: string, failure = "Couldn't copy to clipboard") => {
  try {
    await copyToClipboard(
      text,
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );
    return true;
  } catch {
    toast({ tone: "bad", title: failure });
    return false;
  }
};
