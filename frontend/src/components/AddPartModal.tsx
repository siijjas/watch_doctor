import React, { useState } from 'react';
import type { RepairPartUsed, RepairItem, Item, RepairTask, RepairTaskTemplate } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Autocomplete } from './ui/Autocomplete';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface AddPartModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (part: RepairPartUsed, markTaskCompleted?: boolean) => Promise<void>;
    watchItem: RepairItem;
    allItems: Item[];
    taskTemplates: RepairTaskTemplate[];
    initialTask?: string;
}

export const AddPartModal: React.FC<AddPartModalProps> = ({
    isOpen,
    onClose,
    onSave,
    watchItem,
    allItems,
    taskTemplates,
    initialTask
}) => {
    const [formData, setFormData] = useState<RepairPartUsed>({
        part: '',
        quantity: 1,
        uom: 'Unit',
        task: initialTask || ''
    });
    const [searchResults, setSearchResults] = useState<Item[]>(allItems);
    const [markTaskCompleted, setMarkTaskCompleted] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Filter tasks that belong to this watch item
    const availableTasks = watchItem?.tasks || [];

    // Reset task when initialTask changes (e.g. reopening modal with different task)
    React.useEffect(() => {
        if (isOpen && initialTask) {
            setFormData(prev => ({ ...prev, task: initialTask }));
        } else if (isOpen && !initialTask) {
            setFormData(prev => ({ ...prev, task: '' }));
        }
    }, [isOpen, initialTask]);

    // Filter tasks that belong to this watch item
    // const availableTasks = watchItem?.tasks || [];

    const handleSearch = async (query: string) => {
        const results = await apiService.searchItems(query);
        setSearchResults(results);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.part) {
            alert('Please select a part');
            return;
        }

        if (formData.quantity <= 0) {
            alert('Quantity must be greater than 0');
            return;
        }

        // Show confirmation dialog
        setShowConfirm(true);
    };

    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            await onSave(formData, markTaskCompleted);
            // Reset form
            setFormData({
                part: '',
                quantity: 1,
                uom: 'Unit',
                task: ''
            });
            setMarkTaskCompleted(false);
            setShowConfirm(false);
            onClose();
        } catch (error) {
            alert('Failed to add part: ' + error);
        } finally {
            setIsSaving(false);
        }
    };

    const selectedPart = searchResults.find(p => p.name === formData.part);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Part">
            <form onSubmit={handleSubmit} className="space-y-4">
                <Autocomplete
                    label="Part"
                    placeholder="Type to search: item code, name, or description..."
                    options={searchResults.map(p => ({
                        value: p.name,
                        label: `${p.item_code || p.name} - ${p.item_name}`,
                        subtitle: `Stock: ${p.stock_qty || 0} ${p.stock_uom || ''} | Price: $${p.standard_rate || 0}`
                    }))}
                    value={formData.part}
                    onChange={(value) => {
                        setFormData(prev => ({ ...prev, part: value }));
                        // Auto-fill UOM
                        const item = searchResults.find(p => p.name === value);
                        if (item) {
                            setFormData(prev => ({ ...prev, uom: item.stock_uom }));
                        }
                    }}
                    onSearch={handleSearch}
                />

                {selectedPart && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <p className="font-semibold text-gray-700 dark:text-gray-300">Item Code:</p>
                                <p>{selectedPart.item_code}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-700 dark:text-gray-300">Item Name:</p>
                                <p>{selectedPart.item_name}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-700 dark:text-gray-300">Stock Balance:</p>
                                <p className="font-medium text-blue-600 dark:text-blue-400">{selectedPart.stock_qty || 0} {selectedPart.stock_uom}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-700 dark:text-gray-300">Price:</p>
                                <p className="font-medium text-green-600 dark:text-green-400">${selectedPart.standard_rate || 0}</p>
                            </div>
                        </div>
                        {selectedPart.description && <p className="italic mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">{selectedPart.description}</p>}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Quantity"
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                        min="0"
                        step="0.01"
                        required
                    />
                    <Input
                        label="UOM"
                        value={formData.uom}
                        readOnly
                        className="bg-gray-100 dark:bg-gray-700"
                    />
                </div>

                {/* Task Linking */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link to Task (Optional)</label>
                    <select
                        value={formData.task || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, task: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                        <option value="">-- No Task --</option>
                        {availableTasks.map((task, idx) => {
                            const template = taskTemplates.find(t => t.name === task.service);
                            const displayName = template ? template.task_name : task.service;
                            // Use task name if available, else fallback to index based ID
                            const value = task.name || `task_${idx}`;
                            return (
                                <option key={value} value={value}>
                                    {displayName} ({task.status})
                                </option>
                            );
                        })}
                    </select>

                    {formData.task && (
                        <div className="mt-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={markTaskCompleted}
                                    onChange={(e) => setMarkTaskCompleted(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                    Mark linked task as <strong>Completed</strong>
                                </span>
                            </label>
                        </div>
                    )}
                </div>


                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Adding...' : 'Add Part'}
                    </Button>
                </div>
            </form>

            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleConfirm}
                title="Add Part"
                message={`Add ${formData.quantity} x ${selectedPart?.item_name || formData.part}?`}
                confirmText="Add Part"
            />
        </Modal>
    );
};
