"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState, type JSX } from "react";

interface LabelListEditorProps {
  labels: string[];
  onChange: (labels: string[]) => void;
  addPlaceholder?: string;
  disabled?: boolean;
}

export const LabelListEditor = ({
  labels,
  onChange,
  addPlaceholder = "Add label",
  disabled = false
}: LabelListEditorProps): JSX.Element => {
  const [draft, setDraft] = useState("");

  const addLabel = (): void => {
    const value = draft.trim();
    if (!value || labels.includes(value)) {
      return;
    }
    onChange([...labels, value]);
    setDraft("");
  };

  const removeLabel = (index: number): void => {
    onChange(labels.filter((_, i) => i !== index));
  };

  const moveLabel = (index: number, direction: -1 | 1): void => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= labels.length) {
      return;
    }
    const next = [...labels];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm"
          >
            <span>{label}</span>
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => moveLabel(index, -1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  aria-label={`Move ${label} up`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveLabel(index, 1)}
                  disabled={index === labels.length - 1}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  aria-label={`Move ${label} down`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeLabel(index)}
                  className="rounded p-0.5 text-gray-400 hover:text-red-600"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </span>
        ))}
        {labels.length === 0 && (
          <span className="text-sm text-gray-400">No labels configured</span>
        )}
      </div>

      {!disabled && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLabel();
              }
            }}
            placeholder={addPlaceholder}
            className="flex-1 rounded border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addLabel}
            disabled={!draft.trim()}
            className="rounded border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};
