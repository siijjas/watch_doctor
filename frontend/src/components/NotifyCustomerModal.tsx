import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import * as apiService from '../services/apiService';
import type { NotificationPreview } from '../services/apiService';

interface NotifyCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderName: string;
    orderStatus: string;
    onSuccess?: () => void;
}

type ModalPhase = 'loading' | 'preview' | 'sending' | 'success' | 'error';

export const NotifyCustomerModal: React.FC<NotifyCustomerModalProps> = ({
    isOpen,
    onClose,
    orderName,
    orderStatus,
    onSuccess,
}) => {
    const [phase, setPhase] = useState<ModalPhase>('loading');
    const [preview, setPreview] = useState<NotificationPreview | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        if (!isOpen) return;
        setPhase('loading');
        setPreview(null);
        setErrorMsg('');

        apiService.previewNotification(orderName)
            .then(data => {
                setPreview(data);
                setPhase('preview');
            })
            .catch(err => {
                let msg = err.message || String(err);
                try {
                    const parsed = JSON.parse(msg);
                    msg = parsed._server_messages
                        ? JSON.parse(parsed._server_messages)[0]
                        : msg;
                } catch { /* non-JSON error, use raw */ }
                setErrorMsg(msg);
                setPhase('error');
            });
    }, [isOpen, orderName, fetchKey]);

    const handleSend = async () => {
        setPhase('sending');
        try {
            await apiService.notifyCustomer(orderName);
            setPhase('success');
            onSuccess?.();
            setTimeout(onClose, 2500);
        } catch (err: any) {
            let msg = err.message || String(err);
            try {
                const parsed = JSON.parse(msg);
                msg = parsed._server_messages
                    ? JSON.parse(parsed._server_messages)[0]
                    : msg;
            } catch { /* non-JSON error, use raw */ }
            setErrorMsg(msg);
            setPhase('error');
        }
    };

    const handleClose = () => {
        if (phase !== 'sending') onClose();
    };

    const handleRetry = () => {
        if (preview) {
            setPhase('preview');
        } else {
            setFetchKey(k => k + 1);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Notify Customer via WhatsApp"
            maxWidthClass="max-w-md"
        >

            {/* ── Loading ── */}
            {phase === 'loading' && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div
                        className="animate-spin rounded-full h-10 w-10"
                        style={{
                            borderTop: '3px solid #25D366',
                            borderBottom: '3px solid #25D366',
                            borderLeft: '3px solid transparent',
                            borderRight: '3px solid transparent',
                        }}
                    />
                    <p className="text-sm text-gray-500">Preparing message preview…</p>
                </div>
            )}

            {/* ── Preview / Sending ── */}
            {(phase === 'preview' || phase === 'sending') && preview && (
                <div className="space-y-4">
                    {/* Recipient */}
                    <div
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: '#F9F7F4', border: '1px solid #F0EEEB' }}
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-base font-bold"
                            style={{ backgroundColor: '#25D366' }}
                        >
                            {preview.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 truncate">{preview.customer_name}</p>
                            <p className="text-sm text-gray-500">{preview.phone_display || '—'}</p>
                        </div>
                        <span
                            className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{ backgroundColor: '#E6F9ED', color: '#166534' }}
                        >
                            WhatsApp
                        </span>
                    </div>

                    {/* Message preview bubble */}
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                            Message preview
                        </p>
                        <div
                            className="rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap shadow-sm"
                            style={{ backgroundColor: '#DCF8C6' }}
                        >
                            {preview.message_body}
                        </div>
                    </div>

                    {/* Status context */}
                    <p className="text-xs text-gray-400 text-center">
                        Template for order status:{' '}
                        <span className="font-medium text-gray-600">"{orderStatus}"</span>
                    </p>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-3" style={{ borderTop: '1px solid #F0EEEB' }}>
                        <Button variant="ghost" onClick={handleClose} disabled={phase === 'sending'}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSend}
                            disabled={phase === 'sending'}
                            className="gap-2 text-white hover:opacity-90 focus:ring-green-400"
                            style={{ backgroundColor: '#25D366' }}
                        >
                            {phase === 'sending' ? (
                                <>
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Sending…
                                </>
                            ) : (
                                '📤 Send Message'
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Success ── */}
            {phase === 'success' && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#E6F9ED' }}
                    >
                        <span className="text-4xl">✅</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">Notification Queued!</p>
                    <p className="text-sm text-gray-500">
                        Your message to{' '}
                        <span className="font-medium text-gray-700">{preview?.customer_name}</span>{' '}
                        is being delivered via WhatsApp.
                    </p>
                    <p className="text-xs text-gray-400">Closing automatically…</p>
                </div>
            )}

            {/* ── Error ── */}
            {phase === 'error' && (
                <div className="space-y-4">
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: '#FEE2E2' }}
                        >
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <p className="font-semibold text-gray-900">Could not proceed</p>
                        <p
                            className="text-sm text-red-700 px-4 py-2 rounded-xl w-full"
                            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
                        >
                            {errorMsg}
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 pt-3" style={{ borderTop: '1px solid #F0EEEB' }}>
                        <Button variant="ghost" onClick={handleClose}>Close</Button>
                        <Button onClick={handleRetry}>
                            {preview ? 'Try Again' : 'Retry'}
                        </Button>
                    </div>
                </div>
            )}

        </Modal>
    );
};
