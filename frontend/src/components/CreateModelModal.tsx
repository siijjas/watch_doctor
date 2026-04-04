import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import * as apiService from '../services/apiService';
import type { WatchModel } from '../types';

interface CreateModelModalProps {
    isOpen: boolean;
    onClose: () => void;
    brand: string;
    initialName?: string;
    onModelCreated: (model: WatchModel) => void;
}

const toTitleCase = (value: string): string =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

export const CreateModelModal: React.FC<CreateModelModalProps> = ({ isOpen, onClose, brand, initialName = '', onModelCreated }) => {
    const [modelName, setModelName] = useState(initialName);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setModelName(initialName);
            setDescription('');
            setError('');
        }
    }, [isOpen, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!brand) {
            setError('Brand is required to create a model');
            return;
        }

        if (!modelName.trim()) {
            setError('Model Name is required');
            return;
        }

        const normalizedModelName = toTitleCase(modelName);

        setIsSubmitting(true);
        try {
            const newModel = await apiService.createWatchModel(brand, normalizedModelName, description);
            onModelCreated(newModel);
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to create model: ' + (err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Create New Model for ${brand}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                <div className="text-sm text-gray-500">
                    Creating model for brand: <span className="font-semibold text-gray-900 dark:text-gray-100">{brand}</span>
                </div>

                <Input
                    label="Model Name"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    onBlur={() => setModelName((prev) => toTitleCase(prev))}
                    placeholder="e.g. Submariner"
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
                        {isSubmitting ? 'Creating...' : 'Create Model'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
