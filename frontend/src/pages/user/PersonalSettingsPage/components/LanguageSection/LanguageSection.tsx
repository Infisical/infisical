import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { languageMap } from "@app/const";

export const LanguageSection = () => {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle className="font-alliance">{t("common.language")}</CardTitle>
        <CardDescription>{t("settings.personal.change-language")}</CardDescription>
      </CardHeader>
      <CardContent className="max-w-md px-6 pb-6">
        <Field>
          <FieldLabel htmlFor="personal-settings-language">{t("common.language")}</FieldLabel>
          <Select value={current} onValueChange={(value) => void i18n.changeLanguage(value)}>
            <SelectTrigger id="personal-settings-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(languageMap).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
};
