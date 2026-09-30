import { useState } from "react";

export const useCertificateFilterPreview = <TFilters>(filters: TFilters) => {
  const [previewFilters, setPreviewFilters] = useState<TFilters>(filters);
  const [page, setPage] = useState(1);
  const isStale = JSON.stringify(filters ?? null) !== JSON.stringify(previewFilters ?? null);

  const reloadPreview = (refetch: () => Promise<unknown>) => {
    setPage(1);
    if (isStale) setPreviewFilters(filters);
    else refetch().catch(() => {});
  };

  return { previewFilters, page, setPage, isStale, reloadPreview };
};
