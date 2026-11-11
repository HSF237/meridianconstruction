// ── FIREBASE INITIALIZATION ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCkhf_MbNk-8GAqKBXCeJQ2pk1V_sLyzPU",
    authDomain: "meridian-construction.firebaseapp.com",
    projectId: "meridian-construction",
    storageBucket: "meridian-construction.firebasestorage.app",
    messagingSenderId: "1067477174772",
    appId: "1:1067477174772:web:2c5e69d117b626047591a1",
    measurementId: "G-VX1TG3LXFG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.db = db;
window.fsDoc = doc;
window.fsGetDoc = getDoc;
window.fsSetDoc = setDoc;
window.fsOnSnapshot = onSnapshot;
window.firebaseReady = true;
window.dispatchEvent(new Event("firebaseReady"));

// ── APP LOGIC ──
const PT = 0.15;
const STORE_KEY = "meridian_v3";
const DEF_MAT = ["Stone", "Cement", "Sand", "Metal", "Steel"];
const DEF_LAB = ["Stone Masonry", "Concrete Mason", "Man Labor", "Plastering"];

let sites = [];
let openSite = null;
let openSec = {};
let openCat = {};
let addCatCtx = null;
let fbConnected = false;
let saveTimer = null;

// ── SITE FACTORY ──
function mkSite(name) {
    return {
        name,
        cash: [],
        matCats: [...DEF_MAT],
        mat: Object.fromEntries(DEF_MAT.map(c => [c, []])),
        labCats: [...DEF_LAB],
        lab: Object.fromEntries(DEF_LAB.map(c => [c, { daily: [], contract: null, scName: "", scDesc: "" }]))
    };
}

function migrateSite(s) {
    if (!s.matCats) s.matCats = [...DEF_MAT];
    if (!s.labCats) s.labCats = [...DEF_LAB];
    if (!s.mat) s.mat = {};
    if (!s.lab) s.lab = {};
    if (!s.cash) s.cash = [];
    s.matCats.forEach(c => { if (!s.mat[c]) s.mat[c] = []; });
    s.labCats.forEach(c => {
        if (!s.lab[c]) s.lab[c] = { daily: [], contract: null, scName: "", scDesc: "" };
        if (Array.isArray(s.lab[c])) s.lab[c] = { daily: s.lab[c], contract: null, scName: "", scDesc: "" };
        if (!s.lab[c].daily) s.lab[c].daily = [];
    });
    return s;
}

// ── CLOUD STATUS ──
function setCloudStatus(state, text) {
    const el = document.getElementById("cloudStatus");
    if (!el) return;
    el.className = "cloud-status cloud-" + state;
    el.innerHTML = text;
}

// ── LOAD ──
async function loadData() {
    if (window.firebaseReady && window.db) {
        try {
            setCloudStatus("syncing", "&#9881; Loading from cloud...");
            const ref = window.fsDoc(window.db, "meridian", "main");
            const snap = await window.fsGetDoc(ref);
            if (snap.exists()) {
                const d = snap.data();
                if (d.sites && d.sites.length > 0) {
                    sites = d.sites.map(migrateSite);
                    fbConnected = true;
                    setCloudStatus("synced", "&#9728; Cloud Synced");
                    localStorage.setItem(STORE_KEY, JSON.stringify({ sites }));
                    return;
                }
            }
            loadLocal();
            fbConnected = true;
            saveData();
            setCloudStatus("synced", "&#9728; Cloud Synced");
            return;
        } catch (e) {
            console.error("Firebase load error:", e);
            setCloudStatus("error", "&#9888; Cloud offline (using local)");
            loadLocal();
            return;
        }
    }
    loadLocal();
    setCloudStatus("offline", "&#128190; Local only");
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
            const d = JSON.parse(raw);
            sites = (d.sites || []).map(migrateSite);
        } else {
            for (let i = 1; i <= 20; i++) sites.push(mkSite("Site " + i));
        }
    } catch (e) {
        sites = [];
        for (let i = 1; i <= 20; i++) sites.push(mkSite("Site " + i));
    }
}

// ── SAVE ──
function saveData() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ sites })); } catch (e) { }

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (!window.firebaseReady || !window.db || !fbConnected) {
            setCloudStatus("offline", "&#128190; Local only");
            return;
        }
        try {
            setCloudStatus("syncing", "&#9881; Saving...");
            const ref = window.fsDoc(window.db, "meridian", "main");
            await window.fsSetDoc(ref, { sites, updated: new Date().toISOString() });
            setCloudStatus("synced", "&#9728; Cloud Synced");
        } catch (e) {
            console.error("Cloud save error:", e);
            setCloudStatus("error", "&#9888; Cloud error");
        }
    }, 800);
}

// ── CALC ──
function calc(i) {
    const s = sites[i];
    if (!s) return { rec: 0, matExp: 0, labExp: 0, exp: 0, prof: 0, bal: 0 };
    const rec = s.cash.reduce((a, r) => a + (r.amt || 0), 0);
    let matExp = 0;
    s.matCats.forEach(c => { matExp += (s.mat[c] || []).reduce((a, r) => a + (r.amt || 0), 0); });
    let labExp = 0;
    s.labCats.forEach(c => {
        const lb = s.lab[c] || { daily: [], contract: null };
        labExp += (lb.contract !== null ? lb.contract : (lb.daily || []).reduce((a, r) => a + (r.amt || 0), 0));
    });
    const exp = matExp + labExp;
    const prof = Math.round(exp * PT);
    const bal = Math.round(rec - exp - prof);
    return { rec, matExp, labExp, exp, prof, bal };
}

function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "\u2014";
    return "\u20B9" + Math.round(n).toLocaleString("en-IN");
}

function fmtDate(d) {
    if (!d) return "\u2014";
    try {
        const p = d.split("-");
        if (p.length !== 3) return d;
        return p[2] + "-" + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + "-" + p[0];
    }
    catch { return d; }
}

function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\\/g, "&#92;").replace(/'/g, "&#39;");
}

// ── NAVIGATION ──
function showTab(t) {
    ["dash", "sites", "vsummary", "daybook"].forEach(v => {
        const panel = document.getElementById("view-" + v);
        const tab = document.getElementById("nt-" + v);
        if (panel) panel.style.display = t === v ? "block" : "none";
        if (tab) tab.className = "nav-tab" + (t === v ? " on" : "");
    });
    if (t === "dash") renderDash();
    if (t === "sites") renderSites();
    if (t === "vsummary") renderVendorSummary();
    if (t === "daybook") renderDayBook();
}

// ── DASHBOARD ──
function renderDash() {
    let tR = 0, tE = 0, tP = 0, tB = 0;
    sites.forEach((_, i) => { const c = calc(i); tR += c.rec; tE += c.exp; tP += c.prof; tB += c.bal; });
    const cards = document.getElementById("dashCards");
    if (cards) {
        cards.innerHTML = `
            <div class="dcard dv-green-card"><div class="dl">Total Receipts</div><div class="dv dv-green">${fmt(tR)}</div></div>
            <div class="dcard dv-red-card"><div class="dl">Total Expenditure</div><div class="dv dv-red">${fmt(tE)}</div></div>
            <div class="dcard dv-amber-card"><div class="dl">Total Profit (15%)</div><div class="dv dv-amber">${fmt(tP)}</div></div>
            <div class="dcard dv-blue-card"><div class="dl">Net Balance</div><div class="dv dv-blue">${fmt(tB)}</div></div>`;
    }
    let rows = "";
    sites.forEach((s, i) => {
        const c = calc(i);
        const hasSC = s.labCats.some(lc => s.lab[lc] && s.lab[lc].contract !== null);
        const bc = c.bal >= 0 ? "bal-p" : "bal-n";
        rows += `<tr><td><span class="site-lnk" onclick="goSite(${i})">${esc(s.name)}</span>${hasSC ? '<span class="sc-pill">SC</span>' : ''}</td><td>${fmt(c.rec)}</td><td>${fmt(c.exp)}</td><td>${fmt(c.prof)}</td><td class="${bc}">${fmt(c.bal)}</td></tr>`;
    });
    rows += `<tr class="gt"><td>GRAND TOTAL \u2014 ALL SITES</td><td>${fmt(tR)}</td><td>${fmt(tE)}</td><td>${fmt(tP)}</td><td>${fmt(tB)}</td></tr>`;
    const body = document.getElementById("dashBody");
    if (body) body.innerHTML = rows;
}

function goSite(i) {
    showTab("sites");
    openSite = i;
    renderSites();
    setTimeout(() => {
        const el = document.getElementById("sc-" + i);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
}

// ── VENDOR SUMMARY ──
let vsFilters = { site: "", type: "", cat: "" };

function vsFilter() {
    ["vs-site", "vs-type", "vs-cat"].forEach((id, k) => {
        const el = document.getElementById(id);
        if (el) vsFilters[["site", "type", "cat"][k]] = el.value;
    });
    renderVendorSummary();
}

function vsTypeChange() {
    const el = document.getElementById("vs-type");
    if (el) vsFilters.type = el.value;
    vsFilters.cat = "";
    renderVendorSummary();
}

function clearVsFilters() {
    vsFilters = { site: "", type: "", cat: "" };
    renderVendorSummary();
}

function renderVendorSummary() {
    const siteIdx = vsFilters.site !== "" ? parseInt(vsFilters.site) : -1;
    const typeF = vsFilters.type;
    const catF = vsFilters.cat;

    const scopedMatCats = new Set();
    const scopedLabCats = new Set();
    sites.forEach((s, i) => {
        if (siteIdx >= 0 && siteIdx !== i) return;
        s.matCats.forEach(c => scopedMatCats.add(c));
        s.labCats.forEach(c => scopedLabCats.add(c));
    });

    const siteOptions = `<option value="">All Sites</option>` +
        sites.map((s, i) => `<option value="${i}"${vsFilters.site === String(i) ? " selected" : ""}>${esc(s.name)}</option>`).join("");

    let catOptions = `<option value="">All Categories</option>`;
    if (!typeF || typeF === "mat") scopedMatCats.forEach(c => { catOptions += `<option value="mat:${esc(c)}"${catF === "mat:" + c ? " selected" : ""}>Material: ${esc(c)}</option>`; });
    if (!typeF || typeF === "lab") scopedLabCats.forEach(c => { catOptions += `<option value="lab:${esc(c)}"${catF === "lab:" + c ? " selected" : ""}>Labour: ${esc(c)}</option>`; });

    let html = "";
    let grandTotal = 0;

    if (!typeF || typeF === "mat") {
        scopedMatCats.forEach(cat => {
            if (catF && catF !== "mat:" + cat) return;
            let catTotal = 0;
            let siteRows = "";
            sites.forEach((s, i) => {
                if (siteIdx >= 0 && siteIdx !== i) return;
                const entries = s.mat[cat] || [];
                if (entries.length === 0) return;
                const sub = entries.reduce((a, r) => a + (r.amt || 0), 0);
                catTotal += sub;
                const vendors = {};
                entries.forEach(r => {
                    const v = r.det || "(No vendor name)";
                    if (!vendors[v]) vendors[v] = { amt: 0, bills: [] };
                    vendors[v].amt += (r.amt || 0);
                    if (r.bill) vendors[v].bills.push(r.bill);
                });
                Object.entries(vendors).forEach(([v, info]) => {
                    const billStr = info.bills.length > 0 ? ` <span style="color:#888;font-size:10px">[${esc(info.bills.join(", "))}]</span>` : "";
                    siteRows += `<tr class="vend-site-row"><td style="padding-left:24px">${esc(s.name)}</td><td>${esc(v)}${billStr}</td><td class="r">${fmt(info.amt)}</td></tr>`;
                });
            });
            if (!siteRows) return;
            grandTotal += catTotal;
            html += `<div class="vsec-hdr">&#129521; Material: ${esc(cat)}</div><table class="etbl"><thead><tr><th style="width:32%">Site</th><th>Vendor / Bills</th><th class="r" style="width:22%">Amount (&#8377;)</th></tr></thead><tbody>${siteRows}<tr class="sub-row"><td colspan="2">Total \u2014 ${esc(cat)}</td><td class="r">${fmt(catTotal)}</td></tr></tbody></table>`;
        });
    }

    if (!typeF || typeF === "lab") {
        scopedLabCats.forEach(cat => {
            if (catF && catF !== "lab:" + cat) return;
            let catTotal = 0;
            let siteRows = "";
            sites.forEach((s, i) => {
                if (siteIdx >= 0 && siteIdx !== i) return;
                const lb = s.lab[cat];
                if (!lb) return;
                const isSC = lb.contract !== null;
                const sub = isSC ? lb.contract : (lb.daily || []).reduce((a, r) => a + (r.amt || 0), 0);
                if (!sub) return;
                catTotal += sub;
                if (isSC) {
                    siteRows += `<tr class="vend-site-row"><td style="padding-left:24px">${esc(s.name)}</td><td>${esc(lb.scName) || "Subcontractor"} <span class="sc-pill">SC</span></td><td class="r">${fmt(sub)}</td></tr>`;
                } else {
                    const workers = {};
                    (lb.daily || []).forEach(r => {
                        const w = r.part || "(No name)";
                        if (!workers[w]) workers[w] = { amt: 0, vouchers: [] };
                        workers[w].amt += (r.amt || 0);
                        if (r.voucher) workers[w].vouchers.push(r.voucher);
                    });
                    Object.entries(workers).forEach(([w, info]) => {
                        const vchStr = info.vouchers.length > 0 ? ` <span style="color:#888;font-size:10px">[${esc(info.vouchers.join(", "))}]</span>` : "";
                        siteRows += `<tr class="vend-site-row"><td style="padding-left:24px">${esc(s.name)}</td><td>${esc(w)}${vchStr}</td><td class="r">${fmt(info.amt)}</td></tr>`;
                    });
                }
            });
            if (!siteRows) return;
            grandTotal += catTotal;
            html += `<div class="vsec-hdr">&#128119; Labour: ${esc(cat)}</div><table class="etbl"><thead><tr><th style="width:32%">Site</th><th>Worker / Contractor / Vouchers</th><th class="r" style="width:22%">Amount (&#8377;)</th></tr></thead><tbody>${siteRows}<tr class="sub-row"><td colspan="2">Total \u2014 ${esc(cat)}</td><td class="r">${fmt(catTotal)}</td></tr></tbody></table>`;
        });
    }

    const emptyMsg = '<p style="text-align:center;color:#aaa;padding:40px">No entries found for the selected filters.</p>';
    const content = document.getElementById("vsummaryContent");
    if (content) {
        content.innerHTML = `
            <div class="db-filter-bar">
              <div class="form-row fg3" style="margin-bottom:0">
                <div class="fi"><label>Site</label><select id="vs-site" onchange="vsFilter()">${siteOptions}</select></div>
                <div class="fi"><label>Type</label><select id="vs-type" onchange="vsTypeChange()">
                  <option value=""${!typeF ? " selected" : ""}>All Types</option>
                  <option value="mat"${typeF === "mat" ? " selected" : ""}>Materials Only</option>
                  <option value="lab"${typeF === "lab" ? " selected" : ""}>Labour Only</option>
                </select></div>
                <div class="fi"><label>Category</label><select id="vs-cat" onchange="vsFilter()">${catOptions}</select></div>
              </div>
              <div class="db-stats">
                <span>Filtered Total: <strong style="color:#185FA5">${fmt(grandTotal)}</strong></span>
                <button class="btn btn-outline" style="font-size:11px;padding:3px 10px" onclick="clearVsFilters()">Clear Filters</button>
              </div>
            </div>
            <div style="padding:14px">${html || emptyMsg}</div>`;
    }
}

// ── SITES LIST ──
function renderSites() {
    const wrap = document.getElementById("sitesList");
    if (!wrap) return;
    wrap.innerHTML = "";
    sites.forEach((s, i) => {
        const { rec, exp, bal } = calc(i);
        const isOpen = openSite === i;
        const hasSC = s.labCats.some(lc => s.lab[lc] && s.lab[lc].contract !== null);
        const bc = bal >= 0 ? "bal-p" : "bal-n";
        const div = document.createElement("div");
        div.className = "site-card"; div.id = "sc-" + i;
        div.innerHTML = `
            <div class="site-hdr${isOpen ? " open" : ""}" onclick="toggleSite(${i})">
              <div class="snum">${String(i + 1).padStart(2, "0")}</div>
              <div class="sinfo">
                <div class="sname">${esc(s.name)}${hasSC ? '<span class="sc-pill">Subcontract</span>' : ''}</div>
                <div class="smeta">Receipts: ${fmt(rec)} &nbsp;|&nbsp; Expense: ${fmt(exp)} &nbsp;|&nbsp; <span class="${bc}">Balance: ${fmt(bal)}</span></div>
              </div>
              <div style="display:flex;gap:5px" onclick="event.stopPropagation()">
                <button class="btn btn-outline" style="font-size:10px;padding:4px 8px" onclick="renameSite(${i})">Rename</button>
              </div>
              <span class="sarr">\u25B6</span>
            </div>
            <div class="site-body${isOpen ? " open" : ""}" id="sb-${i}">${isOpen ? bodyHTML(i) : ""}</div>`;
        wrap.appendChild(div);
    });
}

function toggleSite(i) {
    openSite = (openSite === i) ? null : i;
    renderSites();
}

// ── BODY ──
function bodyHTML(i) {
    const sec = openSec[i] || "cash";
    return `
        <div class="sec-tabs">
          ${["cash", "mat", "lab", "sum"].map((s, j) => `<div class="sec-tab${sec === s ? " on" : ""}" onclick="setSec(${i},'${s}')">${["&#128176; Cash", "&#129521; Materials", "&#128119; Labour", "&#128202; Summary"][j]}</div>`).join("")}
        </div>
        <div class="sec-panel${sec === "cash" ? " on" : ""}">${sec === "cash" ? cashHTML(i) : ""}</div>
        <div class="sec-panel${sec === "mat" ? " on" : ""}">${sec === "mat" ? matHTML(i) : ""}</div>
        <div class="sec-panel${sec === "lab" ? " on" : ""}">${sec === "lab" ? labHTML(i) : ""}</div>
        <div class="sec-panel${sec === "sum" ? " on" : ""}">${sec === "sum" ? sumHTML(i) : ""}</div>`;
}

function setSec(i, sec) {
    openSec[i] = sec;
    const sb = document.getElementById("sb-" + i);
    if (sb) sb.innerHTML = bodyHTML(i);
}

// ── CASH ──
function cashHTML(i) {
    const rows = sites[i].cash;
    const tot = rows.reduce((a, r) => a + (r.amt || 0), 0);
    return `
        <div class="print-header"><h2>${esc(sites[i].name)} \u2014 Cash Receipts</h2><p>Meridian Construction Company</p></div>
        <div class="sec-toolbar">
          <div></div>
          <button class="btn btn-grey" style="font-size:11px;padding:5px 10px" onclick="printSec(${i},'cash')">&#128424; Print</button>
        </div>
        <div class="form-row fg4">
          <div class="fi"><label>Date</label><input type="date" id="cd-${i}"></div>
          <div class="fi"><label>Particulars</label><input type="text" id="cp-${i}" placeholder="Running bill, advance..."></div>
          <div class="fi"><label>Amount (&#8377;)</label><input type="number" id="ca-${i}" placeholder="0" min="0"></div>
          <div class="fi" style="display:flex;align-items:flex-end"><button class="btn btn-green" style="width:100%" onclick="addCash(${i})">+ Add</button></div>
        </div>
        <div class="tbl-wrap"><table class="etbl">
          <thead><tr><th style="width:4%">#</th><th style="width:16%">Date</th><th>Particulars</th><th class="r" style="width:20%">Amount (&#8377;)</th><th style="width:4%"></th></tr></thead>
          <tbody>
            ${rows.length === 0 ? '<tr class="empty-row"><td colspan="5">No receipts entered yet</td></tr>' : ""}
            ${rows.map((r, j) => `<tr><td class="muted">${j + 1}</td><td>${fmtDate(r.date)}</td><td>${esc(r.part) || "\u2014"}</td><td class="r">${fmt(r.amt)}</td><td><button class="del-btn" onclick="delEntry(${i},'cash',${j})">&#10005;</button></td></tr>`).join("")}
            ${rows.length > 0 ? `<tr class="sub-row"><td colspan="3">Total Receipts</td><td class="r">${fmt(tot)}</td><td></td></tr>` : ""}
          </tbody>
        </table></div>`;
}

function addCash(i) {
    const d = val("cd-" + i), p = val("cp-" + i), a = num("ca-" + i);
    if (!a) { notif("Enter an amount"); return; }
    sites[i].cash.push({ date: d, part: p, amt: a });
    saveData(); refreshBody(i, "cash"); refreshHdr(i); notif("Receipt added");
}

// ── MATERIALS ──
function matHTML(i) {
    const s = sites[i];
    const cat = openCat["m" + i] || s.matCats[0] || "";
    if (!cat) return `
        <div class="sec-toolbar">
          <div class="cat-tabs"><div class="add-cat-btn" onclick="openAddCat(${i},'mat')">+ Add Category</div></div>
        </div>
        <p style="color:#aaa;padding:20px;text-align:center">No material categories. Add one above.</p>`;
    const rows = s.mat[cat] || [];
    const sub = rows.reduce((a, r) => a + (r.amt || 0), 0);
    return `
        <div class="print-header"><h2>${esc(s.name)} \u2014 Materials: ${esc(cat)}</h2><p>Meridian Construction Company</p></div>
        <div class="sec-toolbar">
          <div class="cat-tabs">
            ${s.matCats.map(c => `<div class="ctab${cat === c ? " on" : ""}" onclick="setCat(${i},'m','${esc(c).replace(/'/g, "&#39;")}')">${esc(c)}<button class="rm" onclick="event.stopPropagation();removeCat(${i},'mat','${esc(c).replace(/'/g, "&#39;")}')" title="Remove">&#10005;</button></div>`).join("")}
            <div class="add-cat-btn" onclick="openAddCat(${i},'mat')">+ Add</div>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:5px 10px" onclick="printSec(${i},'mat')">&#128424; Print</button>
        </div>
        <div class="form-row fg5">
          <div class="fi"><label>Date</label><input type="date" id="md-${i}"></div>
          <div class="fi"><label>Details / Vendor</label><input type="text" id="mdt-${i}" placeholder="Vendor name"></div>
          <div class="fi"><label>Bill No</label><input type="text" id="mbn-${i}" placeholder="Bill / Invoice"></div>
          <div class="fi"><label>Amount (&#8377;)</label><input type="number" id="ma-${i}" placeholder="0" min="0"></div>
          <div class="fi" style="display:flex;align-items:flex-end"><button class="btn btn-blue" style="width:100%" onclick="addMat(${i},'${esc(cat).replace(/'/g, "&#39;")}')">+ Add</button></div>
        </div>
        <div class="tbl-wrap"><table class="etbl">
          <thead><tr><th style="width:4%">#</th><th style="width:14%">Date</th><th>Details / Vendor</th><th style="width:14%">Bill No</th><th class="r" style="width:18%">Amount (&#8377;)</th><th style="width:4%"></th></tr></thead>
          <tbody>
            ${rows.length === 0 ? `<tr class="empty-row"><td colspan="6">No ${esc(cat)} entries yet</td></tr>` : ""}
            ${rows.map((r, j) => `<tr><td class="muted">${j + 1}</td><td>${fmtDate(r.date)}</td><td>${esc(r.det) || "\u2014"}</td><td class="muted">${esc(r.bill) || "\u2014"}</td><td class="r">${fmt(r.amt)}</td><td><button class="del-btn" onclick="delEntry(${i},'mat-${esc(cat).replace(/'/g, "&#39;")}',${j})">&#10005;</button></td></tr>`).join("")}
            ${rows.length > 0 ? `<tr class="sub-row"><td colspan="4">Sub Total \u2014 ${esc(cat)}</td><td class="r">${fmt(sub)}</td><td></td></tr>` : ""}
          </tbody>
        </table></div>`;
}

function addMat(i, cat) {
    const d = val("md-" + i), dt = val("mdt-" + i), bn = val("mbn-" + i), a = num("ma-" + i);
    if (!a) { notif("Enter an amount"); return; }
    if (!sites[i].mat[cat]) sites[i].mat[cat] = [];
    sites[i].mat[cat].push({ date: d, det: dt, bill: bn, amt: a });
    saveData(); openCat["m" + i] = cat; refreshBody(i, "mat"); refreshHdr(i); notif(cat + " entry added");
}

// ── LABOUR ──
function labHTML(i) {
    const s = sites[i];
    const cat = openCat["l" + i] || s.labCats[0] || "";
    if (!cat) return `
        <div class="sec-toolbar">
          <div class="cat-tabs"><div class="add-cat-btn" onclick="openAddCat(${i},'lab')">+ Add Category</div></div>
        </div>
        <p style="color:#aaa;padding:20px;text-align:center">No labour categories. Add one above.</p>`;
    const lb = s.lab[cat] || { daily: [], contract: null, scName: "", scDesc: "" };
    const isSC = lb.contract !== null;
    const sub = isSC ? lb.contract : (lb.daily || []).reduce((a, r) => a + (r.amt || 0), 0);
    return `
        <div class="print-header"><h2>${esc(s.name)} \u2014 Labour: ${esc(cat)}</h2><p>Meridian Construction Company</p></div>
        <div class="sec-toolbar">
          <div class="cat-tabs">
            ${s.labCats.map(c => { const hsc = s.lab[c] && s.lab[c].contract !== null; return `<div class="ctab${cat === c ? " on" : ""}" onclick="setCat(${i},'l','${esc(c).replace(/'/g, "&#39;")}')">${esc(c)}${hsc ? '<span class="sc-pill" style="font-size:9px">SC</span>' : ''}<button class="rm" onclick="event.stopPropagation();removeCat(${i},'lab','${esc(c).replace(/'/g, "&#39;")}')" title="Remove">&#10005;</button></div>`; }).join("")}
            <div class="add-cat-btn" onclick="openAddCat(${i},'lab')">+ Add</div>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:5px 10px" onclick="printSec(${i},'lab')">&#128424; Print</button>
        </div>
        <div class="mode-toggle">
          <button class="mtbtn${!isSC ? " on" : ""}" onclick="setMode(${i},'${esc(cat).replace(/'/g, "&#39;")}',false)">&#128467; Daily Entry</button>
          <button class="mtbtn${isSC ? " on-sc" : ""}" onclick="setMode(${i},'${esc(cat).replace(/'/g, "&#39;")}',true)">&#128196; Subcontract</button>
        </div>
        ${isSC ? `
          <div class="sc-box">
            <div class="sc-box-title">&#128196; Subcontract \u2014 ${esc(cat)}</div>
            <div class="form-row fg3">
              <div class="fi"><label>Subcontractor Name</label><input type="text" id="scn-${i}" value="${esc(lb.scName || "")}" placeholder="Contractor name"></div>
              <div class="fi"><label>Contract Amount (&#8377;)</label><input type="number" id="sca-${i}" value="${lb.contract || ""}" placeholder="Total value" min="0"></div>
              <div class="fi"><label>Work Description</label><input type="text" id="scd-${i}" value="${esc(lb.scDesc || "")}" placeholder="Scope"></div>
            </div>
            <button class="btn btn-purple" onclick="saveContract(${i},'${esc(cat).replace(/'/g, "&#39;")}')">Save Contract</button>
            <div class="sc-note">&#9432; Contract amount is taken as total labour cost.</div>
          </div>
          <div class="tbl-wrap"><table class="etbl">
            <thead><tr><th>Item</th><th>Subcontractor</th><th class="r">Amount (&#8377;)</th></tr></thead>
            <tbody>${lb.contract ? `<tr class="sc-row"><td>Subcontract \u2014 ${esc(cat)}</td><td>${esc(lb.scName) || "\u2014"}</td><td class="r">${fmt(lb.contract)}</td></tr>` : '<tr class="empty-row"><td colspan="3">Enter contract details above and click Save</td></tr>'}</tbody>
          </table></div>`: `
          <div class="form-row fg5">
            <div class="fi"><label>Date</label><input type="date" id="ld-${i}"></div>
            <div class="fi"><label>Particulars / Worker</label><input type="text" id="lp-${i}" placeholder="Worker / details"></div>
            <div class="fi"><label>Voucher No</label><input type="text" id="lvn-${i}" placeholder="Voucher No"></div>
            <div class="fi"><label>Amount (&#8377;)</label><input type="number" id="la-${i}" placeholder="0" min="0"></div>
            <div class="fi" style="display:flex;align-items:flex-end"><button class="btn btn-blue" style="width:100%" onclick="addLab(${i},'${esc(cat).replace(/'/g, "&#39;")}')">+ Add</button></div>
          </div>
          <div class="tbl-wrap"><table class="etbl">
            <thead><tr><th style="width:4%">#</th><th style="width:14%">Date</th><th>Particulars</th><th style="width:14%">Voucher No</th><th class="r" style="width:18%">Amount (&#8377;)</th><th style="width:4%"></th></tr></thead>
            <tbody>
              ${(lb.daily || []).length === 0 ? `<tr class="empty-row"><td colspan="6">No ${esc(cat)} entries yet</td></tr>` : ""}
              ${(lb.daily || []).map((r, j) => `<tr><td class="muted">${j + 1}</td><td>${fmtDate(r.date)}</td><td>${esc(r.part) || "\u2014"}</td><td class="muted">${esc(r.voucher) || "\u2014"}</td><td class="r">${fmt(r.amt)}</td><td><button class="del-btn" onclick="delEntry(${i},'lab-${esc(cat).replace(/'/g, "&#39;")}',${j})">&#10005;</button></td></tr>`).join("")}
              ${(lb.daily || []).length > 0 ? `<tr class="sub-row"><td colspan="4">Sub Total \u2014 ${esc(cat)}</td><td class="r">${fmt(sub)}</td><td></td></tr>` : ""}
            </tbody>
          </table></div>`}`;
}

function addLab(i, cat) {
    const d = val("ld-" + i), p = val("lp-" + i), vn = val("lvn-" + i), a = num("la-" + i);
    if (!a) { notif("Enter an amount"); return; }
    if (!sites[i].lab[cat]) sites[i].lab[cat] = { daily: [], contract: null, scName: "", scDesc: "" };
    sites[i].lab[cat].daily.push({ date: d, part: p, voucher: vn, amt: a });
    saveData(); openCat["l" + i] = cat; refreshBody(i, "lab"); refreshHdr(i); notif(cat + " entry added");
}

function setMode(i, cat, isSC) {
    if (!sites[i].lab[cat]) sites[i].lab[cat] = { daily: [], contract: null, scName: "", scDesc: "" };
    const lb = sites[i].lab[cat];
    if (isSC) { if (lb.contract === null) lb.contract = 0; }
    else lb.contract = null;
    saveData(); openCat["l" + i] = cat; refreshBody(i, "lab");
}

function saveContract(i, cat) {
    if (!sites[i].lab[cat]) sites[i].lab[cat] = { daily: [], contract: 0, scName: "", scDesc: "" };
    const lb = sites[i].lab[cat];
    lb.scName = val("scn-" + i);
    lb.contract = num("sca-" + i);
    lb.scDesc = val("scd-" + i);
    saveData(); refreshBody(i, "lab"); refreshHdr(i); notif("Contract saved");
}

// ── SUMMARY ──
function sumHTML(i) {
    const s = sites[i];
    const { rec, matExp, labExp, exp, prof, bal } = calc(i);
    const mRows = s.matCats.map(c => {
        const v = (s.mat[c] || []).reduce((a, r) => a + (r.amt || 0), 0);
        return `<tr><td>${esc(c)}</td><td class="r">${fmt(v)}</td><td class="r">${fmt(Math.round(v * (1 + PT)))}</td></tr>`;
    }).join("");
    const lRows = s.labCats.map(c => {
        const lb = s.lab[c] || { daily: [], contract: null };
        const isSC = lb.contract !== null;
        const v = isSC ? lb.contract : (lb.daily || []).reduce((a, r) => a + (r.amt || 0), 0);
        return `<tr><td>${esc(c)}${isSC ? '<span class="sc-pill">SC</span>' : ''}</td><td class="r">${fmt(v)}</td><td class="r">${fmt(Math.round(v * (1 + PT)))}</td></tr>`;
    }).join("");
    return `
        <div class="print-header"><h2>${esc(s.name)} \u2014 Summary</h2><p>Meridian Construction Company</p></div>
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="btn btn-grey" style="font-size:11px;padding:5px 10px" onclick="printSec(${i},'sum')">&#128424; Print</button>
        </div>
        <div class="sum-grid">
          <div class="scard sg"><div class="sl">Total Receipts</div><div class="sv">${fmt(rec)}</div></div>
          <div class="scard sr"><div class="sl">Total Expenditure</div><div class="sv">${fmt(exp)}</div></div>
          <div class="scard sa"><div class="sl">Profit @ 15%</div><div class="sv">${fmt(prof)}</div></div>
          <div class="scard sb"><div class="sl">Net Balance</div><div class="sv">${fmt(bal)}</div></div>
        </div>
        <div class="tbl-wrap" style="margin-bottom:12px"><table class="etbl">
          <thead><tr><th>Material</th><th class="r">Amount (&#8377;)</th><th class="r">With 15% Profit (&#8377;)</th></tr></thead>
          <tbody>${mRows}<tr class="sub-row"><td>Total Materials</td><td class="r">${fmt(matExp)}</td><td class="r">${fmt(Math.round(matExp * (1 + PT)))}</td></tr></tbody>
        </table></div>
        <div class="tbl-wrap"><table class="etbl">
          <thead><tr><th>Labour</th><th class="r">Amount (&#8377;)</th><th class="r">With 15% Profit (&#8377;)</th></tr></thead>
          <tbody>${lRows}<tr class="sub-row"><td>Total Labour</td><td class="r">${fmt(labExp)}</td><td class="r">${fmt(Math.round(labExp * (1 + PT)))}</td></tr></tbody>
        </table></div>`;
}

// ── ADD/REMOVE CATEGORIES ──
function openAddCat(siteIdx, type) {
    addCatCtx = { siteIdx, type };
    const title = document.getElementById("addCatTitle");
    if (title) title.textContent = "Add New " + (type === "mat" ? "Material" : "Labour") + " Category";
    const nameInput = document.getElementById("addCatName");
    if (nameInput) nameInput.value = "";
    const modal = document.getElementById("addCatModal");
    if (modal) modal.classList.add("open");
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 50);
}

function confirmAddCat() {
    if (!addCatCtx) return;
    const nmInput = document.getElementById("addCatName");
    const nm = nmInput ? nmInput.value.trim() : "";
    if (!nm) { notif("Enter a name"); return; }
    const { siteIdx, type } = addCatCtx;
    const s = sites[siteIdx];
    if (type === "mat") {
        if (s.matCats.includes(nm)) { notif("Already exists"); return; }
        s.matCats.push(nm);
        if (!s.mat[nm]) s.mat[nm] = [];
        openCat["m" + siteIdx] = nm;
        saveData(); closeModal("addCatModal"); refreshBody(siteIdx, "mat"); notif(nm + " added");
    } else {
        if (s.labCats.includes(nm)) { notif("Already exists"); return; }
        s.labCats.push(nm);
        if (!s.lab[nm]) s.lab[nm] = { daily: [], contract: null, scName: "", scDesc: "" };
        openCat["l" + siteIdx] = nm;
        saveData(); closeModal("addCatModal"); refreshBody(siteIdx, "lab"); notif(nm + " added");
    }
}

function removeCat(siteIdx, type, cat) {
    const s = sites[siteIdx];
    if (type === "mat") {
        const entries = s.mat[cat] || [];
        if (entries.length > 0 && !confirm(`"${cat}" has ${entries.length} entries. Delete category and all its data?`)) return;
        if (entries.length === 0 && !confirm(`Remove "${cat}" category?`)) return;
        s.matCats = s.matCats.filter(c => c !== cat);
        delete s.mat[cat];
        if (openCat["m" + siteIdx] === cat) openCat["m" + siteIdx] = s.matCats[0] || "";
        saveData(); refreshBody(siteIdx, "mat"); refreshHdr(siteIdx); notif(cat + " removed");
    } else {
        const lb = s.lab[cat];
        const hasData = lb && ((lb.daily || []).length > 0 || lb.contract !== null);
        if (hasData && !confirm(`"${cat}" has data. Delete category?`)) return;
        if (!hasData && !confirm(`Remove "${cat}" category?`)) return;
        s.labCats = s.labCats.filter(c => c !== cat);
        delete s.lab[cat];
        if (openCat["l" + siteIdx] === cat) openCat["l" + siteIdx] = s.labCats[0] || "";
        saveData(); refreshBody(siteIdx, "lab"); refreshHdr(siteIdx); notif(cat + " removed");
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("open");
}

// ── PRINT ──
function printSec(siteIdx, sec) {
    openSite = siteIdx; openSec[siteIdx] = sec;
    renderSites();
    setTimeout(() => {
        const card = document.getElementById("sc-" + siteIdx);
        if (card) card.classList.add("print-target");
        window.print();
        if (card) card.classList.remove("print-target");
    }, 300);
}

// ── HELPERS ──
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function num(id) { const e = document.getElementById(id); return e ? parseFloat(e.value) || 0 : 0; }

function setCat(i, type, cat) {
    openCat[type + i] = cat;
    refreshBody(i, type === "m" ? "mat" : "lab");
}

function refreshBody(i, sec) {
    openSec[i] = sec || openSec[i] || "cash";
    const sb = document.getElementById("sb-" + i);
    if (sb) sb.innerHTML = bodyHTML(i);
}

function refreshHdr(i) {
    const { rec, exp, bal } = calc(i);
    const card = document.getElementById("sc-" + i);
    if (!card) return;
    const hasSC = sites[i].labCats.some(lc => sites[i].lab[lc] && sites[i].lab[lc].contract !== null);
    const bc = bal >= 0 ? "bal-p" : "bal-n";
    const nm = card.querySelector(".sname");
    const mt = card.querySelector(".smeta");
    if (nm) nm.innerHTML = esc(sites[i].name) + (hasSC ? '<span class="sc-pill">Subcontract</span>' : '');
    if (mt) mt.innerHTML = `Receipts: ${fmt(rec)} &nbsp;|&nbsp; Expense: ${fmt(exp)} &nbsp;|&nbsp; <span class="${bc}">Balance: ${fmt(bal)}</span>`;
}

function delEntry(i, type, j) {
    if (!confirm("Delete this entry?")) return;
    if (type === "cash") sites[i].cash.splice(j, 1);
    else if (type.startsWith("mat-")) { const c = type.slice(4); if (sites[i].mat[c]) sites[i].mat[c].splice(j, 1); }
    else if (type.startsWith("lab-")) { const c = type.slice(4); if (sites[i].lab[c]) sites[i].lab[c].daily.splice(j, 1); }
    saveData();
    const sec = type === "cash" ? "cash" : type.startsWith("mat") ? "mat" : "lab";
    refreshBody(i, sec); refreshHdr(i);
}

function toggleAddSite() {
    const b = document.getElementById("addSiteBar");
    if (!b) return;
    b.classList.toggle("open");
    if (b.classList.contains("open")) {
        const inp = document.getElementById("newSiteName");
        if (inp) inp.focus();
    }
}

function addSite() {
    const nmInput = document.getElementById("newSiteName");
    const nm = nmInput ? nmInput.value.trim() : "";
    if (!nm) { notif("Enter a site name"); return; }
    sites.push(mkSite(nm));
    if (nmInput) nmInput.value = "";
    const bar = document.getElementById("addSiteBar");
    if (bar) bar.classList.remove("open");
    saveData(); renderSites(); notif(nm + " added");
}

function renameSite(i) {
    const nm = prompt("Rename site:", sites[i].name);
    if (nm && nm.trim()) { sites[i].name = nm.trim(); saveData(); renderSites(); }
}

function clearAllData() {
    if (!confirm("DELETE ALL DATA permanently?")) return;
    if (!confirm("Last chance \u2014 all entries will be lost!")) return;
    sites = []; for (let i = 1; i <= 20; i++) sites.push(mkSite("Site " + i));
    openSite = null; openSec = {}; openCat = {};
    saveData(); renderSites(); renderDash(); notif("All data cleared");
}

function notif(msg) {
    const el = document.getElementById("notif");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(notif._t);
    notif._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// ── EXCEL EXPORT ──
function exportExcel() {
    if (typeof XLSX === 'undefined') {
        notif("Excel library not loaded yet.");
        return;
    }
    const wb = XLSX.utils.book_new();
    // Dashboard
    const dashData = [["MERIDIAN CONSTRUCTION \u2014 DASHBOARD"], [""], ["Site", "Receipts (\u20B9)", "Expense (\u20B9)", "Profit 15% (\u20B9)", "Balance (\u20B9)"]];
    let tR = 0, tE = 0, tP = 0, tB = 0;
    sites.forEach((s, i) => { const c = calc(i); tR += c.rec; tE += c.exp; tP += c.prof; tB += c.bal; dashData.push([s.name, c.rec, c.exp, c.prof, c.bal]); });
    dashData.push(["GRAND TOTAL", tR, tE, tP, tB]);
    const ws0 = XLSX.utils.aoa_to_sheet(dashData);
    ws0["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws0, "Dashboard");

    // Vendor Summary
    const vData = [["VENDOR & LABOUR SUMMARY \u2014 ALL SITES"], [""], ["Type", "Category", "Site", "Vendor / Worker", "Bill/Voucher", "Amount (\u20B9)"]];
    sites.forEach(s => {
        s.matCats.forEach(cat => {
            (s.mat[cat] || []).forEach(r => vData.push(["Material", cat, s.name, r.det || "", r.bill || "", r.amt || 0]));
        });
        s.labCats.forEach(cat => {
            const lb = s.lab[cat] || {};
            if (lb.contract !== null) vData.push(["Labour [SC]", cat, s.name, lb.scName || "Subcontractor", "", lb.contract || 0]);
            else (lb.daily || []).forEach(r => vData.push(["Labour", cat, s.name, r.part || "", r.voucher || "", r.amt || 0]));
        });
    });
    const wsV = XLSX.utils.aoa_to_sheet(vData);
    wsV["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsV, "Vendor Summary");

    // Per site
    sites.forEach((s, i) => {
        const { rec, exp, prof, bal } = calc(i);
        const rows = [[s.name.toUpperCase() + " \u2014 INCOME & EXPENDITURE"], [""]];
        rows.push(["CASH RECEIPTS", "", "", ""]);
        rows.push(["Date", "Particulars", "Amount (\u20B9)", ""]);
        s.cash.forEach(r => rows.push([r.date || "", r.part || "", r.amt || 0, ""]));
        rows.push(["Total Receipts", "", rec, ""]); rows.push([""]);
        rows.push(["MATERIAL PURCHASES", "", "", ""]);
        s.matCats.forEach(cat => {
            const entries = s.mat[cat] || [];
            const sub = entries.reduce((a, r) => a + (r.amt || 0), 0);
            rows.push([cat, "", "", ""]);
            rows.push(["Date", "Details/Vendor", "Bill No", "Amount (\u20B9)"]);
            entries.forEach(r => rows.push([r.date || "", r.det || "", r.bill || "", r.amt || 0]));
            rows.push(["Sub Total \u2014 " + cat, "", "", sub]); rows.push([""]);
        });
        rows.push(["LABOUR COSTS", "", "", ""]);
        s.labCats.forEach(cat => {
            const lb = s.lab[cat] || {};
            const isSC = lb.contract !== null;
            const sub = isSC ? lb.contract : (lb.daily || []).reduce((a, r) => a + (r.amt || 0), 0);
            rows.push([cat + (isSC ? " [SUBCONTRACT]" : ""), "", "", ""]);
            if (isSC) { rows.push(["Subcontractor", lb.scName || "", "", ""]); rows.push(["Contract Amount", "", "", lb.contract]); }
            else {
                rows.push(["Date", "Particulars", "Voucher No", "Amount (\u20B9)"]);
                (lb.daily || []).forEach(r => rows.push([r.date || "", r.part || "", r.voucher || "", r.amt || 0]));
            }
            rows.push(["Sub Total \u2014 " + cat, "", "", sub]); rows.push([""]);
        });
        rows.push(["SUMMARY", "", "", ""]);
        rows.push(["Total Receipts", "", "", rec]);
        rows.push(["Total Expenditure", "", "", exp]);
        rows.push(["Profit @ 15%", "", "", prof]);
        rows.push(["NET BALANCE", "", "", bal]);
        const wsn = (s.name || "Site" + (i + 1)).replace(/[^A-Za-z0-9 _-]/g, "").substring(0, 28) || "Site" + (i + 1);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, wsn);
    });

    const d = new Date();
    const ds = d.getDate() + "-" + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + "-" + d.getFullYear();
    XLSX.writeFile(wb, "Meridian_IE_" + ds + ".xlsx");
    notif("Excel exported!");
}

// ── DAY BOOK ──
let dbFilters = { from: "", to: "", site: "", type: "" };

function inDbRange(date) {
    const { from, to } = dbFilters;
    if (!from && !to) return true;
    if (!date) return true; // Fix: show entries with no date (like SC) if they exist? Or decide. 
    // Actually, for construction contracts, they might not have a specific day.
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}

function dbFilter() {
    const ids = ["db-from", "db-to", "db-site", "db-type"];
    const keys = ["from", "to", "site", "type"];
    ids.forEach((id, k) => { const el = document.getElementById(id); if (el) dbFilters[keys[k]] = el.value; });
    renderDayBook();
}

function clearDbFilters() {
    dbFilters = { from: "", to: "", site: "", type: "" };
    ["db-from", "db-to", "db-site", "db-type"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    renderDayBook();
}

function renderDayBook() {
    const siteOptions = `<option value="">All Sites</option>` +
        sites.map((s, i) => `<option value="${i}"${dbFilters.site === String(i) ? " selected" : ""}>${esc(s.name)}</option>`).join("");

    const entries = [];
    const siteIdx = dbFilters.site !== "" ? parseInt(dbFilters.site) : -1;

    sites.forEach((s, idx) => {
        if (siteIdx >= 0 && siteIdx !== idx) return;

        s.cash.forEach(r => {
            if (!inDbRange(r.date)) return;
            entries.push({ date: r.date || "", site: s.name, type: "Receipt", typeKey: "receipt", part: r.part || "", ref: "", dr: 0, cr: r.amt || 0 });
        });

        s.matCats.forEach(cat => {
            (s.mat[cat] || []).forEach(r => {
                if (!inDbRange(r.date)) return;
                entries.push({ date: r.date || "", site: s.name, type: "Material \u2014 " + cat, typeKey: "material", part: r.det || "", ref: r.bill || "", dr: r.amt || 0, cr: 0 });
            });
        });

        s.labCats.forEach(cat => {
            const lb = s.lab[cat];
            if (!lb) return;
            if (lb.contract !== null) {
                if (!inDbRange("")) return;
                entries.push({ date: "", site: s.name, type: "Labour \u2014 " + cat + " (SC)", typeKey: "labour", part: lb.scName || "Subcontractor", ref: "", dr: lb.contract || 0, cr: 0 });
            } else {
                (lb.daily || []).forEach(r => {
                    if (!inDbRange(r.date)) return;
                    entries.push({ date: r.date || "", site: s.name, type: "Labour \u2014 " + cat, typeKey: "labour", part: r.part || "", ref: r.voucher || "", dr: r.amt || 0, cr: 0 });
                });
            }
        });
    });

    const tf = dbFilters.type;
    const filtered = entries.filter(e => !tf || e.typeKey === tf);

    filtered.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });

    const groups = {};
    const groupOrder = [];
    filtered.forEach(e => {
        const key = e.date || "\u2014";
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(e);
    });

    let totalDr = 0, totalCr = 0;
    let tableRows = "";

    if (filtered.length === 0) {
        tableRows = '<tr class="empty-row"><td colspan="7">No entries found for the selected filters.</td></tr>';
    } else {
        groupOrder.forEach(dateKey => {
            const grp = groups[dateKey];
            let grpDr = 0, grpCr = 0;

            grp.forEach((e, j) => {
                grpDr += e.dr; grpCr += e.cr;
                const typeClass = e.typeKey === "receipt" ? "db-type-receipt" : e.typeKey === "material" ? "db-type-mat" : "db-type-lab";
                tableRows += `<tr>
                <td>${j === 0 ? (dateKey === "\u2014" ? "<span style='color:#aaa'>\u2014</span>" : `<span class="db-date-cell">${fmtDate(dateKey)}</span>`) : ""}</td>
                <td style="font-size:11px">${esc(e.site)}</td>
                <td class="${typeClass}" style="font-size:11px">${esc(e.type)}</td>
                <td>${esc(e.part) || "\u2014"}</td>
                <td class="muted">${esc(e.ref) || "\u2014"}</td>
                <td class="r">${e.dr > 0 ? fmt(e.dr) : "<span style='color:#ddd'>\u2014</span>"}</td>
                <td class="r" style="color:#1D9E75">${e.cr > 0 ? fmt(e.cr) : "<span style='color:#ddd'>\u2014</span>"}</td>
            </tr>`;
            });

            totalDr += grpDr; totalCr += grpCr;

            tableRows += `<tr class="sub-row">
            <td colspan="5" style="text-align:right">${dateKey === "\u2014" ? "Subtotal (No Date)" : fmtDate(dateKey) + " \u2014 Daily Total"}</td>
            <td class="r">${grpDr > 0 ? fmt(grpDr) : "\u2014"}</td>
            <td class="r">${grpCr > 0 ? fmt(grpCr) : "\u2014"}</td>
        </tr>`;
        });

        const net = totalCr - totalDr;
        tableRows += `<tr class="db-total-row">
        <td colspan="5">PERIOD TOTAL</td>
        <td class="r">${fmt(totalDr)}</td>
        <td class="r">${fmt(totalCr)}</td>
    </tr>`;
        tableRows += `<tr class="db-net-row">
        <td colspan="5" style="text-align:right;color:#1A3C5E">Net Balance (Receipts \u2212 Expenses)</td>
        <td colspan="2" class="r" style="color:${net >= 0 ? "#1D9E75" : "#C00000"}">${fmt(net)}</td>
    </tr>`;
    }

    const daybookContent = document.getElementById("daybookContent");
    if (daybookContent) {
        daybookContent.innerHTML = `
            <div class="db-filter-bar">
              <div class="form-row fg4" style="margin-bottom:0">
                <div class="fi"><label>From Date</label><input type="date" id="db-from" value="${esc(dbFilters.from)}" onchange="dbFilter()"></div>
                <div class="fi"><label>To Date</label><input type="date" id="db-to" value="${esc(dbFilters.to)}" onchange="dbFilter()"></div>
                <div class="fi"><label>Site</label><select id="db-site" onchange="dbFilter()">${siteOptions}</select></div>
                <div class="fi"><label>Type</label><select id="db-type" onchange="dbFilter()">
                  <option value=""${!tf ? " selected" : ""}>All Types</option>
                  <option value="receipt"${tf === "receipt" ? " selected" : ""}>Receipts Only</option>
                  <option value="material"${tf === "material" ? " selected" : ""}>Materials Only</option>
                  <option value="labour"${tf === "labour" ? " selected" : ""}>Labour Only</option>
                </select></div>
              </div>
              <div class="db-stats">
                <span>${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}</span>
                <span style="color:#C00000">&#9660; Expenses: <strong>${fmt(totalDr)}</strong></span>
                <span style="color:#1D9E75">&#9650; Receipts: <strong>${fmt(totalCr)}</strong></span>
                <button class="btn btn-outline" style="font-size:11px;padding:3px 10px" onclick="clearDbFilters()">Clear Filters</button>
              </div>
            </div>
            <div class="tbl-wrap" style="margin-top:0">
              <table class="etbl">
                <thead><tr>
                  <th style="width:11%">Date</th>
                  <th style="width:15%">Site</th>
                  <th style="width:20%">Type</th>
                  <th>Particulars</th>
                  <th style="width:9%">Ref No</th>
                  <th class="r" style="width:11%">Debit (&#8377;)</th>
                  <th class="r" style="width:11%">Credit (&#8377;)</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>`;
    }
}

// ── BOOT ──
async function boot() {
    await loadData();
    renderDash();
    showTab("dash");
}

if (window.firebaseReady) { boot(); }
else { window.addEventListener("firebaseReady", boot); setTimeout(() => { if (!fbConnected) boot(); }, 3000); }

// ── AUTH LOGIC ──
(function () {
    const PASS = "Xa#M1";
    const SESSION_KEY = "mc_unlocked";

    function unlock() {
        const inp = document.getElementById("lockInput");
        const val = inp ? inp.value : "";
        const err = document.getElementById("lockErr");
        if (val === PASS) {
            sessionStorage.setItem(SESSION_KEY, "1");
            const screen = document.getElementById("lockScreen");
            if (screen) screen.classList.add("hidden");
            const appWrap = document.getElementById("appWrap");
            if (appWrap) appWrap.style.display = "";
        } else {
            if (inp) {
                inp.classList.remove("error");
                void inp.offsetWidth; // restart animation
                inp.classList.add("error");
                inp.value = "";
                inp.focus();
            }
            if (err) err.textContent = "Incorrect password. Please try again.";
        }
    }

    function toggleLockEye(btn) {
        const inp = document.getElementById("lockInput");
        if (!inp) return;
        if (inp.type === "password") {
            inp.type = "text";
            btn.innerHTML = "&#128064;";
        } else {
            inp.type = "password";
            btn.innerHTML = "&#128065;";
        }
    }

    window.unlock = unlock;
    window.toggleLockEye = toggleLockEye;

    if (sessionStorage.getItem(SESSION_KEY) === "1") {
        const screen = document.getElementById("lockScreen");
        if (screen) screen.classList.add("hidden");
        const appWrap = document.getElementById("appWrap");
        if (appWrap) appWrap.style.display = "";
    } else {
        setTimeout(() => {
            const inp = document.getElementById("lockInput");
            if (inp) inp.focus();
        }, 100);
    }
})();

// Attach all functions to window for HTML onclick handlers
window.toggleAddSite = toggleAddSite;
window.addSite = addSite;
window.exportExcel = exportExcel;
window.clearAllData = clearAllData;
window.showTab = showTab;
window.goSite = goSite;
window.toggleSite = toggleSite;
window.renameSite = renameSite;
window.setSec = setSec;
window.printSec = printSec;
window.addCash = addCash;
window.delEntry = delEntry;
window.openAddCat = openAddCat;
window.setCat = setCat;
window.removeCat = removeCat;
window.addMat = addMat;
window.setMode = setMode;
window.saveContract = saveContract;
window.addLab = addLab;
window.confirmAddCat = confirmAddCat;
window.closeModal = closeModal;
window.vsFilter = vsFilter;
window.vsTypeChange = vsTypeChange;
window.clearVsFilters = clearVsFilters;
window.dbFilter = dbFilter;
window.clearDbFilters = clearDbFilters;
