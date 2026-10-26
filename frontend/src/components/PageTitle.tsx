import { useTranslation } from "react-i18next";

export const PageTitle = ({ title }: { title: string }) => {
  const { t } = useTranslation();

  return <title>{t("common.head-title", { title })}</title>;
};
