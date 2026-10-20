import React, { useEffect, useState } from 'react';
import { Button, EmptyState, Icon, Sheet, Spinner, cx } from '../../design/kit';
import type { Technician } from '../../services/deskApi';
import * as apiService from '../../services/apiService';

interface AssignSheetProps {
    open: boolean;
    onClose: () => void;
    watch: string;
    current?: string | null;
    /** Pass when the caller already has them (order page); otherwise they load. */
    technicians?: Technician[];
    onAssign: (technician: string) => Promise<void>;
}

/** Pick a technician; the open-watch count helps spread the work. */
export const AssignSheet: React.FC<AssignSheetProps> = ({ open, onClose, watch, current, technicians, onAssign }) => {
    const [list, setList] = useState<Technician[] | null>(technicians ?? null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (technicians) { setList(technicians); return; }
        let live = true;
        apiService.getEmployees()
            .then(rows => live && setList(rows.map(r => ({ name: r.name, technician_name: r.employee_name, open_watches: r.open_items ?? 0 }))))
            .catch(() => live && setList([]));
        return () => { live = false; };
    }, [open, technicians]);

    const pick = async (name: string) => {
        setBusy(name);
        try {
            await onAssign(name);
            onClose();
        } finally {
            setBusy(null);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Assign technician" description={watch} dismissable={!busy}>
            {!list ? (
                <div className="flex justify-center py-8 text-dw-caption"><Spinner size={22} /></div>
            ) : list.length === 0 ? (
                <EmptyState icon="users" title="No technicians yet" body="Add technicians under Settings, then assign them here." />
            ) : (
                <div className="flex flex-col gap-2" role="list">
                    {list.map(t => {
                        const on = t.name === current;
                        return (
                            <button
                                key={t.name}
                                type="button"
                                role="listitem"
                                disabled={!!busy}
                                onClick={() => (on ? onClose() : void pick(t.name))}
                                className={cx(
                                    'flex items-center gap-3 min-h-[52px] px-4 rounded-dw-control border text-left',
                                    on ? 'border-dw-accent bg-[#EEF3FC]' : 'border-dw-border bg-dw-surface hover:bg-dw-ground',
                                )}
                            >
                                <span className="w-9 h-9 rounded-full bg-dw-sunken flex items-center justify-center text-[13px] font-extrabold shrink-0">
                                    {t.technician_name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[15px] font-extrabold truncate">{t.technician_name}</span>
                                    <span className="block text-[12px] font-semibold text-dw-caption">{t.open_watches} open {t.open_watches === 1 ? 'watch' : 'watches'}</span>
                                </span>
                                {busy === t.name ? <Spinner /> : on ? <Icon name="check" size={18} className="text-dw-accent" /> : null}
                            </button>
                        );
                    })}
                    {current && (
                        <Button variant="ghost" className="mt-1 text-dw-danger" disabled={!!busy} busy={busy === ''} onClick={() => void pick('')}>
                            Remove technician
                        </Button>
                    )}
                </div>
            )}
        </Sheet>
    );
};
