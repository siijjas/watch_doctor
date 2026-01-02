import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import * as apiService from '../services/apiService';
import type { WatchBrand } from '../types';

interface CreateBrandModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialName?: string;
    onBrandCreated: (brand: WatchBrand) => void;
}

export const CreateBrandModal: React.FC<CreateBrandModalProps> = ({ isOpen, onClose, initialName = '', onBrandCreated }) => {
    const [brandName, setBrandName] = useState(initialName);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setBrandName(initialName);
            setDescription('');
            setError('');
        }
    }, [isOpen, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!brandName.trim()) {
            setError('Brand Name is required');
            return;
        }

        setIsSubmitting(true);
        try {
            const newBrand = await apiService.createWatchBrand(brandName, description);
            onBrandCreated(newBrand);
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to create brand: ' + (err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Brand">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                <Input
                    label="Brand Name"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Rolex"
                    required
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Additional details..."
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Brand'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
