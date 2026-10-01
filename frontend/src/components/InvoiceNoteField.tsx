import React from 'react';
import { INVOICE_NOTE_MAX_LENGTH, INVOICE_NOTE_PRESETS } from '../constants';

interface InvoiceNoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const noteLines = (value: string): string[] => value.split('\n').map((line) => line.trim()).filter(Boolean);

// Note printed on the invoice: one-tap common lines (warranty etc.) plus free text.
export const InvoiceNoteField: React.FC<InvoiceNoteFieldProps> = ({ value, onChange, disabled }) => {
  const lines = noteLines(value);

  const togglePreset = (preset: string) => {
    const next = lines.includes(preset) ? lines.filter((line) => line !== preset) : [...lines, preset];
    onChange(next.join('\n'));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {INVOICE_NOTE_PRESETS.map((preset) => {
          const isSelected = lines.includes(preset);
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => togglePreset(preset)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={2}
        maxLength={INVOICE_NOTE_MAX_LENGTH}
        placeholder="Printed on the invoice, e.g. warranty period. Leave empty for no note."
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
};
