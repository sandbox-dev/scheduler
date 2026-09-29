// Shoot Notes questions — from the Google Form it replaces (2026-09-29),
// with its two location questions reworded into two clear ones. School Name
// and Event Date are left out: the team app already knows which picture day
// this is.
export const SHOOT_NOTES_TITLE = "Shoot Notes";
export const SHOOT_NOTES_INTRO = "Please enter any and all shoot notes below thank you :)";
export const FILLED_BY_QUESTION = "Who's filling out the form? Check all that apply.";

export type YesNoKey = "individual_as_expected" | "group_as_expected" | "on_time" | "parking_as_described";
export const YES_NO_QUESTIONS: { key: YesNoKey; noteKey: string; question: string; ifNo: string }[] = [
  // Adi, 2026-09-29: the form's combined "Individual & Group Photo" question
  // and "set up location" question were confusing — split into these two.
  {
    key: "individual_as_expected",
    noteKey: "individual_note",
    question: "Was the individual location as expected?",
    ifNo: "(If NO, please be specific - use room #'s or name.)",
  },
  {
    key: "group_as_expected",
    noteKey: "group_note",
    question: "Was the group photo location as expected?",
    ifNo: "(If NO, please be specific - use room #'s or name.)",
  },
  { key: "on_time", noteKey: "timeline_note", question: "Timeline - On time?", ifNo: "(If NO, how much over & provide explanation.)" },
  {
    key: "parking_as_described",
    noteKey: "parking_note",
    question: "Was parking as described in event info notes?",
    ifNo: "(If NO, please describe where you parked.)",
  },
];
export const OTHER_QUESTION = "Other";
export const OTHER_HINT = "(Were there any special circumstances not mentioned above that we should know about?)";
export const NEXT_TIME_QUESTION = "For Next Time";
export const NEXT_TIME_HINT = "(What can we do better or different for next time?)";

export type ShootNotesAnswers = {
  filled_by: string[];
  individual_as_expected: boolean | null;
  individual_note: string;
  on_time: boolean | null;
  timeline_note: string;
  parking_as_described: boolean | null;
  parking_note: string;
  group_as_expected: boolean | null;
  group_note: string;
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
