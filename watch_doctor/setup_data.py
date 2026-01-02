import frappe

def execute():
    print("Starting data setup...")
    # Check/Create Task Templates
    tasks = {
        "Replace Battery": "Replace the watch battery",
        "Replace Crystal": "Replace the broken glass/crystal",
        "Dry and Clean": "Disassemble, dry, and clean movement"
    }
    
    task_map = {}
    for task_name, description in tasks.items():
        if not frappe.db.exists("DW Task Template", {"task_name": task_name}):
            try:
                doc = frappe.get_doc({
                    "doctype": "DW Task Template",
                    "task_name": task_name,
                    "description": description,
                    "base_cost": 50
                })
                doc.insert(ignore_permissions=True)
                print(f"Created Task: {task_name}")
            except Exception as e:
                print(f"Error creating task {task_name}: {e}")
        else:
             print(f"Task exists: {task_name}")
        
        # Get the actual name (ID) of the task template
        task_map[task_name] = frappe.db.get_value("DW Task Template", {"task_name": task_name}, "name")

    # Check/Create Issue Templates
    issues = [
        {"issue_name": "Battery Dead", "suggested_task": task_map.get("Replace Battery")},
        {"issue_name": "Glass Cracked", "suggested_task": task_map.get("Replace Crystal")},
        {"issue_name": "Water Damage", "suggested_task": task_map.get("Dry and Clean")},
        {"issue_name": "Strap Broken", "suggested_task": None}
    ]

    for issue in issues:
        if not frappe.db.exists("DW Issue Template", {"issue_name": issue["issue_name"]}):
            try:
                doc = frappe.get_doc({
                    "doctype": "DW Issue Template",
                    "issue_name": issue["issue_name"],
                    "suggested_task": issue["suggested_task"],
                    "is_active": 1
                })
                doc.insert(ignore_permissions=True)
                print(f"Created Issue: {issue['issue_name']}")
            except Exception as e:
                 print(f"Error creating issue {issue['issue_name']}: {e}")
        else:
            print(f"Issue exists: {issue['issue_name']}")

    frappe.db.commit()
    print("Data setup complete.")
