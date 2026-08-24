// Sandbox never greets anyone by their full name — Adi, 2026-08-24: "let's
// never address anyone by their full name. So Hi First Name, welcome to your
// portal. As well as in an email across the board." A school contact saved as
// "Jennifer Alvarez" should read "Hi Jennifer," not "Hi Jennifer Alvarez,".
//
// Contacts do have a stored first_name, but this can't rely on it: the
// approval page's director name is free-typed, older contacts predate the
// first/last split, and portal RPCs return a single joined name. So this works
// from whatever string it's given, and callers pass the stored first_name when
// they have one.
const TITLES = new Set(["mr", "mrs", "ms", "mx", "miss", "dr", "prof", "professor", "fr", "sr", "rev", "coach", "principal"]);

export function firstNameOf(fullName: string | null | undefined): string {
  const cleaned = String(fullName ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  // "Alvarez, Jennifer" — SIS exports and some contact lists store names
  // surname-first, where the FIRST token is exactly the wrong pick.
  if (cleaned.includes(",")) {
    const afterComma = cleaned.split(",")[1]?.trim();
    if (afterComma) return firstNameOf(afterComma);
  }

  const parts = cleaned.split(" ");
  // Skip a leading title so "Dr. Sarah Chen" greets Sarah, not "Dr.". Only
  // when something follows it — "Dr." alone is all we have, so use it rather
  // than greeting nobody.
  const firstWord = parts[0];
  const withoutTitle = firstWord.replace(/\.$/, "").toLowerCase();
  if (TITLES.has(withoutTitle) && parts.length > 1) return parts[1];
  return firstWord;
}

// For a contact whose first_name was captured separately — prefers it, falls
// back to deriving from the full name for records saved before that split.
export function greetingName(firstName: string | null | undefined, fullName: string | null | undefined): string {
  const stored = String(firstName ?? "").trim();
  return stored || firstNameOf(fullName);
}
