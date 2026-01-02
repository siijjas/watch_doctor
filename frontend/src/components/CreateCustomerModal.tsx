import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import * as apiService from '../services/apiService';
import type { Customer } from '../types';

interface CreateCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialName?: string;
    onCustomerCreated: (customer: Customer) => void;
}

interface CountryCode {
    name: string;
    country_name: string;
    code: string;
}

export const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ isOpen, onClose, initialName = '', onCustomerCreated }) => {
    const [name, setName] = useState(initialName);
    const [mobile, setMobile] = useState('');
    const [countryCodes, setCountryCodes] = useState<CountryCode[]>([]);
    const [selectedCode, setSelectedCode] = useState('+91');
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingCodes, setIsLoadingCodes] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadCodes = async () => {
            setIsLoadingCodes(true);
            try {
                const codes = await apiService.getCountryCodes();
                setCountryCodes(codes);
                // Default to India (+91) if available, else first one
                if (codes.length > 0) {
                    const india = codes.find(c => c.code === '+91');
                    setSelectedCode(india ? india.code : codes[0].code);
                }
            } catch (err) {
                console.error("Failed to load country codes:", err);
                // Fallback to basic codes if API fails
                setCountryCodes([
                    { name: 'India', country_name: 'India', code: '+91' },
                    { name: 'USA', country_name: 'United States', code: '+1' }
                ]);
            } finally {
                setIsLoadingCodes(false);
            }
        };

        if (isOpen && countryCodes.length === 0) {
            loadCodes();
        }
    }, [isOpen]); // Load when opened first time

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            // Heuristic: if initialName looks like a number, put it in mobile
            if (/^\d+$/.test(initialName)) {
                setMobile(initialName);
                setName('');
            } else {
                setMobile('');
            }
            setEmail('');
            setError('');
        }
    }, [isOpen, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Customer Name is required');
            return;
        }

        setIsSubmitting(true);
        try {
            // Combine country code and mobile
            const fullMobile = mobile ? `${selectedCode}${mobile}` : undefined;

            const newCustomer = await apiService.createCustomer({
                customer_name: name,
                mobile_no: fullMobile,
                email_id: email
            });
            onCustomerCreated(newCustomer);
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to create customer: ' + (err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Customer">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                <Input
                    label="Customer Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                />

                <div className="grid grid-cols-[100px_1fr] gap-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
                        <select
                            value={selectedCode}
                            onChange={(e) => setSelectedCode(e.target.value)}
                            disabled={isLoadingCodes}
                            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                            {countryCodes.map((c) => (
                                <option key={c.name} value={c.code}>
                                    {c.code} ({c.country_name})
                                </option>
                            ))}
                        </select>
                    </div>
                    <Input
                        label="Mobile Number"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="e.g. 9876543210"
                    />
                </div>

                <Input
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                />

                <div className="flex justify-end space-x-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Customer'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
