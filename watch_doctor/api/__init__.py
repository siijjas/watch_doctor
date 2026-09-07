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
