import React, { useState, useEffect, useCallback } from 'react';
import type { RepairOrder, RepairItem, RepairTask, RepairPartUsed, Customer, Employee, Item, RepairTaskTemplate, WatchBrand, WatchModel, IssueTemplate, WatchConditionTemplate, DiagnosisSummaryTemplate, RecommendedWorkTemplate, MovementTypeTemplate, MovementCaliberTemplate, RepairItemIssue } from '../types';
import { OrderStatus, Priority, WatchStatus, TaskStatus, resolveDiagnosisStatus } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { mockCustomers, mockEmployees, mockSpareParts, mockTaskTemplates } from '../services/mockData';
import { Modal } from './ui/Modal';
import { CreateCustomerModal } from './CreateCustomerModal';
import { CreateBrandModal } from './CreateBrandModal';
import { CreateModelModal } from './CreateModelModal';
import { AddPartModal } from './AddPartModal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { Autocomplete } from './ui/Autocomplete';
import { useAppConfig } from '../context/AppConfigContext';

const DEFAULT_WATCH_CONDITION_TEMPLATES: WatchConditionTemplate[] = [
    { name: 'Scratches on crystal', condition_name: 'Scratches on crystal', description: 'Visible crystal scratching noted at intake.' },
    { name: 'Cracked crystal', condition_name: 'Cracked crystal', description: 'Crystal already cracked before service.' },
    { name: 'Case scratches', condition_name: 'Case scratches', description: 'Visible scratching on case surfaces.' },
    { name: 'Case dents', condition_name: 'Case dents', description: 'Case has dents or impact marks.' },
    { name: 'Bezel scratched', condition_name: 'Bezel scratched', description: 'Bezel or bezel insert shows cosmetic wear.' },
    { name: 'Bezel loose', condition_name: 'Bezel loose', description: 'Bezel feels loose or has excess play.' },
    { name: 'Crown worn', condition_name: 'Crown worn', description: 'Crown shows visible wear or cosmetic damage.' },
    { name: 'Crown loose', condition_name: 'Crown loose', description: 'Crown is loose or does not feel secure.' },
    { name: 'Pusher damaged', condition_name: 'Pusher damaged', description: 'Pushers show visible damage or wear.' },
    { name: 'Dial stained', condition_name: 'Dial stained', description: 'Dial has visible staining, spotting, or discoloration.' },
    { name: 'Hands corroded', condition_name: 'Hands corroded', description: 'Hands show corrosion, oxidation, or finish damage.' },
    { name: 'Bracelet scratched', condition_name: 'Bracelet scratched', description: 'Bracelet has visible scratches or surface wear.' },
    { name: 'Bracelet stretched', condition_name: 'Bracelet stretched', description: 'Bracelet shows stretch or excessive slack.' },
    { name: 'Bracelet link missing', condition_name: 'Bracelet link missing', description: 'One or more bracelet links are missing.' },
    { name: 'Clasp loose', condition_name: 'Clasp loose', description: 'Clasp does not close firmly or has excess movement.' },
    { name: 'Strap worn', condition_name: 'Strap worn', description: 'Strap shows visible wear from prior use.' },
    { name: 'Strap cracked', condition_name: 'Strap cracked', description: 'Strap is cracked, split, or dried out.' },
    { name: 'Strap torn', condition_name: 'Strap torn', description: 'Strap is torn or structurally damaged.' },
    { name: 'Strap stitching damaged', condition_name: 'Strap stitching damaged', description: 'Strap stitching is loose, frayed, or broken.' },
    { name: 'Spring bar loose', condition_name: 'Spring bar loose', description: 'Spring bar is loose or not seated securely.' },
    { name: 'Spring bar missing', condition_name: 'Spring bar missing', description: 'One or more spring bars are missing.' },
    { name: 'Moisture under crystal', condition_name: 'Moisture under crystal', description: 'Condensation or moisture is visible beneath the crystal.' },
    { name: 'Water damage signs', condition_name: 'Water damage signs', description: 'Visible indicators suggest prior water ingress.' },
    { name: 'Rust visible', condition_name: 'Rust visible', description: 'Rust is visible externally at intake.' },
    { name: 'Corrosion visible', condition_name: 'Corrosion visible', description: 'Visible corrosion is present on external parts.' },
    { name: 'Screw missing', condition_name: 'Screw missing', description: 'One or more visible screws are missing.' },
    { name: 'Screw mismatched', condition_name: 'Screw mismatched', description: 'A visible screw appears non-matching or previously replaced.' },
    { name: 'Previous repair marks', condition_name: 'Previous repair marks', description: 'Marks indicate prior opening or repair attempts.' },
    { name: 'Non-original parts visible', condition_name: 'Non-original parts visible', description: 'Visible external parts appear aftermarket or non-original.' },
    { name: 'Heavy cosmetic wear', condition_name: 'Heavy cosmetic wear', description: 'Watch shows heavy pre-existing cosmetic wear.' },
    { name: 'Impact damage visible', condition_name: 'Impact damage visible', description: 'Impact damage is visible on the watch exterior.' },
    { name: 'Other cosmetic condition', condition_name: 'Other cosmetic condition', description: 'Use when another cosmetic condition needs to be documented.' },
    { name: 'Other physical condition', condition_name: 'Other physical condition', description: 'Use when another physical condition needs to be documented.' },
];

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
    { name: 'Chronograph movement', movement_type: 'Chronograph movement', description: 'Watch contains a chronograph complication.' },
    { name: 'GMT movement', movement_type: 'GMT movement', description: 'Watch contains a GMT or dual-time movement.' },
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

interface RepairOrderFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (order: RepairOrder) => void;
    order?: RepairOrder | null;
}

const toDisplayDate = (isoDate?: string): string => {
    if (!isoDate) return '';
    const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[3]}/${m[2]}/${m[1]}`;
};

const toIsoDate = (displayDate?: string): string | null => {
    if (!displayDate) return null;
    const value = displayDate.trim();

    const withDash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (withDash) {
        return `${withDash[3]}-${withDash[2]}-${withDash[1]}`;
    }

    const withSlash = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (withSlash) {
        return `${withSlash[3]}-${withSlash[2]}-${withSlash[1]}`;
    }

    const compact = value.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compact) {
        return `${compact[3]}-${compact[2]}-${compact[1]}`;
    }

    return null;
};

const newRepairItem = (): Omit<RepairItem, 'name'> => ({
    watch_brand: '',
    watch_model: '',
    serial_number: '',
    issues: [],
    issue_description: '',
    pre_existing_condition: [],
    diagnosis_status: 'Pending Diagnosis',
    diagnosis_summary: [],
    movement_type: [],
    movement_caliber: [],
    movement_information: [],
    recommended_work: [],
    diagnosed_by: '',
    diagnosis_date: '',
    technician: '',
    status: WatchStatus.Pending,
    intake_checklist: { scratches: false, water_resistance: false, missing_parts: false, other_observations: '' },
    tasks: [],
    parts_used: [],
});


export const RepairOrderForm: React.FC<RepairOrderFormProps> = ({ isOpen, onClose, onSave, order }) => {
    const { formatCurrency } = useAppConfig();
    const showPostIntakeFields = Boolean(order?.name);
    const [formData, setFormData] = useState<RepairOrder | null>(null);
    const [preExistingConditionQueries, setPreExistingConditionQueries] = useState<Record<number, string>>({});
    const [diagnosisSummaryQueries, setDiagnosisSummaryQueries] = useState<Record<number, string>>({});
    const [movementTypeQueries, setMovementTypeQueries] = useState<Record<number, string>>({});
    const [movementCaliberQueries, setMovementCaliberQueries] = useState<Record<number, string>>({});
    const [dependencies, setDependencies] = useState<{
        customers: Customer[];
        employees: Employee[];
        services: RepairTaskTemplate[];
        parts: Item[];
        brands: WatchBrand[];
        models: WatchModel[];
        issueTemplates: IssueTemplate[];
        watchConditionTemplates: WatchConditionTemplate[];
        diagnosisSummaryTemplates: DiagnosisSummaryTemplate[];
        recommendedWorkTemplates: RecommendedWorkTemplate[];
        movementTypeTemplates: MovementTypeTemplate[];
        movementCaliberTemplates: MovementCaliberTemplate[];
    }>({ customers: [], employees: [], services: [], parts: [], brands: [], models: [], issueTemplates: [], watchConditionTemplates: [], diagnosisSummaryTemplates: [], recommendedWorkTemplates: [], movementTypeTemplates: [], movementCaliberTemplates: [] });

    // Customer Creation State
    const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
    const [createCustomerQuery, setCreateCustomerQuery] = useState('');

    // Customer repair history
    const [repairHistory, setRepairHistory] = useState<apiService.CustomerRepairHistoryRow[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [expandedHistoryRow, setExpandedHistoryRow] = useState<string | null>(null);
    const [historyDetails, setHistoryDetails] = useState<Record<string, any>>({});

    // Brand/Model Creation State
    const [isCreateBrandOpen, setIsCreateBrandOpen] = useState(false);
    const [createBrandQuery, setCreateBrandQuery] = useState('');
    const [activeBrandIndex, setActiveBrandIndex] = useState<number | null>(null);

    const [isCreateModelOpen, setIsCreateModelOpen] = useState(false);
    const [createModelQuery, setCreateModelQuery] = useState('');
    const [createModelBrand, setCreateModelBrand] = useState('');
    const [activeModelIndex, setActiveModelIndex] = useState<number | null>(null);

    // Add Part Modal State
    const [isAddPartModalOpen, setIsAddPartModalOpen] = useState(false);
    const [activePartItemIndex, setActivePartItemIndex] = useState<number | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);


    const loadDependencies = useCallback(async () => {
        if (isErpNext) {
            const [customers, employees, taskTemplates, brands, issueTemplates, watchConditionTemplates, diagnosisSummaryTemplates, recommendedWorkTemplates, movementTypeTemplates, movementCaliberTemplates] = await Promise.all([
                apiService.getCustomers(),
                apiService.getEmployees(),
                apiService.getTaskTemplates(),
                apiService.getWatchBrands(),
                apiService.getIssueTemplates(),
                apiService.getWatchConditionTemplates(),
                apiService.getDiagnosisSummaryTemplates(),
                apiService.getRecommendedWorkTemplates(),
                apiService.getMovementTypeTemplates(),
                apiService.getMovementCaliberTemplates(),
            ]);
            setDependencies({
                customers,
                employees,
                services: taskTemplates,
                parts: [], // Start empty - users must search
                brands,
                models: [], // Models loaded when brand is selected
                issueTemplates,
                watchConditionTemplates,
                diagnosisSummaryTemplates,
                recommendedWorkTemplates,
                movementTypeTemplates,
                movementCaliberTemplates,
            });
            return;
        }
        // Standalone mode: use mock data so the UI stays usable without ERPNext
        setDependencies({
            customers: mockCustomers,
            employees: mockEmployees,
            services: mockTaskTemplates,
            parts: mockSpareParts,
            brands: [],
            models: [],
            issueTemplates: [],
            watchConditionTemplates: DEFAULT_WATCH_CONDITION_TEMPLATES,
            diagnosisSummaryTemplates: DEFAULT_DIAGNOSIS_SUMMARY_TEMPLATES,
            recommendedWorkTemplates: mockTaskTemplates.map(template => ({
                name: template.name,
                work_name: template.task_name,
                description: template.description,
            })),
            movementTypeTemplates: DEFAULT_MOVEMENT_TYPE_TEMPLATES,
            movementCaliberTemplates: DEFAULT_MOVEMENT_CALIBER_TEMPLATES,
        });
    }, []);

    const availableWatchConditionSuggestions = (itemIndex: number) => {
        const selectedConditions = formData.items[itemIndex].pre_existing_condition || [];
        const query = (preExistingConditionQueries[itemIndex] || '').trim().toLowerCase();

        return dependencies.watchConditionTemplates
            .filter(template => !selectedConditions.some(existing => existing.toLowerCase() === template.condition_name.toLowerCase()))
            .filter(template => !query || template.condition_name.toLowerCase().includes(query) || (template.description || '').toLowerCase().includes(query))
            .slice(0, 8);
    };

    const availableDiagnosisSummarySuggestions = (itemIndex: number) => {
        const selectedSummaries = formData.items[itemIndex].diagnosis_summary || [];
        const query = (diagnosisSummaryQueries[itemIndex] || '').trim().toLowerCase();

        return dependencies.diagnosisSummaryTemplates
            .filter(template => !selectedSummaries.some(existing => existing.toLowerCase() === template.summary_name.toLowerCase()))
            .filter(template => !query || template.summary_name.toLowerCase().includes(query) || (template.description || '').toLowerCase().includes(query))
            .slice(0, 8);
    };

    const availableMovementTypeSuggestions = (itemIndex: number) => {
        const selectedValues = formData.items[itemIndex].movement_type || [];
        const query = (movementTypeQueries[itemIndex] || '').trim().toLowerCase();

        return dependencies.movementTypeTemplates
            .filter(template => !selectedValues.some(existing => existing.toLowerCase() === template.movement_type.toLowerCase()))
            .filter(template => !query || template.movement_type.toLowerCase().includes(query) || (template.description || '').toLowerCase().includes(query))
            .slice(0, 8);
    };

    const availableMovementCaliberSuggestions = (itemIndex: number) => {
        const selectedValues = formData.items[itemIndex].movement_caliber || [];
        const query = (movementCaliberQueries[itemIndex] || '').trim().toLowerCase();

        return dependencies.movementCaliberTemplates
            .filter(template => !selectedValues.some(existing => existing.toLowerCase() === template.caliber_code.toLowerCase()))
            .filter(template => !query || template.caliber_code.toLowerCase().includes(query) || (template.description || '').toLowerCase().includes(query))
            .slice(0, 8);
    };

    useEffect(() => {
        if (isOpen) {
            loadDependencies();
            setValidationErrors([]);
            setPreExistingConditionQueries({});
            setDiagnosisSummaryQueries({});
            setMovementTypeQueries({});
            setMovementCaliberQueries({});
        }
    }, [isOpen, loadDependencies]);

    useEffect(() => {
        if (!isOpen) return;

        if (order) {
            const normalizedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
            normalizedOrder.received_date = toDisplayDate(normalizedOrder.received_date);
            normalizedOrder.promised_delivery_date = toDisplayDate(normalizedOrder.promised_delivery_date);
            setFormData(normalizedOrder); // Deep copy

            // Pre-load models for existing items
            if (isErpNext) {
                const uniqueBrands = Array.from(new Set(order.items?.map(i => i.watch_brand).filter(Boolean)));
                const brandsPromise = Promise.all(uniqueBrands.map(brand => apiService.getWatchModels(brand || '')));

                // Load parts that are already selected in the order
                const partIds = Array.from(new Set(
                    order.items?.flatMap(item =>
                        item.parts_used?.map(p => p.part) || []
                    ).filter(Boolean) || []
                ));
                const partsPromise = apiService.getItemsByIds(partIds);

                Promise.all([brandsPromise, partsPromise])
                    .then(([modelResults, loadedParts]) => {
                        const allModels = modelResults.flat();
                        setDependencies(prev => ({
                            ...prev,
                            models: allModels,
                            parts: loadedParts // Load only the parts already selected
                        }));
                    });
            }

        } else {
            const newOrder: RepairOrder = {
                name: '', // Will be set by ERPNext on creation
                customer: '',
                contact_person: '',
                status: OrderStatus.Pending,
                received_date: toDisplayDate(new Date().toISOString().split('T')[0]),
                promised_delivery_date: toDisplayDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
                priority: Priority.Normal,
                items: [newRepairItem()],
            };
            setFormData(newOrder);
        }
    }, [order, isOpen]); // Note: dependencies.customers must NOT be here — adding a new customer updates that list and would reset the form

    // Fetch repair history when customer changes
    useEffect(() => {
        const customer = formData?.customer;
        if (!customer) {
            setRepairHistory([]);
            return;
        }
        apiService.getCustomerRepairHistory(customer, 5).then(rows => {
            // Exclude the current order from history if editing
            const currentName = formData?.name;
            setRepairHistory(currentName ? rows.filter(r => r.name !== currentName) : rows);
        }).catch(() => setRepairHistory([]));
    }, [formData?.customer]);

    if (!formData) return null;

    const handleFieldChange = (field: keyof RepairOrder, value: any) => {
        setFormData(prev => prev ? { ...prev, [field]: value } : null);
    };

    const resolveTaskTemplateName = (value: string): string | null => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return null;
        }

        const match = dependencies.services.find(service => (
            service.name.toLowerCase() === normalized || service.task_name.toLowerCase() === normalized
        ));

        return match?.name || null;
    };

    const buildAutoTasksForItem = (item: RepairItem): RepairTask[] => {
        const recommendedServices = Array.from(new Set(
            (item.recommended_work || [])
                .map(resolveTaskTemplateName)
                .filter((serviceName): serviceName is string => Boolean(serviceName))
        ));

        const issueServices = Array.from(new Set(
            (item.issues || [])
                .map(issue => issue.is_other ? null : (dependencies.issueTemplates.find(template => template.name === issue.issue)?.suggested_task || null))
                .filter((serviceName): serviceName is string => Boolean(serviceName))
        ));

        const serviceNames = recommendedServices.length > 0 ? recommendedServices : issueServices;
        return serviceNames.map(service => ({
            service,
            technician: item.technician,
            notes: '',
            status: TaskStatus.Pending,
        }));
    };

    const handleItemChange = <K extends keyof RepairItem>(itemIndex: number, field: K, value: RepairItem[K]) => {
        const newItems = [...formData.items];
        let updatedItem = { ...newItems[itemIndex], [field]: value };

        if (field === 'recommended_work') {
            updatedItem = { ...updatedItem, tasks: buildAutoTasksForItem(updatedItem) };
        }

        if (field === 'technician') {
            updatedItem = {
                ...updatedItem,
                tasks: (updatedItem.tasks || []).map(task => ({ ...task, technician: value as string })),
            };
        }

        if (field === 'diagnosis_summary' || field === 'movement_type' || field === 'movement_caliber' || field === 'recommended_work') {
            updatedItem.diagnosis_status = resolveDiagnosisStatus(updatedItem.diagnosis_status, updatedItem);
        }
        newItems[itemIndex] = updatedItem;
        setFormData({ ...formData, items: newItems });
    };

    const handleAddItem = () => {
        const newItems = [...formData.items, newRepairItem()];
        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveItem = (itemIndex: number) => {
        const newItems = formData.items.filter((_, index) => index !== itemIndex);
        setFormData({ ...formData, items: newItems });
        setPreExistingConditionQueries(prev => {
            const next: Record<number, string> = {};
            Object.entries(prev).forEach(([key, value]) => {
                const index = Number(key);
                if (index < itemIndex) next[index] = value;
                if (index > itemIndex) next[index - 1] = value;
            });
            return next;
        });
        setDiagnosisSummaryQueries(prev => {
            const next: Record<number, string> = {};
            Object.entries(prev).forEach(([key, value]) => {
                const index = Number(key);
                if (index < itemIndex) next[index] = value;
                if (index > itemIndex) next[index - 1] = value;
            });
            return next;
        });
        setMovementTypeQueries(prev => {
            const next: Record<number, string> = {};
            Object.entries(prev).forEach(([key, value]) => {
                const index = Number(key);
                if (index < itemIndex) next[index] = value;
                if (index > itemIndex) next[index - 1] = value;
            });
            return next;
        });
        setMovementCaliberQueries(prev => {
            const next: Record<number, string> = {};
            Object.entries(prev).forEach(([key, value]) => {
                const index = Number(key);
                if (index < itemIndex) next[index] = value;
                if (index > itemIndex) next[index - 1] = value;
            });
            return next;
        });
    };

    const handlePreExistingConditionQueryChange = (itemIndex: number, value: string) => {
        setPreExistingConditionQueries(prev => ({ ...prev, [itemIndex]: value }));
    };

    const handleAddPreExistingCondition = (itemIndex: number, rawValue: string) => {
        const value = rawValue.trim();
        if (!value) return;

        const existing = formData.items[itemIndex].pre_existing_condition || [];
        if (existing.some(entry => entry.toLowerCase() === value.toLowerCase())) {
            setPreExistingConditionQueries(prev => ({ ...prev, [itemIndex]: '' }));
            return;
        }

        handleItemChange(itemIndex, 'pre_existing_condition', [...existing, value]);
        setPreExistingConditionQueries(prev => ({ ...prev, [itemIndex]: '' }));
    };

    const handleRemovePreExistingCondition = (itemIndex: number, valueToRemove: string) => {
        const existing = formData.items[itemIndex].pre_existing_condition || [];
        handleItemChange(
            itemIndex,
            'pre_existing_condition',
            existing.filter(value => value !== valueToRemove)
        );
    };

    const handleDiagnosisSummaryQueryChange = (itemIndex: number, value: string) => {
        setDiagnosisSummaryQueries(prev => ({ ...prev, [itemIndex]: value }));
    };

    const handleAddDiagnosisSummary = (itemIndex: number, rawValue: string) => {
        const value = rawValue.trim();
        if (!value) return;

        const existing = formData.items[itemIndex].diagnosis_summary || [];
        if (existing.some(entry => entry.toLowerCase() === value.toLowerCase())) {
            setDiagnosisSummaryQueries(prev => ({ ...prev, [itemIndex]: '' }));
            return;
        }

        handleItemChange(itemIndex, 'diagnosis_summary', [...existing, value]);
        setDiagnosisSummaryQueries(prev => ({ ...prev, [itemIndex]: '' }));
    };

    const handleRemoveDiagnosisSummary = (itemIndex: number, valueToRemove: string) => {
        const existing = formData.items[itemIndex].diagnosis_summary || [];
        handleItemChange(
            itemIndex,
            'diagnosis_summary',
            existing.filter(value => value !== valueToRemove)
        );
    };

    const handleMovementTypeQueryChange = (itemIndex: number, value: string) => {
        setMovementTypeQueries(prev => ({ ...prev, [itemIndex]: value }));
    };

    const handleAddMovementType = (itemIndex: number, rawValue: string) => {
        const value = rawValue.trim();
        if (!value) return;

        const existing = formData.items[itemIndex].movement_type || [];
        if (existing.some(entry => entry.toLowerCase() === value.toLowerCase())) {
            setMovementTypeQueries(prev => ({ ...prev, [itemIndex]: '' }));
            return;
        }

        handleItemChange(itemIndex, 'movement_type', [...existing, value]);
        setMovementTypeQueries(prev => ({ ...prev, [itemIndex]: '' }));
    };

    const handleRemoveMovementType = (itemIndex: number, valueToRemove: string) => {
        const existing = formData.items[itemIndex].movement_type || [];
        handleItemChange(itemIndex, 'movement_type', existing.filter(value => value !== valueToRemove));
    };

    const handleMovementCaliberQueryChange = (itemIndex: number, value: string) => {
        setMovementCaliberQueries(prev => ({ ...prev, [itemIndex]: value }));
    };

    const handleAddMovementCaliber = (itemIndex: number, rawValue: string) => {
        const value = rawValue.trim();
        if (!value) return;

        const existing = formData.items[itemIndex].movement_caliber || [];
        if (existing.some(entry => entry.toLowerCase() === value.toLowerCase())) {
            setMovementCaliberQueries(prev => ({ ...prev, [itemIndex]: '' }));
            return;
        }

        handleItemChange(itemIndex, 'movement_caliber', [...existing, value]);
        setMovementCaliberQueries(prev => ({ ...prev, [itemIndex]: '' }));
    };

    const handleRemoveMovementCaliber = (itemIndex: number, valueToRemove: string) => {
        const existing = formData.items[itemIndex].movement_caliber || [];
        handleItemChange(itemIndex, 'movement_caliber', existing.filter(value => value !== valueToRemove));
    };

    const handleTaskChange = (itemIndex: number, taskIndex: number, field: keyof RepairTask, value: any) => {
        const newItems = [...formData.items];
        const newTasks = [...newItems[itemIndex].tasks];
        newTasks[taskIndex] = { ...newTasks[taskIndex], [field]: value };
        newItems[itemIndex].tasks = newTasks;
        setFormData({ ...formData, items: newItems });
    };

    const handleAddTask = (itemIndex: number) => {
        const newItems = [...formData.items];
        const newTask: RepairTask = {
            service: dependencies.services[0]?.name || '',
            technician: newItems[itemIndex].technician,
            notes: '',
            status: TaskStatus.Pending
        };
        if (!newItems[itemIndex].tasks) newItems[itemIndex].tasks = [];
        newItems[itemIndex].tasks.push(newTask);
        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveTask = (itemIndex: number, taskIndex: number) => {
        const newItems = [...formData.items];
        newItems[itemIndex].tasks = newItems[itemIndex].tasks.filter((_, index) => index !== taskIndex);
        setFormData({ ...formData, items: newItems });
    };

    const handlePartChange = (itemIndex: number, partIndex: number, field: keyof RepairPartUsed, value: any) => {
        const newItems = [...formData.items];
        const newParts = [...newItems[itemIndex].parts_used];
        newParts[partIndex] = { ...newParts[partIndex], [field]: value };
        newItems[itemIndex].parts_used = newParts;
        setFormData({ ...formData, items: newItems });
    };

    const handleAddPart = (itemIndex: number) => {
        const newItems = [...formData.items];
        const newPart: RepairPartUsed = {
            part: dependencies.parts[0]?.name || '',
            quantity: 1,
            uom: dependencies.parts[0]?.stock_uom || 'Unit'
        };
        if (!newItems[itemIndex].parts_used) newItems[itemIndex].parts_used = [];
        newItems[itemIndex].parts_used.push(newPart);
        setFormData({ ...formData, items: newItems });
    };

    const handleOpenAddPart = (itemIndex: number) => {
        setActivePartItemIndex(itemIndex);
        setIsAddPartModalOpen(true);
    };

    const handleSavePart = async (part: RepairPartUsed, markTaskCompleted: boolean = false) => {
        if (activePartItemIndex === null) return;

        const newItems = [...formData.items];
        if (!newItems[activePartItemIndex].parts_used) {
            newItems[activePartItemIndex].parts_used = [];
        }

        // Add the part
        newItems[activePartItemIndex].parts_used.push(part);

        // If requested, mark the linked task as completed
        if (part.task) {
            const taskIndex = newItems[activePartItemIndex].tasks.findIndex(t =>
                (t.name && t.name === part.task) || (part.task.startsWith('task_') && part.task === `task_${newItems[activePartItemIndex].tasks.indexOf(t)}`)
            );

            if (taskIndex !== -1) {
                if (markTaskCompleted) {
                    newItems[activePartItemIndex].tasks[taskIndex].status = TaskStatus.Completed;
                } else if (newItems[activePartItemIndex].tasks[taskIndex].status === TaskStatus.Pending) {
                    // Update to In Progress if it was Pending and we just added a part
                    newItems[activePartItemIndex].tasks[taskIndex].status = TaskStatus.InProgress;
                }
            }
        }

        setFormData({ ...formData, items: newItems });
        setIsAddPartModalOpen(false);
    };

    const handleRemovePart = (itemIndex: number, partIndex: number) => {
        const newItems = [...formData.items];
        newItems[itemIndex].parts_used = newItems[itemIndex].parts_used.filter((_, index) => index !== partIndex);
        setFormData({ ...formData, items: newItems });
    };

    const handleIssueToggle = (itemIndex: number, template: IssueTemplate, checked: boolean) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = checked
                ? [...item.issues, { issue: template.name, is_other: false, other_description: '' }]
                : item.issues.filter(i => i.issue !== template.name);

            const updatedItem = { ...item, issues: newIssues };
            return { ...updatedItem, tasks: buildAutoTasksForItem(updatedItem) };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleOtherIssueToggle = (itemIndex: number, checked: boolean) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = checked
                ? [...item.issues, { issue: 'Other', is_other: true, other_description: '' }]
                : item.issues.filter(i => !i.is_other);

            const updatedItem = { ...item, issues: newIssues };
            return { ...updatedItem, tasks: buildAutoTasksForItem(updatedItem) };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleOtherDescriptionChange = (itemIndex: number, description: string) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = item.issues.map(issue =>
                issue.is_other ? { ...issue, other_description: description } : issue
            );

            return { ...item, issues: newIssues };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Check mandatory fields for items
        const missingFields: string[] = [];
        formData.items.forEach((item, idx) => {
            if (!item.watch_brand) missingFields.push(`Row #${idx + 1}: Watch Brand`);
            if (!item.watch_model) missingFields.push(`Row #${idx + 1}: Watch Model`);
        });

        if (missingFields.length > 0) {
            setValidationErrors(missingFields);
            return;
        }

        const receivedDateIso = toIsoDate(formData.received_date);
        const promisedDateIso = toIsoDate(formData.promised_delivery_date);
        if (!receivedDateIso) missingFields.push('Received Date must be in DD/MM/YYYY format');
        if (!promisedDateIso) missingFields.push('Promised Delivery must be in DD/MM/YYYY format');
        if (receivedDateIso && promisedDateIso && promisedDateIso < receivedDateIso) {
            missingFields.push('Promised Delivery cannot be before the Received Date');
        }

        if (missingFields.length > 0) {
            setValidationErrors(missingFields);
            return;
        }

        const sanitizedItems = formData.items.map((item) => ({
            ...item,
            issues: (item.issues || []).map((issue) => {
                if (issue.is_other) {
                    return { ...issue, issue: 'Other' };
                }
                return issue;
            })
        }));

        setValidationErrors([]);
        onSave({
            ...formData,
            received_date: receivedDateIso!,
            promised_delivery_date: promisedDateIso!,
            items: sanitizedItems
        });
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={order ? 'Edit Repair Order' : 'New Repair Order'}
                maxWidthClass="max-w-5xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6 pb-24">
                    {validationErrors.length > 0 && (
                        <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#F3D2D2', backgroundColor: '#FFF6F6' }}>
                            <p className="text-sm font-semibold text-red-700 mb-1">Required fields are missing:</p>
                            <ul className="text-sm text-red-700 list-disc ml-5">
                                {validationErrors.map((error) => (
                                    <li key={error}>{error}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <Autocomplete
                                label="Customer"
                                placeholder="Search by name or phone..."
                                options={dependencies.customers.map(c => ({
                                    value: c.name,
                                    label: c.customer_name,
                                    subtitle: c.phone_display || c.name
                                }))}
                                value={formData.customer}
                                onChange={(value) => handleFieldChange('customer', value)}
                                onSearch={async (query) => {
                                    if (isErpNext && query.trim()) {
                                        const results = await apiService.getCustomers(query);
                                        setDependencies(prev => ({ ...prev, customers: results }));
                                    }
                                }}
                                onCreate={(query) => {
                                    setCreateCustomerQuery(query);
                                    setIsCreateCustomerOpen(true);
                                }}
                            />

                        </div>

                        {/* Previous orders for this customer */}
                        {repairHistory.length > 0 && (
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                                    onClick={() => setHistoryExpanded(prev => !prev)}
                                >
                                    <span>Previous Orders ({repairHistory.length})</span>
                                    <svg className={`w-4 h-4 transition-transform ${historyExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {historyExpanded && (
                                    <div className="divide-y divide-gray-100">
                                        {repairHistory.map(row => (
                                            <div key={row.name}>
                                                <button
                                                    type="button"
                                                    className="w-full px-4 py-2.5 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors"
                                                    onClick={async () => {
                                                        const next = expandedHistoryRow === row.name ? null : row.name;
                                                        setExpandedHistoryRow(next);
                                                        if (next && !historyDetails[next]) {
                                                            try {
                                                                const detail = await apiService.getRepairHistoryDetail(next);
                                                                setHistoryDetails(prev => ({ ...prev, [next]: detail }));
                                                            } catch (_) {}
                                                        }
                                                    }}
                                                >
                                                    <div className="text-left">
                                                        <span className="font-mono text-xs text-gray-500">{row.name}</span>
                                                        <span className="ml-2 text-gray-600">{row.received_date}</span>
                                                        {row.watch_count > 0 && (
                                                            <span className="ml-2 text-xs text-gray-400">{row.watch_count} watch{row.watch_count > 1 ? 'es' : ''}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            row.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                                                            row.status === 'Repaired' ? 'bg-blue-100 text-blue-700' :
                                                            row.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{row.status}</span>
                                                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${expandedHistoryRow === row.name ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                </button>
                                                {expandedHistoryRow === row.name && historyDetails[row.name] && (
                                                    <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                                                        {(historyDetails[row.name].items || []).map((item: any) => (
                                                            <div key={item.name} className="pt-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-medium text-gray-700">{item.watch_brand} {item.watch_model_name || item.watch_model}</span>
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                                                        item.status === 'Completed' || item.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                                                                        item.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-gray-100 text-gray-600'
                                                                    }`}>{item.status}</span>
                                                                </div>
                                                                {item.serial_number && <div className="text-xs text-gray-400 mt-0.5">S/N: {item.serial_number}</div>}
                                                                {(historyDetails[row.name].all_tasks || [])
                                                                    .filter((t: any) => t.repair_item_key === String(item.idx))
                                                                    .map((t: any, ti: number) => (
                                                                        <div key={ti} className="text-xs text-gray-500 ml-2 mt-0.5">• {t.service_name || t.service}</div>
                                                                    ))
                                                                }
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {expandedHistoryRow === row.name && !historyDetails[row.name] && (
                                                    <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50">Loading...</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Status field removed (defaults to Pending) */}
                        <Input
                            label="Received Date"
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={formData.received_date}
                            onChange={(e) => handleFieldChange('received_date', e.target.value)}
                        />
                        <Input
                            label="Promised Delivery"
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={formData.promised_delivery_date}
                            onChange={(e) => handleFieldChange('promised_delivery_date', e.target.value)}
                        />
                        <Select label="Priority" value={formData.priority} onChange={(e) => handleFieldChange('priority', e.target.value as Priority)}>
                            {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                        <Input
                            label="Reference Number"
                            type="text"
                            placeholder="Customer's own reference (optional)"
                            value={formData.reference_number || ''}
                            onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold pb-2 text-gray-900" style={{ borderBottom: '1px solid #F0EEEB' }}>Repair Items</h3>
                        {formData.items.map((item, itemIndex) => (
                            <div
                                key={item.name || itemIndex}
                                className="p-4 rounded-2xl space-y-4 bg-[#F9F7F4]"
                                style={{ border: '1px solid #F0EEEB' }}
                            >
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-gray-900">Watch #{itemIndex + 1}</h4>
                                    {formData.items.length > 1 && (
                                        <Button type="button" variant="destructive" size="sm" onClick={() => handleRemoveItem(itemIndex)}>
                                            <TrashIcon className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Autocomplete
                                        label="Brand"
                                        placeholder="Search brand..."
                                        options={dependencies.brands.map(b => ({
                                            value: b.name,
                                            label: b.brand_name,
                                            subtitle: b.description || ''
                                        }))}
                                        value={formData.items[itemIndex]?.watch_brand || ''}
                                        onChange={(value) => {
                                            console.log('Brand selected:', value);
                                            // Update both brand and model in a single state change
                                            const newItems = [...formData.items];
                                            newItems[itemIndex] = {
                                                ...newItems[itemIndex],
                                                watch_brand: value,
                                                watch_model: '' // Clear model when brand changes
                                            };
                                            setFormData({ ...formData, items: newItems });

                                            // Load models for the selected brand (async, non-blocking)
                                            if (isErpNext && value) {
                                                apiService.getWatchModels(value).then(models => {
                                                    setDependencies(prev => ({ ...prev, models }));
                                                });
                                            }
                                        }}
                                        onSearch={async (query) => {
                                            if (!isErpNext) return;
                                            const results = await apiService.getWatchBrands(query);
                                            setDependencies(prev => ({ ...prev, brands: results }));
                                        }}
                                        onCreate={(query) => {
                                            setCreateBrandQuery(query);
                                            setActiveBrandIndex(itemIndex);
                                            setIsCreateBrandOpen(true);
                                        }}
                                    />
                                    <Autocomplete
                                        label="Model"
                                        placeholder={formData.items[itemIndex]?.watch_brand ? "Search model..." : "Select brand first"}
                                        options={dependencies.models
                                            .filter(m => m.brand === formData.items[itemIndex]?.watch_brand)
                                            .map(m => ({
                                                value: m.name,
                                                label: m.model_name,
                                                subtitle: m.description || ''
                                            }))}
                                        value={formData.items[itemIndex]?.watch_model || ''}
                                        onChange={(value) => handleItemChange(itemIndex, 'watch_model', value)}
                                        onSearch={async (query) => {
                                            const brand = formData.items[itemIndex]?.watch_brand;
                                            if (!isErpNext || !brand) return;
                                            const results = await apiService.getWatchModels(brand, query);
                                            setDependencies(prev => ({ ...prev, models: results }));
                                        }}
                                        onCreate={(query) => {
                                            setCreateModelQuery(query);
                                            setCreateModelBrand(formData.items[itemIndex].watch_brand);
                                            setActiveModelIndex(itemIndex);
                                            setIsCreateModelOpen(true);
                                        }}
                                        className={!formData.items[itemIndex]?.watch_brand ? 'opacity-50 pointer-events-none' : ''}
                                    />
                                    <Input label="Serial Number" value={item.serial_number} onChange={e => handleItemChange(itemIndex, 'serial_number', e.target.value)} />
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Complaint</label>
                                    <div className="space-y-2">
                                        {dependencies.issueTemplates.map(template => (
                                            <label key={template.name} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={item.issues.some(i => i.issue === template.name)}
                                                    onChange={(e) => handleIssueToggle(itemIndex, template, e.target.checked)}
                                                    className="w-4 h-4 rounded border-[#D8D8D8] text-[#648DDA] focus:ring-[#648DDA]"
                                                />
                                                <span className="text-sm text-gray-700">{template.issue_name}</span>

                                            </label>
                                        ))}
                                        <label className="flex items-start space-x-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={item.issues.some(i => i.is_other)}
                                                onChange={(e) => handleOtherIssueToggle(itemIndex, e.target.checked)}
                                                    className="w-4 h-4 mt-1 rounded border-[#D8D8D8] text-[#648DDA] focus:ring-[#648DDA]"
                                            />
                                            <div className="flex-1">
                                                <span className="text-sm text-gray-700">Other (please specify)</span>
                                                {item.issues.some(i => i.is_other) && (
                                                    <textarea
                                                        value={item.issues.find(i => i.is_other)?.other_description || ''}
                                                        onChange={(e) => handleOtherDescriptionChange(itemIndex, e.target.value)}
                                                        rows={2}
                                                        placeholder="Describe the issue..."
                                                        className="mt-2 w-full p-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                        style={{ borderColor: '#E8E8E8' }}
                                                    />
                                                )}
                                            </div>
                                        </label>
                                    </div>

                                    {/* Issue Description */}
                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Issue Description
                                        </label>
                                        <textarea
                                            value={item.issue_description || ''}
                                            onChange={(e) => handleItemChange(itemIndex, 'issue_description', e.target.value)}
                                            rows={3}
                                            placeholder="Describe the customer's complaint or issue in detail..."
                                            className="w-full p-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                            style={{ borderColor: '#E8E8E8' }}
                                        />
                                    </div>

                                    <div className="mt-4 rounded-xl border bg-[#FCFAF7] p-4" style={{ borderColor: '#ECE8E3' }}>
                                        <div className="mb-3">
                                            <h4 className="text-sm font-semibold text-gray-900">Pre-Existing Watch Condition</h4>
                                            <p className="mt-1 text-xs text-gray-500">
                                                Record cosmetic or physical conditions already present at intake to preserve an audit trail.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <div className="relative">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={preExistingConditionQueries[itemIndex] || ''}
                                                        onChange={(e) => handlePreExistingConditionQueryChange(itemIndex, e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleAddPreExistingCondition(itemIndex, preExistingConditionQueries[itemIndex] || '');
                                                            }
                                                        }}
                                                        placeholder="Search or type a condition, then press Enter or Add"
                                                        className="w-full px-3 py-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white pr-24"
                                                        style={{ borderColor: '#E8E8E8' }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleAddPreExistingCondition(itemIndex, preExistingConditionQueries[itemIndex] || '')}
                                                        className="shrink-0"
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                                {(preExistingConditionQueries[itemIndex] || '').trim() && (
                                                    <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: '#E8E8E8' }}>
                                                        {availableWatchConditionSuggestions(itemIndex)
                                                            .map(template => (
                                                                <button
                                                                    key={template.name}
                                                                    type="button"
                                                                    onClick={() => handleAddPreExistingCondition(itemIndex, template.condition_name)}
                                                                    className="block w-full border-b px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#F9F7F4] last:border-b-0"
                                                                    style={{ borderColor: '#F0EEEB' }}
                                                                >
                                                                    <div className="font-medium text-gray-800">{template.condition_name}</div>
                                                                    {template.description && (
                                                                        <div className="text-xs text-gray-500">{template.description}</div>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        {!availableWatchConditionSuggestions(itemIndex).length && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddPreExistingCondition(itemIndex, preExistingConditionQueries[itemIndex] || '')}
                                                                className="block w-full px-3 py-2 text-left text-sm text-[#648DDA] hover:bg-[#F9F7F4]"
                                                            >
                                                                Add custom condition "{(preExistingConditionQueries[itemIndex] || '').trim()}"
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {item.pre_existing_condition.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {item.pre_existing_condition.map((condition) => (
                                                        <span
                                                            key={condition}
                                                            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-gray-700"
                                                        >
                                                            {condition}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemovePreExistingCondition(itemIndex, condition)}
                                                                className="text-gray-400 hover:text-red-500"
                                                                aria-label={`Remove ${condition}`}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400">
                                                    No pre-existing conditions added yet.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {showPostIntakeFields && (
                                    <div className="rounded-xl border bg-white p-4" style={{ borderColor: '#ECE8E3' }}>
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-900">Technician Diagnosis</h4>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Record inspection findings and recommended work after technical assessment.
                                                </p>
                                            </div>
                                            {(item.diagnosed_by || item.diagnosis_date) && (
                                                <div className="text-right text-xs text-gray-500">
                                                    {item.diagnosed_by && <div>By: {item.diagnosed_by}</div>}
                                                    {item.diagnosis_date && <div>{item.diagnosis_date}</div>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Select label="Diagnosis Status" value={item.diagnosis_status} onChange={e => handleItemChange(itemIndex, 'diagnosis_status', e.target.value as RepairItem['diagnosis_status'])}>
                                                <option value="Pending Diagnosis">Pending Diagnosis</option>
                                                <option value="Diagnosed">Diagnosed</option>
                                                <option value="Not Repairable">Not Repairable</option>
                                                <option value="Awaiting Approval">Awaiting Approval</option>
                                                <option value="Quoted">Quoted</option>
                                                <option value="Declined">Declined</option>
                                            </Select>
                                        </div>
                                        <div className="mt-4">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Diagnosis Summary</label>
                                            <div className="flex flex-col gap-3">
                                                <div className="relative">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={diagnosisSummaryQueries[itemIndex] || ''}
                                                            onChange={(e) => handleDiagnosisSummaryQueryChange(itemIndex, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleAddDiagnosisSummary(itemIndex, diagnosisSummaryQueries[itemIndex] || '');
                                                                }
                                                            }}
                                                            placeholder="Search or type a diagnosis summary"
                                                            className="w-full px-3 py-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                            style={{ borderColor: '#E8E8E8' }}
                                                        />
                                                        <Button type="button" variant="outline" size="sm" onClick={() => handleAddDiagnosisSummary(itemIndex, diagnosisSummaryQueries[itemIndex] || '')} className="shrink-0">
                                                            Add
                                                        </Button>
                                                    </div>
                                                    {(diagnosisSummaryQueries[itemIndex] || '').trim() && (
                                                        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: '#E8E8E8' }}>
                                                            {availableDiagnosisSummarySuggestions(itemIndex).map(template => (
                                                                <button
                                                                    key={template.name}
                                                                    type="button"
                                                                    onClick={() => handleAddDiagnosisSummary(itemIndex, template.summary_name)}
                                                                    className="block w-full border-b px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#F9F7F4] last:border-b-0"
                                                                    style={{ borderColor: '#F0EEEB' }}
                                                                >
                                                                    <div className="font-medium text-gray-800">{template.summary_name}</div>
                                                                    {template.description && <div className="text-xs text-gray-500">{template.description}</div>}
                                                                </button>
                                                            ))}
                                                            {!availableDiagnosisSummarySuggestions(itemIndex).length && (
                                                                <button type="button" onClick={() => handleAddDiagnosisSummary(itemIndex, diagnosisSummaryQueries[itemIndex] || '')} className="block w-full px-3 py-2 text-left text-sm text-[#648DDA] hover:bg-[#F9F7F4]">
                                                                    Add custom summary "{(diagnosisSummaryQueries[itemIndex] || '').trim()}"
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {item.diagnosis_summary.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.diagnosis_summary.map((summary) => (
                                                            <span key={summary} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-gray-700">
                                                                {summary}
                                                                <button type="button" onClick={() => handleRemoveDiagnosisSummary(itemIndex, summary)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${summary}`}>
                                                                    ×
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-400">No diagnosis summary added yet.</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Movement Type</label>
                                                <div className="flex flex-col gap-3">
                                                    <div className="relative">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={movementTypeQueries[itemIndex] || ''}
                                                                onChange={(e) => handleMovementTypeQueryChange(itemIndex, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        handleAddMovementType(itemIndex, movementTypeQueries[itemIndex] || '');
                                                                    }
                                                                }}
                                                                placeholder="Search or type movement type"
                                                                className="w-full px-3 py-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                                style={{ borderColor: '#E8E8E8' }}
                                                            />
                                                            <Button type="button" variant="outline" size="sm" onClick={() => handleAddMovementType(itemIndex, movementTypeQueries[itemIndex] || '')} className="shrink-0">
                                                                Add
                                                            </Button>
                                                        </div>
                                                        {(movementTypeQueries[itemIndex] || '').trim() && (
                                                            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: '#E8E8E8' }}>
                                                                {availableMovementTypeSuggestions(itemIndex).map(template => (
                                                                    <button
                                                                        key={template.name}
                                                                        type="button"
                                                                        onClick={() => handleAddMovementType(itemIndex, template.movement_type)}
                                                                        className="block w-full border-b px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#F9F7F4] last:border-b-0"
                                                                        style={{ borderColor: '#F0EEEB' }}
                                                                    >
                                                                        <div className="font-medium text-gray-800">{template.movement_type}</div>
                                                                        {template.description && <div className="text-xs text-gray-500">{template.description}</div>}
                                                                    </button>
                                                                ))}
                                                                {!availableMovementTypeSuggestions(itemIndex).length && (
                                                                    <button type="button" onClick={() => handleAddMovementType(itemIndex, movementTypeQueries[itemIndex] || '')} className="block w-full px-3 py-2 text-left text-sm text-[#648DDA] hover:bg-[#F9F7F4]">
                                                                        Add custom movement type "{(movementTypeQueries[itemIndex] || '').trim()}"
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {item.movement_type.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {item.movement_type.map((movementType) => (
                                                                <span key={movementType} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-gray-700">
                                                                    {movementType}
                                                                    <button type="button" onClick={() => handleRemoveMovementType(itemIndex, movementType)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${movementType}`}>
                                                                        ×
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-400">No movement type added yet.</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Movement Caliber</label>
                                                <div className="flex flex-col gap-3">
                                                    <div className="relative">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={movementCaliberQueries[itemIndex] || ''}
                                                                onChange={(e) => handleMovementCaliberQueryChange(itemIndex, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        handleAddMovementCaliber(itemIndex, movementCaliberQueries[itemIndex] || '');
                                                                    }
                                                                }}
                                                                placeholder="Search or type caliber code"
                                                                className="w-full px-3 py-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                                style={{ borderColor: '#E8E8E8' }}
                                                            />
                                                            <Button type="button" variant="outline" size="sm" onClick={() => handleAddMovementCaliber(itemIndex, movementCaliberQueries[itemIndex] || '')} className="shrink-0">
                                                                Add
                                                            </Button>
                                                        </div>
                                                        {(movementCaliberQueries[itemIndex] || '').trim() && (
                                                            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg" style={{ borderColor: '#E8E8E8' }}>
                                                                {availableMovementCaliberSuggestions(itemIndex).map(template => (
                                                                    <button
                                                                        key={template.name}
                                                                        type="button"
                                                                        onClick={() => handleAddMovementCaliber(itemIndex, template.caliber_code)}
                                                                        className="block w-full border-b px-3 py-2 text-left text-sm text-gray-700 hover:bg-[#F9F7F4] last:border-b-0"
                                                                        style={{ borderColor: '#F0EEEB' }}
                                                                    >
                                                                        <div className="font-medium text-gray-800">{template.caliber_code}</div>
                                                                        {template.description && <div className="text-xs text-gray-500">{template.description}</div>}
                                                                    </button>
                                                                ))}
                                                                {!availableMovementCaliberSuggestions(itemIndex).length && (
                                                                    <button type="button" onClick={() => handleAddMovementCaliber(itemIndex, movementCaliberQueries[itemIndex] || '')} className="block w-full px-3 py-2 text-left text-sm text-[#648DDA] hover:bg-[#F9F7F4]">
                                                                        Add custom caliber "{(movementCaliberQueries[itemIndex] || '').trim()}"
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {item.movement_caliber.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {item.movement_caliber.map((caliber) => (
                                                                <span key={caliber} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-gray-700">
                                                                    {caliber}
                                                                    <button type="button" onClick={() => handleRemoveMovementCaliber(itemIndex, caliber)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${caliber}`}>
                                                                        ×
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-400">No movement caliber added yet.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Recommended Work</label>
                                            <textarea
                                                value={(item.recommended_work || []).join('\n')}
                                                onChange={(e) => handleItemChange(itemIndex, 'recommended_work', e.target.value.split('\n').filter(Boolean) as any)}
                                                rows={2}
                                                placeholder="Recommended service or repair steps..."
                                                className="w-full p-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                style={{ borderColor: '#E8E8E8' }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {showPostIntakeFields && (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Select label="Technician" value={item.technician} onChange={e => handleItemChange(itemIndex, 'technician', e.target.value)}>
                                                <option value="">Unassigned</option>
                                                {dependencies.employees.map(e => <option key={e.name} value={e.name}>{e.employee_name}</option>)}
                                            </Select>
                                            <Select label="Watch Status" value={item.status} onChange={e => handleItemChange(itemIndex, 'status', e.target.value as WatchStatus)}>
                                                {Object.values(WatchStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                            </Select>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between gap-3">
                                                <h5 className="font-semibold text-gray-900">Tasks</h5>
                                                <span className="text-xs text-gray-500">Auto-managed from issues and recommended work</span>
                                            </div>
                                            {item.tasks.map((task, taskIndex) => {
                                                const selectedService = dependencies.services.find(s => s.name === task.service);
                                                const autoRate = selectedService?.default_rate || 0;
                                                return (
                                                    <div key={task.name || taskIndex} className="space-y-2 p-3 border rounded-xl bg-white my-2" style={{ borderColor: '#ECE8E3' }}>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium text-gray-900">{selectedService?.task_name || task.service}</p>
                                                                <p className="text-xs text-gray-500">{task.status}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-medium text-[#2E7B5B]">{formatCurrency(task.rate || autoRate)}</p>
                                                                {task.rate && <p className="text-xs text-gray-500">Manual override saved</p>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center space-x-2 text-sm">
                                                            <div className="flex-1">
                                                                <label className="block text-xs text-gray-500 mb-1">Auto Rate</label>
                                                                <div className="px-3 py-1.5 bg-[#F5F1EC] rounded text-gray-600">
                                                                    {formatCurrency(autoRate)}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="block text-xs text-gray-500 mb-1">Effective Rate</label>
                                                                <div className="px-3 py-1.5 bg-[#EBF5F0] rounded font-medium text-[#2E7B5B]">
                                                                    {formatCurrency(task.rate || autoRate)}
                                                                    {task.rate && <span className="ml-1 text-xs">(manual)</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {item.tasks.length === 0 && (
                                                <p className="mt-2 text-sm text-gray-500">Tasks will be generated automatically from selected issues or recommended work.</p>
                                            )}
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-gray-900">Parts Used</h5>
                                            {item.parts_used.map((part, partIndex) => {
                                                const selectedPart = dependencies.parts.find(p => p.name === part.part);
                                                return (
                                                    <div key={part.name || partIndex} className="space-y-2 p-3 border rounded-xl bg-white my-2" style={{ borderColor: '#ECE8E3' }}>
                                                        <div className="flex items-center space-x-2">
                                                            <Autocomplete
                                                                placeholder="Search by code, name, or description..."
                                                                options={dependencies.parts.map(p => ({
                                                                    value: p.name,
                                                                    label: `${p.item_code || p.name} - ${p.item_name}`,
                                                                    subtitle: p.description || `Rate: ${formatCurrency(p.standard_rate || 0)}`
                                                                }))}
                                                                value={part.part}
                                                                onChange={(value) => {
                                                                    handlePartChange(itemIndex, partIndex, 'part', value);
                                                                    const selectedItem = dependencies.parts.find(p => p.name === value);
                                                                    if (selectedItem) {
                                                                        handlePartChange(itemIndex, partIndex, 'uom', selectedItem.stock_uom);
                                                                        handlePartChange(itemIndex, partIndex, 'auto_rate', selectedItem.standard_rate);
                                                                    }
                                                                }}
                                                                onSearch={async (query) => {
                                                                    if (isErpNext && query.trim()) {
                                                                const results = await apiService.searchItems(query);
                                                                setDependencies(prev => ({ ...prev, parts: results }));
                                                            }
                                                        }}
                                                        className="flex-grow"
                                                    />
                                                    <Input
                                                        type="number"
                                                        value={part.quantity}
                                                        onChange={e => handlePartChange(itemIndex, partIndex, 'quantity', parseFloat(e.target.value) || 1)}
                                                        className="w-24"
                                                        placeholder="Qty"
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                    <Button type="button" variant="destructive" size="icon" onClick={() => handleRemovePart(itemIndex, partIndex)}>
                                                        <TrashIcon className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Optional task assignment */}
                                                <Select
                                                    value={part.task || ''}
                                                    onChange={e => handlePartChange(itemIndex, partIndex, 'task', e.target.value)}
                                                    className="text-sm"
                                                >
                                                    <option value="">Not linked to a specific task</option>
                                                    {item.tasks.map((task, idx) => {
                                                        const template = dependencies.services.find(s => s.name === task.service);
                                                        return (
                                                            <option key={task.name || idx} value={task.name || `task_${idx}`}>
                                                                {template?.task_name || task.service}
                                                            </option>
                                                        );
                                                    })}
                                                </Select>

                                                {/* Pricing row */}
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Auto Rate</label>
                                                        <div className="px-3 py-1.5 bg-[#F5F1EC] rounded text-gray-600">
                                                            {formatCurrency(selectedPart?.standard_rate || 0)}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Manual Rate Override</label>
                                                        <div className="flex space-x-1">
                                                            <Input
                                                                type="number"
                                                                value={part.rate || ''}
                                                                onChange={e => {
                                                                    handlePartChange(itemIndex, partIndex, 'rate', e.target.value ? parseFloat(e.target.value) : undefined);
                                                                    // Auto-fetch rate when part changes
                                                                    if (!e.target.value && selectedPart) {
                                                                        handlePartChange(itemIndex, partIndex, 'auto_rate', selectedPart.standard_rate);
                                                                    }
                                                                }}
                                                                placeholder={`${(selectedPart?.standard_rate || 0).toFixed(2)}`}
                                                                min="0"
                                                                step="0.01"
                                                                className="flex-1"
                                                            />
                                                            {part.rate && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePartChange(itemIndex, partIndex, 'rate', undefined)}
                                                                    className="px-2 text-xs text-[#648DDA] hover:text-[#527cc7]"
                                                                    title="Reset to auto rate"
                                                                >
                                                                    Reset
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Amount</label>
                                                        <div className="px-3 py-1.5 bg-[#EBF5F0] rounded font-medium text-[#2E7B5B]">
                                                            {formatCurrency((part.rate || selectedPart?.standard_rate || 0) * part.quantity)}
                                                            {part.rate && <span className="ml-1 text-xs">(manual)</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Show item details */}
                                                {selectedPart && selectedPart.description && (
                                                    <div className="text-xs text-gray-500">
                                                        <p className="italic">{selectedPart.description}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenAddPart(itemIndex)} className="mt-2"><PlusIcon className="h-4 w-4 mr-1" />Add Part</Button>
                                </div>
                            </>
                        )}
                            </div>
                        ))}
                        <Button type="button" variant="outline" onClick={handleAddItem} className="w-full">
                            <PlusIcon className="h-5 w-5 mr-2" />
                            Add another watch
                        </Button>
                    </div>

                    <div className="sticky bottom-0 left-0 right-0 pt-3 border-t bg-white/95 backdrop-blur-sm flex justify-end space-x-3" style={{ borderColor: '#F0EEEB' }}>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save Order</Button>
                    </div>
                </form>
            </Modal>
            <CreateCustomerModal
                isOpen={isCreateCustomerOpen}
                onClose={() => setIsCreateCustomerOpen(false)}
                initialName={createCustomerQuery}
                onCustomerCreated={(newCustomer) => {
                    setDependencies(prev => ({ ...prev, customers: [newCustomer, ...prev.customers] }));
                    handleFieldChange('customer', newCustomer.name);
                }}
            />
            <CreateBrandModal
                isOpen={isCreateBrandOpen}
                onClose={() => setIsCreateBrandOpen(false)}
                initialName={createBrandQuery}
                onBrandCreated={(newBrand) => {
                    setDependencies(prev => ({ ...prev, brands: [...prev.brands, newBrand] }));
                    if (activeBrandIndex !== null) {
                        const newItems = [...formData.items];
                        newItems[activeBrandIndex] = {
                            ...newItems[activeBrandIndex],
                            watch_brand: newBrand.name,
                            watch_model: ''
                        };
                        setFormData({ ...formData, items: newItems });
                        // Trigger model fetch (empty initially, but sets up dependency)
                        if (isErpNext) {
                            apiService.getWatchModels(newBrand.name).then(models => {
                                setDependencies(prev => ({ ...prev, models }));
                            });
                        }
                    }
                }}
            />
            <CreateModelModal
                isOpen={isCreateModelOpen}
                onClose={() => setIsCreateModelOpen(false)}
                brand={createModelBrand}
                initialName={createModelQuery}
                onModelCreated={(newModel) => {
                    setDependencies(prev => ({ ...prev, models: [...prev.models, newModel] }));
                    if (activeModelIndex !== null) {
                        handleItemChange(activeModelIndex, 'watch_model', newModel.name);
                    }
                }}
            />
            {activePartItemIndex !== null && formData && (
                <AddPartModal
                    isOpen={isAddPartModalOpen}
                    onClose={() => setIsAddPartModalOpen(false)}
                    onSave={handleSavePart}
                    watchItem={formData.items[activePartItemIndex]}
                    allItems={dependencies.parts}
                    taskTemplates={dependencies.services}
                />
            )}
        </>
    );
};
