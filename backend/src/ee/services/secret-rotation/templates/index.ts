import { AWS_IAM_TEMPLATE } from "./aws-iam";
import { MSSQL_TEMPLATE } from "./mssql";
import { MYSQL_TEMPLATE } from "./mysql";
import { POSTGRES_TEMPLATE } from "./postgres";
import { SENDGRID_TEMPLATE } from "./sendgrid";
import { TSecretRotationProviderTemplate } from "./types";

export const rotationTemplates: TSecretRotationProviderTemplate[] = [
  {
    name: "sendgrid",
    title: "Twilio Sendgrid",
    image: "sendgrid.png",
    description: "Rotate Twilio Sendgrid API keys",
    template: SENDGRID_TEMPLATE
  },
  {
    name: "postgres",
    title: "PostgreSQL",
    image: "postgres.png",
    description: "Rotate PostgreSQL/CockroachDB user credentials",
    template: POSTGRES_TEMPLATE,
    isDeprecated: true
  },
  {
    name: "mysql",
    title: "MySQL",
    image: "mysql.png",
    description: "Rotate MySQL@7/MariaDB user credentials",
    template: MYSQL_TEMPLATE
  },
  {
    name: "mssql",
    title: "Microsoft SQL Server",
    image: "mssqlserver.png",
    description: "Rotate Microsoft SQL server user credentials",
    template: MSSQL_TEMPLATE,
    isDeprecated: true
  },
  {
    name: "aws-iam",
    title: "AWS IAM",
    image: "aws-iam.svg",
    description: "Rotate AWS IAM User credentials",
    template: AWS_IAM_TEMPLATE
  }
];
