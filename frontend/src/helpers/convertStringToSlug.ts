export const stringToUnderscoreSlug = (inputString: string): string => {
    /** Replace non-alphanumeric characters (except underscores) with underscores */
    const slug: string = inputString.replace(/[^a-zA-Z0-9_]+/g, "_");
    const cleanedSlug: string = slug.replace(/^_+|_+$/g, "");
    return cleanedSlug.toLowerCase();
}

