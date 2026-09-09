CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE kms_root_config (
  id UUID PRIMARY KEY,
  "encryptedRootKey" BYTEA NOT NULL,
  "encryptionStrategy" TEXT NOT NULL DEFAULT 'SOFTWARE'
);

CREATE TABLE kms_keys (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "isDisabled" BOOLEAN NOT NULL DEFAULT false,
  "isReserved" BOOLEAN NOT NULL DEFAULT false,
  "orgId" UUID NOT NULL,
  "projectId" UUID,
  "keyUsage" TEXT NOT NULL DEFAULT 'encrypt-decrypt',
  "isExportable" BOOLEAN NOT NULL DEFAULT true,
  "hasDeleteProtection" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE internal_kms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "encryptedKey" BYTEA NOT NULL,
  "encryptionAlgorithm" TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  "kmsKeyId" UUID NOT NULL REFERENCES kms_keys(id)
);

CREATE TABLE external_kms (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  "encryptedProviderInputs" BYTEA NOT NULL,
  "kmsKeyId" UUID NOT NULL REFERENCES kms_keys(id)
);

INSERT INTO kms_keys (id, name, "orgId", "projectId")
SELECT
  ('00000000-0000-0000-0000-' || LPAD(key_number::TEXT, 12, '0'))::UUID,
  'raft-cache-probe-' || key_number,
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
FROM generate_series(1, 100) AS key_number;
