import { type BackendModule, createInstance } from "i18next";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

type LocaleResources = Record<string, Record<string, Record<string, unknown>>>;

const localesRoot = new URL("../public/locales/", import.meta.url);

const isResource = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const loadLocaleResources = async (): Promise<LocaleResources> => {
  const resources: LocaleResources = {};
  const locales = await readdir(localesRoot, { withFileTypes: true });

  await Promise.all(
    locales
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }) => {
        const value: unknown = JSON.parse(
          await readFile(new URL(`${name}/translations.json`, localesRoot), "utf8")
        );

        assert.ok(isResource(value), `${name}/translations.json must contain a JSON object`);
        resources[name] = { translations: value };
      })
  );

  return resources;
};

test("all locale resources load as translation objects", async () => {
  const resources = await loadLocaleResources();

  assert.deepEqual(Object.keys(resources).sort(), ["en", "es", "fr", "ko", "pt-BR", "tr"]);
  Object.entries(resources).forEach(([locale, namespaces]) => {
    assert.ok(isResource(namespaces.translations), `${locale} must define translations`);
  });
});

test("language matching, fallback, interpolation, and plurals remain compatible", async () => {
  const resources = await loadLocaleResources();
  const reads: string[] = [];
  const backendResources: LocaleResources = {
    ...resources,
    en: {
      translations: {
        ...resources.en.translations,
        compatibility: {
          fallback: "Fallback copy",
          items_one: "{{count}} item",
          items_other: "{{count}} items"
        }
      }
    }
  };
  const backend: BackendModule = {
    type: "backend",
    init: () => undefined,
    read: (language, namespace, callback) => {
      reads.push(`${language}:${namespace}`);
      callback(null, backendResources[language]?.[namespace] ?? false);
    }
  };
  const instance = createInstance();

  await instance.use(backend).init({
    defaultNS: "translations",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    lng: "fr-CA",
    load: "languageOnly",
    ns: ["translations"],
    showSupportNotice: false,
    supportedLngs: ["en", "fr"]
  });

  assert.equal(instance.resolvedLanguage, "fr");
  assert.ok(reads.includes("fr:translations"));
  assert.ok(reads.includes("en:translations"));
  assert.equal(instance.t("common.head-title", { title: "Status" }), "Status | Infisical");
  assert.equal(instance.t("compatibility.fallback"), "Fallback copy");

  const translateEnglish = instance.getFixedT("en", "translations");
  assert.equal(translateEnglish("compatibility.items", { count: 1 }), "1 item");
  assert.equal(translateEnglish("compatibility.items", { count: 2 }), "2 items");
});
