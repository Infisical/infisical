import { useState } from "react";
import { Banner } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList, List, ListRow, ListSection } from "@infisical/cipher/ui/list";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

import { readableFailure } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AppLogo } from "./AppLogo";

type CredentialField = { key: string; label: string; secret?: boolean };

const credentialFields: Partial<Record<AppConnection, Record<string, CredentialField[]>>> = {
  [AppConnection.AWS]: {
    "assume-role": [{ key: "roleArn", label: "Role ARN" }],
    "access-key": [
      { key: "accessKeyId", label: "Access key ID" },
      { key: "secretAccessKey", label: "Secret access key", secret: true }
    ]
  },
  [AppConnection.GitHub]: {
    pat: [{ key: "personalAccessToken", label: "Personal access token", secret: true }]
  },
  [AppConnection.Vercel]: {
    "api-token": [{ key: "apiToken", label: "API token", secret: true }]
  },
  [AppConnection.GCP]: {
    "service-account-impersonation": [
      { key: "serviceAccountEmail", label: "Service account email" }
    ]
  },
  [AppConnection.AzureKeyVault]: {
    "client-secret": [
      { key: "tenantId", label: "Tenant ID" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true }
    ]
  },
  [AppConnection.Databricks]: {
    "service-principal": [
      { key: "workspaceUrl", label: "Workspace URL" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true }
    ]
  }
};

const asNoun = (label: string) =>
  /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);

const popular = [AppConnection.AWS, AppConnection.GitHub, AppConnection.Vercel, AppConnection.GCP];

export const NewConnection = () => {
  const integrations = useV4Adapter("integrations");
  const { data: options = [] } = integrations.useConnectionOptions();
  const createConnection = integrations.useCreateConnection();
  const [app, setApp] = useState<AppConnection>();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const option = options.find((entry) => entry.app === app);
  const appName = app ? APP_CONNECTION_MAP[app].name : undefined;
  const chosen = option?.methods.includes(method) ? method : option?.methods[0];
  const fields = app && chosen ? credentialFields[app]?.[chosen] : undefined;
  const appIds = options.map((entry) => entry.app);
  const available = new Set(appIds);
  const matches = appIds.filter((id) =>
    `${APP_CONNECTION_MAP[id].name} ${APP_CONNECTION_MAP[id].category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  const appRow = (id: AppConnection, next: () => void) => (
    <ListRow
      key={id}
      value={id}
      label={APP_CONNECTION_MAP[id].name}
      title={APP_CONNECTION_MAP[id].name}
      description={APP_CONNECTION_MAP[id].description}
      media={<AppLogo app={id} />}
      current={app === id}
      onClick={() => {
        setApp(id);
        setMethod(options.find((entry) => entry.app === id)?.methods[0] ?? "");
        setCredentials({});
        if (!name) setName(`${id}-connection`);
        next();
      }}
    />
  );
  const reset = () => {
    setApp(undefined);
    setQuery("");
    setName("");
    setDescription("");
    setMethod("");
    setCredentials({});
  };
  return (
    <MultiStep
      variant="sheet"
      size="lg"
      title="New connection"
      description="Connect a third-party app once and reuse it across projects."
      trigger={
        <Button variant="accent" icon="plus">
          New connection
        </Button>
      }
      completeLabel={appName ? `Connect ${appName}` : "Connect"}
      onCancel={reset}
      onComplete={async () => {
        if (!app || !chosen) return;
        await createConnection
          .mutateAsync({
            app,
            name: name.trim(),
            description: description.trim() || null,
            method: chosen as TAppConnection["method"],
            credentials: credentials as TAppConnection["credentials"]
          } as TCreateAppConnectionDTO)
          .catch(readableFailure(`Could not connect ${APP_CONNECTION_MAP[app].name}.`));
        reset();
      }}
      steps={[
        {
          title: "App",
          heading: "Pick an app",
          summary: appName,
          validate: () => (app ? true : { message: "Pick an app to continue." }),
          render: ({ next }) => (
            <Stack gap={12}>
              <Input
                icon="search"
                placeholder="Search apps, such as AWS or Vault"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <List
                label="Apps"
                variant="bare"
                size="sm"
                empty={
                  <EmptyState
                    size="sm"
                    media="bare"
                    icon="search"
                    title={`No apps match “${query}”`}
                    actions={
                      <Button variant="link" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    }
                  />
                }
              >
                {query.trim()
                  ? matches.map((id) => appRow(id, next))
                  : [
                      <ListSection key="popular" label="Popular">
                        {popular.filter((id) => available.has(id)).map((id) => appRow(id, next))}
                      </ListSection>,
                      <ListSection key="all" label="All apps">
                        {appIds.filter((id) => !popular.includes(id)).map((id) => appRow(id, next))}
                      </ListSection>
                    ]}
              </List>
            </Stack>
          )
        },
        {
          title: "Configure",
          heading: appName ? `Configure ${appName}` : "Configure",
          description: "Credentials are encrypted and never shown again after you connect.",
          summary: name || undefined,
          validate: () => {
            const value = name.trim();
            let nameError: string | undefined;
            if (!value) nameError = "Enter a name.";
            else if (!/^[a-z0-9-]+$/.test(value))
              nameError = "Use lowercase letters, numbers and dashes.";
            return {
              fields: {
                name: nameError,
                method: fields ? undefined : "Pick a method that uses credentials.",
                ...Object.fromEntries(
                  (fields ?? [])
                    .filter((field) => !credentials[field.key]?.trim())
                    .map((field) => [field.key, `Enter the ${asNoun(field.label)}.`])
                )
              }
            };
          },
          content: (
            <Stack gap={16}>
              <Field
                label="Name"
                name="name"
                description="Lowercase letters, numbers and dashes."
                wide
              >
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Description" optional wide>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {option && (
                <Field label="Method" name="method" wide>
                  <Select
                    label="Method"
                    options={option.methods.map((value) => ({
                      value,
                      label: getAppConnectionMethodDetails(value as TAppConnection["method"]).name
                    }))}
                    value={chosen}
                    onChange={(value) => {
                      setMethod(value);
                      setCredentials({});
                    }}
                  />
                </Field>
              )}
              {fields?.map((field) => (
                <Field key={`${chosen}-${field.key}`} label={field.label} name={field.key} wide>
                  <Input
                    mono
                    type={field.secret ? "password" : "text"}
                    value={credentials[field.key] ?? ""}
                    onChange={(event) =>
                      setCredentials((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                </Field>
              ))}
              {option && !fields && (
                <Banner icon="info">
                  This method signs in through {appName}. Connect it from the current Infisical app
                  for now.
                </Banner>
              )}
            </Stack>
          )
        },
        {
          title: "Review",
          heading: "Review the connection",
          content: (
            <DataList
              variant="props"
              items={[
                ["App", appName ?? ""],
                ["Name", <code key="name">{name}</code>],
                [
                  "Method",
                  chosen
                    ? getAppConnectionMethodDetails(chosen as TAppConnection["method"]).name
                    : ""
                ],
                ["Managed by", "Organization"]
              ]}
            />
          )
        }
      ]}
    />
  );
};
