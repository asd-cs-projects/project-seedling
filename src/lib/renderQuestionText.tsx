import React from 'react';

/**
 * Render question / option text with fill-in-the-blank placeholders.
 * Any run of 3+ underscores ("___", "_____") OR a literal "[BLANK]" /
 * "[blank]" / "(blank)" marker becomes a visible inline blank slot.
 * Used for vocabulary / fill-in-the-blank style questions imported from
 * PDFs or written by teachers.
 */
export const renderQuestionText = (text?: string | null): React.ReactNode => {
  if (!text) return null;
  // Split on underscores (3+) or [BLANK]/(blank) tokens, keeping the delimiter.
  const parts = text.split(/(_{3,}|\[blank\]|\[BLANK\]|\(blank\))/g);
  return parts.map((part, i) => {
    if (/^_{3,}$/.test(part) || /^\[blank\]$/i.test(part) || /^\(blank\)$/i.test(part)) {
      return (
        <span
          key={i}
          className="inline-block min-w-[5rem] px-2 mx-1 border-b-2 border-primary/60 text-primary/0 select-none align-middle"
          aria-label="blank"
        >
          ____
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
};