import React, { useState } from 'react';
import { Button } from './ui/Button';

interface ItemInternalNoteProps {
  note: string;
  onSave: (note: string) => Promise<void>;
}

// Staff-only note on a watch, for later reference. Never printed or sent to the customer.
export const ItemInternalNote: React.FC<ItemInternalNoteProps> = ({ note, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setDraft(note);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(draft.trim());
      setIsEditing(false);
    } catch (error: any) {
      alert(`Failed to save note: ${error.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3" onClick={(e) => e.stopPropagation()}>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-yellow-800 mb-2">Internal Note</h5>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isSaving}
          rows={3}
          autoFocus
          placeholder="Only staff can see this. Not printed or sent to the customer."
          className="w-full px-3 py-2 rounded border border-yellow-300 bg-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={isSaving} onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" className="text-xs" disabled={isSaving || draft.trim() === note.trim()} onClick={() => void handleSave()}>
            {isSaving ? 'Saving...' : 'Save Note'}
          </Button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); startEditing(); }}
        className="mt-4 w-full text-left text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-lg px-3 py-2 hover:bg-yellow-50 hover:border-yellow-200 transition-colors"
      >
        📝 Add internal note (staff only)
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-yellow-800">📝 Internal Note</h5>
        <button
          onClick={(e) => { e.stopPropagation(); startEditing(); }}
          className="text-xs font-medium text-yellow-800 hover:underline"
        >
          Edit
        </button>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note}</p>
    </div>
  );
};
