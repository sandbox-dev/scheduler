import { describe, expect, it } from "vitest";
import { firstNameOf, greetingName } from "./personName";

describe("firstNameOf", () => {
  it("takes the first name off a normal full name", () => {
    expect(firstNameOf("Jennifer Alvarez")).toBe("Jennifer");
    expect(firstNameOf("Maya Chen-Torres")).toBe("Maya");
  });

  it("leaves a single name alone", () => {
    expect(firstNameOf("Jennifer")).toBe("Jennifer");
  });

  it("skips a title so the greeting isn't 'Hi Dr.'", () => {
    expect(firstNameOf("Dr. Sarah Chen")).toBe("Sarah");
    expect(firstNameOf("Mrs Alvarez Torres")).toBe("Alvarez");
    expect(firstNameOf("Ms. Diaz")).toBe("Diaz");
  });

  it("uses a bare title rather than greeting nobody", () => {
    expect(firstNameOf("Dr.")).toBe("Dr.");
  });

  it("handles surname-first names, where the first word is the wrong pick", () => {
    // SIS exports commonly store names this way.
    expect(firstNameOf("Alvarez, Jennifer")).toBe("Jennifer");
    expect(firstNameOf("Chen, Dr. Sarah")).toBe("Sarah");
  });

  it("copes with messy spacing and empty values", () => {
    expect(firstNameOf("  Jennifer   Alvarez  ")).toBe("Jennifer");
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf(undefined)).toBe("");
  });
});

describe("greetingName", () => {
  it("prefers a separately stored first name", () => {
    expect(greetingName("Jenny", "Jennifer Alvarez")).toBe("Jenny");
  });

  it("falls back to the full name for records predating the first/last split", () => {
    expect(greetingName("", "Jennifer Alvarez")).toBe("Jennifer");
    expect(greetingName(null, "Dr. Sarah Chen")).toBe("Sarah");
  });

  it("is empty when there's nothing to go on", () => {
    expect(greetingName("", "")).toBe("");
  });
});
