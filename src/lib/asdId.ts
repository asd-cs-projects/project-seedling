// ASD ID is the only identifier surfaced to users. Format: ASD-XXXXXXX (7 digits).
// Internally we map it to a deterministic synthetic email so Supabase Auth
// (which requires an email or phone under the hood) keeps working.
// Users never see, type, or receive anything at this address.
export const ASD_ID_REGEX = /^ASD-\d{7}$/;

export const normalizeAsdId = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "").slice(-7);
  return digits ? `ASD-${digits.padStart(7, "0")}` : "";
};

export const isValidAsdId = (id: string): boolean => ASD_ID_REGEX.test(id);

// Deterministic synthetic email. Lowercased so case can't create duplicates.
export const asdIdToSyntheticEmail = (asdId: string): string =>
  `${asdId.toLowerCase()}@asd.local`;
