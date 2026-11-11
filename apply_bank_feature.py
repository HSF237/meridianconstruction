import shutil, re, os

SRC = r"C:\Users\HI\AppData\Roaming\Claude\local-agent-mode-sessions\5140ed67-f4e6-4d91-a36d-949f51358320\5fbe131d-a1d4-4e91-97c0-26f06fa44286\local_ddca87ca-6b97-4e0f-9c88-acad7d8fbe1c\uploads\index.html"
DST = r"C:\Users\HI\Desktop\MY CODESPACE\meridiahn construction\index.html"

with open(SRC, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add bankAccounts/bankDeposits arrays after labourers
code = code.replace(
    'let labourers = [];\n        let openSite',
    'let labourers = [];\n        let bankAccounts = [];\n        let bankDeposits = [];\n        let openSite'
)

# 2. loadData() Firebase — add after labourers load
code = code.replace(
    'vendors = d.vendors || []; labourers = d.labourers || [];\n                            fbConnected',
    'vendors = d.vendors || []; labourers = d.labourers || [];\n                            bankAccounts = d.bankAccounts || []; bankDeposits = d.bankDeposits || [];\n                            fbConnected'
)

# 3. loadData() localStorage backup line
code = code.replace(
    'JSON.stringify({ sites, tenders, assets, stocks, purchases, attendance, travels, vendors, labourers }));\n                            return;',
    'JSON.stringify({ sites, tenders, assets, stocks, purchases, attendance, travels, vendors, labourers, bankAccounts, bankDeposits }));\n                            return;'
)

# 4. loadLocal() — add bankAccounts/bankDeposits
code = code.replace(
    'vendors = d.vendors || []; labourers = d.labourers || []; }',
    'vendors = d.vendors || []; labourers = d.labourers || []; bankAccounts = d.bankAccounts || []; bankDeposits = d.bankDeposits || []; }'
)

# 5. saveData() localStorage line
code = code.replace(
    'JSON.stringify({ sites, tenders, assets, stocks, purchases, attendance, travels, vendors })); } catch (e) { }',
    'JSON.stringify({ sites, tenders, assets, stocks, purchases, attendance, travels, vendors, bankAccounts, bankDeposits })); } catch (e) { }'
)

# 6. saveData() Firebase fsSetDoc line
code = code.replace(
    'await window.fsSetDoc(ref, { sites, tenders, assets, stocks, purchases, attendance, travels, vendors, labourers, updated',
    'await window.fsSetDoc(ref, { sites, tenders, assets, stocks, purchases, attendance, travels, vendors, labourers, bankAccounts, bankDeposits, updated'
)

# 7. clearAllData()
code = code.replace(
    'sites = []; tenders = []; assets = []; stocks = []; purchases = []; attendance = []; travels = [];',
    'sites = []; tenders = []; assets = []; stocks = []; purchases = []; attendance = []; travels = []; bankAccounts = []; bankDeposits = [];'
)

# 8. Replace renderAccountsView()
OLD_ACCOUNTS = '''        // ══ ACCOUNTS ═════════════════════════════════════════════════════
        function renderAccountsView() {
            let tR = 0, tE = 0, tP = 0, tB = 0;
            sites.forEach((_, i) => { const c = calc(i); tR += c.rec; tE += c.exp; tP += c.prof; tB += c.bal; });
            let tPB = 0; purchases.filter(p => p.type === "PB").forEach(p => tPB += p.amt || 0);
            let tTravel = 0; travels.forEach(t => tTravel += t.amt || 0);
            document.getElementById("accountsContent").innerHTML = `
    <div style="padding:16px">
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat-card green"><div class="stat-label">Total Income</div><div class="stat-value green">${fmt(tR)}</div></div>
        <div class="stat-card red"><div class="stat-label">Total Expenditure</div><div class="stat-value red">${fmt(tE)}</div></div>
        <div class="stat-card amber"><div class="stat-label">Profit Provisioned</div><div class="stat-value amber">${fmt(tP)}</div></div>
        <div class="stat-card blue"><div class="stat-label">Net Balance</div><div class="stat-value" style="color:${tB >= 0 ? "var(--blue)" : "var(--red)"}">${fmt(tB)}</div></div>
      </div>
      <div class="tbl-card">
        <div class="tbl-card-hdr"><h3>📑 Account-wise Summary</h3></div>
        <div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>Account Head</th><th class="r">Amount (₹)</th><th class="r">% of Total</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--green)">💰 Cash Receipts (All Sites)</td><td class="r" style="color:var(--green)">${fmt(tR)}</td><td class="r">—</td></tr>
            <tr><td style="color:var(--blue)">🪨 Material Purchases</td><td class="r" style="color:var(--blue)">${fmt(sites.reduce((a, _, i) => a + calc(i).matExp, 0))}</td><td class="r">${tE > 0 ? Math.round(sites.reduce((a, _, i) => a + calc(i).matExp, 0) / tE * 100) + "%" : "—"}</td></tr>
            <tr><td style="color:#a78bfa">👷 Labour Costs</td><td class="r" style="color:#a78bfa">${fmt(sites.reduce((a, _, i) => a + calc(i).labExp, 0))}</td><td class="r">${tE > 0 ? Math.round(sites.reduce((a, _, i) => a + calc(i).labExp, 0) / tE * 100) + "%" : "—"}</td></tr>
            <tr><td style="color:var(--amber)">🛒 Purchase Bills (PB)</td><td class="r" style="color:var(--amber)">${fmt(tPB)}</td><td class="r">—</td></tr>
            <tr><td style="color:var(--muted)">🚌 Travel Allowance</td><td class="r">${fmt(tTravel)}</td><td class="r">—</td></tr>
            <tr class="sub-row"><td><strong>Net Balance (Income − Expenditure − Profit)</strong></td><td class="r" style="color:${tB >= 0 ? "var(--blue)" : "var(--red)"}"><strong>${fmt(tB)}</strong></td><td class="r">—</td></tr>
          </tbody>
        </table></div>
      </div>
    </div>`;
        }'''

NEW_ACCOUNTS = '''        // ══ ACCOUNTS ═════════════════════════════════════════════════════
        function renderAccountsView() {
            let tR = 0, tE = 0, tMatE = 0, tLabE = 0;
            sites.forEach((s, i) => {
                const c = calc(i); tR += c.rec; tE += c.exp;
                s.matCats.forEach(cat => { (s.mat[cat]||[]).forEach(r => tMatE += (r.amt||0)); });
                s.labCats.forEach(cat => { const lb = s.lab[cat]||{daily:[],contract:null}; tLabE += lb.contract !== null ? lb.contract : (lb.daily||[]).reduce((a,r)=>a+(r.amt||0),0); });
            });
            let tPB = 0; purchases.filter(p => p.type === "PB").forEach(p => tPB += p.amt || 0);
            let tTravel = 0; travels.forEach(t => tTravel += t.amt || 0);
            let totalBankBal = 0;
            let bankRows = bankAccounts.length === 0 ? '<tr class="empty"><td colspan="7">No bank accounts added yet — add one above</td></tr>' : "";
            bankAccounts.forEach((acc, idx) => {
                const deps = bankDeposits.filter(d => d.accIdx === idx);
                const totalDep = deps.reduce((a, d) => a + (d.amt || 0), 0);
                const bal = (acc.opening || 0) + totalDep;
                totalBankBal += bal;
                bankRows += `<tr><td>${esc(acc.name)}</td><td class="muted">${esc(acc.accNo)||"—"}</td><td class="muted">${esc(acc.branch)||"—"}</td><td>${esc(acc.holder)||"—"}</td><td class="r" style="color:var(--dim)">${fmt(acc.opening||0)}</td><td class="r" style="color:var(--teal)">${fmt(totalDep)}</td><td class="r" style="color:var(--blue)"><strong>${fmt(bal)}</strong></td><td><button class="del-btn" onclick="deleteBankAccount(${idx})">✕</button></td></tr>`;
            });
            let totalDeposited = 0;
            let depRows = bankDeposits.length === 0 ? '<tr class="empty"><td colspan="6">No deposits recorded yet</td></tr>' : "";
            bankDeposits.forEach((d, idx) => {
                const acc = bankAccounts[d.accIdx];
                totalDeposited += d.amt || 0;
                depRows += `<tr><td>${fmtDate(d.date)}</td><td>${esc(acc ? acc.name : "—")}</td><td class="r" style="color:var(--teal)">${fmt(d.amt)}</td><td class="muted">${esc(d.ref)||"—"}</td><td>${esc(d.desc)||"—"}</td><td><button class="del-btn" onclick="deleteDeposit(${idx})">✕</button></td></tr>`;
            });
            const accOptions = bankAccounts.map((a, i) => `<option value="${i}">${esc(a.name)}${a.accNo ? " — " + esc(a.accNo) : ""}</option>`).join("");
            document.getElementById("accountsContent").innerHTML = `<div style="padding:16px">
  <div class="stat-grid" style="margin-bottom:20px">
    <div class="stat-card green"><div class="stat-label">Total Income</div><div class="stat-value green">${fmt(tR)}</div></div>
    <div class="stat-card red"><div class="stat-label">Total Expenditure</div><div class="stat-value red">${fmt(tE)}</div></div>
    <div class="stat-card blue"><div class="stat-label">Bank Balance</div><div class="stat-value blue">${fmt(totalBankBal)}</div></div>
    <div class="stat-card amber"><div class="stat-label">Cash In Hand</div><div class="stat-value amber">${fmt(tR - tE)}</div></div>
  </div>
  <div class="tbl-card" style="margin-bottom:16px">
    <div class="tbl-card-hdr"><h3>🏦 Bank Accounts</h3></div>
    <div class="form-grid fg5" style="padding:16px;padding-bottom:8px">
      <div class="fi"><label>Bank Name</label><input type="text" id="ba-name" placeholder="e.g. SBI, HDFC..."></div>
      <div class="fi"><label>Account Number</label><input type="text" id="ba-accno" placeholder="Account no."></div>
      <div class="fi"><label>Account Holder</label><input type="text" id="ba-holder" placeholder="Name"></div>
      <div class="fi"><label>Branch / IFSC</label><input type="text" id="ba-branch" placeholder="Branch or IFSC"></div>
      <div class="fi" style="display:flex;align-items:flex-end"><input type="number" id="ba-opening" placeholder="Opening Bal (₹)" style="width:100%;padding:8px 10px;background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:8px;font-size:12px;color:var(--bright)"></div>
    </div>
    <div style="padding:0 16px 16px"><button class="btn btn-teal" onclick="addBankAccount()">+ Add Bank Account</button></div>
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Bank</th><th>Acc No</th><th>Branch/IFSC</th><th>Holder</th><th class="r">Opening (₹)</th><th class="r">Deposited (₹)</th><th class="r">Balance (₹)</th><th></th></tr></thead>
      <tbody>${bankRows}</tbody>
    </table></div>
    ${bankAccounts.length > 0 ? `<div style="padding:10px 16px;text-align:right;font-size:12px;border-top:1px solid var(--border)">Total Bank Balance: <strong style="color:var(--blue);font-size:14px">${fmt(totalBankBal)}</strong></div>` : ""}
  </div>
  <div class="tbl-card" style="margin-bottom:16px">
    <div class="tbl-card-hdr"><h3>💰 Record Bank Deposit</h3></div>
    <div class="form-grid fg5" style="padding:16px;padding-bottom:8px">
      <div class="fi"><label>Date</label><input type="date" id="dep-date"></div>
      <div class="fi"><label>Bank Account</label><select id="dep-acc"><option value="">(Select Account)</option>${accOptions}</select></div>
      <div class="fi"><label>Amount (₹)</label><input type="number" id="dep-amt" placeholder="0" min="0"></div>
      <div class="fi"><label>Reference / Txn ID</label><input type="text" id="dep-ref" placeholder="Ref. no."></div>
      <div class="fi"><label>Description</label><input type="text" id="dep-desc" placeholder="e.g. Site 1 receipt..."></div>
    </div>
    <div style="padding:0 16px 16px"><button class="btn btn-blue" onclick="addDeposit()">+ Record Deposit</button></div>
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Date</th><th>Bank Account</th><th class="r">Amount (₹)</th><th>Reference</th><th>Description</th><th></th></tr></thead>
      <tbody>${depRows}</tbody>
    </table></div>
    ${bankDeposits.length > 0 ? `<div style="padding:10px 16px;text-align:right;font-size:12px;border-top:1px solid var(--border)">Total Deposited: <strong style="color:var(--teal)">${fmt(totalDeposited)}</strong></div>` : ""}
  </div>
  <div class="tbl-card">
    <div class="tbl-card-hdr"><h3>📑 Account-wise Summary</h3></div>
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Account Head</th><th class="r">Amount (₹)</th></tr></thead>
      <tbody>
        <tr><td style="color:var(--green)">💰 Cash Receipts (All Sites)</td><td class="r" style="color:var(--green)">${fmt(tR)}</td></tr>
        <tr><td style="color:var(--blue)">🪨 Material Purchases</td><td class="r" style="color:var(--blue)">${fmt(tMatE)}</td></tr>
        <tr><td style="color:#a78bfa">👷 Labour Costs</td><td class="r" style="color:#a78bfa">${fmt(tLabE)}</td></tr>
        <tr><td style="color:var(--amber)">🛒 Purchase Bills (PB)</td><td class="r" style="color:var(--amber)">${fmt(tPB)}</td></tr>
        <tr><td style="color:var(--muted)">🚌 Travel Allowance</td><td class="r">${fmt(tTravel)}</td></tr>
        <tr><td style="color:var(--teal)">🏦 Total Bank Deposits</td><td class="r" style="color:var(--teal)">${fmt(totalDeposited)}</td></tr>
        <tr class="sub-row"><td><strong>Net (Receipts − All Expenses)</strong></td><td class="r" style="color:${(tR-tE) >= 0 ? "var(--blue)" : "var(--red)"}"><strong>${fmt(tR - tE)}</strong></td></tr>
      </tbody>
    </table></div>
  </div>
</div>`;
        }
        function addBankAccount() {
            const name = val("ba-name"), accNo = val("ba-accno"), holder = val("ba-holder"), branch = val("ba-branch"), opening = num("ba-opening");
            if (!name) { notif("Enter bank name"); return; }
            bankAccounts.push({ name, accNo, holder, branch, opening });
            saveData(); renderAccountsView(); notif("Bank account added — " + name);
        }
        function deleteBankAccount(i) {
            if (!confirm("Delete this bank account? Deposit records linked to it will also be removed.")) return;
            bankDeposits = bankDeposits.filter(d => d.accIdx !== i).map(d => ({ ...d, accIdx: d.accIdx > i ? d.accIdx - 1 : d.accIdx }));
            bankAccounts.splice(i, 1);
            saveData(); renderAccountsView(); notif("Bank account deleted");
        }
        function addDeposit() {
            const date = val("dep-date"), accIdxStr = val("dep-acc"), amt = num("dep-amt"), ref = val("dep-ref"), desc = val("dep-desc");
            if (!accIdxStr) { notif("Select a bank account"); return; }
            if (!amt) { notif("Enter deposit amount"); return; }
            const accIdx = parseInt(accIdxStr);
            bankDeposits.push({ date, accIdx, amt, ref, desc });
            saveData(); renderAccountsView(); notif("Deposit recorded — " + fmt(amt));
        }
        function deleteDeposit(i) {
            if (!confirm("Delete this deposit record?")) return;
            bankDeposits.splice(i, 1);
            saveData(); renderAccountsView(); notif("Deposit deleted");
        }'''

code = code.replace(OLD_ACCOUNTS, NEW_ACCOUNTS)

# 9. Window exports — add bankAccounts and bankDeposits
code = code.replace(
    'window.sites = sites; window.vendors = vendors; window.labourers = labourers;',
    'window.sites = sites; window.vendors = vendors; window.labourers = labourers; window.bankAccounts = bankAccounts; window.bankDeposits = bankDeposits;'
)

# Also add fg5 CSS if missing
if '.fg5 {' not in code:
    code = code.replace(
        '.fi label {',
        '.fg5 { grid-template-columns: repeat(5, 1fr) }\n\n        .fi label {'
    )

with open(DST, 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS! Bank account feature added to index.html")
print(f"File saved to: {DST}")
input("\nPress Enter to close...")
