# TODO - Meridian Construction UI refactor

- [ ] Update `index.html` navigation tabs:
  - [ ] Remove "Accounts Management" tab
  - [ ] Remove "Vendors" tab
  - [ ] Remove "Vendor Summary" tab
  - [ ] Add "Bank Account Statements" tab (replacing Accounts Management)
  - [ ] Add "Supplier/summary" and "Labour(sub contract)/ summary" tabs (replacing the summary page arrangement)

- [ ] Implement new "Bank Account Statements" page UI:
  - [ ] Keep manual bank account + transaction entry
  - [ ] Add Excel import from bank statement files (new bank import parser)
  - [ ] Store imported transactions in existing bank account data structures

- [ ] Remove complete Vendor Summary page implementation.

- [ ] Preserve vendor and labour data entry pages without changing features.
  - Note: vendors page tab will be removed, but underlying vendor functions/data remain.

- [ ] Split summary logic into two summary pages:
  - [ ] `supplier/summary`: materials + vendors aggregation (remove labour)
  - [ ] `labour(sub contract)/summary`: labour aggregation + subcontractors

- [ ] Update Excel export to match new summary split + remove vendor summary sheet name.

- [ ] Verify Dashboard and Day Book remain unchanged.

- [ ] Smoke test in browser: navigate tabs, add manual bank txn, import sample excel (if available), print pages.

