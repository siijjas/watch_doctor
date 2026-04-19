import frappe


LABEL_HTML = """<style>
  .print-format,
  .print-format table,
  .print-format tr,
  .print-format td,
  .print-format div,
  .print-format p {
    font-family: Arial, sans-serif;
    line-height: 115%;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  @media screen {
    .print-format {
      width: 1.5in;
      padding: 0.07in 0.08in;
      min-height: 1in;
    }
  }
  @media print {
    @page {
      size: 1.5in 1in;
      margin: 0;
    }
    .print-format {
      width: 1.5in;
      height: 1in;
      padding: 0.07in 0.08in;
      overflow: hidden;
    }
  }
  .dw-lbl {
    text-align: center;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    gap: 2px;
  }
  .dw-lbl .ro-id {
    font-size: 15pt;
    font-weight: bold;
    display: block;
    text-align: center;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dw-lbl .cust-name {
    font-size: 10pt;
    font-weight: bold;
    display: block;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dw-lbl .mobile {
    font-size: 10pt;
    display: block;
    text-align: center;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

{%- set _cn = frappe.db.get_value("Customer", doc.customer, "customer_name") or doc.customer -%}
{%- set _mb = frappe.db.get_value("Customer", doc.customer, "mobile_no") or "" -%}
{%- set _ref = doc.reference_number or doc.name -%}

<div class='dw-lbl'>
  <span class='ro-id'>{{ _ref }}</span>
  <span class='cust-name'>{{ _cn | truncate(22, True, '...') }}</span>
  {%- if _mb %}
  <span class='mobile'>{{ _mb }}</span>
  {%- endif -%}
</div>"""


def execute():
    if not frappe.db.exists("Print Format", "DW RO Bag Label"):
        return

    doc = frappe.get_doc("Print Format", "DW RO Bag Label")
    doc.html = LABEL_HTML
    doc.custom_format = 1
    doc.print_format_type = "Jinja"
    doc.disabled = 0
    doc.save(ignore_permissions=True)
