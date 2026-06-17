// Base Menu Items Architecture Matrix
let defaultStructuredItems = [
    { name: "Chicken Biryani", category: "Rice", weight: 0 },
    { name: "Beef Biryani", category: "Rice", weight: 0 },
    { name: "Beef Pulao", category: "Rice", weight: 0 },
    { name: "Sada Biryani", category: "Rice", weight: 0 },
    { name: "Chicken Qorma", category: "Curry", weight: 0 },
    { name: "Beef karahi", category: "Curry", weight: 0 },
    { name: "Naan", category: "Bread", weight: 0 },
    { name: "Chapati", category: "Bread", weight: 0 }
];

// LocalStorage Persistent Global States Initialization
let customItems = JSON.parse(localStorage.getItem('categorizedMenu')) || defaultStructuredItems;
let currentActiveCategory = "All";

let currentCart = JSON.parse(localStorage.getItem('currentCart')) || {};
let currentDayLog = JSON.parse(localStorage.getItem('currentDayLog')) || [];
let currentRefundLog = JSON.parse(localStorage.getItem('currentRefundLog')) || [];
let allTimeHistory = JSON.parse(localStorage.getItem('allTimeHistory')) || [];
let knownCustomers = JSON.parse(localStorage.getItem('knownCustomers')) || [];
let auditLogs = JSON.parse(localStorage.getItem('auditLogs')) || [];

let shiftStartTime = localStorage.getItem('shiftStartTime') || null;
let shiftStartDate = localStorage.getItem('shiftStartDate') || null;

// Sequential Token Tracking Engine Initialization
let globalTokenCounter = parseInt(localStorage.getItem('globalTokenCounter')) || 100;
let currentSelectedCustomer = "Walk-In Customer";

// Modal Flow Engine Memory Pointers
let activePinResolveCallback = null;
let activePinRejectCallback = null;

// Core Security Module Keys
const SYSTEM_MASTER_KEY = "1010"; 

// Navigation View Engine Routing Matrix
function switchView(targetId) {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active-view'));
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    
    let el = document.getElementById(`view-section-${targetId}`);
    if(el) el.classList.add('active-view');
    
    let tLink = document.getElementById(`tab-link-${targetId}`);
    if(tLink) tLink.classList.add('active');
}

// Global Custom Dynamic Security Validation Engine
function openPinPrompt() {
    return new Promise((resolve, reject) => {
        document.getElementById('modal-pin-input').value = "";
        document.getElementById('secure-pin-modal').classList.add('open-modal');
        document.getElementById('modal-pin-input').focus();
        activePinResolveCallback = resolve;
        activePinRejectCallback = reject;
    });
}

function closePinModal() {
    document.getElementById('secure-pin-modal').classList.remove('open-modal');
    if(activePinRejectCallback) {
        activePinRejectCallback();
        activePinRejectCallback = null;
        activePinResolveCallback = null;
    }
}

function submitPinModal() {
    let inputVal = document.getElementById('modal-pin-input').value;
    document.getElementById('secure-pin-modal').classList.remove('open-modal');
    
    if(inputVal === SYSTEM_MASTER_KEY) {
        logAuditEvent("PASSWORD_ATTEMPT", "System root security key verification match success.", "SUCCESS");
        if(activePinResolveCallback) {
            activePinResolveCallback();
            activePinResolveCallback = null;
            activePinRejectCallback = null;
        }
    } else {
        logAuditEvent("PASSWORD_ATTEMPT", `Invalid authorization vector block try: [${inputVal}]`, "FAILURE");
        alert("Security runtime validation failed. Pin mismatch.");
        if(activePinRejectCallback) {
            activePinRejectCallback();
            activePinRejectCallback = null;
            activePinResolveCallback = null;
        }
    }
}

// System Audit Logs Engine Subroutine
function logAuditEvent(category, description, status) {
    let now = new Date();
    let logObj = {
        timestamp: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
        category: category,
        desc: description,
        status: status
    };
    auditLogs.unshift(logObj);
    localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
    renderAuditLog();
}

function renderAuditLog() {
    let fType = document.getElementById('audit-filter-type').value;
    let tbody = document.getElementById('audit-log-tbody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    auditLogs.forEach(l => {
        if(fType !== 'ALL' && l.category !== fType) return;
        let badgeCls = l.status === 'SUCCESS' ? 'status-success' : 'status-fail';
        tbody.innerHTML += `
            <tr>
                <td>${l.timestamp}</td>
                <td><strong>${l.category}</strong></td>
                <td>${l.desc}</td>
                <td><span class="badge-row-status ${badgeCls}">${l.status}</span></td>
            </tr>
        `;
    });
}

// POS Grid Menu Operations Layout Generator Engine
function renderCategoryFilters() {
    let container = document.getElementById('category-filter-container');
    if(!container) return;
    
    let cats = new Set();
    customItems.forEach(i => { if(i.category) cats.add(i.category); });
    
    let html = `<button class="category-btn ${currentActiveCategory === 'All'?'active':''}" onclick="setFilterCategory('All')">All Categories</button>`;
    cats.forEach(c => {
        html += `<button class="category-btn ${currentActiveCategory === c?'active':''}" onclick="setFilterCategory('${c}')">${c}</button>`;
    });
    container.innerHTML = html;
}

function setFilterCategory(cat) {
    currentActiveCategory = cat;
    renderCategoryFilters();
    renderMenu();
}

function renderMenu() {
    let grid = document.getElementById('menu-matrix-container');
    if(!grid) return;
    grid.innerHTML = "";
    
    customItems.forEach(item => {
        if(currentActiveCategory !== "All" && item.category !== currentActiveCategory) return;
        
        let card = document.createElement('div');
        card.className = "menu-card";
        card.innerHTML = `<div>${item.name}</div>`;
        card.onclick = () => addItemToCartQueue(item.name);
        grid.appendChild(card);
    });
}

// Interactive Order Line Execution Pipeline Subroutines
function addItemToCartQueue(name) {
    if(!shiftStartTime) {
        let conf = confirm("No active business operational shift found. Trigger initialization loop?");
        if(conf) { openNewActiveShiftCycle(); } else { return; }
    }
    
    if(currentCart[name]) {
        currentCart[name]++;
    } else {
        currentCart[name] = 1;
    }
    syncCartStateToStorage();
}

function modifyCartItemScalar(name, delta) {
    if(!currentCart[name]) return;
    currentCart[name] += delta;
    if(currentCart[name] <= 0) delete currentCart[name];
    syncCartStateToStorage();
}

function clearCart() {
    currentCart = {};
    syncCartStateToStorage();
}

function syncCartStateToStorage() {
    localStorage.setItem('currentCart', JSON.stringify(currentCart));
    renderCartViewNode();
}

function renderCartViewNode() {
    let wrapper = document.getElementById('cart-basket-container');
    let totalQtySpan = document.getElementById('cart-total-qty');
    if(!wrapper) return;
    
    let keys = Object.keys(currentCart);
    if(keys.length === 0) {
        wrapper.innerHTML = `<div class="cart-empty-state">Your cart is empty</div>`;
        if(totalQtySpan) totalQtySpan.innerText = "0 Items";
        return;
    }
    
    wrapper.innerHTML = "";
    let totalQty = 0;
    
    keys.forEach(k => {
        let q = currentCart[k];
        totalQty += q;
        let w = getItemWeight(k);
        let wString = w > 0 ? `${((q * w)/1000).toFixed(2)} KG Total` : 'No Weight Profile';
        
        let row = document.createElement('div');
        row.className = "cart-item-row";
        row.innerHTML = `
            <div class="cart-item-info">
                <span class="cart-item-title">${k}</span>
                <span class="cart-item-meta">${wString}</span>
            </div>
            <div class="cart-qty-controls">
                <button class="qty-btn" onclick="modifyCartItemScalar('${k}', -1)">-</button>
                <span class="qty-val">${q}</span>
                <button class="qty-btn" onclick="modifyCartItemScalar('${k}', 1)">+</button>
            </div>
        `;
        wrapper.appendChild(row);
    });
    
    if(totalQtySpan) totalQtySpan.innerText = `${totalQty} Unit Scalars`;
}

function getItemWeight(name) {
    let target = customItems.find(i => i.name === name);
    return target ? parseFloat(target.weight || 0) : 0;
}

// Worker Profile Modal Logic Subroutine
function triggerCustomerProfileSelector() {
    document.getElementById('cust-modal-name-input').value = "";
    populateCustomerDatalist();
    renderQuickCustomerGrid();
    document.getElementById('customer-name-modal').classList.add('open-modal');
    document.getElementById('cust-modal-name-input').focus();
}

function closeCustomerModal() {
    document.getElementById('customer-name-modal').classList.remove('open-modal');
}

function populateCustomerDatalist() {
    let dl = document.getElementById('modal-known-cust-datalist');
    if(!dl) return;
    dl.innerHTML = "";
    knownCustomers.forEach(c => {
        let opt = document.createElement('option');
        opt.value = c;
        dl.appendChild(opt);
    });
}

function renderQuickCustomerGrid() {
    let grid = document.getElementById('modal-quick-customer-grid');
    if(!grid) return;
    grid.innerHTML = "";
    
    knownCustomers.slice(0, 12).forEach(c => {
        let btn = document.createElement('button');
        btn.className = "quick-cust-btn";
        btn.innerText = c;
        btn.onclick = () => {
            currentSelectedCustomer = c;
            document.getElementById('active-customer-display-node').innerText = c;
            closeCustomerModal();
        };
        grid.appendChild(btn);
    });
}

function submitCustomerModalDirect() {
    let val = document.getElementById('cust-modal-name-input').value.trim();
    if(!val) val = "Walk-In Customer";
    
    if(val !== "Walk-In Customer" && !knownCustomers.includes(val)) {
        knownCustomers.push(val);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        logAuditEvent("CUSTOMER_MODIFIED", `Auto-registered new worker profile entry into local cache dictionary: [${val}]`, "SUCCESS");
    }
    
    currentSelectedCustomer = val;
    document.getElementById('active-customer-display-node').innerText = val;
    closeCustomerModal();
}

// Transaction Pipeline Commit Block
function processCheckoutCommit() {
    if(Object.keys(currentCart).length === 0) return alert("Operation rejected. Current checkout matrix structural array allocation empty.");
    
    if(currentSelectedCustomer === "Walk-In Customer") {
        let c = confirm("No rider or target destination staff assigned. Open profile picker registry?");
        if(c) {
            triggerCustomerProfileSelector();
            return;
        }
    }
    
    let now = new Date();
    let dateStr = now.toLocaleDateString();
    let timeStr = now.toLocaleTimeString();
    
    let tokenNum = globalTokenCounter;
    globalTokenCounter++;
    localStorage.setItem('globalTokenCounter', globalTokenCounter);
    
    let itemsToGroup = {};
    
    Object.keys(currentCart).forEach(k => {
        let qty = currentCart[k];
        let itemDef = customItems.find(i => i.name === k);
        let cat = itemDef ? itemDef.category : "Unassigned";
        
        let rowObj = {
            date: dateStr,
            time: timeStr,
            tokenNum: tokenNum,
            customer: currentSelectedCustomer,
            item: k,
            qty: qty,
            type: 'SALE'
        };
        
        currentDayLog.push(rowObj);
        
        if(!itemsToGroup[cat]) itemsToGroup[cat] = [];
        itemsToGroup[cat].push({ name: k, qty: qty });
    });
    
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    logAuditEvent("SETTINGS_CHANGED", `Committed transactions token cluster node: #${tokenNum}.`, "SUCCESS");
    
    executeThermalTicketSpool(tokenNum, dateStr, timeStr, currentSelectedCustomer, itemsToGroup);
    
    currentCart = {};
    syncCartStateToStorage();
    currentSelectedCustomer = "Walk-In Customer";
    document.getElementById('active-customer-display-node').innerText = "Walk-In Customer";
    
    renderLogs();
}

// Thermal Print Hardware Interface Driver Simulation Subroutine
function executeThermalTicketSpool(tokenNum, dateStr, timeStr, customer, groupedItems) {
    let area = document.getElementById('print-area');
    if(!area) return;
    
    let html = `
        <div class="ticket-wrapper">
            <div class="report-title">Ahmed Hanif Rajput<br>Pakwan Center</div>
            <div style="text-align:center; font-size:11px; font-weight:900; margin-bottom:6px;">Gulistan-e-Jauhar, Karachi</div>
            <hr style="border:none; border-top:1.5px dashed #000; margin:4px 0;">
            <div class="report-row"><span>DATE: ${dateStr}</span></div>
            <div class="report-row"><span>TIME: ${timeStr}</span></div>
            <div class="report-row"><span>STAFF / RIDER:</span></div>
            <div class="report-row" style="font-size:15px;"><span style="background:#000; color:#fff; padding:2px 6px;">${customer}</span></div>
            <hr style="border:none; border-top:1.5px dashed #000; margin:4px 0;">
    `;
    
    Object.keys(groupedItems).forEach(cat => {
        html += `<div class="report-category-header">${cat}</div>`;
        groupedItems[cat].forEach(i => {
            html += `
                <div class="report-row">
                    <span>${i.name}</span>
                    <span class="pos-qty">x${i.qty}</span>
                </div>
            `;
        });
    });
    
    html += `
            <hr style="border:none; border-top:1.5px dashed #000; margin:4px 0;">
            <div class="highlight-box">
                <div style="font-size:12px; font-weight:900;">TOKEN REFERENCE ORDER NUMBER</div>
                <div style="font-size:32px; font-weight:900; margin:2px 0;">${tokenNum}</div>
            </div>
            <div style="text-align:center; font-size:11px; font-weight:900; margin-top:10px;">*** System Operational Node Ticket ***</div>
        </div>
    `;
    
    area.innerHTML = html;
    window.print();
    setTimeout(() => { area.innerHTML = ""; }, 1000);
}

// Shift State Control Subroutine Operations Matrix
function checkAndRunAutoShift() {
    let now = new Date();
    let systemCurrentDateStr = now.toLocaleDateString();
    
    if(shiftStartTime && shiftStartDate && shiftStartDate !== systemCurrentDateStr) {
        autoArchiveOldShift();
    }
    updateGlobalShiftStatusUIDisplay();
}

function openNewActiveShiftCycle() {
    let now = new Date();
    shiftStartTime = now.toLocaleTimeString();
    shiftStartDate = now.toLocaleDateString();
    
    localStorage.setItem('shiftStartTime', shiftStartTime);
    localStorage.setItem('shiftStartDate', shiftStartDate);
    
    logAuditEvent("SHIFT_CONTROL", `Initialized shift log matrix block routine. Date: ${shiftStartDate} at ${shiftStartTime}`, "SUCCESS");
    updateGlobalShiftStatusUIDisplay();
}

function autoArchiveOldShift() {
    logAuditEvent("SHIFT_CONTROL", `Detecting multi-day business cycle rollover. Initializing auto-archive workflow sequence.`, "SUCCESS");
    
    currentDayLog.forEach(r => allTimeHistory.push(r));
    currentRefundLog.forEach(r => allTimeHistory.push(r));
    
    localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
    
    currentDayLog = [];
    currentRefundLog = [];
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
    
    shiftStartTime = null;
    shiftStartDate = null;
    localStorage.removeItem('shiftStartTime');
    localStorage.removeItem('shiftStartDate');
    
    renderLogs();
    renderHistory();
}

function triggerManualShiftClose() {
    let c = confirm("Are you sure you want to close the current shift? This will archive all logs and reset the dashboard counters.");
    if(!c) return;
    
    openPinPrompt().then(() => {
        currentDayLog.forEach(r => allTimeHistory.push(r));
        currentRefundLog.forEach(r => allTimeHistory.push(r));
        
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        
        currentDayLog = [];
        currentRefundLog = [];
        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
        
        logAuditEvent("SHIFT_CONTROL", `User manually terminated current operational shift ledger array framework allocation.`, "SUCCESS");
        
        shiftStartTime = null;
        shiftStartDate = null;
        localStorage.removeItem('shiftStartTime');
        localStorage.removeItem('shiftStartDate');
        
        updateGlobalShiftStatusUIDisplay();
        renderLogs();
        renderHistory();
        alert("Operational shift closed out cleanly. Ledger items committed to persistent long-term storage array matrices.");
    }).catch(() => {});
}

function updateGlobalShiftStatusUIDisplay() {
    let tsNode = document.getElementById('shift-start-timestamp-node');
    let badgeContainer = document.getElementById('shift-state-badge-container');
    if(!tsNode || !badgeContainer) return;
    
    if(shiftStartTime) {
        tsNode.innerText = `${shiftStartDate} @ ${shiftStartTime}`;
        badgeContainer.innerHTML = `<span class="smart-shift-badge badge-active">Live Shift Open</span>`;
    } else {
        tsNode.innerText = "No Active Operational Session Listed";
        badgeContainer.innerHTML = `<span class="smart-shift-badge badge-closed">System Session Terminated</span>`;
    }
}

// Ledger Layout Formatting Engines
function getAllConsumptionData() {
    return [...currentDayLog, ...currentRefundLog].sort((a,b) => {
        return new Date(`1970/01/01 ${a.time}`) - new Date(`1970/01/01 ${b.time}`);
    });
}

function renderLogs() {
    let tbody = document.getElementById('logs-tbody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    let combined = getAllConsumptionData();
    
    let totalSales = 0;
    let totalRefunds = 0;
    let netWeightGrams = 0;
    
    combined.forEach((row, index) => {
        let isRefund = row.type === 'REFUND';
        let weightPerUnit = getItemWeight(row.item);
        let absoluteWeight = row.qty * weightPerUnit;
        
        if(isRefund) {
            totalRefunds += row.qty;
            netWeightGrams -= absoluteWeight;
        } else {
            totalSales += row.qty;
            netWeightGrams += absoluteWeight;
        }
        
        let displayQty = isRefund ? `-${row.qty}` : `${row.qty}`;
        let displayWeight = `${(absoluteWeight / 1000).toFixed(2)} KG`;
        if(isRefund) displayWeight = `-${displayWeight}`;
        
        let tr = document.createElement('tr');
        if(isRefund) tr.style.background = "var(--danger-bg)";
        
        tr.innerHTML = `
            <td>${row.time || 'N/A'}</td>
            <td><strong>#${row.tokenNum || 'N/A'}</strong></td>
            <td>${row.customer}</td>
            <td>${row.item}</td>
            <td><strong>${displayQty}</strong></td>
            <td>${displayWeight}</td>
            <td>
                ${isRefund ? '' : `<button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="voidTransactionLineItem(${index})">Refund</button>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('summary-total-sales-count').innerText = totalSales;
    document.getElementById('summary-total-refund-count').innerText = totalRefunds;
    document.getElementById('summary-net-weight').innerText = `${(netWeightGrams / 1000).toFixed(2)} KG`;
}

function voidTransactionLineItem(index) {
    let combined = getAllConsumptionData();
    let targetRow = combined[index];
    if(!targetRow || targetRow.type === 'REFUND') return;
    
    let c = confirm(`Reverse transaction line: [Token #${targetRow.tokenNum} -> ${targetRow.item}]?`);
    if(!c) return;
    
    openPinPrompt().then(() => {
        let refundObj = {
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            tokenNum: targetRow.tokenNum,
            customer: targetRow.customer,
            item: targetRow.item,
            qty: targetRow.qty,
            type: 'REFUND'
        };
        
        currentRefundLog.push(refundObj);
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
        logAuditEvent("SETTINGS_CHANGED", `Processed transaction modification refund line for item [${targetRow.item}] under token ref #${targetRow.tokenNum}`, "SUCCESS");
        
        renderLogs();
    }).catch(() => {});
}

function renderHistory() {
    let tbody = document.getElementById('history-tbody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    let reversedHistory = [...allTimeHistory].reverse();
    
    reversedHistory.forEach(row => {
        let isRefund = row.type === 'REFUND';
        let weightPerUnit = getItemWeight(row.item);
        let totalWeight = ((row.qty * weightPerUnit) / 1000).toFixed(2);
        
        let tr = document.createElement('tr');
        if(isRefund) tr.style.background = "var(--danger-bg)";
        
        tr.innerHTML = `
            <td>${row.date} ${row.time || ''}</td>
            <td><strong>#${row.tokenNum || 'N/A'}</strong></td>
            <td>${row.customer}</td>
            <td>${row.item}</td>
            <td><strong>${isRefund ? `-${row.qty}` : row.qty}</strong></td>
            <td>${isRefund ? `-${totalWeight}` : totalWeight} KG</td>
            <td><span class="badge-row-status ${isRefund?'status-fail':'status-success'}">${row.type}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Configuration Tab Management Engines
function renderSettingsMenuTable() {
    let tbody = document.getElementById('settings-menu-tbody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    customItems.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.category || 'Unassigned'}</td>
                <td>${item.weight || 0} Grams</td>
                <td>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteCustomItemDescriptor(${index})">Remove</button>
                </td>
            </tr>
        `;
    });
}

function addNewCustomItem() {
    let name = document.getElementById('setup-item-name').value.trim();
    let cat = document.getElementById('setup-item-category').value.trim();
    let weight = document.getElementById('setup-item-weight').value.trim();
    
    if(!name || !cat) return alert("Validation error layout framework nodes failed. Empty parameters detected.");
    
    customItems.push({
        name: name,
        category: cat,
        weight: weight ? parseFloat(weight) : 0
    });
    
    localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
    logAuditEvent("SETTINGS_CHANGED", `Injected manual card matrix structural array entity: [${name}]`, "SUCCESS");
    
    document.getElementById('setup-item-name').value = "";
    document.getElementById('setup-item-category').value = "";
    document.getElementById('setup-item-weight').value = "";
    
    renderCategoryFilters();
    renderMenu();
    renderSettingsMenuTable();
}

function deleteCustomItemDescriptor(index) {
    let item = customItems[index];
    if(!item) return;
    let c = confirm(`Permanently excise item descriptor: [${item.name}] from runtime architecture array matrices?`);
    if(!c) return;
    
    openPinPrompt().then(() => {
        customItems.splice(index, 1);
        localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
        logAuditEvent("SETTINGS_CHANGED", `Excised item descriptor vector target index: [${item.name}]`, "SUCCESS");
        
        renderCategoryFilters();
        renderMenu();
        renderSettingsMenuTable();
    }).catch(() => {});
}

function renderSettingsCustomerTable() {
    let tbody = document.getElementById('settings-customer-tbody');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    knownCustomers.forEach((cust, index) => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${cust}</strong></td>
                <td>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteCustomerProfileDescriptor(${index})">Remove</button>
                </td>
            </tr>
        `;
    });
}

function addNewCustomerProfile() {
    let name = document.getElementById('setup-cust-name').value.trim();
    if(!name) return alert("Blank identifier text inputs cannot register vectors safely.");
    
    if(knownCustomers.includes(name)) return alert("Worker profile data string match duplicates key vector registers.");
    
    knownCustomers.push(name);
    localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
    logAuditEvent("SETTINGS_CHANGED", `Registered new worker entity line mapping: [${name}]`, "SUCCESS");
    
    document.getElementById('setup-cust-name').value = "";
    renderSettingsCustomerTable();
    populateCustomerDatalist();
}

function deleteCustomerProfileDescriptor(index) {
    let targetName = knownCustomers[index];
    let c = confirm(`Excise registered operator trace record file: [${targetName}]?`);
    if(!c) return;
    
    openPinPrompt().then(() => {
        knownCustomers.splice(index, 1);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        logAuditEvent("SETTINGS_CHANGED", `Wiped trace record mapping profile pointer target block: [${targetName}]`, "SUCCESS");
        renderSettingsCustomerTable();
        populateCustomerDatalist();
    }).catch(() => {});
}

// Data Serialization Engineering Utilities Matrix
function backupSystemDataJSON() {
    let backupPackage = {
        categorizedMenu: customItems,
        currentCart: currentCart,
        currentDayLog: currentDayLog,
        currentRefundLog: currentRefundLog,
        allTimeHistory: allTimeHistory,
        knownCustomers: knownCustomers,
        auditLogs: auditLogs,
        shiftStartTime: shiftStartTime,
        shiftStartDate: shiftStartDate,
        globalTokenCounter: globalTokenCounter
    };
    
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPackage));
    let dlAnchorNode = document.createElement('a');
    dlAnchorNode.setAttribute("href", dataStr);
    dlAnchorNode.setAttribute("download", `Ahmed_Hanif_POS_StateBackup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchorNode);
    dlAnchorNode.click();
    dlAnchorNode.remove();
    logAuditEvent("SETTINGS_CHANGED", "Generated complete storage array infrastructure database JSON backup object download.", "SUCCESS");
}

function restoreSystemDataJSON(event) {
    let file = event.target.files[0];
    if(!file) return;
    
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let parsed = JSON.parse(e.target.result);
            
            openPinPrompt().then(() => {
                if(parsed.categorizedMenu) localStorage.setItem('categorizedMenu', JSON.stringify(parsed.categorizedMenu));
                if(parsed.currentCart) localStorage.setItem('currentCart', JSON.stringify(parsed.currentCart));
                if(parsed.currentDayLog) localStorage.setItem('currentDayLog', JSON.stringify(parsed.currentDayLog));
                if(parsed.currentRefundLog) localStorage.setItem('currentRefundLog', JSON.stringify(parsed.currentRefundLog));
                if(parsed.allTimeHistory) localStorage.setItem('allTimeHistory', JSON.stringify(parsed.allTimeHistory));
                if(parsed.knownCustomers) localStorage.setItem('knownCustomers', JSON.stringify(parsed.knownCustomers));
                if(parsed.auditLogs) localStorage.setItem('auditLogs', JSON.stringify(parsed.auditLogs));
                
                if(parsed.shiftStartTime) { localStorage.setItem('shiftStartTime', parsed.shiftStartTime); } else { localStorage.removeItem('shiftStartTime'); }
                if(parsed.shiftStartDate) { localStorage.setItem('shiftStartDate', parsed.shiftStartDate); } else { localStorage.removeItem('shiftStartDate'); }
                if(parsed.globalTokenCounter) localStorage.setItem('globalTokenCounter', parsed.globalTokenCounter);
                
                logAuditEvent("DATA_RESTORED", "Injected complete storage structure file payload recovery overwrite segment map.", "SUCCESS");
                alert("Database state structural arrays imported into physical localStorage contexts safely. Reloading active UI nodes.");
                window.location.reload();
            }).catch(() => {});
            
        } catch(err) {
            alert("Structural parser fail. Selected data entity asset contains damaged mapping definitions.");
        }
    };
    reader.readAsText(file);
}

function clearAllTimeHistoryWithPin() {
    let c = confirm("CRITICAL OPERATIONAL SEQUENCE DETECTED. Wipe long-term archived file matrices permanently?");
    if(!c) return;
    
    openPinPrompt().then(() => {
        allTimeHistory = [];
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        logAuditEvent("HISTORY_CLEARED", "Executed hard reset purge sequence over historical table space logs.", "SUCCESS");
        renderHistory();
        alert("Long-term persistent storage targets truncated cleanly.");
    }).catch(() => {});
}

// Flat Structured Content Comma Separated Value Generators
function exportCurrentShiftToCSV() {
    let data = getAllConsumptionData();
    if(data.length === 0) return alert("Structural target storage layer empty.");
    let csvContent = "data:text/csv;charset=utf-8,Time,Token Reference,Rider / Worker Name,Menu Label,Quantity Scalar,Weight Metric(KG),State Vector\n";
    data.forEach(r => {
        let val = r.type === 'REFUND' ? `-${r.qty}` : r.qty;
        let wVal = ((r.qty * getItemWeight(r.item)) / 1000).toFixed(2);
        let wStr = r.type === 'REFUND' ? `-${wVal}` : wVal;
        csvContent += `"${r.time || 'N/A'}", "${r.tokenNum || 'N/A'}", "${r.customer}","${r.item}",${val},${wStr},"${r.type}"\n`;
    });
    triggerCSVDownload(csvContent, "Shift_Ledger_Report");
}

function exportAllTimeHistoryToCSV() {
    if(allTimeHistory.length === 0) return alert("Archived historical target collection ledger completely empty.");
    let csvContent = "data:text/csv;charset=utf-8,Date & Time Stamp,Token Reference,Rider / Worker Name,Menu Label,Quantity Scalar,Weight Metric(KG),State Vector\n";
    allTimeHistory.forEach(r => {
        let val = r.type === 'REFUND' ? `-${r.qty}` : r.qty;
        let wVal = ((r.qty * getItemWeight(r.item)) / 1000).toFixed(2);
        let wStr = r.type === 'REFUND' ? `-${wVal}` : wVal;
        csvContent += `"${r.date} ${r.time || ''}", "${r.tokenNum || 'N/A'}", "${r.customer}","${r.item}",${val},${wStr},"${r.type}"\n`;
    });
    triggerCSVDownload(csvContent, "AllTime_Historical_Archive_Report");
}

function triggerCSVDownload(csvContent, filenamePrefix) {
    let encodedUri = encodeURI(csvContent);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filenamePrefix}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initial Boot Cycle Executions
window.onload = function() {
    checkAndRunAutoShift(); 
    renderCategoryFilters();
    renderMenu();
    renderLogs();
    renderHistory();
    renderSettingsMenuTable();
    renderSettingsCustomerTable();
    populateCustomerDatalist();
    renderCartViewNode();
    
    // Automatically verify shift matrix execution window safety every 60 seconds
    setInterval(checkAndRunAutoShift, 60000); 
};

// Keyboard Action Triggers
document.getElementById('modal-pin-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitPinModal(); });
