import type { RepairItem, WatchConditionTemplate } from '../types';
import { WatchStatus } from '../types';

// Fixed group order for the pre-existing condition picker. Categories are
// rendered in this order regardless of alphabetical sort.
export const WATCH_CONDITION_CATEGORIES = [
    'Case & Exterior',
    'Crystal & Water Resistance',
    'Bracelet & Strap',
    'History & Other',
] as const;

// Fallback presets used only in standalone (non-ERPNext) mode, where there is
// no DW Watch Condition Template list to fetch from the backend.
export const DEFAULT_WATCH_CONDITION_TEMPLATES: WatchConditionTemplate[] = [
    { name: 'Scratches on crystal', condition_name: 'Scratches on crystal', description: 'Visible crystal scratching noted at intake.', category: 'Crystal & Water Resistance' },
    { name: 'Cracked crystal', condition_name: 'Cracked crystal', description: 'Crystal already cracked before service.', category: 'Crystal & Water Resistance' },
    { name: 'Case scratches', condition_name: 'Case scratches', description: 'Visible scratching on case surfaces.', category: 'Case & Exterior' },
    { name: 'Case dents', condition_name: 'Case dents', description: 'Case has dents or impact marks.', category: 'Case & Exterior' },
    { name: 'Bezel scratched', condition_name: 'Bezel scratched', description: 'Bezel or bezel insert shows cosmetic wear.', category: 'Case & Exterior' },
    { name: 'Bezel loose', condition_name: 'Bezel loose', description: 'Bezel feels loose or has excess play.', category: 'Case & Exterior' },
    { name: 'Crown worn', condition_name: 'Crown worn', description: 'Crown shows visible wear or cosmetic damage.', category: 'Case & Exterior' },
    { name: 'Crown loose', condition_name: 'Crown loose', description: 'Crown is loose or does not feel secure.', category: 'Case & Exterior' },
    { name: 'Pusher damaged', condition_name: 'Pusher damaged', description: 'Pushers show visible damage or wear.', category: 'Case & Exterior' },
    { name: 'Dial stained', condition_name: 'Dial stained', description: 'Dial has visible staining, spotting, or discoloration.', category: 'Case & Exterior' },
    { name: 'Hands corroded', condition_name: 'Hands corroded', description: 'Hands show corrosion, oxidation, or finish damage.', category: 'Case & Exterior' },
    { name: 'Bracelet scratched', condition_name: 'Bracelet scratched', description: 'Bracelet has visible scratches or surface wear.', category: 'Bracelet & Strap' },
    { name: 'Bracelet stretched', condition_name: 'Bracelet stretched', description: 'Bracelet shows stretch or excessive slack.', category: 'Bracelet & Strap' },
    { name: 'Bracelet link missing', condition_name: 'Bracelet link missing', description: 'One or more bracelet links are missing.', category: 'Bracelet & Strap' },
    { name: 'Clasp loose', condition_name: 'Clasp loose', description: 'Clasp does not close firmly or has excess movement.', category: 'Bracelet & Strap' },
    { name: 'Strap worn', condition_name: 'Strap worn', description: 'Strap shows visible wear from prior use.', category: 'Bracelet & Strap' },
    { name: 'Strap cracked', condition_name: 'Strap cracked', description: 'Strap is cracked, split, or dried out.', category: 'Bracelet & Strap' },
    { name: 'Strap torn', condition_name: 'Strap torn', description: 'Strap is torn or structurally damaged.', category: 'Bracelet & Strap' },
    { name: 'Strap stitching damaged', condition_name: 'Strap stitching damaged', description: 'Strap stitching is loose, frayed, or broken.', category: 'Bracelet & Strap' },
    { name: 'Spring bar loose', condition_name: 'Spring bar loose', description: 'Spring bar is loose or not seated securely.', category: 'Bracelet & Strap' },
    { name: 'Spring bar missing', condition_name: 'Spring bar missing', description: 'One or more spring bars are missing.', category: 'Bracelet & Strap' },
    { name: 'Moisture under crystal', condition_name: 'Moisture under crystal', description: 'Condensation or moisture is visible beneath the crystal.', category: 'Crystal & Water Resistance' },
    { name: 'Water damage signs', condition_name: 'Water damage signs', description: 'Visible indicators suggest prior water ingress.', category: 'Crystal & Water Resistance' },
    { name: 'Rust visible', condition_name: 'Rust visible', description: 'Rust is visible externally at intake.', category: 'Case & Exterior' },
    { name: 'Corrosion visible', condition_name: 'Corrosion visible', description: 'Visible corrosion is present on external parts.', category: 'Case & Exterior' },
    { name: 'Screw missing', condition_name: 'Screw missing', description: 'One or more visible screws are missing.', category: 'Bracelet & Strap' },
    { name: 'Screw mismatched', condition_name: 'Screw mismatched', description: 'A visible screw appears non-matching or previously replaced.', category: 'Bracelet & Strap' },
    { name: 'Previous repair marks', condition_name: 'Previous repair marks', description: 'Marks indicate prior opening or repair attempts.', category: 'History & Other' },
    { name: 'Non-original parts visible', condition_name: 'Non-original parts visible', description: 'Visible external parts appear aftermarket or non-original.', category: 'History & Other' },
    { name: 'Heavy cosmetic wear', condition_name: 'Heavy cosmetic wear', description: 'Watch shows heavy pre-existing cosmetic wear.', category: 'History & Other' },
    { name: 'Impact damage visible', condition_name: 'Impact damage visible', description: 'Impact damage is visible on the watch exterior.', category: 'Case & Exterior' },
    { name: 'Other cosmetic condition', condition_name: 'Other cosmetic condition', description: 'Use when another cosmetic condition needs to be documented.', category: 'History & Other' },
    { name: 'Other physical condition', condition_name: 'Other physical condition', description: 'Use when another physical condition needs to be documented.', category: 'History & Other' },
];

export const newRepairItem = (): Omit<RepairItem, 'name'> => ({
    watch_brand: '',
    watch_model: '',
    serial_number: '',
    case_type: '',
    strap_bracelet: '',
    watch_type: '',
    dial: '',
    issues: [],
    issue_description: '',
    pre_existing_condition: [],
    photos: [],
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
