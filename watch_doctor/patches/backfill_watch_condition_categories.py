from __future__ import unicode_literals

import frappe

# Maps existing seed condition names to a starter category. Anything not
# listed here (custom conditions added later) falls back to "History & Other".
CATEGORY_MAP = {
    "Case scratches": "Case & Exterior",
    "Case dents": "Case & Exterior",
    "Rust visible": "Case & Exterior",
    "Corrosion visible": "Case & Exterior",
    "Impact damage visible": "Case & Exterior",
    "Bezel scratched": "Case & Exterior",
    "Bezel loose": "Case & Exterior",
    "Crown worn": "Case & Exterior",
    "Crown loose": "Case & Exterior",
    "Pusher damaged": "Case & Exterior",
    "Dial stained": "Case & Exterior",
    "Hands corroded": "Case & Exterior",
    "Scratches on crystal": "Crystal & Water Resistance",
    "Cracked crystal": "Crystal & Water Resistance",
    "Moisture under crystal": "Crystal & Water Resistance",
    "Water damage signs": "Crystal & Water Resistance",
    "Bracelet scratched": "Bracelet & Strap",
    "Bracelet stretched": "Bracelet & Strap",
    "Bracelet link missing": "Bracelet & Strap",
    "Clasp loose": "Bracelet & Strap",
    "Strap worn": "Bracelet & Strap",
    "Strap cracked": "Bracelet & Strap",
    "Strap torn": "Bracelet & Strap",
    "Strap stitching damaged": "Bracelet & Strap",
    "Spring bar loose": "Bracelet & Strap",
    "Spring bar missing": "Bracelet & Strap",
    "Screw missing": "Bracelet & Strap",
    "Screw mismatched": "Bracelet & Strap",
    "Previous repair marks": "History & Other",
    "Non-original parts visible": "History & Other",
    "Heavy cosmetic wear": "History & Other",
    "Other cosmetic condition": "History & Other",
    "Other physical condition": "History & Other",
}


def execute():
    frappe.reload_doc("repair_management", "doctype", "dw_watch_condition_template")

    if not frappe.db.has_column("DW Watch Condition Template", "category"):
        return

    rows = frappe.get_all("DW Watch Condition Template", fields=["name", "condition_name"])
    for row in rows:
        category = CATEGORY_MAP.get(row.condition_name)
        if not category:
            continue
        frappe.db.set_value("DW Watch Condition Template", row.name, "category", category, update_modified=False)
