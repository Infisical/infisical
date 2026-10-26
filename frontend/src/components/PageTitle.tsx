import { useTranslation } from "react-i18next";

export const PageTitle = ({ title }: { title: string }) => {
  const { t, ready } = useTranslation(undefined, { useSuspense: false });

  return <title>{ready ? t("common.head-title", { title }) : `${title} | Infisical`}</title>;
};
