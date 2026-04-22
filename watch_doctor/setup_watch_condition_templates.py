"""Seed default watch intake condition templates."""

import frappe


DEFAULT_WATCH_CONDITION_TEMPLATES = [
    ("Scratches on crystal", "Visible crystal scratching noted at intake."),
    ("Cracked crystal", "Crystal already cracked before service."),
    ("Case scratches", "Visible scratching on case surfaces."),
    ("Case dents", "Case has dents or impact marks."),
    ("Bezel scratched", "Bezel or bezel insert shows cosmetic wear."),
    ("Bezel loose", "Bezel feels loose or has excess play."),
    ("Crown worn", "Crown shows visible wear or cosmetic damage."),
    ("Crown loose", "Crown is loose or does not feel secure."),
    ("Pusher damaged", "Pushers show visible damage or wear."),
    ("Dial stained", "Dial has visible staining, spotting, or discoloration."),
    ("Hands corroded", "Hands show corrosion, oxidation, or finish damage."),
    ("Bracelet scratched", "Bracelet has visible scratches or surface wear."),
    ("Bracelet stretched", "Bracelet shows stretch or excessive slack."),
    ("Bracelet link missing", "One or more bracelet links are missing."),
    ("Clasp loose", "Clasp does not close firmly or has excess movement."),
    ("Strap worn", "Strap shows visible wear from prior use."),
    ("Strap cracked", "Strap is cracked, split, or dried out."),
    ("Strap torn", "Strap is torn or structurally damaged."),
    ("Strap stitching damaged", "Strap stitching is loose, frayed, or broken."),
    ("Spring bar loose", "Spring bar is loose or not seated securely."),
    ("Spring bar missing", "One or more spring bars are missing."),
    ("Moisture under crystal", "Condensation or moisture is visible beneath the crystal."),
    ("Water damage signs", "Visible indicators suggest prior water ingress."),
    ("Rust visible", "Rust is visible externally at intake."),
    ("Corrosion visible", "Visible corrosion is present on external parts."),
    ("Screw missing", "One or more visible screws are missing."),
    ("Screw mismatched", "A visible screw appears non-matching or previously replaced."),
    ("Previous repair marks", "Marks indicate prior opening or repair attempts."),
    ("Non-original parts visible", "Visible external parts appear aftermarket or non-original."),
    ("Heavy cosmetic wear", "Watch shows heavy pre-existing cosmetic wear."),
    ("Impact damage visible", "Impact damage is visible on the watch exterior."),
    ("Other cosmetic condition", "Use when another cosmetic condition needs to be documented."),
    ("Other physical condition", "Use when another physical condition needs to be documented."),
]


def execute():
    """Create default watch condition templates when missing."""
    for condition_name, description in DEFAULT_WATCH_CONDITION_TEMPLATES:
        if frappe.db.exists("DW Watch Condition Template", {"condition_name": condition_name}):
            continue

        frappe.get_doc({
            "doctype": "DW Watch Condition Template",
            "condition_name": condition_name,
            "description": description,
            "is_active": 1,
        }).insert(ignore_permissions=True)

    frappe.db.commit()
