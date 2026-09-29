// Shoot Notes questions — word for word from the Google Form it replaces
// (2026-09-29). School Name and Event Date are left out: the team app already
// knows which picture day this is.
export const SHOOT_NOTES_TITLE = "Shoot Notes";
export const SHOOT_NOTES_INTRO = "Please enter any and all shoot notes below thank you :)";
export const FILLED_BY_QUESTION = "Who's filling out the form? Check all that apply.";

export type YesNoKey = "location_same" | "on_time" | "parking_as_described" | "setup_as_expected";
export const YES_NO_QUESTIONS: { key: YesNoKey; noteKey: string; question: string; ifNo: string }[] = [
  {
    key: "location_same",
    noteKey: "location_note",
    question: "Was the location for Individual & Group Photo the same as on the event info notes provided?",
    ifNo: "(If NO, please be specific - use room #'s or name.)",
  },
  { key: "on_time", noteKey: "timeline_note", question: "Timeline - On time?", ifNo: "(If NO, how much over & provide explanation.)" },
  {
    key: "parking_as_described",
    noteKey: "parking_note",
    question: "Was parking as described in event info notes?",
    ifNo: "(If NO, please describe where you parked.)",
  },
  { key: "setup_as_expected", noteKey: "setup_note", question: "Was the set up location as expected?", ifNo: "(If NO, please list changes)" },
];
export const OTHER_QUESTION = "Other";
export const OTHER_HINT = "(Were there any special circumstances not mentioned above that we should know about?)";
export const NEXT_TIME_QUESTION = "For Next Time";
export const NEXT_TIME_HINT = "(What can we do better or different for next time?)";

export type ShootNotesAnswers = {
  filled_by: string[];
  location_same: boolean | null;
  location_note: string;
  on_time: boolean | null;
  timeline_note: string;
  parking_as_described: boolean | null;
  parking_note: string;
  setup_as_expected: boolean | null;
  setup_note: string;
  other_notes: string;
  next_time: string;
};

// What's still missing, in plain words — every Yes/No answered, a note for
// each No, and at least one name.
export function missingShootNotes(a: ShootNotesAnswers): string[] {
  const missing: string[] = [];
  if (a.filled_by.length === 0) missing.push("who's filling out the form");
  for (const q of YES_NO_QUESTIONS) {
    const v = a[q.key];
    if (v === null) missing.push(`"${q.question}"`);
    else if (v === false && !String(a[q.noteKey as keyof ShootNotesAnswers] ?? "").trim()) missing.push(`details for "${q.question}"`);
  }
  return missing;
}
