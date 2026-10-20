import React, { useRef } from 'react';
import { cx } from './primitives';
import { Icon } from './Icon';

export interface Photo {
    id: string;
    url: string;
    label?: string;
    /** True while uploading. */
    pending?: boolean;
}

interface PhotoRowProps {
    photos: Photo[];
    onAdd?: (files: File[]) => void;
    onRemove?: (photo: Photo) => void;
    onOpen?: (photo: Photo) => void;
    max?: number;
    label?: string;
}

/**
 * Thumbnails with a camera button. On phones `capture` opens the rear
 * camera directly; on desk it is a normal file picker.
 */
export const PhotoRow: React.FC<PhotoRowProps> = ({ photos, onAdd, onRemove, onOpen, max = 12, label = 'Photos' }) => {
    const input = useRef<HTMLInputElement>(null);
    const full = photos.length >= max;
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
            {photos.map(p => (
                <div key={p.id} className="relative w-[72px] h-[72px] rounded-[12px] overflow-hidden border border-dw-border bg-dw-sunken">
                    <button type="button" onClick={() => onOpen?.(p)} className="block w-full h-full" aria-label={`Open ${p.label || 'photo'}`}>
                        <img src={p.url} alt={p.label || ''} className={cx('w-full h-full object-cover', p.pending && 'opacity-50')} />
                    </button>
                    {onRemove && !p.pending && (
                        <button
                            type="button"
                            onClick={() => onRemove(p)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[rgba(31,41,51,.7)] text-white flex items-center justify-center"
                            aria-label={`Remove ${p.label || 'photo'}`}
                        >
                            <Icon name="x" size={12} strokeWidth={2.4} />
                        </button>
                    )}
                </div>
            ))}
            {onAdd && !full && (
                <>
                    <button
                        type="button"
                        onClick={() => input.current?.click()}
                        className="w-[72px] h-[72px] rounded-[12px] border-2 border-dashed border-dw-border-strong text-dw-caption hover:text-dw-accent hover:border-dw-accent flex flex-col items-center justify-center gap-1"
                    >
                        <Icon name="camera" size={20} />
                        <span className="text-[11px] font-bold">Add</span>
                    </button>
                    <input
                        ref={input}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={e => {
                            const files = Array.from(e.target.files ?? []).slice(0, max - photos.length);
                            if (files.length) onAdd(files);
                            e.target.value = '';
                        }}
                    />
                </>
            )}
        </div>
    );
};
