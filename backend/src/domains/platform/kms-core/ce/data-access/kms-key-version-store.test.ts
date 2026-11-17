import { inMemoryKmsKeyStoreFixture } from "../testing/kms-key-store-contract";
import { describeKmsKeyVersionStoreContract } from "../testing/kms-key-version-store-contract";

describeKmsKeyVersionStoreContract("in memory", inMemoryKmsKeyStoreFixture);
