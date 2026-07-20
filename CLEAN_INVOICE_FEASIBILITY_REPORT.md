# Feasibility Study & Implementation Report: Clean Repair Invoicing

**Document Version:** 1.0.0
**Target System:** ERPNext v15 / Frappe Framework
**Prepared By:** Senior Solutions Architect
**Module:** Custom Repair Management

---

## 1. Executive Summary
This document outlines the architectural feasibility and implementation strategy for achieving "Clean Invoicing" within a custom Repair Management module in ERPNext v15. The core objective is to present the customer with a single, consolidated service line (e.g., "Repair - Rolex Submariner") while completely abstracting internal spare parts, individual part pricing, and markups. 

Following a comprehensive assessment of ERPNext's inventory valuation and accounting engines, we conclude that **the requirement is 100% feasible**. We recommend a **"Zero-Rated Component Injection"** architecture. This approach leverages standard ERPNext accounting/inventory flows while utilizing the presentation layer to obscure the complexity from the end customer, ensuring zero compromises on COGS tracking, inventory deduction, or gross profit reporting.

---

## 2. Business Objectives & Technical Constraints

### 2.1 Core Objectives
*   **Customer Experience:** Deliver professional, uncluttered Sales Invoices with consolidated repair totals.
*   **Inventory Integrity:** Automatically deduct spare parts consumed during the repair from the warehouse.
*   **Financial Accuracy:** Maintain accurate Cost of Goods Sold (COGS) and accurate Gross Profit (GP) per invoice.
*   **Data Privacy:** Prevent customers from seeing internal part numbers, individual part costs, and applied markups via Print Formats, Customer Portals, or API.

### 2.2 ERPNext Native Constraints
*   Standard ERPNext Sales Invoices require an item to be present in the `items` child table to trigger automated stock deduction (when `update_stock = 1`).
*   Native "Product Bundles" are static (defined in the Item Master) and cannot dynamically accommodate the unique combination of parts required for individual, bespoke repairs without polluting the Item Master.
*   Removing items from the invoice strictly to "hide" them breaks the native COGS and Gross Profit calculation for that specific transaction.

---

## 3. Solution Architecture Evaluation

We evaluated three potential architectural approaches to solve this requirement in ERPNext v15:

### Option A: Decoupled Inventory & Billing (Custom Doctype + Stock Entry)
*   **Mechanism:** A custom "Repair Order" doctype manages the job. Upon completion, a background script generates a `Stock Entry` (Material Issue) for the parts and a `Sales Invoice` for the single service line.
*   **Pros:** Invoice is natively clean. Data separation is absolute.
*   **Cons:** Breaks native item-wise Gross Profit reporting. COGS and Revenue are recorded in different transaction types, requiring heavy customizations to the General Ledger and Profitability reports to reconcile a single repair job.

### Option B: Dynamic Product Bundles
*   **Mechanism:** A script automatically creates a new, hidden `Item` and a `Product Bundle` for every unique repair, adding the spare parts as children.
*   **Pros:** Native ERPNext functionality for bundles handles the print hiding and stock deduction.
*   **Cons:** **Catastrophic** pollution of the Item Master. Generating thousands of one-off item codes (e.g., `BNDL-REP-001029`) degrades system performance and complicates inventory management.

### Option C: Premium Service & Zero-Rated Parts (Recommended)
*   **Mechanism:** The `Sales Invoice` includes both the Service Item and the Spare Parts. 
    *   The **Service Item** is billed at the *total* repair price (Service Fee + Parts Margin).
    *   The **Spare Parts** are added with a Selling Rate of `$0.00`.
    *   At the database level, ERPNext natively issues the stock for the $0 items and debits COGS based on their Valuation Rate. The Revenue is credited from the Service Item. 
    *   The Presentation Layer (Print Formats & Portal Views) is customized to simply ignore any item flagged as a "hidden part".
*   **Pros:** Natively supports precise GP calculation. No Item Master pollution. Standard accounting ledger entries.
*   **Cons:** Requires careful overriding of the Frappe Customer Portal to ensure $0 items don't leak in the web view.

---

## 4. Proposed Implementation Strategy (Option C)

We will proceed with the **Premium Service & Zero-Rated Parts** architecture. Below is the technical implementation blueprint.

### Phase 1: Database & Schema Enhancements
1.  **Custom Fields on Sales Invoice Item (`tabSales Invoice Item`):**
    *   `is_repair_part` (Data Type: Check, Default: 0) - Flags the item as an internal component.
    *   `parent_repair_service` (Data Type: Link, Options: Sales Invoice Item) - Associates the part with its parent service line for logical grouping.
2.  **Custom Field on Item (`tabItem`):**
    *   `is_repair_service` (Data Type: Check) - Identifies top-level service items (e.g., "Rolex Overhaul").

### Phase 2: Backend Automation (Controller Hooks)
We will implement a `before_save` hook on the `Sales Invoice` to enforce the pricing logic:
1.  **Price Rollup:** The script will automatically sum the intended selling price of all `is_repair_part` items and add it to the `rate` of the associated `parent_repair_service` item.
2.  **Zero-Rating:** The script will force the `rate` and `amount` of all `is_repair_part` items to `0.0`.
3.  **Taxation Handling:** Taxes will be applied exclusively to the parent service item, avoiding standard ERPNext tax calculation errors on $0 items.

### Phase 3: Presentation Layer (Print & Portal)
1.  **Jinja Print Format (`Custom Repair Invoice`):**
    *   Develop a custom Print Format for the Sales Invoice.
    *   The Jinja loop will filter the items: `{% for row in doc.items if not row.is_repair_part %}`.
    *   This guarantees the PDF generated for the customer *only* contains the clean service lines.
2.  **Customer Portal Override:**
    *   Customize the standard `/invoices` web view in Frappe.
    *   Override the `get_context` controller for the Sales Invoice portal page to filter out items where `is_repair_part == 1` before passing the data to the web template.

### Phase 4: Financial & Inventory Validation
*   **Inventory:** Verify that submitting the Sales Invoice generates the correct `Stock Ledger Entry` (SLE) for the hidden parts, deducting them at the correct warehouse valuation rate.
*   **Accounting (GL):** Verify the `GL Entry` correctly debits *Cost of Goods Sold* for the parts' value, credits *Inventory*, debits *Accounts Receivable* for the total rolled-up amount, and credits *Sales Income*.

---

## 5. Potential Risks & Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Tax Rate Discrepancies** | If parts and labor require different tax rates legally, rolling them into one line may violate local tax compliance. | *Consult local tax regulations.* If separated taxes are strictly required, we will maintain two parent lines: "Service Fee" and "Materials (Consolidated)", applying the respective tax templates to each. |
| **Returns / Credit Notes** | Processing a partial return of a hidden part could be complex since its selling price is $0. | Customize the `Sales Return` flow to handle repair warranties explicitly via a separate "Warranty Claim" doctype rather than standard Credit Notes. |
| **API Data Leaks** | Tech-savvy customers accessing the `/api/resource/Sales Invoice` endpoint could see the child items. | Implement Role-Based Access Control (RBAC). Ensure the "Customer" role does not have direct read access to `Sales Invoice Item` REST APIs, restricting them strictly to the Web Portal view. |

## 6. Conclusion
The requested Clean Invoicing feature is highly feasible and can be integrated seamlessly into ERPNext v15. By leveraging the "Zero-Rated Component Injection" method, we satisfy the customer's aesthetic and privacy requirements while maintaining the absolute integrity of the ERP's financial and inventory engines.

**Sign-off:**
*Architect:* Antigravity
*Date:* 2026-05-08
