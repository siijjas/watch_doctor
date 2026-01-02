import React, { useState, useEffect } from 'react';

export interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', duration = 3000, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColor = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    }[type];

    const icon = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
    }[type];

    return (
        <div className="fixed top-4 right-4 z-[100] animate-slide-in">
            <div className={`${bgColor} text-white px-6 py-4 rounded-xl shadow-lg flex items-center space-x-3 min-w-[300px]`}>
                <span className="text-xl">{icon}</span>
                <div className="flex-1">
                    <p className="font-medium">{message}</p>
                </div>
                <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
            </div>
        </div>
    );
};

// Hook for easy toast management
export const useToast = () => {
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
    };

    const hideToast = () => {
        setToast(null);
    };

    const ToastComponent = toast ? (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
    ) : null;

    return { showToast, ToastComponent };
};

export default Toast;
