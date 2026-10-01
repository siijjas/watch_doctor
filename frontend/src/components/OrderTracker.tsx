import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import type { OrderTrackerData, TrackerRow, TrackerStage, TrackerStageAction } from '../services/apiService';
import { useAppConfig } from '../context/AppConfigContext';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Toast } from './ui/Toast';
import { NotifyCustomerModal } from './NotifyCustomerModal';

export type TrackerTabId = 'all' | 'ready' | 'approval' | 'estimate' | 'workshop' | 'parts' | 'not_started' | 'overdue' | 'attention';

interface OrderTrackerProps {
  onSelectOrder: (orderId: string) => void;
  initialSearch?: string;
  initialTab?: TrackerTabId;
  onViewChange?: (search: string, tab: TrackerTabId) => void;
}

const TABS: { id: TrackerTabId; label: string; matches: (row: TrackerRow) => boolean }[] = [
  { id: 'all', label: 'All in shop', matches: () => true },
  { id: 'ready', label: 'Ready for collection', matches: (row) => row.stage === 'ready' },
  { id: 'approval', label: 'Waiting for customer', matches: (row) => row.stage === 'approval' },
  { id: 'estimate', label: 'Estimate to send', matches: (row) => row.stage === 'estimate' },
  { id: 'workshop', label: 'In workshop', matches: (row) => row.stage === 'workshop' },
  { id: 'parts', label: 'Waiting for parts', matches: (row) => row.stage === 'parts' },
  { id: 'not_started', label: 'Not started', matches: (row) => row.stage === 'not_started' },
  { id: 'overdue', label: 'Past promised date', matches: (row) => row.overdue_days > 0 },
  { id: 'attention', label: 'Needs follow-up', matches: (row) => row.needs_attention },
];

const STAGE_META: Record<TrackerStage, { label: string; badge: string }> = {
  not_started: { label: 'Not started', badge: 'bg-stone-200 text-stone-700' },
  workshop: { label: 'In workshop', badge: 'bg-blue-200 text-blue-700' },
  estimate: { label: 'Estimate to send', badge: 'bg-orange-200 text-orange-700' },
  approval: { label: 'Waiting for customer', badge: 'bg-indigo-100 text-indigo-800' },
  parts: { label: 'Waiting for parts', badge: 'bg-amber-200 text-amber-700' },
  ready: { label: 'Ready for collection', badge: 'bg-emerald-200 text-emerald-700' },
  collected: { label: 'Collected', badge: 'bg-violet-200 text-violet-700' },
};

const PRIORITY_STYLES: { [key: string]: string } = {
  Urgent: 'bg-orange-200 text-orange-700',
  VIP: 'bg-pink-200 text-pink-700',
};

const ACTION_COPY: Record<TrackerStageAction, { button: string; title: string; outcome: string; done: string }> = {
  approve: {
    button: 'Customer approved',
    title: 'Customer approved the estimate?',
    outcome: 'will be marked "Approved", ready for the technician to start.',
    done: 'Marked as approved',
  },
  start: {
    button: 'Start repair',
    title: 'Repair started?',
    outcome: 'will move to "In Repair".',
    done: 'Moved to In Repair',
  },
  parts_wait: {
    button: 'Waiting for parts',
    title: 'Waiting for parts',
    outcome: 'will be listed as waiting for parts.',
    done: 'Marked as waiting for parts',
  },
  parts_arrived: {
    button: 'Parts arrived',
    title: 'Parts arrived?',
    outcome: 'will go back to the workshop list.',
    done: 'Parts hold removed',
  },
  decline: {
    button: 'Declined',
    title: 'Customer declined the estimate?',
    outcome: 'will be marked "Declined" and listed as ready to return.',
    done: 'Marked as declined',
  },
  complete: {
    button: 'Repair finished',
    title: 'Repair finished?',
    outcome: 'will be marked "Completed" and listed as ready for collection.',
    done: 'Marked as ready for collection',
  },
};

// Shown as secondary buttons: they park the watch rather than move it forward.
const SECONDARY_ACTIONS: TrackerStageAction[] = ['decline', 'parts_wait'];

const todayISO = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const EMPTY_DATA: OrderTrackerData = { rows: [], attention_after_days: {}, whatsapp_enabled: false, truncated: false };

const formatDay = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
};

const daysLabel = (days: number): string => (days === 1 ? '1 day' : `${days} days`);

const watchLabel = (row: TrackerRow): string => [row.watch_brand, row.watch_model].filter(Boolean).join(' ');

const stageLabel = (row: TrackerRow): string => {
  if (row.stage === 'ready' && row.watch_status !== 'Completed') return 'Ready to return';
  return STAGE_META[row.stage].label;
};

const stageSince = (row: TrackerRow): string => {
  if (row.stage === 'collected') {
    const collectedOn = formatDay(row.delivery_date || row.status_changed_on);
    return collectedOn ? `on ${collectedOn}` : '';
  }
  if (row.stage === 'parts') {
    if (!row.parts_expected_date) return 'no expected date';
    return row.parts_overdue_days > 0
      ? `part ${daysLabel(row.parts_overdue_days)} late`
      : `part expected ${formatDay(row.parts_expected_date)}`;
  }
  return row.days_in_stage <= 0 ? 'since today' : `for ${daysLabel(row.days_in_stage)}`;
};

const stageActions = (row: TrackerRow): TrackerStageAction[] => {
  if (row.stage === 'collected') return [];
  if (row.stage === 'parts') return ['parts_arrived'];
  if (row.watch_status === 'Quoted') return ['approve', 'decline'];
  if (row.watch_status === 'Approved') return ['start', 'parts_wait'];
  if (row.watch_status === 'In Repair') return ['complete', 'parts_wait'];
  return [];
};

const OrderTracker: React.FC<OrderTrackerProps> = ({ onSelectOrder, initialSearch = '', initialTab = 'all', onViewChange }) => {
  const { formatCurrency } = useAppConfig();
  const [data, setData] = useState<OrderTrackerData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [activeTab, setActiveTab] = useState<TrackerTabId>(initialTab);
  const [pendingAction, setPendingAction] = useState<{ row: TrackerRow; action: TrackerStageAction } | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [partsRow, setPartsRow] = useState<TrackerRow | null>(null);
  const [partsDate, setPartsDate] = useState('');
  const [partsNote, setPartsNote] = useState('');
  const [notifyRow, setNotifyRow] = useState<TrackerRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const latestRequestRef = useRef(0);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    onViewChange?.(search, activeTab);
  }, [search, activeTab, onViewChange]);

  const load = useCallback(async (query: string) => {
    const requestId = ++latestRequestRef.current;
    setIsLoading(true);
    setError('');
    try {
      const result = isErpNext ? await apiService.getOrderTracker(query) : EMPTY_DATA;
      if (requestId !== latestRequestRef.current) return;
      setData(result);
    } catch (err: any) {
      if (requestId !== latestRequestRef.current) return;
      setError(err?.message || 'Could not load the order tracker.');
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(debouncedSearch);
  }, [debouncedSearch, load]);

  const isSearching = debouncedSearch.length > 0;

  const tabCounts = useMemo(() => {
    const counts = {} as Record<TrackerTabId, number>;
    TABS.forEach((tab) => {
      counts[tab.id] = data.rows.filter(tab.matches).length;
    });
    return counts;
  }, [data.rows]);

  const visibleRows = useMemo(() => {
    // Search results keep the server order (open orders first, newest first).
    if (isSearching) return data.rows;
    const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
    return data.rows.filter(tab.matches).sort((a, b) => b.days_in_stage - a.days_in_stage);
  }, [data.rows, activeTab, isSearching]);

  const describe = (row: TrackerRow): string => {
    if (row.stage === 'collected') {
      const collectedOn = formatDay(row.delivery_date || row.status_changed_on);
      return collectedOn ? `Collected on ${collectedOn}.` : 'Already collected.';
    }
    if (row.stage === 'parts') {
      const part = row.parts_note ? ` (${row.parts_note})` : '';
      return row.parts_expected_date
        ? `Waiting for a part${part}. Expected ${formatDay(row.parts_expected_date)}.`
        : `Waiting for a part${part}.`;
    }
    const technician = row.technician || 'the technician';
    switch (row.watch_status) {
      case 'Pending':
        return 'Received. Not yet checked by a technician.';
      case 'Under Diagnosis':
        return `Being checked by ${technician}.`;
      case 'Diagnosed':
      case 'Create Estimate':
        return 'Checked. We are preparing the estimate.';
      case 'Quoted':
        return 'Estimate sent. Waiting for the customer to approve.';
      case 'Approved':
        return 'Estimate approved. Waiting for the technician to start.';
      case 'In Repair':
        return `Being repaired by ${technician}.`;
      case 'Completed':
        if (!row.sales_invoice) return 'Repair finished. Ready for collection, not invoiced yet.';
        return row.balance_amount > 0
          ? `Ready for collection. Balance to pay: ${formatCurrency(row.balance_amount)}.`
          : 'Ready for collection. Fully paid.';
      case 'Not Repairable':
        return 'Cannot be repaired. Ready to be returned.';
      case 'Declined':
        return 'Estimate declined. Ready to be returned.';
      default:
        return row.watch_status;
    }
  };

  const runAction = async (
    row: TrackerRow,
    action: TrackerStageAction,
    parts?: { expectedDate: string; note?: string },
  ) => {
    setBusyItem(row.item_name);
    try {
      await apiService.updateWatchStage(row.item_name, action, parts);
      setToast({ message: `${watchLabel(row)}: ${ACTION_COPY[action].done}`, type: 'success' });
      await load(debouncedSearch);
    } catch (err: any) {
      setToast({ message: err?.message || 'Could not update the watch.', type: 'error' });
    } finally {
      setBusyItem(null);
    }
  };

  const openPartsDialog = (row: TrackerRow) => {
    setPartsRow(row);
    setPartsDate('');
    setPartsNote('');
  };

  const savePartsDialog = () => {
    if (!partsRow || !partsDate) return;
    void runAction(partsRow, 'parts_wait', { expectedDate: partsDate, note: partsNote.trim() });
    setPartsRow(null);
  };

  const canNotify = (row: TrackerRow) => data.whatsapp_enabled && row.stage === 'ready' && row.order_status === 'Repaired';

  const renderPromised = (row: TrackerRow) => {
    if (row.stage === 'ready' || row.stage === 'collected' || !row.promised_delivery_date) return null;
    return (
      <p className="text-xs mt-1 text-slate-500">
        Promised {formatDay(row.promised_delivery_date)}
        {row.overdue_days > 0 && <span className="text-rose-600 font-medium"> · {daysLabel(row.overdue_days)} late</span>}
      </p>
    );
  };

  const renderLastMessage = (row: TrackerRow) => {
    if (!row.last_message) return <span className="text-slate-400">No message sent</span>;
    return (
      <>
        <span className="text-slate-700">{row.last_message.label}</span>
        <span className="block text-xs text-slate-500">
          {formatDay(row.last_message.sent_at)}
          {row.last_message.status === 'Queued' ? ' · sending' : ''}
        </span>
      </>
    );
  };

  const renderStage = (row: TrackerRow) => (
    <>
      <Badge className={`${STAGE_META[row.stage].badge} px-3 py-1 text-xs font-medium`}>{stageLabel(row)}</Badge>
      <span className={`block text-xs mt-1 ${row.needs_attention ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
        {stageSince(row)}
      </span>
    </>
  );

  const renderActions = (row: TrackerRow) => {
    const isBusy = busyItem === row.item_name;
    return (
      <div className="flex flex-wrap gap-2 md:justify-end">
        {stageActions(row).map((action) => (
          <button
            key={action}
            type="button"
            disabled={isBusy}
            onClick={() => (action === 'parts_wait' ? openPartsDialog(row) : setPendingAction({ row, action }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
              SECONDARY_ACTIONS.includes(action) ? 'bg-white text-slate-600 hover:bg-stone-50' : 'text-white hover:opacity-90'
            }`}
            style={SECONDARY_ACTIONS.includes(action) ? { border: '1px solid #E8E8E8' } : { backgroundColor: '#648DDA' }}
          >
            {ACTION_COPY[action].button}
          </button>
        ))}
        {canNotify(row) && (
          <button
            type="button"
            onClick={() => setNotifyRow(row)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            Notify customer
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelectOrder(row.repair_order)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-stone-50 transition-colors"
          style={{ border: '1px solid #E8E8E8', color: '#5B8DEF' }}
        >
          Open order
        </button>
      </div>
    );
  };

  const renderCustomer = (row: TrackerRow) => (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{row.customer_name}</span>
        {PRIORITY_STYLES[row.priority] && (
          <Badge className={`${PRIORITY_STYLES[row.priority]} px-2 py-0.5 text-xs font-medium`}>{row.priority}</Badge>
        )}
      </div>
      {row.customer_mobile && (
        <a href={`tel:${row.customer_mobile}`} className="block text-xs text-slate-500 hover:underline">{row.customer_mobile}</a>
      )}
      <span className="block text-xs font-semibold mt-1" style={{ color: '#6A7288' }}>
        {row.repair_order}
        {row.reference_number ? <span className="font-normal text-slate-500"> · Ref: {row.reference_number}</span> : null}
      </span>
    </>
  );

  const renderWatch = (row: TrackerRow) => (
    <>
      <span className="text-sm text-slate-700">{watchLabel(row)}</span>
      {row.serial_number && <span className="block text-xs text-slate-500">S/N {row.serial_number}</span>}
    </>
  );

  const emptyMessage = isSearching
    ? `Nothing found for "${debouncedSearch}". Try the phone number or order number.`
    : 'No watches in this list.';

  return (
    <div className="w-full">
      <div className="mb-4 sm:mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Tracker</h1>
          <p className="text-slate-500 text-sm mt-1">
            {isSearching
              ? `${data.rows.length} ${data.rows.length === 1 ? 'watch' : 'watches'} found, including collected ones`
              : `${tabCounts.all} ${tabCounts.all === 1 ? 'watch' : 'watches'} in the shop · ${tabCounts.ready} ready for collection`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(debouncedSearch)}
          disabled={isLoading}
          className="px-4 py-2.5 rounded-xl bg-white text-sm font-semibold text-slate-600 hover:bg-stone-50 shadow-sm disabled:opacity-60"
          style={{ border: '1px solid #E8E8E8' }}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="mb-4 relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          autoFocus
          placeholder="Customer calling? Type the mobile number, name, order no. or serial no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-20 py-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-200 shadow-sm"
          style={{ border: '1px solid #E8E8E8' }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute inset-y-0 right-0 pr-4 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {!isSearching && (
        <div className="mb-4 sm:mb-6 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'text-white' : 'bg-white text-slate-600 hover:bg-stone-50'}`}
                style={isActive ? { backgroundColor: '#648DDA' } : { border: '1px solid #E8E8E8' }}
              >
                {tab.label}
                <span className={`ml-2 text-xs font-semibold ${isActive ? 'text-white/90' : 'text-slate-400'}`}>{tabCounts[tab.id]}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 text-rose-700 text-sm px-4 py-3" style={{ border: '1px solid #FECDD3' }}>
          {error}
        </div>
      )}

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {visibleRows.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #F0EEEB' }}>
            <p className="text-slate-400 font-medium">{isLoading ? 'Loading...' : emptyMessage}</p>
          </div>
        ) : (
          visibleRows.map((row) => (
            <div key={row.item_name} className="bg-white rounded-2xl p-4" style={{ border: '1px solid #F0EEEB' }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>{renderCustomer(row)}</div>
                <div className="text-right shrink-0">{renderStage(row)}</div>
              </div>
              <div className="mb-2">{renderWatch(row)}</div>
              <p className="text-sm text-slate-800">{describe(row)}</p>
              {renderPromised(row)}
              <p className="text-xs mt-2">{renderLastMessage(row)}</p>
              <div className="mt-3">{renderActions(row)}</div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #F0EEEB' }}>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead style={{ backgroundColor: '#F6F3EF' }}>
              <tr>
                <th scope="col" className="px-5 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-5 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Watch</th>
                <th scope="col" className="px-5 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
                <th scope="col" className="px-5 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">What to tell the customer</th>
                <th scope="col" className="px-5 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last message</th>
                <th scope="col" className="relative px-5 py-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="text-lg font-medium">{isLoading ? 'Loading...' : emptyMessage}</p>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.item_name} className="hover:bg-stone-50 transition-colors align-top" style={{ borderBottom: '1px solid #F3EFEA' }}>
                    <td className="px-5 py-4">{renderCustomer(row)}</td>
                    <td className="px-5 py-4">{renderWatch(row)}</td>
                    <td className="px-5 py-4 whitespace-nowrap">{renderStage(row)}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-800">{describe(row)}</p>
                      {renderPromised(row)}
                    </td>
                    <td className="px-5 py-4 text-sm whitespace-nowrap">{renderLastMessage(row)}</td>
                    <td className="px-5 py-4">{renderActions(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data.truncated && (
        <p className="mt-3 text-sm text-slate-500">
          Showing the first {data.rows.length} matches. Type more of the name or number to narrow it down.
        </p>
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) void runAction(pendingAction.row, pendingAction.action);
        }}
        title={pendingAction ? ACTION_COPY[pendingAction.action].title : ''}
        message={
          pendingAction
            ? `${watchLabel(pendingAction.row)} for ${pendingAction.row.customer_name} (order ${pendingAction.row.repair_order}) ${ACTION_COPY[pendingAction.action].outcome}`
            : ''
        }
        confirmText={pendingAction ? ACTION_COPY[pendingAction.action].button : 'Confirm'}
      />

      <Modal
        isOpen={partsRow !== null}
        onClose={() => setPartsRow(null)}
        title="Waiting for parts"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {partsRow && (
            <p className="text-sm text-gray-700">
              {watchLabel(partsRow)} for {partsRow.customer_name} (order {partsRow.repair_order})
            </p>
          )}
          <Input
            label="When is the part expected?"
            type="date"
            min={todayISO()}
            value={partsDate}
            onChange={(e) => setPartsDate(e.target.value)}
          />
          <Input
            label="Which part? (optional)"
            type="text"
            maxLength={140}
            placeholder="e.g. crown, crystal, movement"
            value={partsNote}
            onChange={(e) => setPartsNote(e.target.value)}
          />
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => setPartsRow(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={savePartsDialog} disabled={!partsDate}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {notifyRow && (
        <NotifyCustomerModal
          isOpen
          onClose={() => setNotifyRow(null)}
          orderName={notifyRow.repair_order}
          orderStatus={notifyRow.order_status}
          onSuccess={() => void load(debouncedSearch)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  );
};

export default OrderTracker;
