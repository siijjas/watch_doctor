import React, { useState } from 'react';
import type { RepairOrder, RepairTaskTemplate, Item } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';

interface CreateQuotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (quotationType: 'Estimate' | 'Final', watchIndices?: number[]) => Promise<void>;
    order: RepairOrder;
    taskTemplates: RepairTaskTemplate[];
    allItems: Item[];
}

export const CreateQuotationModal: React.FC<CreateQuotationModalProps> = ({
    isOpen,
    onClose,
    onSave,
    order,
    taskTemplates,
    allItems
}) => {
    const [quotationType, setQuotationType] = useState<'Estimate' | 'Final'>('Estimate');
    const [selectionMode, setSelectionMode] = useState<'all' | 'specific'>('all');
    const [selectedWatchIndices, setSelectedWatchIndices] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleWatchToggle = (index: number) => {
        setSelectedWatchIndices(prev => {
            if (prev.includes(index)) {
                return prev.filter(i => i !== index);
            } else {
                return [...prev, index];
            }
        });
    };

    const handleSelectAll = () => {
        setSelectedWatchIndices(order.items.map((_, idx) => idx));
    };

    const handleDeselectAll = () => {
        setSelectedWatchIndices([]);
    };

    const calculateWatchCost = (watchIndex: number) => {
        const item = order.items[watchIndex];
        if (!item) return 0;

        const tasksCost = (item.tasks || []).reduce((sum, task) => {
            const template = taskTemplates.find(t => t.name === task.service);
            const effectiveRate = task.rate || template?.default_rate || 0;
            return sum + effectiveRate;
        }, 0);

        const partsCost = (item.parts_used || []).reduce((sum, part) => {
            const sparePart = allItems.find(i => i.name === part.part);
            const effectiveRate = part.rate || sparePart?.standard_rate || 0;
            return sum + (effectiveRate * part.quantity);
        }, 0);

        return tasksCost + partsCost;
    };

    const getTotalAmount = () => {
        if (selectionMode === 'all') {
            return order.items.reduce((sum, _, idx) => sum + calculateWatchCost(idx), 0);
        } else {
            return selectedWatchIndices.reduce((sum, idx) => sum + calculateWatchCost(idx), 0);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (selectionMode === 'specific' && selectedWatchIndices.length === 0) {
            alert('Please select at least one watch');
            return;
        }

        setIsSaving(true);
        try {
            const watchIndices = selectionMode === 'all' ? undefined : selectedWatchIndices;
            await onSave(quotationType, watchIndices);
            onClose();
        } catch (error) {
            alert('Failed to create quotation: ' + error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Quotation">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Quotation Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Quotation Type
                    </label>
                    <Select
                        value={quotationType}
                        onChange={(e) => setQuotationType(e.target.value as 'Estimate' | 'Final')}
                    >
                        <option value="Estimate">Estimate (Before Repairs)</option>
                        <option value="Final">Final (After Repairs)</option>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {quotationType === 'Estimate'
                            ? 'Create an estimated quotation based on initial assessment'
                            : 'Create a final quotation with actual costs after completing repairs'}
                    </p>
                </div>

                {/* Watch Selection Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Watch Selection
                    </label>
                    <Select
                        value={selectionMode}
                        onChange={(e) => {
                            setSelectionMode(e.target.value as 'all' | 'specific');
                            if (e.target.value === 'all') {
                                setSelectedWatchIndices([]);
                            }
                        }}
                    >
                        <option value="all">All Watches ({order.items.length})</option>
                        <option value="specific">Specific Watches</option>
                    </Select>
                </div>

                {/* Watch Selection List */}
                {selectionMode === 'specific' && (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Select Watches
                            </label>
                            <div className="space-x-2">
                                <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll}>
                                    Select All
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAll}>
                                    Deselect All
                                </Button>
                            </div>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                            {order.items.map((item, index) => {
                                const watchCost = calculateWatchCost(index);
                                const isSelected = selectedWatchIndices.includes(index);

                                return (
                                    <label
                                        key={index}
                                        className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleWatchToggle(index)}
                                            className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-gray-100">
                                                {item.watch_brand} {item.watch_model}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                S/N: {item.serial_number} • Status: {item.status}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {item.tasks?.length || 0} task(s) • {item.parts_used?.length || 0} part(s)
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold text-green-600 dark:text-green-400">
                                                ${watchCost.toFixed(2)}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Preview Summary */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Quotation Preview</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Type:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{quotationType}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Watches:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                {selectionMode === 'all'
                                    ? `All ${order.items.length} watch(es)`
                                    : `${selectedWatchIndices.length} selected`}
                            </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Total Amount:</span>
                            <span className="font-bold text-lg text-green-600 dark:text-green-400">
                                ${getTotalAmount().toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSaving || (selectionMode === 'specific' && selectedWatchIndices.length === 0)}
                    >
                        {isSaving ? 'Creating...' : 'Create Quotation'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
