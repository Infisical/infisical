import { Knex } from "knex";

import { TableName } from "../schemas";
import { dropOnUpdateTrigger } from "../utils";

// Drops the tables of the removed Agent Sentinel (ai project type) and SSH project type
// products. Tables are dropped children-first; no live table has a foreign key into
// either cluster. Existing project rows of type "ai" / "ssh" are left in place.
export async function up(knex: Knex): Promise<void> {
  // Agent Sentinel (ai_mcp_*)
  await dropOnUpdateTrigger(knex, TableName.AiMcpServerUserCredential);
  await knex.schema.dropTableIfExists(TableName.AiMcpServerUserCredential);

  await knex.schema.dropTableIfExists(TableName.AiMcpEndpointServerTool);
  await knex.schema.dropTableIfExists(TableName.AiMcpEndpointServer);

  await dropOnUpdateTrigger(knex, TableName.AiMcpEndpoint);
  await knex.schema.dropTableIfExists(TableName.AiMcpEndpoint);

  await knex.schema.dropTableIfExists(TableName.AiMcpServerTool);

  await dropOnUpdateTrigger(knex, TableName.AiMcpServer);
  await knex.schema.dropTableIfExists(TableName.AiMcpServer);

  await knex.schema.dropTableIfExists(TableName.AiMcpActivityLog);

  // SSH product — drop order follows the FK graph (children before parents):
  // ssh_host_login_users FKs ssh_host_groups + ssh_hosts; ssh_certificates FKs
  // ssh_hosts + ssh_certificate_templates + ssh_certificate_authorities.
  await dropOnUpdateTrigger(knex, TableName.SshHostGroupMembership);
  await knex.schema.dropTableIfExists(TableName.SshHostGroupMembership);

  await dropOnUpdateTrigger(knex, TableName.SshHostLoginUserMapping);
  await knex.schema.dropTableIfExists(TableName.SshHostLoginUserMapping);

  await dropOnUpdateTrigger(knex, TableName.SshHostLoginUser);
  await knex.schema.dropTableIfExists(TableName.SshHostLoginUser);

  await dropOnUpdateTrigger(knex, TableName.SshHostGroup);
  await knex.schema.dropTableIfExists(TableName.SshHostGroup);

  await dropOnUpdateTrigger(knex, TableName.SshCertificateBody);
  await knex.schema.dropTableIfExists(TableName.SshCertificateBody);

  await dropOnUpdateTrigger(knex, TableName.SshCertificate);
  await knex.schema.dropTableIfExists(TableName.SshCertificate);

  await dropOnUpdateTrigger(knex, TableName.SshCertificateTemplate);
  await knex.schema.dropTableIfExists(TableName.SshCertificateTemplate);

  await dropOnUpdateTrigger(knex, TableName.ProjectSshConfig);
  await knex.schema.dropTableIfExists(TableName.ProjectSshConfig);

  await dropOnUpdateTrigger(knex, TableName.SshHost);
  await knex.schema.dropTableIfExists(TableName.SshHost);

  await dropOnUpdateTrigger(knex, TableName.SshCertificateAuthoritySecret);
  await knex.schema.dropTableIfExists(TableName.SshCertificateAuthoritySecret);

  await dropOnUpdateTrigger(knex, TableName.SshCertificateAuthority);
  await knex.schema.dropTableIfExists(TableName.SshCertificateAuthority);

  // Org-level SSH product toggle
  const hasSshProductEnabled = await knex.schema.hasColumn(TableName.Organization, "sshProductEnabled");
  if (hasSshProductEnabled) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("sshProductEnabled");
    });
  }
}

export async function down(): Promise<void> {}
