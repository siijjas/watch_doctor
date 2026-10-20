/**
 * Scan a bag label (spec Phase 5). The label's QR is the order's staff link,
 * so the phone's own camera app already opens it; this sheet does the same
 * inside the app where the browser can read codes (BarcodeDetector, e.g.
 * Chrome on Android), and otherwise takes the tag or order number typed in.
 */
import React, { useEffect, useRef, useState } from 'react';
import { navigate, path as buildPath } from '../../router';
import { Button, Sheet, TextInput } from '../../design/kit';

interface Detector { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const detectorCtor = (): DetectorCtor | null =>
    (typeof window !== 'undefined' && 'BarcodeDetector' in window ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector : null);

/** Where a scanned or typed value leads: an order link, an order number, or a search. */
export const routeForCode = (raw: string): string => {
    const v = raw.trim();
    const link = v.match(/\/repair\/orders\/([^/?#\s]+)/);
    if (link) return buildPath('orders', decodeURIComponent(link[1]));
    if (/^\d{8}$/.test(v)) return buildPath('orders', v);
    return `/orders?q=${encodeURIComponent(v)}`;
};

export const ScanSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const video = useRef<HTMLVideoElement>(null);
    const [state, setState] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting');
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (!open) return;
        const Ctor = detectorCtor();
        if (!Ctor || !navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
        let stream: MediaStream | null = null;
        let timer = 0;
        let stopped = false;
        setState('starting');
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                if (stopped) return;
                const v = video.current!;
                v.srcObject = stream;
                await v.play();
                setState('scanning');
                const detector = new Ctor({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] });
                const tick = async () => {
                    if (stopped) return;
                    try {
                        const hits = await detector.detect(v);
                        if (hits[0]?.rawValue) { onClose(); navigate(routeForCode(hits[0].rawValue)); return; }
                    } catch { /* frame not ready */ }
                    timer = window.setTimeout(() => void tick(), 250);
                };
                void tick();
            } catch {
                setState('denied');
            }
        })();
        return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
    }, [open, onClose]);

    const go = () => { if (typed.trim()) { onClose(); navigate(routeForCode(typed)); setTyped(''); } };

    return (
        <Sheet open={open} onClose={onClose} title="Scan a bag label" description="Point the camera at the QR on the label.">
            <div className="flex flex-col gap-3">
                {state === 'scanning' || state === 'starting' ? (
                    <div className="relative rounded-dw-control overflow-hidden bg-black aspect-square max-h-[60vh]">
                        <video ref={video} muted playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-[18%] border-2 border-white/80 rounded-[14px] pointer-events-none" aria-hidden="true" />
                        {state === 'starting' && <p className="absolute inset-x-0 bottom-3 m-0 text-center text-[13px] font-bold text-white">Starting the camera…</p>}
                    </div>
                ) : (
                    <p className="m-0 p-3 rounded-dw-control bg-dw-ground text-[13px] text-dw-body leading-relaxed">
                        {state === 'denied'
                            ? 'The camera is blocked for this site. Allow it in the browser settings, or type the number below.'
                            : 'This browser cannot read codes in the app. Open the phone’s camera app and point it at the label: it opens the order directly. Or type the number below.'}
                    </p>
                )}
                <div className="flex gap-2">
                    <TextInput value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} placeholder="Tag or order number" aria-label="Tag or order number" inputMode="search" />
                    <Button variant="primary" disabled={!typed.trim()} onClick={go}>Open</Button>
                </div>
            </div>
        </Sheet>
    );
};
