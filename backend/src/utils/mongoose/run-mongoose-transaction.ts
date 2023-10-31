import mongoose, { mongo } from "mongoose";

interface RunTransactionArgs<T> {
  existingSession?: mongo.ClientSession;
  transactions: (session: mongoose.mongo.ClientSession) => Promise<T>;
}

export const runMongooseTransaction = async <T>({
  transactions,
  existingSession
}: RunTransactionArgs<T>) => {
  const session = existingSession ?? (await mongoose.startSession());

  if (!existingSession) {
    session.startTransaction();
  }

  try {
    const result = await transactions(session);

    if (!existingSession) {
      await session.commitTransaction();
    }

    return result;
  } catch (error) {
    if (!existingSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (!existingSession) {
      await session.endSession();
    }
  }
};
