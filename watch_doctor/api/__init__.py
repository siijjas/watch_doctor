"""Re-export shim so watch_doctor.api.<fn> dotted paths (used by frappe.whitelist()
resolution and the frontend's apiService calls) keep working after the package split.
See API_PY_AUDIT.md item 5. This file must stay logic-free — add new endpoints to the
appropriate submodule, not here.
"""

# Settings / app config
from watch_doctor.api.settings import (  # noqa: F401
    get_user_info,
    get_app_config,
    get_invoice_workflow_configuration,
    save_invoice_workflow_configuration,
    get_sales_invoice_print_context_api,
    get_ro_label_print_format,
    save_logo_url,
    get_general_configuration_api,
    save_general_configuration,
    get_pms_configuration,
    save_pms_configuration,
)

# Repair order lifecycle
from watch_doctor.api.orders import (  # noqa: F401
    save_repair_order,
    update_repair_item_diagnosis,
    update_repair_item_photos,
    list_repair_orders,
    list_order_history,
)

# Catalog / reference lookups
from watch_doctor.api.catalog import (  # noqa: F401
    search_customers,
    get_watch_brands,
    create_watch_brand,
    create_watch_model,
    get_watch_models,
    get_issue_templates,
    get_watch_condition_templates,
    get_diagnosis_summary_templates,
    get_recommended_work_templates,
    get_movement_info_templates,
    get_movement_type_templates,
    get_movement_caliber_templates,
    get_diagnosis_usage,
    get_country_codes,
    search_items,
    get_item_stock,
    get_task_templates,
    get_employees,
    get_payment_modes,
)

# Dashboard / reporting
from watch_doctor.api.dashboard import (  # noqa: F401
    get_dashboard_stats,
    get_orders_trend,
    get_outstanding_invoices,
    get_technician_stats,
    get_top_issues,
    get_aged_pending_orders,
)

# Front-desk order tracker
from watch_doctor.api.tracker import (  # noqa: F401
    get_order_tracker,
    update_watch_stage,
    set_watch_stage,
)

# Order page + technician bench (narrow edits)
from watch_doctor.api.jobs import (  # noqa: F401
    get_order_context,
    get_my_bench,
    assign_technician,
    add_task,
    set_task_status,
    remove_task,
    add_part,
    remove_part,
    set_awaiting_parts,
    set_internal_note,
    set_watch_issues,
    update_order_details,
    set_task_rate,
    set_part_line,
    create_estimate,
    collect_watches,
    preview_collect,
    update_watch_details,
    add_watch,
)

# Intake (one form for new orders)
from watch_doctor.api.intake import (  # noqa: F401
    find_customers,
    check_phone,
    create_customer,
)

# POS
from watch_doctor.api.pos import (  # noqa: F401
    get_pos_runtime_config,
    get_pos_items,
    get_pos_customers,
    get_customer_repair_history,
    get_repair_history_detail,
    create_pos_customer,
    create_pos_invoice,
    get_pos_outstanding_invoices,
    collect_pos_payment,
    get_pos_return_candidates,
    get_pos_invoice_return_items,
    create_pos_return,
    save_pos_draft,
    get_pos_drafts,
    load_pos_draft,
    delete_pos_draft,
    submit_pos_draft,
    get_daily_report,
)

# Point of sale v2 (till) and customer profile
from watch_doctor.api.till import (  # noqa: F401
    till_categories,
    till_items,
    till_preview,
    till_charge,
    till_hold,
    till_held,
    till_load,
    till_last_receipt,
    till_collect,
    till_return_details,
)
from watch_doctor.api.customers import (  # noqa: F401
    list_customers,
    get_customer_profile,
    update_customer,
)

# Owner dashboard
from watch_doctor.api.owner import get_overview  # noqa: F401

# Reports (four, one period) and settings lists
from watch_doctor.api.reports import (  # noqa: F401
    report_workshop,
    report_sales,
    report_cash,
    report_profit,
)
from watch_doctor.api.setup_lists import (  # noqa: F401
    setup_list,
    setup_options,
    setup_save,
    setup_delete,
    pos_profiles,
    save_pos_profile,
    whatsapp_log,
    daily_summary_preview,
)
