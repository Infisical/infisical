import type {
  AppConnectionFieldPreset,
  AppConnectionPreset
} from "@app/components/v4/patterns/app-connection-form";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ChefConnectionMethod } from "@app/hooks/api/appConnections/types/chef-connection";
import { ClickHouseConnectionMethod } from "@app/hooks/api/appConnections/types/clickhouse-connection";
import { DatabricksConnectionMethod } from "@app/hooks/api/appConnections/types/databricks-connection";
import { HCVaultConnectionMethod } from "@app/hooks/api/appConnections/types/hc-vault-connection";
import { JiraConnectionMethod } from "@app/hooks/api/appConnections/types/jira-connection";
import { KeeperConnectionMethod } from "@app/hooks/api/appConnections/types/keeper-connection";
import {
  LdapConnectionMethod,
  LdapConnectionProvider
} from "@app/hooks/api/appConnections/types/ldap-connection";
import { MongoDBConnectionMethod } from "@app/hooks/api/appConnections/types/mongodb-connection";
import { MsSqlConnectionMethod } from "@app/hooks/api/appConnections/types/mssql-connection";
import { MySqlConnectionMethod } from "@app/hooks/api/appConnections/types/mysql-connection";
import { OracleDBConnectionMethod } from "@app/hooks/api/appConnections/types/oracledb-connection";
import { PowerDnsConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";
import { RedisConnectionMethod } from "@app/hooks/api/appConnections/types/redis-connection";
import { ServiceNowConnectionMethod } from "@app/hooks/api/appConnections/types/servicenow-connection";
import { SmbConnectionMethod } from "@app/hooks/api/appConnections/types/smb-connection";
import { SnowflakeConnectionMethod } from "@app/hooks/api/appConnections/types/snowflake-connection";
import { SshConnectionMethod } from "@app/hooks/api/appConnections/types/ssh-connection";
import { WinRMConnectionMethod } from "@app/hooks/api/appConnections/types/winrm-connection";
import {
  chefConnectionFormSchema,
  clickHouseConnectionFormSchema,
  databricksConnectionFormSchema,
  hcVaultConnectionFormSchema,
  jiraConnectionFormSchema,
  keeperConnectionFormSchema,
  ldapConnectionFormSchema,
  mongoDBConnectionFormSchema,
  msSqlConnectionFormSchema,
  mySqlConnectionFormSchema,
  oracleDBConnectionFormSchema,
  powerDnsConnectionFormSchema,
  redisConnectionFormSchema,
  serviceNowConnectionFormSchema,
  smbConnectionFormSchema,
  snowflakeConnectionFormSchema,
  sshConnectionFormSchema,
  winRMConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import { methodLabel } from "./shared";

const gatewayValues = { gatewayId: null, gatewayPoolId: null };

const sqlCredentials = (port: number, database: string) => ({
  host: "",
  port,
  database,
  username: "",
  password: "",
  sslEnabled: true,
  sslRejectUnauthorized: true,
  sslCertificate: ""
});

type Visible = NonNullable<AppConnectionFieldPreset["visible"]>;

const sslEnabled: Visible = (values) => Boolean(values.credentials?.sslEnabled);

const sslFields = (visible?: Visible): readonly AppConnectionFieldPreset[] => [
  {
    name: "credentials.sslRejectUnauthorized",
    label: "Reject unauthorized certificates",
    kind: "switch",
    visible
  },
  {
    name: "credentials.sslCertificate",
    label: "CA certificate",
    kind: "textarea",
    optional: true,
    placeholder: "-----BEGIN CERTIFICATE-----",
    visible
  }
];

const sqlFields = (databaseDescription?: string): readonly AppConnectionFieldPreset[] => [
  { name: "credentials.host", label: "Host", mono: true, placeholder: "db.example.com" },
  { name: "credentials.port", label: "Port", kind: "number" },
  {
    name: "credentials.database",
    label: "Database",
    mono: true,
    description: databaseDescription
  },
  { name: "credentials.username", label: "Username", mono: true },
  { name: "credentials.password", label: "Password", kind: "secret" },
  { name: "credentials.sslEnabled", label: "Use SSL", kind: "switch" },
  ...sslFields(sslEnabled)
];

const platformManagedField: AppConnectionFieldPreset = {
  name: "isPlatformManagedCredentials",
  label: "Let Infisical manage credentials",
  kind: "switch",
  description: "Infisical rotates the password on creation, and you can no longer view it."
};

const isLdaps: Visible = (values) =>
  typeof values.credentials?.url === "string" && values.credentials.url.startsWith("ldaps://");

const sshHostFields: readonly AppConnectionFieldPreset[] = [
  { name: "credentials.host", label: "Host", mono: true, placeholder: "server.example.com" },
  { name: "credentials.port", label: "Port", kind: "number" },
  { name: "credentials.username", label: "Username", mono: true }
];

const sshBlockedUsersField: AppConnectionFieldPreset = {
  name: "configuration.blockedUsers",
  label: "Blocked users",
  mono: true,
  optional: true,
  placeholder: "root,admin,ubuntu",
  description: "Comma-separated usernames that operations such as secret rotation never use."
};

const hcVaultInstanceFields: readonly AppConnectionFieldPreset[] = [
  {
    name: "credentials.instanceUrl",
    label: "Instance URL",
    mono: true,
    placeholder: "https://vault.example.com"
  },
  {
    name: "credentials.namespace",
    label: "Namespace",
    mono: true,
    optional: true,
    placeholder: "admin",
    description: "Leave empty if your cluster has no namespaces."
  }
];

export const DATABASE_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.MsSql]: {
    app: AppConnection.MsSql,
    name: APP_CONNECTION_MAP[AppConnection.MsSql].name,
    schema: msSqlConnectionFormSchema,
    values: { ...gatewayValues, isPlatformManagedCredentials: false },
    methods: [
      {
        value: MsSqlConnectionMethod.UsernameAndPassword,
        label: methodLabel(MsSqlConnectionMethod.UsernameAndPassword),
        credentials: sqlCredentials(1433, "default"),
        fields: [...sqlFields(), platformManagedField]
      }
    ]
  },
  [AppConnection.MySql]: {
    app: AppConnection.MySql,
    name: APP_CONNECTION_MAP[AppConnection.MySql].name,
    schema: mySqlConnectionFormSchema,
    values: { ...gatewayValues, isPlatformManagedCredentials: false },
    methods: [
      {
        value: MySqlConnectionMethod.UsernameAndPassword,
        label: methodLabel(MySqlConnectionMethod.UsernameAndPassword),
        credentials: sqlCredentials(3306, "default"),
        fields: [...sqlFields(), platformManagedField]
      }
    ]
  },
  [AppConnection.OracleDB]: {
    app: AppConnection.OracleDB,
    name: APP_CONNECTION_MAP[AppConnection.OracleDB].name,
    schema: oracleDBConnectionFormSchema,
    values: { ...gatewayValues, isPlatformManagedCredentials: false },
    methods: [
      {
        value: OracleDBConnectionMethod.UsernameAndPassword,
        label: methodLabel(OracleDBConnectionMethod.UsernameAndPassword),
        credentials: sqlCredentials(1521, "ORCL"),
        fields: [...sqlFields("The service name, usually ORCL or FREEPDB1."), platformManagedField]
      }
    ]
  },
  [AppConnection.ClickHouse]: {
    app: AppConnection.ClickHouse,
    name: APP_CONNECTION_MAP[AppConnection.ClickHouse].name,
    schema: clickHouseConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: ClickHouseConnectionMethod.UsernameAndPassword,
        label: methodLabel(ClickHouseConnectionMethod.UsernameAndPassword),
        credentials: sqlCredentials(8443, "default"),
        fields: sqlFields()
      }
    ]
  },
  [AppConnection.Redis]: {
    app: AppConnection.Redis,
    name: APP_CONNECTION_MAP[AppConnection.Redis].name,
    schema: redisConnectionFormSchema,
    methods: [
      {
        value: RedisConnectionMethod.UsernameAndPassword,
        label: methodLabel(RedisConnectionMethod.UsernameAndPassword),
        credentials: {
          host: "",
          port: 6379,
          username: "",
          password: "",
          sslEnabled: false,
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          { name: "credentials.host", label: "Host", mono: true, placeholder: "redis.example.com" },
          { name: "credentials.port", label: "Port", kind: "number" },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret", optional: true },
          { name: "credentials.sslEnabled", label: "Use SSL", kind: "switch" },
          ...sslFields(sslEnabled)
        ]
      }
    ]
  },
  [AppConnection.MongoDB]: {
    app: AppConnection.MongoDB,
    name: APP_CONNECTION_MAP[AppConnection.MongoDB].name,
    schema: mongoDBConnectionFormSchema,
    methods: [
      {
        value: MongoDBConnectionMethod.UsernameAndPassword,
        label: methodLabel(MongoDBConnectionMethod.UsernameAndPassword),
        credentials: {
          host: "",
          port: 27017,
          username: "",
          password: "",
          database: "",
          tlsEnabled: false,
          tlsRejectUnauthorized: true,
          tlsCertificate: ""
        },
        fields: [
          { name: "credentials.host", label: "Host", mono: true, placeholder: "mongo.example.com" },
          { name: "credentials.port", label: "Port", kind: "number" },
          { name: "credentials.database", label: "Database", mono: true },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          { name: "credentials.tlsEnabled", label: "Use TLS", kind: "switch" },
          {
            name: "credentials.tlsRejectUnauthorized",
            label: "Reject unauthorized certificates",
            kind: "switch",
            visible: (values) => Boolean(values.credentials?.tlsEnabled)
          },
          {
            name: "credentials.tlsCertificate",
            label: "CA certificate",
            kind: "textarea",
            optional: true,
            placeholder: "-----BEGIN CERTIFICATE-----",
            visible: (values) => Boolean(values.credentials?.tlsEnabled)
          }
        ]
      }
    ]
  },
  [AppConnection.Snowflake]: {
    app: AppConnection.Snowflake,
    name: APP_CONNECTION_MAP[AppConnection.Snowflake].name,
    schema: snowflakeConnectionFormSchema,
    methods: [
      {
        value: SnowflakeConnectionMethod.UsernameAndToken,
        label: methodLabel(SnowflakeConnectionMethod.UsernameAndToken),
        credentials: { account: "", username: "", password: "" },
        fields: [
          {
            name: "credentials.account",
            label: "Account identifier",
            mono: true,
            placeholder: "myorg-myaccount"
          },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Programmatic access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.LDAP]: {
    app: AppConnection.LDAP,
    name: APP_CONNECTION_MAP[AppConnection.LDAP].name,
    schema: ldapConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: LdapConnectionMethod.SimpleBind,
        label: methodLabel(LdapConnectionMethod.SimpleBind),
        credentials: {
          provider: LdapConnectionProvider.ActiveDirectory,
          url: "",
          dn: "",
          password: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.provider",
            label: "Provider",
            kind: "select",
            options: [{ value: LdapConnectionProvider.ActiveDirectory, label: "Active Directory" }]
          },
          {
            name: "credentials.url",
            label: "LDAP URL",
            mono: true,
            placeholder: "ldap://domain-or-ip:389",
            description: "Use ldaps:// to connect over SSL."
          },
          {
            name: "credentials.dn",
            label: "Binding DN or UPN",
            mono: true,
            placeholder: "CN=John,OU=Users,DC=example,DC=com"
          },
          { name: "credentials.password", label: "Binding password", kind: "secret" },
          ...sslFields(isLdaps)
        ]
      }
    ]
  },
  [AppConnection.SSH]: {
    app: AppConnection.SSH,
    name: APP_CONNECTION_MAP[AppConnection.SSH].name,
    schema: sshConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: SshConnectionMethod.SshKey,
        label: methodLabel(SshConnectionMethod.SshKey),
        credentials: { host: "", port: 22, username: "", privateKey: "", passphrase: "" },
        fields: [
          ...sshHostFields,
          {
            name: "credentials.privateKey",
            label: "Private key",
            kind: "secret",
            placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----"
          },
          {
            name: "credentials.passphrase",
            label: "Passphrase",
            kind: "secret",
            optional: true
          },
          sshBlockedUsersField
        ]
      },
      {
        value: SshConnectionMethod.Password,
        label: methodLabel(SshConnectionMethod.Password),
        credentials: { host: "", port: 22, username: "", password: "" },
        fields: [
          ...sshHostFields,
          { name: "credentials.password", label: "Password", kind: "secret" },
          sshBlockedUsersField
        ]
      }
    ]
  },
  [AppConnection.SMB]: {
    app: AppConnection.SMB,
    name: APP_CONNECTION_MAP[AppConnection.SMB].name,
    schema: smbConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: SmbConnectionMethod.Credentials,
        label: methodLabel(SmbConnectionMethod.Credentials),
        credentials: { host: "", port: 445, domain: "", username: "", password: "" },
        fields: [
          {
            name: "credentials.host",
            label: "Host",
            mono: true,
            placeholder: "fileserver.example.com"
          },
          { name: "credentials.port", label: "Port", kind: "number" },
          {
            name: "credentials.domain",
            label: "Domain",
            mono: true,
            optional: true,
            placeholder: "MYDOMAIN",
            description: "For domain-joined servers."
          },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.WinRM]: {
    app: AppConnection.WinRM,
    name: APP_CONNECTION_MAP[AppConnection.WinRM].name,
    schema: winRMConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: WinRMConnectionMethod.UsernamePassword,
        label: methodLabel(WinRMConnectionMethod.UsernamePassword),
        credentials: {
          host: "",
          port: 5985,
          username: "",
          password: "",
          sslEnabled: false,
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.host",
            label: "Host",
            mono: true,
            placeholder: "win01.corp.example.com"
          },
          { name: "credentials.port", label: "Port", kind: "number" },
          {
            name: "credentials.username",
            label: "Username",
            mono: true,
            placeholder: "DOMAIN\\username or user@domain.com"
          },
          { name: "credentials.password", label: "Password", kind: "secret" },
          {
            name: "credentials.sslEnabled",
            label: "Use SSL",
            kind: "switch",
            description:
              "Connects over HTTPS. Without it, HTTP with NTLM message encryption is used."
          },
          {
            name: "credentials.sslRejectUnauthorized",
            label: "Reject unauthorized certificates",
            kind: "switch",
            visible: sslEnabled
          },
          {
            name: "credentials.sslCertificate",
            label: "CA certificate",
            kind: "textarea",
            optional: true,
            placeholder: "-----BEGIN CERTIFICATE-----",
            description: "Leave empty to use the system trust store.",
            visible: sslEnabled
          }
        ]
      }
    ]
  },
  [AppConnection.HCVault]: {
    app: AppConnection.HCVault,
    name: APP_CONNECTION_MAP[AppConnection.HCVault].name,
    schema: hcVaultConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: HCVaultConnectionMethod.AppRole,
        label: methodLabel(HCVaultConnectionMethod.AppRole),
        credentials: { instanceUrl: "", namespace: "", roleId: "", secretId: "" },
        fields: [
          ...hcVaultInstanceFields,
          { name: "credentials.roleId", label: "Role ID", mono: true },
          { name: "credentials.secretId", label: "Secret ID", kind: "secret" }
        ]
      },
      {
        value: HCVaultConnectionMethod.AccessToken,
        label: methodLabel(HCVaultConnectionMethod.AccessToken),
        credentials: { instanceUrl: "", namespace: "", accessToken: "" },
        fields: [
          ...hcVaultInstanceFields,
          { name: "credentials.accessToken", label: "Access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Chef]: {
    app: AppConnection.Chef,
    name: APP_CONNECTION_MAP[AppConnection.Chef].name,
    schema: chefConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: ChefConnectionMethod.UserKey,
        label: methodLabel(ChefConnectionMethod.UserKey),
        credentials: { orgName: "", userName: "", privateKey: "", dataBagSecret: "" },
        fields: [
          {
            name: "credentials.serverUrl",
            label: "Server URL",
            mono: true,
            optional: true,
            placeholder: "https://api.chef.io",
            description: "Leave empty for Chef Cloud."
          },
          { name: "credentials.orgName", label: "Organization short name", mono: true },
          { name: "credentials.userName", label: "Username", mono: true },
          {
            name: "credentials.privateKey",
            label: "Private key",
            kind: "secret",
            description: "The contents of the user's .pem file."
          },
          {
            name: "credentials.dataBagSecret",
            label: "Data bag secret",
            kind: "secret",
            optional: true,
            description:
              "The contents of encrypted_data_bag_secret, needed for encrypted data bags."
          }
        ]
      }
    ]
  },
  [AppConnection.PowerDns]: {
    app: AppConnection.PowerDns,
    name: APP_CONNECTION_MAP[AppConnection.PowerDns].name,
    schema: powerDnsConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: PowerDnsConnectionMethod.ApiKey,
        label: methodLabel(PowerDnsConnectionMethod.ApiKey),
        credentials: {
          apiUrl: "",
          apiKey: "",
          serverId: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.apiUrl",
            label: "API URL",
            mono: true,
            placeholder: "https://pdns.example.com:8081",
            description: "The web server address, without the /api/v1 path."
          },
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            description: "The api-key setting in your PowerDNS configuration."
          },
          {
            name: "credentials.serverId",
            label: "Server ID",
            mono: true,
            optional: true,
            placeholder: "localhost",
            description: "Leave empty unless a proxy fronts several PowerDNS servers."
          },
          ...sslFields()
        ]
      }
    ]
  },
  [AppConnection.Databricks]: {
    app: AppConnection.Databricks,
    name: APP_CONNECTION_MAP[AppConnection.Databricks].name,
    schema: databricksConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: DatabricksConnectionMethod.ServicePrincipal,
        label: methodLabel(DatabricksConnectionMethod.ServicePrincipal),
        credentials: { workspaceUrl: "", clientId: "", clientSecret: "" },
        fields: [
          {
            name: "credentials.workspaceUrl",
            label: "Workspace URL",
            mono: true,
            placeholder: "https://xxx-xxxxxxxx-xxx.cloud.databricks.com"
          },
          { name: "credentials.clientId", label: "Client ID", mono: true },
          { name: "credentials.clientSecret", label: "Client secret", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Jira]: {
    app: AppConnection.Jira,
    name: APP_CONNECTION_MAP[AppConnection.Jira].name,
    schema: jiraConnectionFormSchema,
    values: gatewayValues,
    methods: [
      {
        value: JiraConnectionMethod.ApiToken,
        label: methodLabel(JiraConnectionMethod.ApiToken),
        description: "For Jira Cloud.",
        credentials: { instanceUrl: "", email: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://your-domain.atlassian.net"
          },
          { name: "credentials.email", label: "Email", placeholder: "user@example.com" },
          {
            name: "credentials.apiToken",
            label: "API token",
            kind: "secret",
            description:
              "Create one in your Atlassian account settings under Security > API tokens."
          }
        ]
      },
      {
        value: JiraConnectionMethod.PersonalAccessToken,
        label: methodLabel(JiraConnectionMethod.PersonalAccessToken),
        description: "For Jira Data Center.",
        credentials: {
          instanceUrl: "",
          personalAccessToken: "",
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://jira.example.com",
            description: "Include the context path if Jira runs under one, such as /jira."
          },
          {
            name: "credentials.personalAccessToken",
            label: "Personal access token",
            kind: "secret",
            description: "Create one in Jira under Profile > Personal Access Tokens."
          },
          ...sslFields()
        ]
      }
    ]
  },
  [AppConnection.ServiceNow]: {
    app: AppConnection.ServiceNow,
    name: APP_CONNECTION_MAP[AppConnection.ServiceNow].name,
    schema: serviceNowConnectionFormSchema,
    methods: [
      {
        value: ServiceNowConnectionMethod.BasicAuth,
        label: methodLabel(ServiceNowConnectionMethod.BasicAuth),
        credentials: { instanceUrl: "", username: "", password: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://dev12345.service-now.com"
          },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Keeper]: {
    app: AppConnection.Keeper,
    name: APP_CONNECTION_MAP[AppConnection.Keeper].name,
    schema: keeperConnectionFormSchema,
    methods: [
      {
        value: KeeperConnectionMethod.ApiKey,
        label: methodLabel(KeeperConnectionMethod.ApiKey),
        credentials: { instanceUrl: "", apiKey: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://keeper.company.com",
            description: "Your Keeper Commander instance."
          },
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            description: "Generated for Keeper Commander Service Mode."
          }
        ]
      }
    ]
  }
};
