import { ISecretRotationProviderTemplate } from "../types";
import { MYSQL_TEMPLATE } from "./mysql";
import { POSTGRES_TEMPLATE } from "./postgres";
import { SENDGRID_TEMPLATE } from "./sendgrid";

export const rotationTemplates: ISecretRotationProviderTemplate[] = [
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
    template: POSTGRES_TEMPLATE
  },
  {
    name: "mysql",
    title: "MySQL",
    image: "mysql.png",
    description: "Rotate MySQL@7/MariaDB user credentials",
    template: MYSQL_TEMPLATE
  }
];
