import React, { useState } from 'react';
import type { RepairItem } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

export interface WatchDetailsFields {
    serial_number: string;
    case_type: string;
    strap_bracelet: string;
    watch_type: string;
    dial: string;
}

interface WatchDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (fields: WatchDetailsFields) => Promise<void>;
    watchItem: RepairItem;
}

export const WatchDetailsModal: React.FC<WatchDetailsModalProps> = ({
    isOpen,
    onClose,
    onSave,
    watchItem,
}) => {
    const [serialNumber, setSerialNumber] = useState(watchItem.serial_number || '');
    const [caseType, setCaseType] = useState(watchItem.case_type || '');
    const [strapBracelet, setStrapBracelet] = useState(watchItem.strap_bracelet || '');
    const [watchType, setWatchType] = useState(watchItem.watch_type || '');
    const [dial, setDial] = useState(watchItem.dial || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({
                serial_number: serialNumber,
                case_type: caseType,
                strap_bracelet: strapBracelet,
                watch_type: watchType,
                dial,
            });
            onClose();
        } catch (error: any) {
            alert(`Failed to save watch details: ${error.message || error}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Watch Details">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Watch</p>
                    <p className="text-gray-900 dark:text-gray-100">
                        {watchItem.watch_brand} {watchItem.watch_model}
                    </p>
                </div>

                <Input
                    label="Serial Number"
                    placeholder="Optional"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Case Type"
                        placeholder="e.g. Stainless Steel"
                        value={caseType}
                        onChange={(e) => setCaseType(e.target.value)}
                    />
                    <Input
                        label="Strap / Bracelet"
                        placeholder="e.g. Leather Strap"
                        value={strapBracelet}
                        onChange={(e) => setStrapBracelet(e.target.value)}
                    />
                    <Select
                        label="Watch Type"
                        value={watchType}
                        onChange={(e) => setWatchType(e.target.value)}
                    >
                        <option value="">Select...</option>
                        <option value="Mechanical">Mechanical</option>
                        <option value="Automatic">Automatic</option>
                        <option value="Quartz">Quartz</option>
                        <option value="Other">Other</option>
                    </Select>
                    <Input
                        label="Dial"
                        placeholder="e.g. Black Dial"
                        value={dial}
                        onChange={(e) => setDial(e.target.value)}
                    />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Details'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
