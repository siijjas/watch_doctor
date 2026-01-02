import React, { useState } from 'react';
import type { RepairItem, RepairTask, RepairPartUsed, RepairTaskTemplate, Item } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface UpdatePriceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedTasks: RepairTask[], updatedParts: RepairPartUsed[]) => Promise<void>;
    watchItem: RepairItem;
    taskTemplates: RepairTaskTemplate[];
    allItems: Item[];
}

interface TaskPriceUpdate {
    index: number;
    name: string;
    service: string;
    autoRate: number;
    currentRate: number | null;
    newRate: number | null;
}

interface PartPriceUpdate {
    index: number;
    name: string;
    part: string;
    quantity: number;
    autoRate: number;
    currentRate: number | null;
    newRate: number | null;
}

export const UpdatePriceModal: React.FC<UpdatePriceModalProps> = ({
    isOpen,
    onClose,
    onSave,
    watchItem,
    taskTemplates,
    allItems
}) => {
    // Initialize task prices
    const [taskPrices, setTaskPrices] = useState<TaskPriceUpdate[]>(() => {
        return (watchItem.tasks || []).map((task, index) => {
            const template = taskTemplates.find(t => t.name === task.service);
            const autoRate = template?.default_rate || 0;
            return {
                index,
                name: task.name || '',
                service: task.service,
                autoRate,
                currentRate: task.rate || null,
                newRate: task.rate || null
            };
        });
    });

    // Initialize part prices
    const [partPrices, setPartPrices] = useState<PartPriceUpdate[]>(() => {
        return (watchItem.parts_used || []).map((part, index) => {
            const item = allItems.find(i => i.name === part.part);
            const autoRate = item?.standard_rate || 0;
            return {
                index,
                name: part.name || '',
                part: part.part,
                quantity: part.quantity,
                autoRate,
                currentRate: part.rate || null,
                newRate: part.rate || null
            };
        });
    });

    const [isSaving, setIsSaving] = useState(false);

    const handleTaskPriceChange = (index: number, value: string) => {
        setTaskPrices(prev => prev.map((task, i) => {
            if (i === index) {
                const newRate = value === '' ? null : parseFloat(value);
                return { ...task, newRate };
            }
            return task;
        }));
    };

    const handlePartPriceChange = (index: number, value: string) => {
        setPartPrices(prev => prev.map((part, i) => {
            if (i === index) {
                const newRate = value === '' ? null : parseFloat(value);
                return { ...part, newRate };
            }
            return part;
        }));
    };

    const handleResetTaskPrice = (index: number) => {
        setTaskPrices(prev => prev.map((task, i) => {
            if (i === index) {
                return { ...task, newRate: null };
            }
            return task;
        }));
    };

    const handleResetPartPrice = (index: number) => {
        setPartPrices(prev => prev.map((part, i) => {
            if (i === index) {
                return { ...part, newRate: null };
            }
            return part;
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            // Update tasks with new prices
            const updatedTasks = (watchItem.tasks || []).map((task, index) => {
                const taskPrice = taskPrices[index];
                return {
                    ...task,
                    rate: taskPrice.newRate,
                    price_manually_set: taskPrice.newRate !== null ? 1 : 0
                };
            });

            // Update parts with new prices
            const updatedParts = (watchItem.parts_used || []).map((part, index) => {
                const partPrice = partPrices[index];
                return {
                    ...part,
                    rate: partPrice.newRate,
                    price_manually_set: partPrice.newRate !== null ? 1 : 0
                };
            });

            await onSave(updatedTasks, updatedParts);
            onClose();
        } catch (error) {
            alert('Failed to update prices: ' + error);
        } finally {
            setIsSaving(false);
        }
    };

    const totalTaskCost = taskPrices.reduce((sum, task) => {
        const effectiveRate = task.newRate !== null ? task.newRate : task.autoRate;
        return sum + effectiveRate;
    }, 0);

    const totalPartCost = partPrices.reduce((sum, part) => {
        const effectiveRate = part.newRate !== null ? part.newRate : part.autoRate;
        return sum + (effectiveRate * part.quantity);
    }, 0);

    const totalCost = totalTaskCost + totalPartCost;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Update Prices">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Tasks Section */}
                {taskPrices.length > 0 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Repair Tasks</h3>
                        <div className="space-y-3">
                            {taskPrices.map((task, index) => {
                                const template = taskTemplates.find(t => t.name === task.service);
                                const effectiveRate = task.newRate !== null ? task.newRate : task.autoRate;

                                return (
                                    <div key={index} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {template?.task_name || task.service}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Auto Rate: ${task.autoRate.toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-green-600 dark:text-green-400">
                                                    ${effectiveRate.toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                type="number"
                                                placeholder={`Auto: $${task.autoRate.toFixed(2)}`}
                                                value={task.newRate !== null ? task.newRate : ''}
                                                onChange={(e) => handleTaskPriceChange(index, e.target.value)}
                                                step="0.01"
                                                min="0"
                                                className="flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleResetTaskPrice(index)}
                                                disabled={task.newRate === null}
                                            >
                                                Reset
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Parts Section */}
                {partPrices.length > 0 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Spare Parts</h3>
                        <div className="space-y-3">
                            {partPrices.map((part, index) => {
                                const item = allItems.find(i => i.name === part.part);
                                const effectiveRate = part.newRate !== null ? part.newRate : part.autoRate;
                                const totalAmount = effectiveRate * part.quantity;

                                return (
                                    <div key={index} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {item?.item_name || part.part}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Qty: {part.quantity} × Auto Rate: ${part.autoRate.toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-green-600 dark:text-green-400">
                                                    ${totalAmount.toFixed(2)}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    ${effectiveRate.toFixed(2)} each
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                type="number"
                                                placeholder={`Auto: $${part.autoRate.toFixed(2)}`}
                                                value={part.newRate !== null ? part.newRate : ''}
                                                onChange={(e) => handlePartPriceChange(index, e.target.value)}
                                                step="0.01"
                                                min="0"
                                                className="flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleResetPartPrice(index)}
                                                disabled={part.newRate === null}
                                            >
                                                Reset
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* No items message */}
                {taskPrices.length === 0 && partPrices.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No tasks or parts to update prices for.</p>
                    </div>
                )}

                {/* Total Cost Summary */}
                {(taskPrices.length > 0 || partPrices.length > 0) && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Total Estimated Cost:</span>
                            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                                ${totalCost.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving || (taskPrices.length === 0 && partPrices.length === 0)}>
                        {isSaving ? 'Saving...' : 'Save Prices'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
