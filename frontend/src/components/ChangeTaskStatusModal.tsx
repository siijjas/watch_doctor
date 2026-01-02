import React, { useState } from 'react';
import { TaskStatus } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface ChangeTaskStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (status: TaskStatus) => Promise<void>;
    currentStatus: TaskStatus;
    taskName: string;
}

export const ChangeTaskStatusModal: React.FC<ChangeTaskStatusModalProps> = ({
    isOpen,
    onClose,
    onSave,
    currentStatus,
    taskName
}) => {
    const [status, setStatus] = useState(currentStatus);
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (status === currentStatus) {
            alert('Status has not changed');
            return;
        }

        // Show confirmation dialog
        setShowConfirm(true);
    };

    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            await onSave(status); // This includes both save AND refresh
            // Wait a moment for the refresh to complete before closing
            await new Promise(resolve => setTimeout(resolve, 500));
            setShowConfirm(false);
            onClose(); // Close the main modal after successful save and refresh
        } catch (error) {
            alert('Failed to update status: ' + error);
            setShowConfirm(false); // Close confirm dialog on error
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Change Task Status">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Task</p>
                    <p className="text-gray-900 dark:text-gray-100">{taskName}</p>
                </div>

                <Select
                    label="New Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                    {Object.values(TaskStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Select>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Updating...' : 'Update Status'}
                    </Button>
                </div>
            </form>

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleConfirm}
                title="Change Task Status"
                message={`Change "${taskName}" status from "${currentStatus}" to "${status}"?`}
                confirmText="Update Status"
            />
        </Modal>
    );
};
