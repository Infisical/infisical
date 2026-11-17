import { describeKmsKeyStoreContract, inMemoryKmsKeyStoreFixture } from "../testing/kms-key-store-contract";

describeKmsKeyStoreContract("in memory", inMemoryKmsKeyStoreFixture);
