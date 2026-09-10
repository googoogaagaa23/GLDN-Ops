# Tasks Manual Timestamp Handler

`Timestamps.gs` is the separate script bound to the shared Tasks spreadsheet, not the dashboard web app. Existing `onEdit` / `handleEdit` triggers use its saved source immediately. Do not paste it over `GLDN_Ops_Dashboard_Code.gs` or run Setup Automation just to install a source repair.

Manual edits stamp affected task checkboxes and values in computer columns E:J. Pasted ranges process every affected cell. Formula cells, headers and archived snapshot tabs are excluded. A cleared input loses its entry timestamp; an unchecked checkbox records an edit while retaining its prior completion time. Existing notes retain non-timestamp comments.

The 3.12.35 source was deployed to the existing bound project and read back. Existing metric values and historical timestamps were re-read unchanged. Automated regressions cover single and multi-cell edits; an actual subsequent signed-in manual edit event has not yet been observed. Historical missing dates cannot be reconstructed from current values.
