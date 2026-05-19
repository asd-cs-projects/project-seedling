// Convert any casing into Proper Case: first letter of each word uppercase, rest lowercase.
export const toProperCase = (input: string): string =>
  input
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
