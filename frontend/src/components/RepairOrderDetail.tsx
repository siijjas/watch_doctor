import React, { useState, useEffect } from 'react';
import type { RepairOrder, RepairItem, RepairPartUsed, RepairTask, Employee, Item, RepairTaskTemplate, WatchModel, IssueTemplate, DiagnosisSummaryTemplate, RecommendedWorkTemplate, MovementTypeTemplate, MovementCaliberTemplate } from '../types';
import { TaskStatus, WatchStatus, resolveDiagnosisStatus } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { mockEmployees, mockItems, mockTaskTemplates } from '../services/mockData';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { UserIcon } from './icons/UserIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { ClockIcon } from './icons/ClockIcon';
import { PlusIcon } from './icons/PlusIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { AddPartModal } from './AddPartModal';
import { ChangeTaskStatusModal } from './ChangeTaskStatusModal';
import { UpdatePriceModal } from './UpdatePriceModal';
import { CreateQuotationModal } from './CreateQuotationModal';
import PaymentModal from './PaymentModal';
import { AssignTechnicianModal } from './AssignTechnicianModal';
import { ActionsDropdown } from './ui/ActionsDropdown';
import { ViewQuotationModal } from './ViewQuotationModal';
import { ViewInvoiceModal } from './ViewInvoiceModal';
import { AddIssueModal } from './AddIssueModal';
import { AddTaskModal } from './AddTaskModal';
import { NotifyCustomerModal } from './NotifyCustomerModal';
import { Modal } from './ui/Modal';
import { useAppConfig } from '../context/AppConfigContext';
import { useAuth } from '../context/AuthContext';
import type { EstimateNotificationPreview, WhatsAppNotificationStatus } from '../services/apiService';

const DEFAULT_DIAGNOSIS_SUMMARY_TEMPLATES: DiagnosisSummaryTemplate[] = [
  { name: 'Circuit Damage', summary_name: 'Circuit Damage', description: 'Circuit damage found.' },
  { name: 'Movement Damage', summary_name: 'Movement Damage', description: 'Movement damage found.' },
  { name: 'Hour Wheel Damage', summary_name: 'Hour Wheel Damage', description: 'Hour wheel damage found.' },
  { name: 'Minute Wheel Damage', summary_name: 'Minute Wheel Damage', description: 'Minute wheel damage found.' },
  { name: 'Lever Damage', summary_name: 'Lever Damage', description: 'Lever damage found.' },
  { name: 'Main Spring Damage', summary_name: 'Main Spring Damage', description: 'Main spring damage found.' },
  { name: 'Automatic Rotor Damage', summary_name: 'Automatic Rotor Damage', description: 'Automatic rotor damage found.' },
  { name: 'Escape Wheel Damage', summary_name: 'Escape Wheel Damage', description: 'Escape wheel damage found.' },
  { name: 'Third Wheel Damage', summary_name: 'Third Wheel Damage', description: 'Third wheel damage found.' },
  { name: 'Fourth Wheel Damage', summary_name: 'Fourth Wheel Damage', description: 'Fourth wheel damage found.' },
  { name: 'Balance Staff Damage', summary_name: 'Balance Staff Damage', description: 'Balance staff damage found.' },
  { name: 'Balance Pivot Damage', summary_name: 'Balance Pivot Damage', description: 'Balance pivot damage found.' },
  { name: 'Pallet Fork Damage', summary_name: 'Pallet Fork Damage', description: 'Pallet fork damage found.' },
  { name: 'Barrel Arbor Damage', summary_name: 'Barrel Arbor Damage', description: 'Barrel arbor damage found.' },
  { name: 'Cannon Pinion Damage', summary_name: 'Cannon Pinion Damage', description: 'Cannon pinion damage found.' },
  { name: 'Setting Lever Damage', summary_name: 'Setting Lever Damage', description: 'Setting lever damage found.' },
  { name: 'Stem Damage', summary_name: 'Stem Damage', description: 'Stem damage found.' },
  { name: 'Crown Wheel Damage', summary_name: 'Crown Wheel Damage', description: 'Crown wheel damage found.' },
  { name: 'Ratchet Wheel Damage', summary_name: 'Ratchet Wheel Damage', description: 'Ratchet wheel damage found.' },
  { name: 'Keyless Works Damage', summary_name: 'Keyless Works Damage', description: 'Keyless works damage found.' },
  { name: 'Gear Train Damage', summary_name: 'Gear Train Damage', description: 'Gear train damage found.' },
  { name: 'Calendar Mechanism Damage', summary_name: 'Calendar Mechanism Damage', description: 'Calendar mechanism damage found.' },
  { name: 'Chronograph Module Damage', summary_name: 'Chronograph Module Damage', description: 'Chronograph module damage found.' },
  { name: 'Battery Contact Damage', summary_name: 'Battery Contact Damage', description: 'Battery contact damage found.' },
  { name: 'Coil Damage', summary_name: 'Coil Damage', description: 'Coil damage found.' },
  { name: 'Step Motor Damage', summary_name: 'Step Motor Damage', description: 'Step motor damage found.' },
  { name: 'Dial Train Damage', summary_name: 'Dial Train Damage', description: 'Dial train damage found.' },
];

const DEFAULT_MOVEMENT_TYPE_TEMPLATES: MovementTypeTemplate[] = [
  { name: 'Quartz movement', movement_type: 'Quartz movement', description: 'Watch uses a quartz movement.' },
  { name: 'Automatic movement', movement_type: 'Automatic movement', description: 'Watch uses an automatic self-winding movement.' },
  { name: 'Manual-wind movement', movement_type: 'Manual-wind movement', description: 'Watch uses a manual-wind movement.' },
  { name: 'GMT movement', movement_type: 'GMT movement', description: 'Watch contains a GMT or dual-time movement.' },
  { name: 'Chronograph movement', movement_type: 'Chronograph movement', description: 'Watch contains a chronograph complication.' },
  { name: 'Co-axial movement', movement_type: 'Co-axial movement', description: 'Watch uses a co-axial escapement design.' },
];

const DEFAULT_MOVEMENT_CALIBER_TEMPLATES: MovementCaliberTemplate[] = [
  { name: '2235', caliber_code: '2235', description: 'Rolex calibre 2235 automatic movement.' },
  { name: '2500', caliber_code: '2500', description: 'Omega calibre 2500 co-axial automatic movement.' },
  { name: '2824-2', caliber_code: '2824-2', description: 'ETA calibre 2824-2 automatic movement.' },
  { name: '3135', caliber_code: '3135', description: 'Rolex calibre 3135 automatic date movement.' },
  { name: 'NH35', caliber_code: 'NH35', description: 'Seiko/TMI calibre NH35 automatic movement.' },
  { name: 'Powermatic 80', caliber_code: 'Powermatic 80', description: 'ETA-derived Powermatic 80 automatic movement family.' },
];

interface DiagnosisModalOption {
  value: string;
  label: string;
  description?: string;
}

interface DiagnosisSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  helperText: string;
  options: DiagnosisModalOption[];
  currentValues: Set<string>;
  onSave: (selectedValues: string[]) => Promise<void> | void;
  selectedStateClasses: string;
  checkboxClasses: string;
}

const mergeUniqueStrings = (existing: string[], incoming: string[]) => {
  const seen = new Set(existing.map(value => value.toLowerCase()));
  const merged = [...existing];

  incoming.forEach(value => {
    const normalized = value.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(value);
    }
  });

  return merged;
};

const WORKFLOW_STATUS_OPTIONS: WatchStatus[] = [
  WatchStatus.Pending,
  WatchStatus.UnderDiagnosis,
  WatchStatus.Diagnosed,
  WatchStatus.CreateEstimate,
  WatchStatus.Quoted,
  WatchStatus.InRepair,
  WatchStatus.Completed,
  WatchStatus.NotRepairable,
  WatchStatus.Declined,
];

const DiagnosisSelectionModal: React.FC<DiagnosisSelectionModalProps> = ({
  isOpen,
  onClose,
  title,
  helperText,
  options,
  currentValues,
  onSave,
  selectedStateClasses,
  checkboxClasses,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedValues([]);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const visibleOptions = options.filter(option => {
    const haystack = `${option.label} ${option.description || ''}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const toggleSelection = (value: string) => {
    setSelectedValues(current => (
      current.includes(value)
        ? current.filter(entry => entry !== value)
        : [...current, value]
    ));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">{helperText}</p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search options..."
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-100"
          />
        </div>

        <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          {visibleOptions.length > 0 ? visibleOptions.map(option => {
            const alreadyAdded = currentValues.has(option.value);
            const isSelected = selectedValues.includes(option.value);

            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${alreadyAdded ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60' : isSelected ? selectedStateClasses : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <input
                  type="checkbox"
                  checked={alreadyAdded || isSelected}
                  disabled={alreadyAdded}
                  onChange={() => toggleSelection(option.value)}
                  className={`mt-1 h-4 w-4 rounded border-gray-300 ${checkboxClasses}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                    {alreadyAdded && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                        Already added
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <p className="mt-1 text-sm text-gray-500">{option.description}</p>
                  )}
                </div>
              </label>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              No options match your search.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void onSave(selectedValues)}
            disabled={selectedValues.length === 0}
          >
            Add Selected
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const WatchCard: React.FC<{
    item: RepairItem;
    itemIndex: number;
    employees: Employee[];
    allItems: Item[];
    taskTemplates: RepairTaskTemplate[];
    issueTemplates: IssueTemplate[];
    watchModels: WatchModel[];
    onAddPart: (itemIndex: number, taskIndex: number) => void;
    onChangeTaskStatus: (itemIndex: number, taskIndex: number) => void;
    onUpdatePrices: (itemIndex: number) => void;
    onAssignTechnician: (itemIndex: number) => void;
    onAddIssue: (itemIndex: number) => void;
    onAddTask: (itemIndex: number) => void;
    onSetWorkflowStatus: (itemIndex: number, status: WatchStatus) => Promise<void>;
    onNotifyEstimateCustomer: (itemIndex: number) => Promise<void>;
    diagnosisSummaryTemplates: DiagnosisSummaryTemplate[];
    recommendedWorkTemplates: RecommendedWorkTemplate[];
    movementTypeTemplates: MovementTypeTemplate[];
    movementCaliberTemplates: MovementCaliberTemplate[];
    canEditDiagnosis: boolean;
    canManageWorkflowStatus: boolean;
    canNotifyEstimateCustomer: boolean;
    isSavingDiagnosis: boolean;
    onSaveDiagnosis: (itemIndex: number, diagnosis: Pick<RepairItem, 'diagnosis_status' | 'diagnosis_summary' | 'movement_type' | 'movement_caliber' | 'movement_information' | 'recommended_work'>) => Promise<void>;
    defaultExpanded?: boolean;
  }> = ({ item, itemIndex, employees, allItems, taskTemplates, issueTemplates, watchModels, onAddPart, onChangeTaskStatus, onUpdatePrices, onAssignTechnician, onAddIssue, onAddTask, onSetWorkflowStatus, onNotifyEstimateCustomer, diagnosisSummaryTemplates, recommendedWorkTemplates, movementTypeTemplates, movementCaliberTemplates, canEditDiagnosis, canManageWorkflowStatus, canNotifyEstimateCustomer, isSavingDiagnosis, onSaveDiagnosis, defaultExpanded = true }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [activeDiagnosisModal, setActiveDiagnosisModal] = useState<null | 'movement_type' | 'movement_caliber' | 'diagnosis_summary' | 'recommended_work'>(null);
    const [diagnosisDraft, setDiagnosisDraft] = useState({
      diagnosis_status: item.diagnosis_status,
      diagnosis_summary: item.diagnosis_summary,
      movement_type: item.movement_type,
      movement_caliber: item.movement_caliber,
      movement_information: item.movement_information,
      recommended_work: item.recommended_work,
    });
    const { formatCurrency } = useAppConfig();
    const technician = employees.find(e => e.name === item.technician);

    useEffect(() => {
      setDiagnosisDraft({
        diagnosis_status: item.diagnosis_status,
        diagnosis_summary: item.diagnosis_summary,
        movement_type: item.movement_type,
        movement_caliber: item.movement_caliber,
        movement_information: item.movement_information,
        recommended_work: item.recommended_work,
      });
    }, [item]);

    const updateAndSave = (updater: (current: typeof diagnosisDraft) => typeof diagnosisDraft) => {
      const next = updater(diagnosisDraft);
      const resolved = {
        ...next,
        diagnosis_status: resolveDiagnosisStatus(next.diagnosis_status, next),
      };
      setDiagnosisDraft(resolved);
      void onSaveDiagnosis(itemIndex, resolved);
    };

    const totalCost = (item.tasks || []).reduce((sum, task) => {
      const template = taskTemplates.find(t => t.name === task.service);
      const effectiveRate = task.rate || template?.default_rate || 0;
      return sum + effectiveRate;
    }, 0) + (item.parts_used || []).reduce((sum, part) => {
      const sparePart = allItems.find(i => i.name === part.part);
      const effectiveRate = part.rate || sparePart?.standard_rate || 0;
      return sum + (effectiveRate * part.quantity);
    }, 0);

    const watchModel = watchModels.find(m => m.name === item.watch_model);
    const taskCount = item.tasks?.length || 0;
    const partCount = item.parts_used?.length || 0;
    const completedTasks = (item.tasks || []).filter(t => t.status === 'Completed').length;
    const movementTypeOptions = movementTypeTemplates.map(template => ({
      value: template.movement_type,
      label: template.movement_type,
      description: template.description,
    }));
    const movementCaliberOptions = movementCaliberTemplates.map(template => ({
      value: template.caliber_code,
      label: template.caliber_code,
      description: template.description,
    }));
    const diagnosisSummaryOptions = diagnosisSummaryTemplates.map(template => ({
      value: template.summary_name,
      label: template.summary_name,
      description: template.description,
    }));
    const recommendedWorkOptions = recommendedWorkTemplates.map(template => ({
      value: template.work_name,
      label: template.work_name,
      description: template.description,
    }));
    const canSubmitForEstimateApproval = canManageWorkflowStatus && item.status === WatchStatus.Diagnosed;
    const canSubmitToQuoted = canManageWorkflowStatus && item.status === WatchStatus.CreateEstimate;
    const canMoveToRepair = canManageWorkflowStatus && item.status === WatchStatus.Quoted;
    const canNotifyCustomerEstimate = canNotifyEstimateCustomer && item.status === WatchStatus.Quoted;

    return (
      <div className="mb-4 bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md" style={{ border: '1px solid #F0EEEB' }}>
        <div
          className="p-3 sm:p-5 cursor-pointer flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#648DDA' }}>
              <span className="text-white text-lg sm:text-xl">⌚</span>
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-xl text-gray-900">
                {item.watch_brand} {watchModel?.model_name || item.watch_model}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
                S/N: {item.serial_number || 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 sm:space-x-3 pl-13 sm:pl-0">
            {taskCount > 0 && (
              <span className="text-xs px-3 py-1 rounded-full text-gray-600" style={{ backgroundColor: '#F3EFEA' }}>
                {completedTasks}/{taskCount} tasks
              </span>
            )}
            {partCount > 0 && (
              <span className="text-xs px-3 py-1 rounded-full text-gray-600" style={{ backgroundColor: '#F3EFEA' }}>
                {partCount} parts
              </span>
            )}
            <span className="font-bold text-green-600">{formatCurrency(totalCost)}</span>
            <Badge className={`${STATUS_COLORS[item.status]} px-3 py-1`}>{item.status}</Badge>
            <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 sm:px-5 sm:pb-5 border-t" style={{ borderColor: '#F0EEEB' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b" style={{ borderColor: '#F0EEEB' }}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${technician ? 'bg-indigo-100' : 'bg-amber-100'}`}>
                  <span className="text-lg">{technician ? '👤' : '❓'}</span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Technician</p>
                  <p className={`font-semibold text-base ${technician ? 'text-gray-900' : 'text-amber-600'}`}>
                    {technician?.employee_name || 'Not Assigned'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={technician ? 'outline' : 'primary'}
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onAssignTechnician(itemIndex); }}
                  className="text-xs"
                >
                  👤 {technician ? 'Change Tech' : 'Assign Tech'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onUpdatePrices(itemIndex); }}
                  className="text-xs"
                  disabled={!canManageWorkflowStatus}
                >
                  💰 Update Prices
                </Button>
                {canSubmitForEstimateApproval && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onSetWorkflowStatus(itemIndex, WatchStatus.CreateEstimate);
                    }}
                    className="text-xs"
                  >
                    Submit to Create Estimate
                  </Button>
                )}
                {canSubmitToQuoted && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onSetWorkflowStatus(itemIndex, WatchStatus.Quoted);
                    }}
                    className="text-xs"
                  >
                    Submit to Quoted
                  </Button>
                )}
                {canNotifyCustomerEstimate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onNotifyEstimateCustomer(itemIndex);
                    }}
                    className="text-xs"
                  >
                    Notify Customer
                  </Button>
                )}
                {canMoveToRepair && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onSetWorkflowStatus(itemIndex, WatchStatus.InRepair);
                    }}
                    className="text-xs"
                  >
                    Move to In Repair
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 pt-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Issues</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onAddIssue(itemIndex); }}
                    className="text-xs h-7 px-2"
                  >
                    ➕ Add Issue
                  </Button>
                </div>
                {(item.issues || []).length > 0 ? (
                  <div className="space-y-2">
                    {(item.issues || []).map((issue, idx) => {
                      const template = issueTemplates.find(t => t.name === issue.issue);
                      const issueLabel = issue.is_other && issue.other_description
                        ? issue.other_description
                        : (template?.issue_name || issue.issue);

                      return (
                        <div key={idx} className="flex items-center p-3 rounded-lg border bg-orange-50 border-orange-100 min-h-[3.5rem]">
                          <span className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-sm text-orange-700 mr-3 shrink-0 font-bold">
                            !
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            {issueLabel}
                            {issue.is_other && issue.other_description && (
                              <span className="block text-xs font-medium uppercase tracking-wide text-orange-700/80 mt-1">Other issue</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddIssue(itemIndex); }}
                    className="w-full text-sm text-amber-500 italic border-2 border-dashed border-amber-200 rounded-lg py-3 hover:bg-amber-50 transition-colors"
                  >
                    No issues reported — click to add
                  </button>
                )}
                {item.issue_description && (
                  <p className="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded-lg">{item.issue_description}</p>
                )}
                {item.pre_existing_condition.length > 0 && (
                  <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-stone-600">Pre-Existing Watch Condition</h5>
                    <div className="mt-2 space-y-2">
                      {item.pre_existing_condition.map((condition) => (
                        <div
                          key={condition}
                          className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm text-gray-700 min-h-[3.25rem]"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">P</span>
                          <span className="font-medium text-gray-900">{condition}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Repair Tasks</h4>
                  <span className="text-xs text-gray-400">Auto-managed</span>
                </div>
                {(item.tasks || []).length > 0 ? (
                  <div className="space-y-2">
                    {(item.tasks || []).map((task, taskIdx) => {
                      const template = taskTemplates.find(t => t.name === task.service);
                      const isCompleted = task.status === 'Completed';
                      return (
                        <div
                          key={task.name || taskIdx}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-2 ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>
                              {isCompleted ? '✓' : ''}
                            </span>
                            <div>
                              <span className="text-sm font-medium text-gray-900">{template?.task_name || task.service}</span>
                              <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 rounded">{task.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="font-medium text-green-600">{formatCurrency(task.rate || template?.default_rate || 0)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); onAddPart(itemIndex, taskIdx); }}
                              className="text-xs"
                            >
                              +Part
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); onChangeTaskStatus(itemIndex, taskIdx); }}
                              className="text-xs"
                            >
                              Status
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No tasks assigned</p>
                )}
              </div>
            </div>

            {(item.parts_used || []).length > 0 && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: '#F0EEEB' }}>
                <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Parts Used</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(item.parts_used || []).map((part, idx) => {
                    const sparePart = allItems.find(i => i.name === part.part);
                    return (
                      <div key={part.name || idx} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-700">
                          {sparePart?.item_name || part.part} <span className="text-gray-400">×{part.quantity}</span>
                        </span>
                        <span className="font-medium text-green-600">
                          {formatCurrency((part.rate || sparePart?.standard_rate || 0) * part.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t" style={{ borderColor: '#F0EEEB' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Technician Diagnosis</h4>
                  <p className="mt-1 text-xs text-gray-400">Diagnosis details still feed the watch workflow, but watch progression now follows the merged watch status.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  {(item.diagnosed_by || item.diagnosis_date) && (
                    <div className="text-right text-xs text-gray-400">
                      {item.diagnosed_by && <span>By: {item.diagnosed_by}</span>}
                      {item.diagnosed_by && item.diagnosis_date && <span className="mx-1">·</span>}
                      {item.diagnosis_date && <span>{item.diagnosis_date}</span>}
                    </div>
                  )}
                  {canManageWorkflowStatus ? (
                    <select
                      value={item.status}
                      onChange={(e) => void onSetWorkflowStatus(itemIndex, e.target.value as WatchStatus)}
                      disabled={isSavingDiagnosis}
                      className="rounded-md border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 disabled:bg-gray-100"
                      style={{ borderColor: '#E8E8E8' }}
                    >
                      {WORKFLOW_STATUS_OPTIONS.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>{statusOption}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Diagnosis: {diagnosisDraft.diagnosis_status}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Movement Type</h4>
                    {canEditDiagnosis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setActiveDiagnosisModal('movement_type'); }}
                        className="text-xs h-7 px-2"
                        disabled={isSavingDiagnosis}
                      >
                        ➕ Add Type
                      </Button>
                    )}
                  </div>
                  {diagnosisDraft.movement_type.length > 0 ? (
                    <div className="space-y-2">
                      {diagnosisDraft.movement_type.map((movementType) => (
                        <div
                          key={movementType}
                          className="flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50 p-3 min-h-[3.5rem]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-200 text-xs font-semibold text-sky-700">M</span>
                            <span className="truncate text-sm font-semibold text-gray-900">{movementType}</span>
                          </div>
                          {canEditDiagnosis && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAndSave(current => ({
                                  ...current,
                                  movement_type: current.movement_type.filter(entry => entry !== movementType),
                                }));
                              }}
                              className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100 hover:text-sky-900"
                              aria-label={`Remove ${movementType}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No movement type added</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Movement Caliber</h4>
                    {canEditDiagnosis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setActiveDiagnosisModal('movement_caliber'); }}
                        className="text-xs h-7 px-2"
                        disabled={isSavingDiagnosis}
                      >
                        ➕ Add Caliber
                      </Button>
                    )}
                  </div>
                  {diagnosisDraft.movement_caliber.length > 0 ? (
                    <div className="space-y-2">
                      {diagnosisDraft.movement_caliber.map((caliber) => (
                        <div
                          key={caliber}
                          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 min-h-[3.5rem]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-xs font-semibold text-emerald-700">C</span>
                            <span className="truncate text-sm font-semibold text-gray-900">{caliber}</span>
                          </div>
                          {canEditDiagnosis && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAndSave(current => ({
                                  ...current,
                                  movement_caliber: current.movement_caliber.filter(entry => entry !== caliber),
                                }));
                              }}
                              className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
                              aria-label={`Remove ${caliber}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No movement caliber added</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-4">
                <div>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Diagnosis Summary</h4>
                    {canEditDiagnosis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setActiveDiagnosisModal('diagnosis_summary'); }}
                        className="text-xs h-7 px-2"
                        disabled={isSavingDiagnosis}
                      >
                        ➕ Add Summary
                      </Button>
                    )}
                  </div>
                  {diagnosisDraft.diagnosis_summary.length > 0 ? (
                    <div className="space-y-2">
                      {diagnosisDraft.diagnosis_summary.map((summary) => (
                        <div
                          key={summary}
                          className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-violet-50 p-3 min-h-[3.5rem]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-200 text-xs font-semibold text-violet-700">D</span>
                            <span className="truncate text-sm font-semibold text-gray-900">{summary}</span>
                          </div>
                          {canEditDiagnosis && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAndSave(current => ({
                                  ...current,
                                  diagnosis_summary: current.diagnosis_summary.filter(entry => entry !== summary),
                                }));
                              }}
                              className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100 hover:text-violet-900"
                              aria-label={`Remove ${summary}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No diagnosis summary added</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Recommended Work</h4>
                    {canEditDiagnosis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setActiveDiagnosisModal('recommended_work'); }}
                        className="text-xs h-7 px-2"
                        disabled={isSavingDiagnosis}
                      >
                        ➕ Add Work
                      </Button>
                    )}
                  </div>
                  {(diagnosisDraft.recommended_work || []).length > 0 ? (
                    <div className="space-y-2">
                      {(diagnosisDraft.recommended_work || []).map((work: string) => (
                        <div
                          key={work}
                          className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3 min-h-[3.5rem]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-semibold text-amber-700">+</span>
                            <span className="truncate text-sm font-semibold text-gray-900">{work}</span>
                          </div>
                          {canEditDiagnosis && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAndSave(current => ({
                                  ...current,
                                  recommended_work: (current.recommended_work || []).filter((entry: string) => entry !== work),
                                }));
                              }}
                              className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
                              aria-label={`Remove ${work}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No recommended work added</p>
                  )}
                </div>
              </div>
            </div>

            <DiagnosisSelectionModal
              isOpen={activeDiagnosisModal === 'movement_type'}
              onClose={() => setActiveDiagnosisModal(null)}
              title="Add Movement Type"
              helperText="Select one or more movement types to add to this watch."
              options={movementTypeOptions}
              currentValues={new Set(diagnosisDraft.movement_type)}
              onSave={async (selectedValues) => {
                updateAndSave(current => ({
                  ...current,
                  movement_type: mergeUniqueStrings(current.movement_type, selectedValues),
                }));
                setActiveDiagnosisModal(null);
              }}
              selectedStateClasses="bg-sky-50 border-sky-300"
              checkboxClasses="text-sky-500"
            />

            <DiagnosisSelectionModal
              isOpen={activeDiagnosisModal === 'movement_caliber'}
              onClose={() => setActiveDiagnosisModal(null)}
              title="Add Movement Caliber"
              helperText="Select one or more caliber codes to add to this watch."
              options={movementCaliberOptions}
              currentValues={new Set(diagnosisDraft.movement_caliber)}
              onSave={async (selectedValues) => {
                updateAndSave(current => ({
                  ...current,
                  movement_caliber: mergeUniqueStrings(current.movement_caliber, selectedValues),
                }));
                setActiveDiagnosisModal(null);
              }}
              selectedStateClasses="bg-emerald-50 border-emerald-300"
              checkboxClasses="text-emerald-500"
            />

            <DiagnosisSelectionModal
              isOpen={activeDiagnosisModal === 'diagnosis_summary'}
              onClose={() => setActiveDiagnosisModal(null)}
              title="Add Diagnosis Summary"
              helperText="Select one or more diagnosis summaries to add to this watch."
              options={diagnosisSummaryOptions}
              currentValues={new Set(diagnosisDraft.diagnosis_summary)}
              onSave={async (selectedValues) => {
                updateAndSave(current => ({
                  ...current,
                  diagnosis_summary: mergeUniqueStrings(current.diagnosis_summary, selectedValues),
                }));
                setActiveDiagnosisModal(null);
              }}
              selectedStateClasses="bg-violet-50 border-violet-300"
              checkboxClasses="text-violet-500"
            />

            <DiagnosisSelectionModal
              isOpen={activeDiagnosisModal === 'recommended_work'}
              onClose={() => setActiveDiagnosisModal(null)}
              title="Add Recommended Work"
              helperText=""
              options={recommendedWorkOptions}
              currentValues={new Set(diagnosisDraft.recommended_work || [])}
              onSave={async (selectedValues) => {
                updateAndSave(current => ({
                  ...current,
                  recommended_work: mergeUniqueStrings(current.recommended_work || [], selectedValues),
                }));
                setActiveDiagnosisModal(null);
              }}
              selectedStateClasses="bg-amber-50 border-amber-300"
              checkboxClasses="text-amber-500"
            />
          </div>
        )}
      </div>
    );
  };
interface RepairOrderDetailProps {
  order: RepairOrder;
  onBack: () => void;
  onEdit?: (order: RepairOrder) => void;
  onRefresh?: (orderName: string) => Promise<void> | void;
}

const RepairOrderDetail: React.FC<RepairOrderDetailProps> = ({ order, onBack, onEdit, onRefresh }) => {
  const { formatCurrency } = useAppConfig();
  const { hasRole, userInfo } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<RepairTaskTemplate[]>([]);
  const [watchModels, setWatchModels] = useState<WatchModel[]>([]);
  const [issueTemplates, setIssueTemplates] = useState<IssueTemplate[]>([]);
  const [diagnosisSummaryTemplates, setDiagnosisSummaryTemplates] = useState<DiagnosisSummaryTemplate[]>([]);
  const [recommendedWorkTemplates, setRecommendedWorkTemplates] = useState<RecommendedWorkTemplate[]>([]);
  const [movementTypeTemplates, setMovementTypeTemplates] = useState<MovementTypeTemplate[]>([]);
  const [movementCaliberTemplates, setMovementCaliberTemplates] = useState<MovementCaliberTemplate[]>([]);
  const [addPartModal, setAddPartModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
    taskIndex: number | null;
  }>({ isOpen: false, watchIndex: null, taskIndex: null });
  const [changeTaskStatusModal, setChangeTaskStatusModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
    taskIndex: number | null;
  }>({ isOpen: false, watchIndex: null, taskIndex: null });
  const [updatePriceModal, setUpdatePriceModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [assignTechnicianModal, setAssignTechnicianModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [addIssueModal, setAddIssueModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [addTaskModal, setAddTaskModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [createQuotationModal, setCreateQuotationModal] = useState(false);
  const [viewQuotationModal, setViewQuotationModal] = useState(false);
  const [viewInvoiceModal, setViewInvoiceModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    invoiceName: string;
    invoiceAmount: number;
  }>({ isOpen: false, invoiceName: '', invoiceAmount: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // WhatsApp notification state
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [lastNotification, setLastNotification] = useState<WhatsAppNotificationStatus | null>(null);
  const [showEstimateNotifyModal, setShowEstimateNotifyModal] = useState(false);
  const [estimateNotifyItemIndex, setEstimateNotifyItemIndex] = useState<number | null>(null);
  const [estimateNotifyPhase, setEstimateNotifyPhase] = useState<'loading' | 'preview' | 'sending' | 'success' | 'error'>('loading');
  const [estimatePreview, setEstimatePreview] = useState<EstimateNotificationPreview | null>(null);
  const [estimateNotifyError, setEstimateNotifyError] = useState('');
  const [diagnosisSavingItemName, setDiagnosisSavingItemName] = useState<string | null>(null);

  // Handlers
  const handleAddPart = async (watchIndex: number, initialTaskIndex: number | null, part: RepairPartUsed, markTaskCompleted: boolean = false) => {
    // Deep clone to avoid mutating props
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;

    if (!updatedOrder.items[watchIndex].parts_used) {
      updatedOrder.items[watchIndex].parts_used = [];
    }

    updatedOrder.items[watchIndex].parts_used.push(part);

    // Update Task Status Logic
    // Use the task ID selected in the part to find the correct task, 
    // falling back to initialTaskIndex only if necessary (though part.task should stay synced)
    if (part.task) {
      const taskToUpdateIndex = updatedOrder.items[watchIndex].tasks.findIndex(t => t.name === part.task);

      if (taskToUpdateIndex !== -1) {
        const task = updatedOrder.items[watchIndex].tasks[taskToUpdateIndex];
        if (markTaskCompleted) {
          task.status = TaskStatus.Completed;
        } else if (task.status === TaskStatus.Pending) {
          task.status = TaskStatus.InProgress;
        }
      }
    }

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleChangeTaskStatus = async (watchIndex: number, taskIndex: number, status: TaskStatus) => {
    const updatedOrder = { ...order };
    updatedOrder.items[watchIndex].tasks[taskIndex].status = status;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleUpdatePrices = async (watchIndex: number, updatedTasks: RepairTask[], updatedParts: RepairPartUsed[]) => {
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    updatedOrder.items[watchIndex].tasks = updatedTasks;
    updatedOrder.items[watchIndex].parts_used = updatedParts;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleSetWorkflowStatus = async (watchIndex: number, status: WatchStatus) => {
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    updatedOrder.items[watchIndex].status = status;

    if (status === WatchStatus.InRepair) {
      updatedOrder.items[watchIndex].tasks = (updatedOrder.items[watchIndex].tasks || []).map((task) => ({
        ...task,
        status: TaskStatus.InProgress,
      }));
    }

    await apiService.saveRepairOrder(updatedOrder);

    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleNotifyEstimateCustomer = async (watchIndex: number) => {
    const item = order.items[watchIndex];
    if (!item?.name) {
      alert('This watch must be saved before sending an estimate notification.');
      return;
    }

    if (!whatsappEnabled) {
      alert('WhatsApp notifications are disabled. Enable WhatsApp first.');
      return;
    }

    setEstimateNotifyItemIndex(watchIndex);
    setShowEstimateNotifyModal(true);
    setEstimateNotifyPhase('loading');
    setEstimatePreview(null);
    setEstimateNotifyError('');

    try {
      const preview = await apiService.previewEstimateNotification(order.name, item.name);
      setEstimatePreview(preview);
      setEstimateNotifyPhase('preview');
    } catch (error: any) {
      setEstimateNotifyError(error?.message || String(error));
      setEstimateNotifyPhase('error');
    }
  };

  const handleSendEstimateNotification = async () => {
    if (estimateNotifyItemIndex === null) {
      return;
    }

    const item = order.items[estimateNotifyItemIndex];
    if (!item?.name) {
      setEstimateNotifyError('This watch must be saved before sending an estimate notification.');
      setEstimateNotifyPhase('error');
      return;
    }

    setEstimateNotifyPhase('sending');
    setEstimateNotifyError('');
    try {
      await apiService.notifyEstimateCustomer(order.name, item.name);
      await handleNotifySuccess();
      setEstimateNotifyPhase('success');
      setTimeout(() => {
        setShowEstimateNotifyModal(false);
      }, 1800);
    } catch (error: any) {
      setEstimateNotifyError(error?.message || String(error));
      setEstimateNotifyPhase('error');
    }
  };

  const handleCloseEstimateNotifyModal = () => {
    if (estimateNotifyPhase === 'sending') {
      return;
    }
    setShowEstimateNotifyModal(false);
  };

  const handleAddIssue = async (watchIndex: number, selectedIssueNames: string[]) => {
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    const currentIssues = updatedOrder.items[watchIndex].issues || [];
    const existingNames = new Set(currentIssues.map((i: any) => i.issue));
    const resolveTaskTemplateName = (value: string) => {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return null;
      }

      return taskTemplates.find(template => (
        template.name.toLowerCase() === normalized || template.task_name.toLowerCase() === normalized
      ))?.name || null;
    };

    const newIssues = selectedIssueNames
      .filter(n => !existingNames.has(n))
      .map(n => ({ issue: n, is_other: false, other_description: '' }));

    updatedOrder.items[watchIndex].issues = [...currentIssues, ...newIssues];

    const recommendedWorkServices = Array.from(new Set(
      (updatedOrder.items[watchIndex].recommended_work || [])
        .map(resolveTaskTemplateName)
        .filter((service): service is string => Boolean(service))
    ));

    if (recommendedWorkServices.length > 0) {
      updatedOrder.items[watchIndex].tasks = recommendedWorkServices.map(service => ({
        service,
        technician: updatedOrder.items[watchIndex].technician || '',
        notes: '',
        status: TaskStatus.Pending,
      }));
    } else {

      // Auto-add suggested tasks for newly added issues
      const currentTasks = updatedOrder.items[watchIndex].tasks || [];
      const existingServices = new Set(currentTasks.map((t: any) => t.service));
      const tasksToAdd: any[] = [];

      for (const issueName of selectedIssueNames.filter(n => !existingNames.has(n))) {
        const template = issueTemplates.find(t => t.name === issueName);
        if (template?.suggested_task && !existingServices.has(template.suggested_task)) {
          tasksToAdd.push({
            service: template.suggested_task,
            technician: updatedOrder.items[watchIndex].technician || '',
            notes: '',
            status: 'Pending',
          });
          existingServices.add(template.suggested_task);
        }
      }

      if (tasksToAdd.length > 0) {
        updatedOrder.items[watchIndex].tasks = [...currentTasks, ...tasksToAdd];
      }
    }

    await apiService.saveRepairOrder(updatedOrder);
    if (onRefresh) await onRefresh(order.name);
  };

  const handleAddTask = async (watchIndex: number, selectedTaskNames: string[]) => {
    if (!taskTemplates.length || selectedTaskNames.length === 0) {
      return;
    }

    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    const item = updatedOrder.items[watchIndex];
    if (!item.tasks) item.tasks = [];

    const existingServices = new Set((item.tasks || []).map(t => t.service));
    for (const taskName of selectedTaskNames) {
      if (existingServices.has(taskName)) continue;
      item.tasks.push({
        service: taskName,
        technician: item.technician || '',
        notes: '',
        status: TaskStatus.Pending,
      });
      existingServices.add(taskName);
    }

    await apiService.saveRepairOrder(updatedOrder);
    if (onRefresh) await onRefresh(order.name);
  };

  const handleAssignTechnician = async (watchIndex: number, technicianId: string) => {
    const updatedOrder = { ...order };
    updatedOrder.items[watchIndex].technician = technicianId;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleSaveDiagnosis = async (watchIndex: number, diagnosis: Pick<RepairItem, 'diagnosis_status' | 'diagnosis_summary' | 'movement_type' | 'movement_caliber' | 'movement_information' | 'recommended_work'>) => {
    const item = order.items[watchIndex];
    if (!item?.name) {
      alert('Diagnosis can only be saved after the repair item exists.');
      return;
    }

    setDiagnosisSavingItemName(item.name);
    try {
      await apiService.updateRepairItemDiagnosis(item.name, diagnosis);
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error: any) {
      alert(`Failed to save diagnosis: ${error.message || error}`);
    } finally {
      setDiagnosisSavingItemName(null);
    }
  };

  const handleCreateQuotation = async (quotationType: 'Estimate' | 'Final', watchIndices?: number[]) => {
    try {
      await apiService.createQuotation(order.name, quotationType, watchIndices);
      // Refresh order to get updated quotation link
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error) {
      throw error;
    }
  };

  const handleCreateInvoice = async (sourceType: 'quotation' | 'order', paymentType: 'full' | 'advance' | 'balance', amount?: number) => {
    try {
      const result = await apiService.createInvoice(order.name, sourceType, paymentType, amount);
      // Refresh order to get updated invoice link
      if (onRefresh) {
        await onRefresh(order.name);
      }
      // Open PaymentModal after invoice is created
      if (result && result.invoice_name) {
        setPaymentModal({
          isOpen: true,
          invoiceName: result.invoice_name,
          invoiceAmount: result.invoice_amount || order.quotation_amount || 0
        });
      }
    } catch (error) {
      alert(`Failed to create invoice: ${error}`);
    }
  };

  const handleSubmit = async () => {
    if (!confirm('Submit this repair order? This will mark it as Delivered and make it read-only.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.submitRepairOrder(order.name);
      alert('Repair order submitted successfully!');
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error: any) {
      alert(`Failed to submit: ${error.message || error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintLabel = async () => {
    try {
      const response = await apiService.getRepairOrderLabelPrintFormat();
      const printFormat = response.print_format || 'DW RO Bag Label';
      const url = `/printview?doctype=DW%20Repair%20Order&name=${encodeURIComponent(order.name)}&format=${encodeURIComponent(printFormat)}&no_letterhead=1`;
      const win = window.open(url, '_blank', 'width=400,height=320,menubar=no,toolbar=no,location=no,status=no');
      if (win) {
        win.addEventListener('load', () => win.print(), { once: true });
      }
    } catch (error: any) {
      alert(`Failed to load print format: ${error.message || error}`);
    }
  };

  const handlePrintReceipt = () => {
    const url = `/printview?doctype=DW%20Repair%20Order&name=${encodeURIComponent(order.name)}&format=DW%20RO%20Repair%20Order&no_letterhead=1`;
    window.open(url, '_blank');
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this repair order? This action cannot be undone.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.cancelRepairOrder(order.name);
      alert('Repair order cancelled.');
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error: any) {
      alert(`Failed to cancel: ${error.message || error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      if (isErpNext) {
        const [emps, templates, models, issues, diagnosisSummaries, recommendedWorks, movementTypes, movementCalibers] = await Promise.all([
          apiService.getEmployees(),
          apiService.getTaskTemplates(),
          apiService.getWatchModels(''), // Fetch all models
          apiService.getIssueTemplates(),
          apiService.getDiagnosisSummaryTemplates(),
          apiService.getRecommendedWorkTemplates(),
          apiService.getMovementTypeTemplates(),
          apiService.getMovementCaliberTemplates(),
        ]);
        setEmployees(emps);
        setTaskTemplates(templates);
        setIssueTemplates(issues);
        setDiagnosisSummaryTemplates(diagnosisSummaries);
        setRecommendedWorkTemplates(recommendedWorks);
        setMovementTypeTemplates(movementTypes);
        setMovementCaliberTemplates(movementCalibers);

        // Ensure all model IDs used in this order are resolved to model_name,
        // even when the initial list endpoint is capped.
        const orderModelIds = Array.from(
          new Set((order.items || []).map(item => item.watch_model).filter(Boolean))
        );
        const loadedModelIds = new Set(models.map(m => m.name));
        const missingModelIds = orderModelIds.filter(id => !loadedModelIds.has(id));
        const missingModels = missingModelIds.length
          ? await apiService.getWatchModelsByIds(missingModelIds)
          : [];
        setWatchModels([...models, ...missingModels]);

        // Load specific items used in parts
        const partIds = Array.from(new Set(
          order.items?.flatMap(item =>
            item.parts_used?.map(p => p.part) || []
          ).filter(Boolean) || []
        ));

        if (partIds.length > 0) {
          const items = await apiService.getItemsByIds(partIds);
          setAllItems(items);
        } else {
          setAllItems([]);
        }
      } else {
        setEmployees(mockEmployees);
        setAllItems(mockItems);
        setTaskTemplates(mockTaskTemplates);
        setDiagnosisSummaryTemplates(DEFAULT_DIAGNOSIS_SUMMARY_TEMPLATES);
        setRecommendedWorkTemplates(mockTaskTemplates.map(template => ({
          name: template.name,
          work_name: template.task_name,
          description: template.description,
        })));
        setMovementTypeTemplates(DEFAULT_MOVEMENT_TYPE_TEMPLATES);
        setMovementCaliberTemplates(DEFAULT_MOVEMENT_CALIBER_TEMPLATES);
      }
      setIsLoading(false);
    };
    fetchData();
  }, [order]);

  // Load WhatsApp config & last notification status
  useEffect(() => {
    if (!isErpNext || !hasRole('executive', 'data_entry')) return;

    const loadWhatsApp = async () => {
      try {
        const [config, notifStatus] = await Promise.all([
          apiService.getWhatsAppConfig(),
          apiService.getNotificationStatus(order.name),
        ]);
        setWhatsappEnabled(config.enabled);
        setLastNotification(notifStatus);
      } catch {
        // WhatsApp feature might not be set up yet — silently ignore
      }
    };
    loadWhatsApp();
  }, [order.name, order.status]);

  const handleNotifyCustomer = () => setShowNotifyModal(true);

  const handleNotifySuccess = async () => {
    try {
      const notifStatus = await apiService.getNotificationStatus(order.name);
      setLastNotification(notifStatus);
    } catch {
      // silently ignore — status will refresh on next order reload
    }
  };


  const totalOrderCost = (order.items || []).reduce((total, item) => {
    const itemCost = (item.tasks || []).reduce((sum, task) => {
      const template = taskTemplates.find(t => t.name === task.service);
      const effectiveRate = task.rate || template?.default_rate || 0;
      return sum + effectiveRate;
    }, 0) + (item.parts_used || []).reduce((sum, p) => {
      const part = allItems.find(i => i.name === p.part);
      const effectiveRate = p.rate || part?.standard_rate || 0;
      return sum + (effectiveRate * p.quantity);
    }, 0);
    return total + itemCost;
  }, 0);

  const technicianIdentifiers = new Set([
    userInfo?.technician?.name,
    userInfo?.technician?.technician_name,
    userInfo?.technician?.email,
  ].filter(Boolean));

  const canEditDiagnosisForItem = (item: RepairItem) => {
    if (hasRole('executive', 'data_entry')) {
      return true;
    }
    if (!hasRole('technician')) {
      return false;
    }
    return Boolean(item.technician && technicianIdentifiers.has(item.technician));
  };
  const canManageWorkflowStatus = hasRole('executive', 'data_entry');

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12" style={{ borderTop: '3px solid #8B7E74', borderBottom: '3px solid #8B7E74', borderLeft: '3px solid transparent', borderRight: '3px solid transparent' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-0">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center text-slate-700 hover:bg-stone-100">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to List
          </Button>
          <Button
            variant="outline"
            onClick={() => onRefresh?.(order.name)}
            className="flex items-center"
            style={{ borderColor: '#E8E8E8' }}
            title="Refresh order data"
          >
            <RefreshIcon className="h-4 w-4" />
          </Button>
          {hasRole('executive', 'data_entry') && order.docstatus !== 2 && (
            <Button
              variant="outline"
              onClick={handleNotifyCustomer}
              disabled={!whatsappEnabled}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ borderColor: '#E8E8E8' }}
              title={whatsappEnabled ? 'Send WhatsApp notification to customer' : 'Enable WhatsApp in site_config.json first'}
            >
              <span className="text-base">📱</span>
              <span className="hidden sm:inline">Notify Customer</span>
            </Button>
          )}
        </div>
        <ActionsDropdown
          items={[
            // Create actions
            {
              label: 'Create Quotation',
              icon: '📝',
              onClick: () => setCreateQuotationModal(true),
              hidden: !(order.docstatus === 0 && ['Pending', 'In Progress', 'Repaired'].includes(order.status)),
            },
            {
              label: 'Create Invoice',
              icon: '💰',
              onClick: () => handleCreateInvoice('quotation', 'full', order.quotation_amount),
              hidden: !(order.docstatus === 0 && order.status === 'Repaired' && order.quotation && !order.sales_invoice),
            },
            // View actions
            {
              label: 'View Quotation',
              icon: '👁️',
              onClick: () => setViewQuotationModal(true),
              hidden: !order.quotation,
            },
            {
              label: 'View Invoice',
              icon: '🧾',
              onClick: () => setViewInvoiceModal(true),
              hidden: !order.sales_invoice,
            },
            {
              label: 'Print Receipt',
              icon: '🧾',
              onClick: handlePrintReceipt,
              hidden: !isErpNext,
            },
            {
              label: 'Print Label',
              icon: '🏷️',
              onClick: handlePrintLabel,
              hidden: !isErpNext,
            },
            // Edit action (only for draft, and if onEdit is provided)
            {
              label: 'Edit Order',
              icon: '✏️',
              onClick: () => onEdit?.(order),
              hidden: order.docstatus !== 0 || !onEdit,
            },
            // WhatsApp notification
            {
              label: whatsappEnabled ? 'Notify Customer' : 'Notify Customer (disabled)',
              icon: '📱',
              onClick: handleNotifyCustomer,
              hidden: !hasRole('executive', 'data_entry') || order.docstatus === 2,
              disabled: !whatsappEnabled,
            },
          ]}
        />
      </div>

      {/* Order Info Card */}
      <div className="mb-4 sm:mb-6 bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #F0EEEB' }}>
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{order.name}</h1>
              {order.reference_number && (
                <p className="text-sm text-gray-600 font-medium">Ref: {order.reference_number}</p>
              )}
              <p className="text-gray-500">Watch Repair Order</p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {order.docstatus === 0 && (
                <Badge className="bg-gray-200 text-gray-700">Draft</Badge>
              )}
              {order.docstatus === 1 && (
                <Badge className="bg-green-100 text-green-700">Submitted</Badge>
              )}
              {order.docstatus === 2 && (
                <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
              )}
              <Badge className={`${STATUS_COLORS[order.status]} px-4 py-1 text-sm`}>{order.status}</Badge>
              <Badge className={`${PRIORITY_COLORS[order.priority]} px-3 py-1 text-xs`}>{order.priority}</Badge>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4 sm:mt-6">
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E8EEF9' }}>
                  <UserIcon className="h-5 w-5" style={{ color: '#648DDA' }} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Customer</p>
                  <p className="font-semibold text-gray-900">{order.customer_name || order.customer}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{order.customer_mobile || 'No mobile number'}</p>
                </div>
              </div>
            </div>
            {order.reference_number && (
              <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FFF4E8' }}>
                    <span className="text-orange-600 font-bold text-sm">#</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Reference</p>
                    <p className="font-semibold text-gray-900">{order.reference_number}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E9F7EE' }}>
                  <CalendarIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Received</p>
                  <p className="font-semibold text-gray-900">{order.received_date}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FBEFDF' }}>
                  <ClockIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Promised Delivery</p>
                  <p className="font-semibold text-gray-900">{order.promised_delivery_date}</p>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Notification Status */}
          {whatsappEnabled && lastNotification && hasRole('executive', 'data_entry') && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <span>📱</span>
              <span>Last Notification:</span>
              <Badge className={
                lastNotification.status === 'Sent'
                  ? 'bg-green-100 text-green-700'
                  : lastNotification.status === 'Queued'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
              }>
                {lastNotification.status}
              </Badge>
              <span className="text-gray-400">—</span>
              <span>{lastNotification.order_status}</span>
              {lastNotification.sent_at && (
                <span className="text-gray-400 text-xs">
                  ({new Date(lastNotification.sent_at).toLocaleString()})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Billing Summary */}
      {(order.quotation || order.sales_invoice) && (
        <div className="mb-4 sm:mb-6 bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">Billing Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {order.quotation && (
              <>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#F6F1FA' }}>
                  <p className="text-xs text-purple-600 uppercase tracking-wide mb-1">Quotation Type</p>
                  <p className="text-xl font-bold text-purple-700">{order.quotation_type || 'N/A'}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#EAF6EE' }}>
                  <p className="text-xs text-green-600 uppercase tracking-wide mb-1">Quotation Amount</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(order.quotation_amount || 0)}</p>
                </div>
              </>
            )}
            {order.sales_invoice && (
              <>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#EAF0FA' }}>
                  <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">Paid Amount</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(order.paid_amount || 0)}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#FBF2E8' }}>
                  <p className="text-xs text-orange-600 uppercase tracking-wide mb-1">Balance Due</p>
                  <p className="text-xl font-bold text-orange-700">{formatCurrency(order.balance_amount || 0)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <h3 className="text-xl font-bold text-gray-800 mb-4">Watches in this Order ({order.items?.length || 0})</h3>
      {(order.items || []).map((item, idx) => (
        <WatchCard
          key={item.name || idx}
          item={item}
          itemIndex={idx}
          employees={employees}
          allItems={allItems}
          taskTemplates={taskTemplates}
          watchModels={watchModels}
          onAddPart={(itemIndex, taskIndex) => setAddPartModal({ isOpen: true, watchIndex: itemIndex, taskIndex })}
          onChangeTaskStatus={(itemIndex, taskIndex) => setChangeTaskStatusModal({ isOpen: true, watchIndex: itemIndex, taskIndex })}
          onUpdatePrices={(itemIndex) => setUpdatePriceModal({ isOpen: true, watchIndex: itemIndex })}
          onAssignTechnician={(itemIndex) => setAssignTechnicianModal({ isOpen: true, watchIndex: itemIndex })}
          onAddIssue={(itemIndex) => setAddIssueModal({ isOpen: true, watchIndex: itemIndex })}
          onAddTask={(itemIndex) => setAddTaskModal({ isOpen: true, watchIndex: itemIndex })}
          onSetWorkflowStatus={handleSetWorkflowStatus}
          onNotifyEstimateCustomer={handleNotifyEstimateCustomer}
          diagnosisSummaryTemplates={diagnosisSummaryTemplates}
          recommendedWorkTemplates={recommendedWorkTemplates}
          movementTypeTemplates={movementTypeTemplates}
          movementCaliberTemplates={movementCaliberTemplates}
          canEditDiagnosis={canEditDiagnosisForItem(item)}
          canManageWorkflowStatus={canManageWorkflowStatus}
          canNotifyEstimateCustomer={hasRole('executive', 'data_entry') && whatsappEnabled && order.docstatus !== 2}
          isSavingDiagnosis={diagnosisSavingItemName === item.name}
          onSaveDiagnosis={handleSaveDiagnosis}
          issueTemplates={issueTemplates}
          defaultExpanded={idx === 0}
        />
      ))}

      {/* Total Order Summary */}
      <div className="mt-4 sm:mt-6 p-4 sm:p-6 bg-white rounded-2xl shadow-sm" style={{ border: '1px solid #F0EEEB' }}>
        <div className="flex justify-between items-center">
          <span className="text-base sm:text-lg font-semibold text-gray-700">Total Estimated Cost</span>
          <span className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(totalOrderCost)}</span>
        </div>
      </div>

      {/* Modals */}
      {addPartModal.isOpen && addPartModal.watchIndex !== null && addPartModal.taskIndex !== null && (
        <AddPartModal
          isOpen={addPartModal.isOpen}
          onClose={() => setAddPartModal({ isOpen: false, watchIndex: null, taskIndex: null })}
          onSave={async (part, markCompleted) => {
            await handleAddPart(addPartModal.watchIndex!, addPartModal.taskIndex!, part, markCompleted);
            setAddPartModal({ isOpen: false, watchIndex: null, taskIndex: null });
          }}
          watchItem={order.items[addPartModal.watchIndex]}
          allItems={allItems}
          taskTemplates={taskTemplates}
          initialTask={order.items[addPartModal.watchIndex].tasks[addPartModal.taskIndex].name || `task_${addPartModal.taskIndex}`}
        />
      )}

      {changeTaskStatusModal.isOpen && changeTaskStatusModal.watchIndex !== null && changeTaskStatusModal.taskIndex !== null && (
        <ChangeTaskStatusModal
          isOpen={changeTaskStatusModal.isOpen}
          onClose={() => setChangeTaskStatusModal({ isOpen: false, watchIndex: null, taskIndex: null })}
          onSave={(status) => handleChangeTaskStatus(changeTaskStatusModal.watchIndex!, changeTaskStatusModal.taskIndex!, status)}
          currentStatus={order.items[changeTaskStatusModal.watchIndex].tasks[changeTaskStatusModal.taskIndex].status}
          taskName={taskTemplates.find(t => t.name === order.items[changeTaskStatusModal.watchIndex!].tasks[changeTaskStatusModal.taskIndex!].service)?.task_name || order.items[changeTaskStatusModal.watchIndex!].tasks[changeTaskStatusModal.taskIndex!].service}
        />
      )}

      {updatePriceModal.isOpen && updatePriceModal.watchIndex !== null && (
        <UpdatePriceModal
          isOpen={updatePriceModal.isOpen}
          onClose={() => setUpdatePriceModal({ isOpen: false, watchIndex: null })}
          onSave={(updatedTasks, updatedParts) => handleUpdatePrices(updatePriceModal.watchIndex!, updatedTasks, updatedParts)}
          watchItem={order.items[updatePriceModal.watchIndex]}
          taskTemplates={taskTemplates}
          allItems={allItems}
        />
      )}

      {/* Create Quotation Modal */}
      {createQuotationModal && (
        <CreateQuotationModal
          isOpen={createQuotationModal}
          onClose={() => setCreateQuotationModal(false)}
          onSave={handleCreateQuotation}
          order={order}
          taskTemplates={taskTemplates}
          allItems={allItems}
        />
      )}

      {/* Assign Technician Modal */}
      {assignTechnicianModal.isOpen && assignTechnicianModal.watchIndex !== null && (
        <AssignTechnicianModal
          isOpen={assignTechnicianModal.isOpen}
          onClose={() => setAssignTechnicianModal({ isOpen: false, watchIndex: null })}
          onSave={(technicianId) => handleAssignTechnician(assignTechnicianModal.watchIndex!, technicianId)}
          currentTechnician={order.items[assignTechnicianModal.watchIndex].technician}
          employees={employees}
          watchItem={order.items[assignTechnicianModal.watchIndex]}
        />
      )}

      {/* Add Issue Modal */}
      {addIssueModal.isOpen && addIssueModal.watchIndex !== null && (() => {
        const watchIndex = addIssueModal.watchIndex;
        const currentIssueNames = new Set((order.items[watchIndex]?.issues || []).map((i: any) => i.issue));
        return (
          <AddIssueModal
            isOpen={addIssueModal.isOpen}
            onClose={() => setAddIssueModal({ isOpen: false, watchIndex: null })}
            issueTemplates={issueTemplates}
            taskTemplates={taskTemplates}
            currentIssueNames={currentIssueNames}
            onSave={async (selected) => {
              await handleAddIssue(watchIndex, selected);
              setAddIssueModal({ isOpen: false, watchIndex: null });
            }}
          />
        );
      })()}

      {/* Add Task Modal */}
      {addTaskModal.isOpen && addTaskModal.watchIndex !== null && (() => {
        const watchIndex = addTaskModal.watchIndex;
        const currentTaskServiceNames = new Set((order.items[watchIndex]?.tasks || []).map((t: any) => t.service));
        return (
          <AddTaskModal
            isOpen={addTaskModal.isOpen}
            onClose={() => setAddTaskModal({ isOpen: false, watchIndex: null })}
            taskTemplates={taskTemplates}
            currentTaskServiceNames={currentTaskServiceNames}
            onSave={async (selected) => {
              await handleAddTask(watchIndex, selected);
              setAddTaskModal({ isOpen: false, watchIndex: null });
            }}
          />
        );
      })()}

      {/* View Quotation Modal */}
      {order.quotation && (
        <ViewQuotationModal
          isOpen={viewQuotationModal}
          onClose={() => setViewQuotationModal(false)}
          quotationName={order.quotation}
          onUpdated={() => onRefresh?.(order.name)}
        />
      )}

      {/* View Invoice Modal */}
      {order.sales_invoice && (
        <ViewInvoiceModal
          isOpen={viewInvoiceModal}
          onClose={() => setViewInvoiceModal(false)}
          invoiceName={order.sales_invoice}
          onUpdated={() => onRefresh?.(order.name)}
        />
      )}

      {/* WhatsApp Notify Modal */}
      <NotifyCustomerModal
        isOpen={showNotifyModal}
        onClose={() => setShowNotifyModal(false)}
        orderName={order.name}
        orderStatus={order.status}
        onSuccess={handleNotifySuccess}
      />

      <Modal
        isOpen={showEstimateNotifyModal}
        onClose={handleCloseEstimateNotifyModal}
        title="Notify Customer: Watch Estimate"
        maxWidthClass="max-w-lg"
      >
        {estimateNotifyPhase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div
              className="animate-spin rounded-full h-10 w-10"
              style={{
                borderTop: '3px solid #25D366',
                borderBottom: '3px solid #25D366',
                borderLeft: '3px solid transparent',
                borderRight: '3px solid transparent',
              }}
            />
            <p className="text-sm text-gray-500">Preparing watch estimate preview...</p>
          </div>
        )}

        {(estimateNotifyPhase === 'preview' || estimateNotifyPhase === 'sending') && estimatePreview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-900">{estimatePreview.watch_label || 'Watch'}</p>
              <p className="text-gray-600 mt-1">Estimate Total: <span className="font-semibold text-green-700">{estimatePreview.estimate_total || 'N/A'}</span></p>
              <p className="text-gray-500 mt-1">Recommended Work: {(estimatePreview.recommended_work || []).length > 0 ? estimatePreview.recommended_work.join(', ') : 'None'}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Message preview</p>
              <div className="rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap shadow-sm" style={{ backgroundColor: '#DCF8C6' }}>
                {estimatePreview.message_body}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button variant="ghost" onClick={handleCloseEstimateNotifyModal} disabled={estimateNotifyPhase === 'sending'}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleSendEstimateNotification()}
                disabled={estimateNotifyPhase === 'sending'}
                className="text-white hover:opacity-90"
                style={{ backgroundColor: '#25D366' }}
              >
                {estimateNotifyPhase === 'sending' ? 'Sending...' : 'Send WhatsApp'}
              </Button>
            </div>
          </div>
        )}

        {estimateNotifyPhase === 'success' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E6F9ED' }}>
              <span className="text-3xl">✅</span>
            </div>
            <p className="font-semibold text-gray-900">Estimate notification queued</p>
            <p className="text-sm text-gray-500">The customer will receive the watch-specific estimate via WhatsApp.</p>
          </div>
        )}

        {estimateNotifyPhase === 'error' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {estimateNotifyError || 'Failed to prepare or send estimate notification.'}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button variant="ghost" onClick={handleCloseEstimateNotifyModal}>Close</Button>
              {estimateNotifyItemIndex !== null && (
                <Button
                  onClick={() => void handleNotifyEstimateCustomer(estimateNotifyItemIndex)}
                  className="text-white hover:opacity-90"
                  style={{ backgroundColor: '#25D366' }}
                >
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={paymentModal.isOpen}
        onClose={() => setPaymentModal({ isOpen: false, invoiceName: '', invoiceAmount: 0 })}
        repairOrderName={order.name}
        invoiceName={paymentModal.invoiceName}
        invoiceAmount={paymentModal.invoiceAmount}
        onSuccess={async () => {
          if (onRefresh) {
            await onRefresh(order.name);
          }
        }}
      />
    </div>
  );
};

export default RepairOrderDetail;
