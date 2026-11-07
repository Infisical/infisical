import { useState } from "react";

import { Banner } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow, ListSection } from "@app/components/v4/ui/list";
import { MultiStep } from "@app/components/v4/ui/multi-step";
import { Select } from "@app/components/v4/ui/select";
import { Textarea } from "@app/components/v4/ui/textarea";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

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
  const [nameError, setNameError] = useState<string>();
  const [appError, setAppError] = useState(false);
  const option = options.find((entry) => entry.app === app);
  const appName = app ? APP_CONNECTION_MAP[app].name : undefined;
  const chosen = option?.methods.includes(method) ? method : option?.methods[0];
  const fields = app && chosen ? credentialFields[app]?.[chosen] : undefined;
  const appIds = options.map((entry) => entry.app);
  const matches = appIds.filter((id) =>
    `${APP_CONNECTION_MAP[id].name} ${APP_CONNECTION_MAP[id].category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  const appRow = (id: AppConnection) => (
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
        setAppError(false);
        setMethod(options.find((entry) => entry.app === id)?.methods[0] ?? "");
        setCredentials({});
        if (!name) setName(`${id}-connection`);
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
    setNameError(undefined);
    setAppError(false);
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
        await createConnection.mutateAsync({
          app,
          name: name.trim(),
          description: description.trim() || null,
          method: chosen as TAppConnection["method"],
          credentials: credentials as TAppConnection["credentials"]
        } as TCreateAppConnectionDTO);
        reset();
      }}
      steps={[
        {
          title: "App",
          heading: "Pick an app",
          summary: appName,
          validate: () => {
            if (app) return true;
            setAppError(true);
            return "Pick an app to continue.";
          },
          content: (
            <Stack gap={12}>
              <Input
                icon="search"
                placeholder="Search apps, such as AWS or Vault"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-invalid={appError || undefined}
              />
              <List
                label="Apps"
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
                  ? matches.map(appRow)
                  : [
                      <ListSection key="popular" label="Popular">
                        {popular.filter((id) => appIds.includes(id)).map(appRow)}
                      </ListSection>,
                      <ListSection key="all" label="All apps">
                        {appIds.filter((id) => !popular.includes(id)).map(appRow)}
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
            let error: string | undefined;
            if (!value) error = "Enter a name.";
            else if (!/^[a-z0-9-]+$/.test(value))
              error = "Use lowercase letters, numbers and dashes.";
            setNameError(error);
            if (error) return false;
            if (!fields) return "Pick a method that uses credentials.";
            const missing = fields.find((field) => !credentials[field.key]?.trim());
            return missing ? `Enter the ${missing.label.toLowerCase()}.` : true;
          },
          content: (
            <Stack gap={16}>
              <Field
                label="Name"
                description="Lowercase letters, numbers and dashes."
                error={nameError}
                wide
              >
                <Input mono value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Description" optional wide>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {option && (
                <Field label="Method" wide>
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
                <Field key={`${chosen}-${field.key}`} label={field.label} wide>
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
