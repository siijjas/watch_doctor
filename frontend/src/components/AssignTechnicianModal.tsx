import React, { useState } from 'react';
import type { Employee, RepairItem } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface AssignTechnicianModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (technicianId: string) => Promise<void>;
    currentTechnician?: string;
    employees: Employee[];
    watchItem: RepairItem;
}

export const AssignTechnicianModal: React.FC<AssignTechnicianModalProps> = ({
    isOpen,
    onClose,
    onSave,
    currentTechnician,
    employees,
    watchItem
}) => {
    const [technician, setTechnician] = useState(currentTechnician || '');
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (technician === currentTechnician) {
            alert('Technician has not changed');
            return;
        }

        // Show confirmation dialog
        setShowConfirm(true);
    };

    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            await onSave(technician); // This includes both save AND refresh
            // Wait a moment for the refresh to complete before closing
            await new Promise(resolve => setTimeout(resolve, 500));
            setShowConfirm(false);
            onClose(); // Close the main modal after successful save and refresh
        } catch (error) {
            alert('Failed to assign technician: ' + error);
            setShowConfirm(false); // Close confirm dialog on error
        } finally {
            setIsSaving(false);
        }
    };

    const currentTechName = employees.find(e => e.name === currentTechnician)?.employee_name || 'Unassigned';
    const newTechName = technician ? employees.find(e => e.name === technician)?.employee_name : 'None';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Assign Technician">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Watch</p>
                    <p className="text-gray-900 dark:text-gray-100">
                        {watchItem.watch_brand} {watchItem.watch_model}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">S/N: {watchItem.serial_number}</p>
                </div>

                <Select
                    label="Technician"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                >
                    <option value="">-- Unassigned --</option>
                    {employees.map(emp => (
                        <option key={emp.name} value={emp.name}>
                            {emp.employee_name}
                        </option>
                    ))}
                </Select>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Assign Technician'}
                    </Button>
                </div>
            </form>

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleConfirm}
                title="Assign Technician"
                message={`Change technician from "${currentTechName}" to "${newTechName}"?`}
                confirmText="Assign"
            />
        </Modal>
    );
};
