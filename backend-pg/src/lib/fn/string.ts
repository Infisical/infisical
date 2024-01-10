import path from "path";

// given two paths irrespective of ending with / or not
// this will return true if its equal
export const isSamePath = async (from: string, to: string) => !path.relative(from, to);
