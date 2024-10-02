// Credit: https://github.com/miguelmota/is-base64
export const isBase64 = (
  v: string,
  opts = { allowEmpty: false, mimeRequired: false, allowMime: true, paddingRequired: false }
) => {
  if (opts.allowEmpty === false && v === "") {
    return false;
  }

  let regex = "(?:[A-Za-z0-9+\\/]{4})*(?:[A-Za-z0-9+\\/]{2}==|[A-Za-z0-9+/]{3}=)?";
  const mimeRegex = "(data:\\w+\\/[a-zA-Z\\+\\-\\.]+;base64,)";

  if (opts.mimeRequired === true) {
    regex = mimeRegex + regex;
  } else if (opts.allowMime === true) {
    regex = `${mimeRegex}?${regex}`;
  }

  if (opts.paddingRequired === false) {
    regex = "(?:[A-Za-z0-9+\\/]{4})*(?:[A-Za-z0-9+\\/]{2}(==)?|[A-Za-z0-9+\\/]{3}=?)?";
  }

  return new RegExp(`^${regex}$`, "gi").test(v);
};

export const getBase64SizeInBytes = (base64String: string) => {
  // Remove data URI scheme if present
  const base64 = base64String.replace(/^data:.*?;base64,/, "");

  // Remove padding characters
  const withoutPadding = base64.replace(/=+$/, "");

  // Calculate bits: each base64 character represents 6 bits
  const totalBits = withoutPadding.length * 6;

  // Convert bits to bytes (8 bits = 1 byte)
  const bytes = totalBits / 8;

  return bytes;
};
