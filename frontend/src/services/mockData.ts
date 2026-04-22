
import type { Customer, Employee, Item, RepairOrder, RepairTaskTemplate } from '../types';
import { OrderStatus, Priority, WatchStatus, TaskStatus } from '../types';

// FIX: Corrected property names to match the `Customer` type (`id`->`name`, `name`->`customer_name`, `contactPerson`->`customer_primary_contact`).
export const mockCustomers: Customer[] = [
  { name: 'C001', customer_name: 'John Doe', customer_primary_contact: 'John Doe', email: 'john.doe@email.com', phone: '123-456-7890' },
  { name: 'C002', customer_name: 'Jane Smith', customer_primary_contact: 'Jane Smith', email: 'jane.smith@email.com', phone: '098-765-4321' },
];

// FIX: Corrected property names to match the `Employee` type (`id`->`name`, `name`->`employee_name`).
export const mockEmployees: Employee[] = [
  { name: 'TECH-001', employee_name: 'Alice Williams' },
  { name: 'TECH-002', employee_name: 'Bob Brown' },
];

// FIX: Corrected property names to match the `Item` type (`id`->`name`, `name`->`item_name`, `group`->`item_group`, `price`->`standard_rate`, `uom`->`stock_uom`).
export const mockItems: Item[] = [
  { name: 'P001', item_name: 'CR2032 Battery', item_group: 'Spare Part', standard_rate: 5, stock_uom: 'Unit' },
  { name: 'P002', item_name: '20mm Leather Strap', item_group: 'Spare Part', standard_rate: 35, stock_uom: 'Unit' },
  { name: 'P003', item_name: 'Sapphire Crystal', item_group: 'Spare Part', standard_rate: 90, stock_uom: 'Unit' },
];

export const mockSpareParts = mockItems.filter(i => i.item_group === 'Spare Part');

export const mockTaskTemplates: RepairTaskTemplate[] = [
  { name: 'T001', task_name: 'Battery Replacement', default_rate: 50 },
  { name: 'T002', task_name: 'Strap Replacement', default_rate: 80 },
  { name: 'T003', task_name: 'Glass Polishing', default_rate: 120 },
  { name: 'T004', task_name: 'Full Overhaul', default_rate: 450 },
];

// FIX: Updated the entire mock repair order structure to align with `RepairOrder` and related types.
// This includes:
// - Renaming `id` to `name` for all documents and child table records.
// - Changing camelCase properties to snake_case (e.g., `receivedDate` to `received_date`).
// - Using string links (e.g., `customer: mockCustomers[0].name`) instead of objects.
// - Adding `customer_name` for display purposes.
// - Renaming `technicianId` to `technician`.
// - Removing fields not present in the types (e.g., `estimatedHours`).
// - Adding fields required by types (e.g., `uom` for parts).
// - Adding optional display fields (`service_name`, `part_name`, etc.) for consistency.
export const mockRepairOrders: RepairOrder[] = [
  {
    name: 'RO-2024-001',
    customer: mockCustomers[0].name,
    customer_name: mockCustomers[0].customer_name,
    contact_person: mockCustomers[0].customer_primary_contact,
    status: OrderStatus.Repaired,
    received_date: '2024-07-15',
    promised_delivery_date: '2024-07-22',
    priority: Priority.Normal,
    items: [
      {
        name: 'RI-001-1',
        watch_brand: 'Rolex',
        watch_model: 'Submariner',
        serial_number: 'SN12345XYZ',
        issue_description: 'Watch stopped working. Possible battery issue.',
        pre_existing_condition: ['Scratches on crystal', 'Worn strap'],
        diagnosis_status: 'Diagnosed',
        diagnosis_summary: ['Movement Damage', 'Circuit Damage'],
        movement_type: ['Quartz movement'],
        movement_caliber: ['2235'],
        movement_information: ['Quartz movement', '2235'],
        recommended_work: ['Replace battery', 'Inspect gasket', 'Reseal case'],
        diagnosed_by: 'E001',
        diagnosis_date: '2026-04-18 10:30:00',
        technician: 'E001',
        status: WatchStatus.Completed,
        intake_checklist: {
          scratches: true,
          water_resistance: false,
          missing_parts: false,
          other_observations: 'Minor scuff on the bezel.',
        },
        tasks: [
          {
            name: 'RT-001',
            service: mockTaskTemplates[0].name,
            service_name: mockTaskTemplates[0].task_name,
            service_price: mockTaskTemplates[0].default_rate,
            technician: mockEmployees[0].name,
            notes: 'Replaced battery and sealed case.',
            status: TaskStatus.Completed,
          },
        ],
        parts_used: [
          {
            name: 'RPU-001',
            part: mockItems[0].name,
            part_name: mockItems[0].item_name,
            part_price: mockItems[0].standard_rate,
            quantity: 1,
            uom: mockItems[0].stock_uom,
          },
        ],
      },
    ],
  },
  {
    name: 'RO-2024-002',
    customer: mockCustomers[1].name,
    customer_name: mockCustomers[1].customer_name,
    contact_person: mockCustomers[1].customer_primary_contact,
    status: OrderStatus.InProgress,
    received_date: '2024-07-18',
    promised_delivery_date: '2024-07-28',
    priority: Priority.Urgent,
    items: [
      {
        name: 'RI-002-1',
        watch_brand: 'Omega',
        watch_model: 'Seamaster',
        serial_number: 'SN67890ABC',
        issue_description: 'Broken strap and the crown is loose.',
        pre_existing_condition: ['Case dents', 'Mismatched caseback screw'],
        diagnosis_status: 'Awaiting Approval',
        diagnosis_summary: ['Automatic Rotor Damage'],
        movement_type: ['Automatic movement'],
        movement_caliber: ['2500'],
        movement_information: ['Automatic movement', '2500'],
        recommended_work: ['Replace crown assembly', 'Fit new strap after customer approval'],
        diagnosed_by: mockEmployees[1].name,
        diagnosis_date: '2026-04-19 14:15:00',
        technician: mockEmployees[1].name,
        status: WatchStatus.CreateEstimate,
        intake_checklist: {
          scratches: false,
          water_resistance: true,
          missing_parts: true,
          other_observations: 'Strap is completely broken in two.',
        },
        tasks: [
          {
            name: 'RT-002',
            service: mockTaskTemplates[1].name,
            service_name: mockTaskTemplates[1].task_name,
            service_price: mockTaskTemplates[1].default_rate,
            technician: mockEmployees[1].name,
            notes: '',
            status: TaskStatus.InProgress,
          },
        ],
        parts_used: [
             {
            name: 'RPU-002',
            part: mockItems[1].name,
            part_name: mockItems[1].item_name,
            part_price: mockItems[1].standard_rate,
            quantity: 1,
            uom: mockItems[1].stock_uom,
          },
        ],
      },
      {
        name: 'RI-002-2',
        watch_brand: 'Seiko',
        watch_model: 'SKX007',
        serial_number: 'SN45001DEF',
        issue_description: 'Losing time, needs regulation.',
        pre_existing_condition: ['Deep crystal scratch', 'Faded bezel insert'],
        diagnosis_status: 'Pending Diagnosis',
        diagnosis_summary: [],
        movement_type: [],
        movement_caliber: [],
        movement_information: [],
        recommended_work: [],
        diagnosed_by: '',
        diagnosis_date: '',
        technician: 'E002',
        status: WatchStatus.UnderDiagnosis,
        intake_checklist: {
          scratches: true,
          water_resistance: true,
          missing_parts: false,
          other_observations: 'Crystal has a deep scratch.',
        },
        tasks: [],
        parts_used: [],
      }
    ],
  },
];
