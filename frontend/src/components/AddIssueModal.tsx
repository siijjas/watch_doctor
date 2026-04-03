import React, { useState } from 'react';
import type { IssueTemplate, RepairTaskTemplate } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface AddIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  issueTemplates: IssueTemplate[];
  taskTemplates: RepairTaskTemplate[];
  currentIssueNames: Set<string>;
  onSave: (selectedIssueNames: string[]) => Promise<void>;
}

export const AddIssueModal: React.FC<AddIssueModalProps> = ({
  isOpen,
  onClose,
  issueTemplates,
  taskTemplates,
  currentIssueNames,
  onSave,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setIsSaving(true);
    try {
      await onSave(Array.from(selected));
      setSelected(new Set());
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  const newSelections = Array.from(selected).filter(n => !currentIssueNames.has(n));

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Issue">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select one or more issues to add to this watch.
        </p>

        <div className="space-y-2">
          {issueTemplates.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">No issue templates found.</p>
          ) : (
            issueTemplates.map(template => {
              const alreadyAdded = currentIssueNames.has(template.name);
              const isChecked = selected.has(template.name);
              return (
                <label
                  key={template.name}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    alreadyAdded
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      : isChecked
                      ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={alreadyAdded}
                    checked={isChecked || alreadyAdded}
                    onChange={() => !alreadyAdded && toggle(template.name)}
                    className="w-4 h-4 mt-0.5 text-orange-500 border-gray-300 rounded focus:ring-orange-400 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {template.issue_name}
                      {alreadyAdded && (
                        <span className="ml-2 text-xs font-normal text-gray-400">Already added</span>
                      )}
                    </p>
                    {template.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{template.description}</p>
                    )}
                    {template.suggested_task && (() => {
                      const taskName = taskTemplates.find(t => t.name === template.suggested_task)?.task_name || template.suggested_task;
                      return (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                          💡 Suggests task: {taskName}
                        </p>
                      );
                    })()}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {newSelections.length > 0 ? `${newSelections.length} issue${newSelections.length > 1 ? 's' : ''} selected` : 'None selected'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={newSelections.length === 0 || isSaving}
            >
              {isSaving ? 'Saving…' : 'Add Issues'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
