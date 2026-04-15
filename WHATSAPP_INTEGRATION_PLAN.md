# WhatsApp Customer Notification — Implementation Plan

> **Date:** 2026-04-15  
> **Scope:** On-demand WhatsApp notifications for Watch Doctor repair order status updates via whapi.cloud  
> **Target codebase:** `apps/watch_doctor` (Frappe 15 + React 19 SPA)

---

## Executive Summary

This plan adds a **staff-initiated "Notify Customer" button** to the `RepairOrderDetail` view that sends a WhatsApp message reflecting the current repair order status. Messages are dispatched via the **whapi.cloud REST API** using the connected WhatsApp Business number. The backend enqueues the send operation through Frappe's background job queue (`frappe.enqueue`), logs every attempt in a new `DW WhatsApp Log` DocType for auditability, and handles retries with exponential backoff. A webhook endpoint receives delivery receipts (sent / delivered / read / failed) and updates the log accordingly.

**Key design decisions:**
- **whapi.cloud operates as a WhatsApp Business API gateway using a linked phone number**, not the official Cloud API (no Meta template approval process). Messages are sent as free-form text via `POST /messages/text`. This simplifies rollout but requires adherence to WhatsApp anti-spam policies.
- **On-demand only** — no auto-notifications on status change. Staff explicitly trigger each notification.
- **Idempotent per order+status** — a cooldown window (configurable, default 60 min) prevents duplicate sends for the same order at the same status.
- **Outbound-only** — no webhook endpoint needed. Delivery receipts deferred to V2.
- **Roles:** `DW Executive` and `DW Data Entry` may send notifications. `DW Technician` cannot.

---

## 1. Data & Status Mapping Table

### 1.1 Entity Mapping

| PRD Entity | DocType / Field | Notification Role |
|---|---|---|
| Repair Order | `DW Repair Order.name` | Message identifier (e.g., `2504.0001`) |
| Customer name | `DW Repair Order.customer` → `Customer.customer_name` | Greeting personalization |
| Customer phone | `DW Repair Order.customer` → `Customer.mobile_no` | WhatsApp recipient (`{country_code}{mobile_no}`) |
| Country code | `DW Country Code` (active, linked via intake) or site default | Prefix for phone normalization |
| Order status | `DW Repair Order.status` | Determines message template |
| Reference number | `DW Repair Order.reference_number` or `.name` | Customer-facing order ID |
| Promised date | `DW Repair Order.promised_delivery_date` | Included in Ready messages |
| Shop name | `frappe.db.get_default("company")` or site config | Message footer / sender identity |

### 1.2 Status → Message Mapping

| Order Status | Notification Key | Customer-Facing Subject | Message Body |
|---|---|---|---|
| `Pending` | `order_received` | Order Received | "Dear {customer_name}, your repair order #{ref} has been received. We'll update you as work begins. Thank you for choosing {shop_name}." |
| `In Progress` | `in_progress` | In Progress | "Dear {customer_name}, your repair order #{ref} is now being worked on by our technicians. We'll notify you when it's ready." |
| `Awaiting Parts` | `awaiting_parts` | Awaiting Parts | "Dear {customer_name}, your repair order #{ref} requires parts that are being sourced. We'll update you once work resumes." |
| `Repaired` | `ready_for_collection` | Ready for Collection | "Dear {customer_name}, great news! Your repair order #{ref} is complete and ready for collection. Please visit us at your convenience." |
| `Delivered` | `delivered` | Delivered | "Dear {customer_name}, your repair order #{ref} has been delivered. Thank you for your business! We'd love to see you again at {shop_name}." |

> **Note:** Messages are stored as configurable templates in `DW WhatsApp Template` (new DocType) so that the shop owner can customize wording from the Settings panel without code changes.

---

## 2. System Architecture

### 2.1 Sequence Diagram

```
Staff (SPA)                  Frappe API                  Background Job              whapi.cloud
    |                            |                            |                          |
    |-- POST notify_customer --> |                            |                          |
    |                            |-- validate order,          |                          |
    |                            |   phone, cooldown          |                          |
    |                            |-- create DW WhatsApp Log   |                          |
    |                            |   (status: Queued)         |                          |
    |                            |-- frappe.enqueue() ------->|                          |
    |  <-- 200 {queued} --------|                            |                          |
    |                            |                            |-- POST /messages/text -->|
    |                            |                            |                          |-- 200 {message_id}
    |                            |                            |<- response --------------|
    |                            |                            |-- update Log: Sent       |
    |                            |                            |   store whapi message_id |
    |                            |                            |                          |
    |                            |                            |    (async webhook)       |
    |                            |<--- POST /api/method/      |                          |
    |                            |     whatsapp_webhook ------+--------------------------|
    |                            |-- update Log: Delivered/   |                          |
    |                            |   Read/Failed              |                          |
```

### 2.2 Component Placement

```
watch_doctor/
├── whatsapp/                      # NEW MODULE
│   ├── __init__.py
│   ├── api.py                     # Whitelisted endpoints: notify_customer, get_notification_status
│   ├── service.py                 # Core logic: build_message, send_whatsapp, normalize_phone
│   └── templates.py               # Default message templates & template resolver
├── repair_management/
│   └── doctype/
│       ├── dw_whatsapp_log/       # NEW DocType: audit trail
│       │   ├── dw_whatsapp_log.json
│       │   └── dw_whatsapp_log.py
│       └── dw_whatsapp_template/  # NEW DocType: editable message templates
│           ├── dw_whatsapp_template.json
│           └── dw_whatsapp_template.py
frontend/
└── src/
    ├── components/
    │   └── RepairOrderDetail.tsx   # MODIFIED: add "Notify Customer" button
    └── services/
        └── apiService.ts           # MODIFIED: add notifyCustomer() function
```

> **V1 simplification:** No `retry.py` (retry logic inlined in `service.py`). No webhook endpoint. No inbound message handling.

---

## 3. Step-by-Step Implementation Plan

### Phase 1: Backend Foundation

| Step | Action | Files |
|---|---|---|
| 1.1 | Create `DW WhatsApp Log` DocType (see §3.1) | `dw_whatsapp_log.json`, `.py` |
| 1.2 | Create `DW WhatsApp Template` DocType (see §3.2) | `dw_whatsapp_template.json`, `.py` |
| 1.3 | Add `whatsapp/service.py` with `normalize_phone()`, `build_message()`, `send_whatsapp_message()` | `whatsapp/service.py` |
| 1.4 | Add `whatsapp/api.py` with `notify_customer` and `get_notification_status` endpoints | `whatsapp/api.py` |
| 1.5 | ~~Add webhook endpoint~~ **Deferred to V2** | — |
| 1.6 | Inline retry logic in `service.py` (exponential backoff) | `whatsapp/service.py` |
| 1.7 | ~~Register webhook route~~ **Deferred to V2** | — |
| 1.8 | Seed default templates in `setup_data.py` or a new patch | `patches/` |

### Phase 2: Frontend Integration

| Step | Action | Files |
|---|---|---|
| 2.1 | Add `notifyCustomer(orderName)` to `apiService.ts` | `apiService.ts` |
| 2.2 | Add "Notify Customer" button to `RepairOrderDetail.tsx` action bar | `RepairOrderDetail.tsx` |
| 2.3 | Show notification status indicator (last sent time, delivery status) | `RepairOrderDetail.tsx` |
| 2.4 | Add WhatsApp Settings tab to `Settings.tsx` (API key config, template editor) | `Settings.tsx` |

### Phase 3: Configuration & Ops

| Step | Action |
|---|---|
| 3.1 | Add `site_config.json` keys (see §5) |
| 3.2 | Configure whapi.cloud webhook URL pointing to the Frappe site |
| 3.3 | Seed default message templates via bench command |

---

### 3.1 `DW WhatsApp Log` DocType Schema

| Field | Type | Description |
|---|---|---|
| `repair_order` | Link → `DW Repair Order` | Source order |
| `customer` | Link → `Customer` | Recipient |
| `customer_name` | Data (read-only) | Denormalized |
| `phone_number` | Data | Normalized E.164 number sent to |
| `order_status` | Data | Status at time of send |
| `notification_key` | Data | Template key used (e.g., `ready_for_collection`) |
| `message_body` | Long Text | Actual message sent |
| `status` | Select | `Queued` / `Sent` / `Failed` |
| `whapi_message_id` | Data | whapi.cloud returned `message_id` |
| `error_detail` | Long Text | Error response body on failure |
| `retry_count` | Int | Number of retries attempted |
| `sent_by` | Link → `User` | Staff who triggered |
| `sent_at` | Datetime | Timestamp of successful API call |
| `idempotency_key` | Data (unique) | `{order_name}:{status}:{YYYYMMDD-HH}` |

> **V1 note:** `delivered_at` and `read_at` fields omitted. Will be added in V2 when webhook delivery receipts are implemented.

**Permissions:** Read for `DW Executive` and `DW Data Entry`. No create/write from Desk (system-managed).

### 3.2 `DW WhatsApp Template` DocType Schema

| Field | Type | Description |
|---|---|---|
| `notification_key` | Data (unique, required) | e.g., `ready_for_collection` |
| `label` | Data | Human-friendly name |
| `message_body` | Long Text | Template with `{customer_name}`, `{ref}`, `{status}`, `{shop_name}`, `{promised_date}` placeholders |
| `is_active` | Check | Enable/disable per template |

---

## 4. whapi.cloud API Integration Details

### 4.1 Authentication

All whapi.cloud requests use **Bearer token** authentication:

```
Authorization: Bearer <WHAPI_API_TOKEN>
```

The token is obtained from the whapi.cloud panel after connecting a WhatsApp channel. It must be stored securely in `site_config.json` (never in the database or frontend code).

### 4.2 Send Text Message

**Endpoint:** `POST https://gate.whapi.cloud/messages/text`

**Headers:**
```
Content-Type: application/json
Accept: application/json
Authorization: Bearer {token}
```

**Request Payload:**
```json
{
  "to": "97339398859@s.whatsapp.net",
  "body": "Dear Ahmed, your repair order #2504.0001 is complete and ready for collection. Please visit us at your convenience.",
  "typing_time": 2
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string | Yes | Chat ID format: `{country_code}{number}@s.whatsapp.net` (no `+`, no spaces, no dashes) |
| `body` | string | Yes | Message text. Supports WhatsApp formatting (`*bold*`, `_italic_`, `~strikethrough~`, `` ```monospace``` ``) |
| `typing_time` | number | No | 0-60 seconds simulated typing delay. Use `2` for natural feel |

**Success Response (200):**
```json
{
  "sent": true,
  "message": {
    "id": "BAE5F4C7A2B3D1E0",
    "status": "pending",
    "to": "97339398859@s.whatsapp.net",
    "type": "text",
    "text": { "body": "..." },
    "timestamp": 1744700000
  }
}
```

**Error Responses:**

| Code | Meaning | Action |
|---|---|---|
| 400 | Invalid params (bad phone format) | Log error, do not retry |
| 401 | Invalid/expired API token | Alert admin, do not retry |
| 402 | Plan limit exceeded | Log, alert admin, do not retry |
| 403 | Blocked recipient | Log, mark as failed |
| 429 | Rate limited | Retry with backoff |
| 500 | whapi internal error | Retry with backoff |

### 4.3 Verify Phone Has WhatsApp (Optional Pre-Check)

**Endpoint:** `POST https://gate.whapi.cloud/contacts`

**Payload:**
```json
{
  "contacts": ["97339398859"],
  "force_check": false
}
```

Use this before first-ever send to a customer to verify the number is WhatsApp-enabled. Cache the result on the `Customer` record (a custom field `whatsapp_verified`) to avoid repeated checks.

### 4.4 Webhook for Delivery Receipts (Deferred — V2)

> **Not implemented in V1.** The shop handles inbound messages directly from the mobile device. Delivery receipt tracking will be added in V2 if needed, using whapi.cloud channel settings:
>
> ```json
> {
>   "webhooks": [{
>     "url": "https://{your-site}/api/method/watch_doctor.whatsapp.api.whatsapp_webhook",
>     "events": [{ "type": "statuses", "method": "post" }]
>   }],
>   "callback_backoff_delay_ms": 3000,
>   "callback_persist": true
> }
> ```

---

## 5. Configuration & Environment Variables

All secrets go in **`site_config.json`** (Frappe's standard secure config), never in the database:

```json
{
  "whapi_api_token": "YOUR_WHAPI_CHANNEL_API_TOKEN",
  "whapi_base_url": "https://gate.whapi.cloud",
  "whatsapp_cooldown_minutes": 60,
  "whatsapp_enabled": true
}
```

| Key | Type | Default | Purpose |
|---|---|---|---|
| `whapi_api_token` | string | *required* | Bearer token for whapi.cloud API |
| `whapi_base_url` | string | `https://gate.whapi.cloud` | API base URL |
| `whatsapp_cooldown_minutes` | int | `60` | Minimum minutes between duplicate notifications for same order+status |
| `whatsapp_enabled` | bool | `false` | Master kill switch for the feature |

> **Removed from V1:** `whapi_webhook_secret` (no webhook), `whatsapp_default_country_code` (phone numbers already stored with country code).

**Settings UI access:** The `whatsapp_enabled` flag is exposed in the Settings panel (Executive only). The API token is **not** exposed in the UI — it requires server access to configure.

---

## 6. WhatsApp Compliance & Template Setup

### 6.1 whapi.cloud vs. Official Cloud API

whapi.cloud operates by connecting a **real WhatsApp number** (personal or Business) via QR code. This means:

- **No Meta Business Manager / template approval process.** Messages are sent as free-form text, not pre-approved HSM templates.
- **No 24-hour service window restriction** in the traditional Cloud API sense — but WhatsApp's anti-spam detection still applies.
- **Risk:** Sending too many unsolicited messages can get the number flagged or banned.

### 6.2 Compliance Safeguards (Built Into the System)

| Safeguard | Implementation |
|---|---|
| **Explicit opt-in** | Messages are staff-triggered only, not automated. Staff confirms before send |
| **Cooldown window** | Same order+status cannot be re-notified within `whatsapp_cooldown_minutes` |
| **Rate limiting** | Max 20 messages per minute across all orders (configurable). Enforced server-side before queuing |
| **Business hours** | Optional: configurable send window (e.g., 9AM–9PM). Outside hours, queue with `enqueue_after` |
| **Unsubscribe** | Include "Reply STOP to opt out" footer. Maintain opt-out list via webhook monitoring for inbound "STOP" messages |
| **Content policy** | No promotional content — strictly transactional status updates |
| **Audit trail** | Every message logged with sender identity, timestamp, delivery status |

### 6.3 Message Template Placeholders

Templates support these placeholders, resolved at send time:

| Placeholder | Source |
|---|---|
| `{customer_name}` | `Customer.customer_name` |
| `{ref}` | `DW Repair Order.reference_number` or `.name` |
| `{status}` | Human-readable status label |
| `{shop_name}` | `frappe.db.get_default("company")` |
| `{promised_date}` | `DW Repair Order.promised_delivery_date` (formatted) |

---

## 7. Error Handling, Retries & Audit Logging

### 7.1 Retry Strategy

```python
# whatsapp/retry.py
MAX_RETRIES = 3
BASE_DELAY_SECONDS = 10  # 10s, 20s, 40s

def should_retry(status_code: int) -> bool:
    return status_code in (429, 500, 502, 503, 504)

def get_backoff_delay(attempt: int) -> int:
    """Exponential backoff with jitter."""
    delay = BASE_DELAY_SECONDS * (2 ** attempt)
    jitter = random.uniform(0, delay * 0.2)
    return delay + jitter
```

**Flow:**
1. Initial attempt in background job.
2. On retryable failure (429/5xx): re-enqueue with `enqueue_after_timeout` using exponential backoff.
3. After `MAX_RETRIES`: mark log status as `Failed`, set `error_detail`.
4. Non-retryable errors (400/401/402/403): fail immediately, no retry.

### 7.2 Dead-Letter Handling

Failed messages after all retries remain in `DW WhatsApp Log` with status `Failed`. A **daily scheduled task** (optional Phase 2) can:
- Email a digest of failed notifications to `DW Executive` users.
- Provide a "Retry" button in the WhatsApp Log list view.

### 7.3 Idempotency

The `idempotency_key` field (`{order_name}:{status}:{YYYYMMDD-HH}`) prevents duplicate sends:
- Before queuing, check if a log with the same key exists and is not `Failed`.
- If found and within cooldown window → reject with user-friendly message: "Customer was already notified about this status X minutes ago."

### 7.4 Audit Log Fields Updated at Each Stage

| Event | Fields Updated |
|---|---|
| Staff clicks "Notify" | `status=Queued`, `sent_by`, `idempotency_key`, `message_body` |
| whapi returns 200 | `status=Sent`, `whapi_message_id`, `sent_at` |
| whapi returns error | `status=Failed` or retry, `error_detail`, `retry_count++` |

> **V1 note:** No webhook-driven status updates. Terminal states are `Sent` or `Failed`.

---

## 8. Backend Pseudo-Code (Key Functions)

### 8.1 `whatsapp/service.py`

```python
import frappe
import requests
import re

def normalize_phone(mobile_no: str) -> str:
    """
    Normalize customer phone to WhatsApp Chat ID format.
    Assumes phone already includes country code (per A2).
    Input:  "+973 3939 8859" or "97339398859"
    Output: "97339398859@s.whatsapp.net"
    """
    digits = re.sub(r"[^\d]", "", mobile_no)
    # Strip leading 00 (international dialing prefix)
    if digits.startswith("00"):
        digits = digits[2:]
    return f"{digits}@s.whatsapp.net"


def build_message(order_name: str, notification_key: str) -> dict:
    """
    Resolve template and substitute placeholders.
    Returns: {"to": "...", "body": "...", "customer_name": "...", "phone": "..."}
    """
    order = frappe.get_doc("DW Repair Order", order_name)
    customer = frappe.get_doc("Customer", order.customer)
    template = frappe.get_value(
        "DW WhatsApp Template",
        {"notification_key": notification_key, "is_active": 1},
        ["message_body"],
    )
    if not template:
        frappe.throw(f"No active WhatsApp template for key: {notification_key}")

    shop_name = frappe.db.get_default("company") or "our shop"
    ref = order.reference_number or order.name
    promised = (
        frappe.utils.formatdate(order.promised_delivery_date)
        if order.promised_delivery_date else ""
    )

    body = template.format(
        customer_name=customer.customer_name,
        ref=ref,
        status=order.status,
        shop_name=shop_name,
        promised_date=promised,
    )

    default_cc = frappe.conf.get("whatsapp_default_country_code", "973")
    phone = normalize_phone(customer.mobile_no or "")

    return {
        "to": phone,
        "body": body,
        "customer_name": customer.customer_name,
        "phone_raw": customer.mobile_no,
    }


def send_whatsapp_message(log_name: str):
    """
    Background job: send message and update log.
    Called via frappe.enqueue().
    """
    log = frappe.get_doc("DW WhatsApp Log", log_name)
    token = frappe.conf.get("whapi_api_token")
    base_url = frappe.conf.get("whapi_base_url", "https://gate.whapi.cloud")

    if not token:
        log.status = "Failed"
        log.error_detail = "whapi_api_token not configured in site_config.json"
        log.save(ignore_permissions=True)
        frappe.db.commit()
        return

    try:
        resp = requests.post(
            f"{base_url}/messages/text",
            json={"to": log.phone_number, "body": log.message_body, "typing_time": 2},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30,
        )

        if resp.status_code == 200:
            data = resp.json()
            log.status = "Sent"
            log.whapi_message_id = data.get("message", {}).get("id", "")
            log.sent_at = frappe.utils.now_datetime()
        elif should_retry(resp.status_code) and log.retry_count < MAX_RETRIES:
            log.retry_count += 1
            log.error_detail = f"HTTP {resp.status_code}: {resp.text[:500]}"
            log.save(ignore_permissions=True)
            frappe.db.commit()
            delay = get_backoff_delay(log.retry_count)
            frappe.enqueue(
                "watch_doctor.whatsapp.service.send_whatsapp_message",
                log_name=log_name,
                queue="short",
                enqueue_after_timeout=delay,
            )
            return
        else:
            log.status = "Failed"
            log.error_detail = f"HTTP {resp.status_code}: {resp.text[:500]}"

    except requests.RequestException as e:
        if log.retry_count < MAX_RETRIES:
            log.retry_count += 1
            log.error_detail = str(e)[:500]
            log.save(ignore_permissions=True)
            frappe.db.commit()
            delay = get_backoff_delay(log.retry_count)
            frappe.enqueue(
                "watch_doctor.whatsapp.service.send_whatsapp_message",
                log_name=log_name,
                queue="short",
                enqueue_after_timeout=delay,
            )
            return
        log.status = "Failed"
        log.error_detail = str(e)[:500]

    log.save(ignore_permissions=True)
    frappe.db.commit()
```

### 8.2 `whatsapp/api.py`

```python
import frappe
from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY

STATUS_TO_NOTIFICATION_KEY = {
    "Pending": "order_received",
    "In Progress": "in_progress",
    "Awaiting Parts": "awaiting_parts",
    "Repaired": "ready_for_collection",
    "Delivered": "delivered",
}

@frappe.whitelist()
def notify_customer(repair_order_name: str):
    """On-demand WhatsApp notification trigger."""
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

    if not frappe.conf.get("whatsapp_enabled"):
        frappe.throw("WhatsApp notifications are not enabled.")

    order = frappe.get_doc("DW Repair Order", repair_order_name)
    customer = frappe.get_doc("Customer", order.customer)

    # Validate phone
    if not customer.mobile_no:
        frappe.throw(f"Customer {customer.customer_name} has no mobile number.")

    notification_key = STATUS_TO_NOTIFICATION_KEY.get(order.status)
    if not notification_key:
        frappe.throw(f"No notification template for status: {order.status}")

    # Cooldown check
    cooldown = int(frappe.conf.get("whatsapp_cooldown_minutes", 60))
    cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-cooldown)
    existing = frappe.db.exists("DW WhatsApp Log", {
        "repair_order": repair_order_name,
        "order_status": order.status,
        "status": ["in", ["Queued", "Sent"]],
        "creation": [">=", cutoff],
    })
    if existing:
        frappe.throw(f"Customer was already notified about this status within the last {cooldown} minutes.")

    # Build message
    from watch_doctor.whatsapp.service import build_message
    msg = build_message(repair_order_name, notification_key)

    # Create log
    log = frappe.get_doc({
        "doctype": "DW WhatsApp Log",
        "repair_order": repair_order_name,
        "customer": order.customer,
        "customer_name": msg["customer_name"],
        "phone_number": msg["to"],
        "order_status": order.status,
        "notification_key": notification_key,
        "message_body": msg["body"],
        "status": "Queued",
        "sent_by": frappe.session.user,
        "retry_count": 0,
    })
    log.insert(ignore_permissions=True)
    frappe.db.commit()

    # Enqueue async send
    frappe.enqueue(
        "watch_doctor.whatsapp.service.send_whatsapp_message",
        log_name=log.name,
        queue="short",
        is_async=True,
    )

    return {"status": "queued", "log_name": log.name}


@frappe.whitelist()
def get_notification_status(repair_order_name: str):
    """Get the latest WhatsApp notification status for an order."""
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

    log = frappe.db.get_value(
        "DW WhatsApp Log",
        {"repair_order": repair_order_name},
        ["status", "order_status", "sent_at", "creation", "message_body"],
        order_by="creation desc",
        as_dict=True,
    )
    return log
```

> **V1 note:** No `whatsapp_webhook()` endpoint. Delivery receipt tracking deferred to V2.

---

## 9. Frontend Integration Details

### 9.1 `apiService.ts` Addition

```typescript
export const notifyCustomer = async (orderName: string): Promise<{ status: string; log_name: string }> => {
  const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.notify_customer', {
    method: 'POST',
    body: JSON.stringify({ repair_order_name: orderName }),
  });
  return res.message;
};
```

### 9.2 `RepairOrderDetail.tsx` — Button Placement

Add to the action bar (alongside existing "Create Quotation", "Create Invoice"):

```tsx
<button
  onClick={handleNotifyCustomer}
  disabled={notifying}
  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md
             bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
>
  {notifying ? 'Sending...' : '📱 Notify Customer'}
</button>
```

**UX behavior:**
- Button shows current notification status badge (e.g., "Sent 2h ago ✓✓").
- Confirmation dialog before send: "Send WhatsApp notification for status '{status}' to {customer_name} ({phone})?"
- On success: toast "Notification queued for delivery".
- On cooldown error: toast with the server's cooldown message.

### 9.3 Notification Status Indicator

Below the order header, show the last WhatsApp notification status:

```
Last Notification: Ready for Collection — Delivered ✓✓ (2 hours ago)
```

This requires a lightweight endpoint `get_notification_status(repair_order_name)` that returns the latest `DW WhatsApp Log` entry for the order.

---

## 10. hooks.py Changes

**V1: No hooks.py changes required.**

- No webhook route (outbound only).
- No `doc_events` (manual trigger only).
- No `scheduler_events` (failed digest is optional V2).

All new functionality lives in `watch_doctor.whatsapp.api` via `@frappe.whitelist()` endpoints.

---

## 11. Testing & Deployment Strategy

### 11.1 Testing Phases

| Phase | Environment | Scope |
|---|---|---|
| **Unit tests** | Local / CI | `normalize_phone()` edge cases (with/without country code, spaces, dashes, +prefix). Template placeholder resolution. Cooldown logic. |
| **Integration tests** | Dev site | Mock `requests.post` to simulate whapi responses (200, 429, 500). Verify log state transitions. Verify retry count increments. |
| **whapi.cloud sandbox** | Sandbox channel | Real API calls to whapi.cloud free sandbox. Send to owned test numbers. Verify delivery receipts via webhook. |
| **Staging** | Staging site | Full E2E with real whapi.cloud channel (non-production number). Staff triggers notify → message arrives → webhook updates log. |
| **Production** | Prod site | Phased rollout (see 11.3). |

### 11.2 Key Test Cases

| # | Test | Expected |
|---|---|---|
| 1 | Notify with valid phone | Log created (Queued → Sent), message arrives on WhatsApp |
| 2 | Notify with no phone | `frappe.throw` "no mobile number" |
| 3 | Notify same order+status within cooldown | `frappe.throw` cooldown message |
| 4 | Notify same order+status after cooldown | New log created, message sent |
| 5 | whapi returns 429 | Retry with backoff, log shows `retry_count` increment |
| 6 | whapi returns 401 | Immediate failure, no retry, `error_detail` set |
| 7 | whapi returns 500 × 3 | Three retries, then `Failed` |
| 8 | Webhook delivers status update | ~~Deferred to V2~~ |
| 9 | Webhook with invalid signature | ~~Deferred to V2~~ |
| 10 | `whatsapp_enabled = false` | Throws "not enabled" |
| 11 | Technician role tries to notify | `PermissionError` |
| 12 | Phone with country code already present | Correctly normalized (no double prefix) |
| 13 | Phone with local format (039398859) | Leading zero stripped, country code prepended |

### 11.3 Phased Rollout

| Phase | Duration | Criteria |
|---|---|---|
| **Alpha** | 1 week | 1-2 staff members, ≤ 10 notifications/day. Monitor whapi.cloud dashboard for delivery rates |
| **Beta** | 1 week | All staff, all orders. Monitor `DW WhatsApp Log` failure rate. Target < 2% failure |
| **GA** | Ongoing | Remove rate limit override. Enable daily digest for failed notifications |

### 11.4 Monitoring & Alerting

| Metric | Source | Alert Threshold |
|---|---|---|
| Failure rate | `DW WhatsApp Log` (Failed / Total) | > 5% in rolling 24h |
| Avg delivery time | `sent_at` → `delivered_at` delta | > 5 minutes |
| API token expiry | whapi 401 errors | Any occurrence |
| Queue depth | `DW WhatsApp Log` with status `Queued` older than 5 min | > 10 |

---

## 12. Assumptions & Open Questions

### Assumptions (Resolved)

| # | Assumption | Status | Resolution |
|---|---|---|---|
| A1 | `Customer.mobile_no` contains the primary phone number for WhatsApp delivery | **Confirmed** | Use `Customer.mobile_no` directly. No extra field needed. |
| A2 | Phone numbers include country code or the default country code applies universally | **Confirmed** | Contact numbers already stored with country code. `normalize_phone()` still strips formatting but country code logic is simplified — no default CC fallback needed. |
| A3 | whapi.cloud's free sandbox is sufficient for development and testing | **Confirmed** | Free sandbox for dev; paid plan for production (~1000+ msg/month). |
| A4 | The Frappe site is publicly accessible via HTTPS (required for webhook delivery) | **Simplified** | **Outbound-only design.** Webhook for delivery receipts is optional/deferred. Inbound messages handled directly from the shop's mobile device. No public URL required for V1. |
| A5 | Frappe background workers (`bench worker`) are running in production | **Confirmed** | Workers are running. |
| A6 | whapi.cloud sends delivery receipt webhooks for all message statuses | **Deferred** | Webhook infrastructure is deferred to V2. V1 logs messages as `Sent` on successful API response (HTTP 200). No delivery/read tracking in V1. |

### Open Questions (All Resolved)

| # | Question | Answer | Architectural Impact |
|---|---|---|---|
| Q1 | Inbound customer replies? | **Outbound only.** Inbound handled from mobile directly. | Remove `whatsapp_webhook` endpoint. Remove webhook config from channel settings. Remove `delivered_at`, `read_at` webhook update logic. |
| Q2 | Auto-notify on status change? | **Manual only** for V1. | No `doc_events` hook. No auto-trigger on `validate()`. Staff must click "Notify Customer" explicitly. |
| Q3 | Message language? | **English only.** | No `language` field on `DW WhatsApp Template`. Single template per `notification_key`. |
| Q4 | Attach quotation/invoice PDF? | **No attachments** for now. | Use only `POST /messages/text`. No `/messages/document` integration. |
| Q5 | WhatsApp summary in daily report? | **No.** | No changes to `get_daily_report`. |
| Q6 | Expected monthly volume? | **~1000+ messages/month.** | Requires a paid whapi.cloud channel. Free sandbox for dev only. |
| Q7 | WhatsApp Business profile status? | **Already running WhatsApp Business.** | No warm-up period needed. Can go live immediately after integration. |

### V1 Scope Simplifications (Based on Resolved Questions)

- **No webhook endpoint** — removes `whatsapp_webhook()`, HMAC validation, and `allow_guest` route. Reduces attack surface.
- **No `delivered_at` / `read_at` tracking** — log status transitions: `Queued` → `Sent` or `Failed`. Simpler state machine.
- **No `DW WhatsApp Template.language` field** — single-language templates.
- **No daily report changes** — zero coupling with existing reporting.
- **No `doc_events` hooks** — no automatic triggers, purely on-demand.
- **Text-only messages** — single whapi endpoint (`/messages/text`).

---

## Appendix: Phone Normalization Edge Cases

Since phone numbers already include country codes (A2 confirmed), `normalize_phone()` only strips formatting:

| Input (`mobile_no`) | Output (Chat ID) |
|---|---|
| `+973 3939 8859` | `97339398859@s.whatsapp.net` |
| `97339398859` | `97339398859@s.whatsapp.net` |
| `0097339398859` | `97339398859@s.whatsapp.net` |
| `+91-85899-47318` | `918589947318@s.whatsapp.net` |

The function strips `+`, spaces, dashes, and leading `00` international prefix. No country code inference is needed.
