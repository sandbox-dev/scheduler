"use client";

import { useRef, useState, useTransition } from "react";

// A text field that only commits on an explicit Save click (Enter also
// works), never on blur — for anywhere accidental edits are a real risk
// (e.g. clicking away mid-edit shouldn't silently change saved data).
// Originally built for Staff email/phone; reused wherever else that same
// concern applies, since it's the same underlying pattern each time.
export function SavableField({
  onSave,
  defaultValue,
  type = "text",
  placeholder,
  width,
  className = "field-input",
  inputStyle,
}: {
  onSave: (value: string) => void;
  defaultValue: string;
  type?: string;
  placeholder?: string;
  width?: number;
  className?: string;
  inputStyle?: React.CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const value = inputRef.current!.value.trim();
    startTransition(() => onSave(value));
    setDirty(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        ref={inputRef}
        type={type}
        className={className}
        style={{ width, ...inputStyle }}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onChange={(e) => setDirty(e.target.value.trim() !== defaultValue)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) {
            e.preventDefault();
            save();
          }
        }}
      />
      {dirty && (
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: "2px 8px", fontSize: 11 }}
          disabled={pending}
          onClick={save}
        >
          Save
        </button>
      )}
    </div>
  );
}
