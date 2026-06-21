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
let activeShiftDate = localStorage.getItem('activeShiftDate') || null; 

let globalTokenCounter = parseInt(localStorage.getItem('globalTokenCounter')) || 100;

let activeCallback = null;
let requiredPinType = 'refund'; 
let activeCustomerSearchQuery = "";

// ----------------------------------------------------
// Service Worker Registration for Offline Mode
// ----------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('ServiceWorker registered:', reg.scope);
        }).catch(err => {
            console.log('ServiceWorker failure:', err);
        });
    });
}

window.addEventListener('offline', () => document.getElementById('offline-banner').style.display = 'block');
window.addEventListener('online', () => document.getElementById('offline-banner').style.display = 'none');
if (!navigator.onLine) document.getElementById('offline-banner').style.display = 'block';

// ----------------------------------------------------
// NEW: AUTO-FIX ENGINE FOR MIXED MULTI-DAY RECORDS
// ----------------------------------------------------

// Extracts the correct shift date from an entry's exact timestamp string
function getShiftDateFromLogTime(timeStr) {
    if (!timeStr) return activeShiftDate || getCalculatedShiftDate();
    
    let parts = timeStr.split(" - ");
    let datePart = parts[0].trim();
    let timePart = parts[1] ? parts[1].trim() : "";
    
    // Parse the hour and AM/PM marker
    let match = timePart.match(/^(\d+):(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
        let hours = parseInt(match[1]);
        let ampm = match[4].toUpperCase();
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
        
        // Custom rule: Transactions before 10:00 AM belong to yesterday's shift
        if (hours < 10) {
            let parsedDate = new Date(datePart);
            if (!isNaN(parsedDate.getTime())) {
                parsedDate.setDate(parsedDate.getDate() - 1);
                return getFormattedSystemDate(parsedDate);
            }
        }
    }
    return datePart;
}

// Automatically separates combined logs into clean daily historical records
function autoFixMixedShifts() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) return;

    let groups = {};
    let currentCalculatedShift = getCalculatedShiftDate();
    let historyUpdated = false;

    // Group active sales records by their real shift date
    currentDayLog.forEach(log => {
        let realShiftDate = getShiftDateFromLogTime(log.time);
        if (!groups[realShiftDate]) groups[realShiftDate] = { sales: [], refunds: [] };
        groups[realShiftDate].sales.push(log);
    });

    // Group active refunds records by their real shift date
    currentRefundLog.forEach(log => {
        let realShiftDate = getShiftDateFromLogTime(log.time);
        if (!groups[realShiftDate]) groups[realShiftDate] = { sales: [], refunds: [] };
        groups[realShiftDate].refunds.push(log);
    });

    // Sort shift dates chronologically
    let sortedShiftDates = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

    sortedShiftDates.forEach(sDate => {
        // If the record belongs to a past day, isolate it and commit to shift history
        if (sDate !== currentCalculatedShift) {
            let group = groups[sDate];
            let netItems = 0;
            let grossItemsCount = 0;
            let summary = {};
            let detailedTimeline = [];

            group.sales.forEach(log => {
                netItems += log.qty;
                grossItemsCount += log.qty;
                summary[log.item] = (summary[log.item] || 0) + log.qty;
                detailedTimeline.push({
                    time: log.time, type: 'SALE', item: log.item, qty: log.qty, customer: log.customer, tokenNum: log.tokenNum
                });
            });

            group.refunds.forEach(log => {
                grossItemsCount += log.qty;
                detailedTimeline.push({
                    time: log.time, type: 'REFUND', item: log.item, qty: log.qty, customer: log.customer, tokenNum: log.tokenNum
                });
            });

            // Look for an existing daily card in the history database to avoid duplicates
            let existingDayIdx = allTimeHistory.findIndex(d => normalizeToSystemDate(d.date) === normalizeToSystemDate(sDate));

            if (existingDayIdx > -1) {
                // Merge entries smoothly into the existing historical day card
                let existingDay = allTimeHistory[existingDayIdx];
                existingDay.netItems += netItems;
                existingDay.grossItems += grossItemsCount;
                for (let itm in summary) {
                    existingDay.summary[itm] = (existingDay.summary[itm] || 0) + summary[itm];
                }
                existingDay.detailedTimeline = (existingDay.detailedTimeline || []).concat(detailedTimeline);
            } else {
                // Create a completely separate clean history report card
                allTimeHistory.push({
                    date: sDate,
                    startTime: "10:00 AM",
                    endTime: "03:00 AM",
                    netItems: netItems,
                    grossItems: grossItemsCount,
                    summary: summary,
                    detailedTimeline: detailedTimeline
                });
            }
            historyUpdated = true;
            logAuditEvent("SHIFT_CONTROL", `Auto-fixed & decoupled mixed records for past shift date: ${sDate}`);
        }
    });

    // If modifications were made, clean up active live screens and save everything safely
    if (historyUpdated) {
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));

        // Keep ONLY the true current day's data inside active queues
        let liveGroup = groups[currentCalculatedShift] || { sales: [], refunds: [] };
        currentDayLog = liveGroup.sales;
        currentRefundLog = liveGroup.refunds;

        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));

        activeShiftDate = currentCalculatedShift;
        localStorage.setItem('activeShiftDate', activeShiftDate);

        // Reset system structures safely if today is a completely clean start
        if (currentDayLog.length === 0) {
            globalTokenCounter = 100;
            localStorage.setItem('globalTokenCounter', 100);
            localStorage.removeItem('shiftStartTime');
            localStorage.removeItem('shiftStartDate');
        }

        // Refresh view screens instantly
        renderLogs();
        renderCart();
        updateLiveBreakdown();
        if (document.getElementById('rule-shift-selector')) {
            populateShiftSelectorOptions();
        }
    }
}

// ----------------------------------------------------
// Automated Shift Engine Core
// ----------------------------------------------------
function getCalculatedShiftDate() {
    let now = new Date();
    let hours = now.getHours();
    let shiftStart = new Date(now);
    
    if (hours < 10) {
        shiftStart.setDate(shiftStart.getDate() - 1);
    }
    return getFormattedSystemDate(shiftStart);
}

function processAutomatedShiftRollover() {
    // Run the clean engine first to unpack and repair any mixed multi-day data
    autoFixMixedShifts();

    let currentCalculatedShift = getCalculatedShiftDate();
    
    if (!activeShiftDate) {
        activeShiftDate = currentCalculatedShift;
        localStorage.setItem('activeShiftDate', activeShiftDate);
        return;
    }

    if (currentCalculatedShift !== activeShiftDate) {
        let hasDataToSave = saveCurrentShiftToHistory();
        
        if (hasDataToSave) {
            exportSystemBackupJSON(`AHRP_Backup_AutoShiftEnd_${activeShiftDate.replace(/ /g, "_")}.json`);
        }
        
        currentDayLog = [];
        currentRefundLog = [];
        globalTokenCounter = 100;
        shiftStartTime = null;
        shiftStartDate = null;
        
        localStorage.removeItem('currentDayLog');
        localStorage.removeItem('currentRefundLog');
        localStorage.removeItem('shiftStartTime');
        localStorage.removeItem('shiftStartDate');
        localStorage.setItem('globalTokenCounter', 100);
        
        activeShiftDate = currentCalculatedShift;
        localStorage.setItem('activeShiftDate', activeShiftDate);
        
        logAuditEvent("SHIFT_CONTROL", `Automated Rollover executed. New shift: ${activeShiftDate}`);
        renderLogs();
        renderCart();
    }
}

// Check every 60 seconds to process shifts
setInterval(processAutomatedShiftRollover, 60000);

// Execute fix immediately when app is initialized or refreshed
setTimeout(autoFixMixedShifts, 1000);

function getExactTimestamp() {
    let now = new Date();
    let timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    let dateStr = getFormattedSystemDate(now);
    return `${dateStr} - ${timeStr}`;
}

function normalizeToSystemDate(rawDateString) {
    if (!rawDateString) return getFormattedSystemDate();
    let workingString = rawDateString.split('(')[0].trim();
    let parsedDate = new Date(workingString);
    if (isNaN(parsedDate.getTime())) {
        let match = workingString.match(/^(\d+)[./-](\d+)[./-](\d+)/);
        if (match) {
            let parts = workingString.split(/[./-]/);
            if(parts[0].length === 4) {
                parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
                parsedDate = new Date(parts[2], parts[0] - 1, parts[1]);
            }
        }
    }
    return isNaN(parsedDate.getTime()) ? rawDateString : getFormattedSystemDate(parsedDate);
}

function getFormattedSystemDate(dateObj = new Date()) {
    const day = dateObj.getDate();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${day} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// Levenshtein String Proximity Matcher
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function findClosestCustomerName(inputName) {
    let cleanInput = inputName.trim().toLowerCase();
    let bestMatch = null;
    let lowestDistance = Infinity;
    for (let known of knownCustomers) {
        let cleanKnown = known.toLowerCase();
        let distance = getLevenshteinDistance(cleanInput, cleanKnown);
        let threshold = cleanInput.length <= 4 ? 1 : 2; 
        if (distance <= threshold && distance < lowestDistance) {
            lowestDistance = distance;
            bestMatch = known;
        }
    }
    return bestMatch;
}

function populateCustomerDatalist() {
    const dataList = document.getElementById('customer-memory-list');
    if (!dataList) return;
    dataList.innerHTML = '';
    knownCustomers.sort().forEach(name => {
        let option = document.createElement('option');
        option.value = name;
        dataList.appendChild(option);
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
    
    if (tabId === 'history-tab' || tabId === 'logs-tab') {
        renderLogs();
    }
}

function openPinModal(title, type, successCallback) {
    document.getElementById('modal-title-text').innerText = title;
    document.getElementById('modal-pin-input').value = '';
    requiredPinType = type;
    activeCallback = successCallback;
    document.getElementById('secure-pin-modal').style.display = 'flex';
    document.getElementById('modal-pin-input').focus();
}

function closePinModal() {
    document.getElementById('secure-pin-modal').style.display = 'none';
    activeCallback = null;
}

function submitPinModal() {
    let entered = document.getElementById('modal-pin-input').value.trim();
    if (entered === "2580") { 
        let cb = activeCallback;
        closePinModal();
        logAuditEvent("PASSWORD_ATTEMPT", `Access key authenticated successfully for type: ${requiredPinType}`, "SUCCESS");
        if (cb) cb();
    } else {
        alert("Invalid authorization key sequence.");
        logAuditEvent("PASSWORD_ATTEMPT", `Unauthorized security key attempt dropped on action: ${requiredPinType}`, "FAILED");
        document.getElementById('modal-pin-input').value = '';
    }
}

function logAuditEvent(type, message, status = "SUCCESS") {
    let logEntry = {
        timestamp: getExactTimestamp(),
        type: type,
        message: message,
        status: status
    };
    auditLogs.push(logEntry);
    localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
    renderAuditLog();
}

function renderAuditLog() {
    const tbody = document.getElementById('audit-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let filter = document.getElementById('audit-filter-type').value;
    
    let displayed = [...auditLogs].reverse();
    if (filter !== "ALL") {
        displayed = displayed.filter(l => l.type === filter);
    }
    
    if (displayed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No operational audit signals found.</td></tr>`;
        return;
    }
    
    displayed.forEach(l => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${l.timestamp}</td>
            <td><span class="badge badge-info">${l.type}</span></td>
            <td>${l.message}</td>
            <td><span class="status-indicator ${l.status === 'SUCCESS' ? 'status-online' : 'status-offline'}"></span> ${l.status}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCustomerManagement() {
    const listDiv = document.getElementById('customer-profiles-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    
    let filteredCustomers = knownCustomers.filter(name => name.toLowerCase().includes(activeCustomerSearchQuery.toLowerCase()));
    
    if (filteredCustomers.length === 0) {
        listDiv.innerHTML = '<p style="color:var(--text-muted); padding: 12px 0;">No matching identity profiles found.</p>';
        return;
    }
    
    let table = `<table class="styled-table">
        <thead>
            <tr>
                <th>Worker Registry Label</th>
                <th style="text-align:right; width: 180px;">Actions Control</th>
            </tr>
        </thead>
        <tbody>`;
        
    filteredCustomers.forEach(name => {
        let indexInGlobal = knownCustomers.indexOf(name);
        table += `<tr>
            <td style="font-weight:600;">${name}</td>
            <td style="text-align:right;">
                <button class="btn btn-primary" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="openMergeIdentityModal(${indexInGlobal})">Merge</button>
                <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCustomer(${indexInGlobal})">Delete</button>
            </td>
        </tr>`;
    });
    
    table += `</tbody></table>`;
    listDiv.innerHTML = table;
}

function handleCustomerSearch(val) {
    activeCustomerSearchQuery = val;
    renderCustomerManagement();
}

function openAddNewCustomerModal() {
    document.getElementById('cust-modal-title').innerText = "Register New Rider / Customer Profile";
    document.getElementById('cust-modal-name-input').value = '';
    document.getElementById('customer-action-modal').style.display = 'flex';
    document.getElementById('cust-modal-name-input').focus();
}

function closeCustomerModal() {
    document.getElementById('customer-action-modal').style.display = 'none';
}

function submitCustomerModal() {
    let name = document.getElementById('cust-modal-name-input').value.trim();
    if (!name) return alert("Profile name string target cannot be empty.");
    
    if (knownCustomers.some(c => c.toLowerCase() === name.toLowerCase())) {
        return alert("Identity name profile node matches an existing registry target.");
    }
    
    knownCustomers.push(name);
    localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
    logAuditEvent("CUSTOMER_MODIFIED", `Created profile target identity trace node: ${name}`);
    closeCustomerModal();
    populateCustomerDatalist();
    populateMergeDropdowns();
    renderCustomerManagement();
    renderLogs();
}

function deleteCustomer(index) {
    let targetName = knownCustomers[index];
    if (confirm(`Wipe "${targetName}" identity mapping block trace completely?`)) {
        knownCustomers.splice(index, 1);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        logAuditEvent("CUSTOMER_MODIFIED", `Deleted identity record block: ${targetName}`);
        populateCustomerDatalist();
        populateMergeDropdowns();
        renderCustomerManagement();
        renderLogs();
    }
}

let trackingMergeSourceIdx = null;
function openMergeIdentityModal(index) {
    trackingMergeSourceIdx = index;
    document.getElementById('merge-source-label').innerText = knownCustomers[index];
    document.getElementById('customer-merge-modal').style.display = 'flex';
}

function closeMergeModal() {
    document.getElementById('customer-merge-modal').style.display = 'none';
    trackingMergeSourceIdx = null;
}

function populateMergeDropdowns() {
    const select = document.getElementById('merge-target-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose Target Record --</option>';
    knownCustomers.sort().forEach(name => {
        let opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
    });
}

function executeIdentityMerge() {
    let targetName = document.getElementById('merge-target-select').value;
    if (!targetName) return alert("Please specify a target mapping record destination node.");
    let sourceName = knownCustomers[trackingMergeSourceIdx];
    
    if (sourceName === targetName) return alert("Source and target record blocks map to the same identical node reference.");
    
    if (confirm(`Merge all history logs matching "${sourceName}" into "${targetName}"? This action cannot be reversed.`)) {
        // Rewrite active queues
        currentDayLog.forEach(l => { if(l.customer === sourceName) l.customer = targetName; });
        currentRefundLog.forEach(l => { if(l.customer === sourceName) l.customer = targetName; });
        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
        
        // Rewrite historical databases
        allTimeHistory.forEach(day => {
            if(day.detailedTimeline) {
                day.detailedTimeline.forEach(t => { if(t.customer === sourceName) t.customer = targetName; });
            }
        });
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        
        // Remove old profile entry trace
        knownCustomers.splice(trackingMergeSourceIdx, 1);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        
        logAuditEvent("CUSTOMER_MODIFIED", `Merged profile nodes: ${sourceName} into ${targetName}`);
        closeMergeModal();
        populateCustomerDatalist();
        populateMergeDropdowns();
        renderCustomerManagement();
        renderLogs();
    }
}

function renderMenuGrid() {
    const grid = document.getElementById('menu-items-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    customItems.forEach(item => {
        if (currentActiveCategory !== "All" && item.category !== currentActiveCategory) return;
        
        let card = document.createElement('div');
        card.className = 'item-card';
        card.onclick = () => addToCart(item.name);
        card.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-cat">${item.category} ${item.weight > 0 ? `(${item.weight}g)` : ''}</div>
        `;
        grid.appendChild(card);
    });
}

function filterCategory(cat, btn) {
    currentActiveCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMenuGrid();
}

function addToCart(item) {
    if (!shiftStartTime) {
        let now = new Date();
        shiftStartTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        shiftStartDate = getFormattedSystemDate(now);
        localStorage.setItem('shiftStartTime', shiftStartTime);
        localStorage.setItem('shiftStartDate', shiftStartDate);
    }
    
    currentCart[item] = (currentCart[item] || 0) + 1;
    renderCart();
}

function changeQty(item, amount) {
    currentCart[item] += amount;
    if (currentCart[item] <= 0) delete currentCart[item];
    renderCart();
}

function updateLiveBreakdown() {
    const container = document.getElementById('live-total-container');
    if (!container) return;
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center;">No live transactions recorded in the current active shift log.</div>';
        return;
    }
    
    let counts = {};
    currentDayLog.forEach(l => counts[l.item] = (counts[l.item] || 0) + l.qty);
    currentRefundLog.forEach(l => counts[l.item] = (counts[l.item] || 0) - l.qty);
    
    let html = '<div class="live-breakdown-grid">';
    for (let itm in counts) {
        if (counts[itm] === 0) continue;
        html += `<div class="live-breakdown-row">
            <span class="live-breakdown-name">${itm}</span>
            <span class="badge ${counts[itm] > 0 ? 'badge-success' : 'badge-danger'}">${counts[itm]} Units</span>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderCart() {
    const body = document.getElementById('cart-tbody');
    if (!body) return;
    body.innerHTML = '';
    
    let keys = Object.keys(currentCart);
    if (keys.length === 0) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:40px 10px;">Cart workspace empty. Select menu layout nodes to begin queue.</td></tr>`;
        document.getElementById('checkout-action-btn').disabled = true;
        localStorage.removeItem('currentCart');
        return;
    }
    
    document.getElementById('checkout-action-btn').disabled = false;
    localStorage.setItem('currentCart', JSON.stringify(currentCart));
    
    keys.forEach(itm => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--text-main);">${itm}</td>
            <td>
                <div class="qty-control">
                    <button class="qty-btn" onclick="changeQty('${itm}', -1)">-</button>
                    <span class="qty-val">${currentCart[itm]}</span>
                    <button class="qty-btn" onclick="changeQty('${itm}', 1)">+</button>
                </div>
            </td>
            <td style="text-align:right;">
                <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="changeQty('${itm}', -${currentCart[itm]})">Remove</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

function processCheckoutOrder() {
    let rawCustName = document.getElementById('customer-name-field').value.trim();
    if (!rawCustName) return alert("Worker node assignment reference identity mandatory.");
    
    let verifiedCustomer = rawCustName;
    let match = findClosestCustomerName(rawCustName);
    
    if (match && match.toLowerCase() !== rawCustName.toLowerCase()) {
        if (confirm(`Spelling approximation detected. Map "${rawCustName}" to registered profile: "${match}"?`)) {
            verifiedCustomer = match;
            document.getElementById('customer-name-field').value = match;
        } else {
            if (!knownCustomers.some(c => c.toLowerCase() === rawCustName.toLowerCase())) {
                knownCustomers.push(rawCustName);
                localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
                populateCustomerDatalist();
                populateMergeDropdowns();
                renderCustomerManagement();
            }
        }
    } else if (!match) {
        if (!knownCustomers.some(c => c.toLowerCase() === rawCustName.toLowerCase())) {
            knownCustomers.push(rawCustName);
            localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
            populateCustomerDatalist();
            populateMergeDropdowns();
            renderCustomerManagement();
        }
    }
    
    let timestamp = getExactTimestamp();
    
    for (let item in currentCart) {
        let orderLog = {
            tokenNum: globalTokenCounter,
            time: timestamp,
            item: item,
            qty: currentCart[item],
            customer: verifiedCustomer
        };
        currentDayLog.push(orderLog);
    }
    
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    
    // Automatically trigger receipt print
    printTokenReceiptReceipt(globalTokenCounter, verifiedCustomer, currentCart);
    
    globalTokenCounter++;
    localStorage.setItem('globalTokenCounter', globalTokenCounter);
    
    currentCart = {};
    localStorage.removeItem('currentCart');
    document.getElementById('customer-name-field').value = '';
    
    renderCart();
    renderLogs();
    updateLiveBreakdown();
}

function printTokenReceiptReceipt(token, customer, itemsMap) {
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    
    let now = new Date();
    let timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getFormattedSystemDate(now);
    
    for (let item in itemsMap) {
        let qty = itemsMap[item];
        let reportDiv = document.createElement('div');
        reportDiv.className = 'thermal-slip-node';
        reportDiv.innerHTML = `
            <div class="report-title" style="font-size:15px; margin-bottom:2px;">AHMED HANIF RAJPUT</div>
            <div class="meta-line">OPERATIONAL ROUTING LOG TERMINAL</div>
            <div class="pos-divider"></div>
            <div class="meta-line" style="text-align:left;">DATE: ${dateStr}</div>
            <div class="meta-line" style="text-align:left;">TIME: ${timeStr}</div>
            <div class="meta-line" style="text-align:left; text-transform:uppercase;">RIDER: ${customer}</div>
            <div class="pos-divider"></div>
            <div class="pos-token-block" style="font-size:24px; font-weight:900; text-align:center; border:2px solid #000000; padding: 2px 0; margin: 2px 0;">TOKEN NO: ${token}</div>
            <div class="pos-divider"></div>
            <div class="item-container" style="margin: 6px 0;">
                <div class="pos-item" style="font-size:16px; font-weight:900; text-transform:uppercase; margin-bottom:2px;">${item}</div>
                <div class="pos-qty" style="font-size:18px; font-weight:900; border:2px solid #000000; padding:2px 14px; display:inline-block;">QUANTITY: [ ${qty} ]</div>
            </div>
            <div class="pos-divider"></div>
            <div class="meta-line" style="font-size:10px; margin-top:4px;">SYSTEM OPERATING CLOUD PERSISTENT LAYER</div>
        `;
        printArea.appendChild(reportDiv);
    }
    
    setTimeout(() => {
        window.print();
        printArea.innerHTML = '';
    }, 250);
}

function executeActiveRowVoidTrigger(index) {
    if (!confirm("Are you sure you want to void this item? Authentication required.")) return;
    
    openPinModal("Verification authorization protocols requested.", "refund", function() {
        let exactTime = getExactTimestamp();
        let targetItem = currentDayLog[index];
        
        let refundObject = {
            tokenNum: targetItem.tokenNum,
            time: exactTime,
            item: targetItem.item,
            qty: targetItem.qty,
            customer: targetItem.customer || "Walk-In"
        };
        
        currentRefundLog.push(refundObject);
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
        
        logAuditEvent("SHIFT_CONTROL", `Void action executed on token: ${targetItem.tokenNum} - ${targetItem.item} x${targetItem.qty}`);
        
        currentDayLog.splice(index, 1);
        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        
        renderLogs();
        updateLiveBreakdown();
    });
}

function renderLogs() {
    const activeBody = document.getElementById('active-logs-tbody');
    const refundBody = document.getElementById('refund-logs-tbody');
    
    if (activeBody) {
        activeBody.innerHTML = '';
        if (currentDayLog.length === 0) {
            activeBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No transaction records available in current live buffer map.</td></tr>`;
        } else {
            for (let i = currentDayLog.length - 1; i >= 0; i--) {
                let log = currentDayLog[i];
                let tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>#${log.tokenNum}</b></td>
                    <td>${log.time.split(" - ")[1] || log.time}</td>
                    <td style="font-weight:600; color:var(--primary);">${log.item}</td>
                    <td><span class="badge badge-success">${log.qty} Units</span></td>
                    <td style="font-weight:600;">${log.customer || 'Walk-In'}</td>
                    <td style="text-align:right;"><button class="btn btn-danger" style="padding:2px 6px; font-size:11px;" onclick="executeActiveRowVoidTrigger(${i})">Void</button></td>
                `;
                activeBody.appendChild(tr);
            }
        }
    }
    
    if (refundBody) {
        refundBody.innerHTML = '';
        if (currentRefundLog.length === 0) {
            refundBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No historical void signals logs generated.</td></tr>`;
        } else {
            for (let j = currentRefundLog.length - 1; j >= 0; j--) {
                let rLog = currentRefundLog[j];
                let tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>#${rLog.tokenNum}</b></td>
                    <td>${rLog.time.split(" - ")[1] || rLog.time}</td>
                    <td style="font-weight:600; color:var(--danger); text-decoration:line-through;">${rLog.item}</td>
                    <td><span class="badge badge-danger">-${rLog.qty} Units</span></td>
                    <td style="font-weight:600;">${rLog.customer || 'Walk-In'}</td>
                `;
                refundBody.appendChild(tr);
            }
        }
    }
    
    renderHistoryCards();
}

function renderHistoryCards() {
    const container = document.getElementById('historical-shifts-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (allTimeHistory.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:40px 10px;">Shift reports matrix history archive is empty.</div>';
        return;
    }
    
    let displayed = [...allTimeHistory].reverse();
    
    displayed.forEach((day, index) => {
        let globalIndex = allTimeHistory.length - 1 - index;
        let normalizedDateLabel = normalizeToSystemDate(day.date);
        let rangeSuffix = (day.startTime && day.endTime) ? ` (${day.startTime} to ${day.endTime})` : '';
        
        let card = document.createElement('div');
        card.className = 'history-card';
        
        let summaryHtml = '';
        for (let item in day.summary) {
            if (day.summary[item] > 0) {
                summaryHtml += `
                    <div class="summary-row-item">
                        <span class="summary-item-name">${item}</span>
                        <span class="summary-item-qty">${day.summary[item]} Pcs</span>
                    </div>`;
            }
        }
        
        card.innerHTML = `
            <div class="history-card-header">
                <div class="history-card-title">${normalizedDateLabel}</div>
                <div class="history-card-subtitle">${rangeSuffix}</div>
            </div>
            <div class="history-card-body">
                <div class="metric-row-grid">
                    <div class="metric-box-node">
                        <div class="metric-box-label">Net Outflow</div>
                        <div class="metric-box-val text-primary">${day.netItems || 0}</div>
                    </div>
                    <div class="metric-box-node">
                        <div class="metric-box-label">Gross Interactions</div>
                        <div class="metric-box-val text-accent">${day.grossItems || 0}</div>
                    </div>
                </div>
                <div style="font-weight:700; font-size:12px; margin-bottom:6px; color:var(--text-main); text-transform:uppercase; letter-spacing:0.5px;">Product Aggregates Summary</div>
                <div class="summary-items-box-list">${summaryHtml || '<div style="color:var(--text-muted); font-size:12px;">No structured log arrays generated.</div>'}</div>
                <div class="history-action-btn-group" style="margin-top:12px; display:flex; gap:6px;">
                    <button class="btn btn-primary" style="flex:1; padding:6px; font-size:12px;" onclick="printHistoricalShiftLogs(${globalIndex})">Print Summary</button>
                    <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="wipeHistoricalCard(${globalIndex})">Delete</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function printHistoricalShiftLogs(index) {
    const day = allTimeHistory[index];
    if (!day) return;
    
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    
    let reportDiv = document.createElement('div');
    reportDiv.className = 'thermal-slip-node';
    
    let itemsHtml = '';
    for (let itm in day.summary) {
        if (day.summary[itm] > 0) {
            itemsHtml += `
                <div class="report-row">
                    <span>${itm}</span>
                    <span>${day.summary[itm]} Pcs</span>
                </div>`;
        }
    }
    
    let timelineHtml = '';
    if (day.detailedTimeline && day.detailedTimeline.length > 0) {
        day.detailedTimeline.forEach(t => {
            let custName = t.customer || 'Walk-In';
            let formattedCust = custName.length > 10 ? custName.slice(0,9)+'.' : custName;
            let timePart = t.time.split(" - ")[1] || t.time;
            timePart = timePart.replace(/:\d+\s/, ' '); 
            
            if (t.type === 'SALE') {
                timelineHtml += `
                    <div class="report-row" style="font-weight:500; font-size:11px;">
                        <span>#${t.tokenNum} ${timePart} (${formattedCust})</span>
                        <span>${t.item} x${t.qty}</span>
                    </div>`;
            } else {
                timelineHtml += `
                    <div class="report-row" style="font-weight:500; font-size:11px; color:#000000; text-decoration:line-through;">
                        <span>#${t.tokenNum} ${timePart} (${formattedCust})</span>
                        <span>VOID x${t.qty}</span>
                    </div>`;
            }
        });
    }
    
    reportDiv.innerHTML = `
        <div class="report-title">AHMED HANIF RAJPUT</div>
        <div class="meta-line">DAILY SHIFT SUMMARY PERFORMANCE REPORT</div>
        <div class="pos-divider"></div>
        <div class="meta-line" style="text-align:left;">SHIFT DATE: ${normalizeToSystemDate(day.date)}</div>
        <div class="meta-line" style="text-align:left;">DURATION: ${day.startTime || 'N/A'} TO ${day.endTime || 'N/A'}</div>
        <div class="pos-divider"></div>
        <div class="report-row" style="font-weight:900;">
            <span>TOTAL NET QUANTITY:</span>
            <span>${day.netItems || 0} PCS</span>
        </div>
        <div class="report-row" style="font-weight:900;">
            <span>GROSS EVENT SIGNALS:</span>
            <span>${day.grossItems || 0} ACTIONS</span>
        </div>
        <div class="pos-divider"></div>
        <div class="report-category-header">Itemized Volume Quantities</div>
        ${itemsHtml || '<div class="meta-line">No items logged.</div>'}
        <div class="pos-divider"></div>
        <div class="report-category-header">Detailed Sequence Audit Timeline</div>
        ${timelineHtml || '<div class="meta-line">No timeline entries recorded.</div>'}
        <div class="pos-divider"></div>
        <div class="meta-line" style="font-size:10px; margin-top:6px; text-align:center;">REPORT LOG EXPORT LAYER SECURE PERSISTENCE</div>
    `;
    
    printArea.appendChild(reportDiv);
    
    setTimeout(() => {
        window.print();
        printArea.innerHTML = '';
    }, 250);
}

function wipeHistoricalCard(index) {
    if (!confirm("Are you sure you want to completely delete this historical shift report card? This cannot be undone.")) return;
    openPinModal("Verification authorization protocols requested.", "settings", function() {
        let deletedDate = allTimeHistory[index].date;
        allTimeHistory.splice(index, 1);
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        logAuditEvent("HISTORY_CLEARED", `Wiped historical shift record block for date target: ${deletedDate}`);
        renderLogs();
        if (document.getElementById('rule-shift-selector')) {
            populateShiftSelectorOptions();
        }
    });
}

function saveCurrentShiftToHistory() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) return false;
    
    let netItems = 0;
    let grossItemsCount = 0;
    let summary = {};
    let detailedTimeline = [];
    
    currentDayLog.forEach(log => {
        netItems += log.qty;
        grossItemsCount += log.qty;
        summary[log.item] = (summary[log.item] || 0) + log.qty;
        detailedTimeline.push({
            time: log.time, type: 'SALE', item: log.item, qty: log.qty, customer: log.customer, tokenNum: log.tokenNum
        });
    });
    
    currentRefundLog.forEach(log => {
        grossItemsCount += log.qty;
        detailedTimeline.push({
            time: log.time, type: 'REFUND', item: log.item, qty: log.qty, customer: log.customer, tokenNum: log.tokenNum
        });
    });
    
    let calculatedDate = activeShiftDate || getCalculatedShiftDate();
    let existingIdx = allTimeHistory.findIndex(d => normalizeToSystemDate(d.date) === normalizeToSystemDate(calculatedDate));
    
    if (existingIdx > -1) {
        let existingDay = allTimeHistory[existingIdx];
        existingDay.netItems += netItems;
        existingDay.grossItems += grossItemsCount;
        for (let itm in summary) {
            existingDay.summary[itm] = (existingDay.summary[itm] || 0) + summary[itm];
        }
        existingDay.detailedTimeline = (existingDay.detailedTimeline || []).concat(detailedTimeline);
    } else {
        allTimeHistory.push({
            date: calculatedDate,
            startTime: shiftStartTime || "10:00 AM",
            endTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            netItems: netItems,
            grossItems: grossItemsCount,
            summary: summary,
            detailedTimeline: detailedTimeline
        });
    }
    
    localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
    return true;
}

function printLiveActiveShiftReport() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) {
        alert("No transaction active logs matrix data available to print.");
        return;
    }
    
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    
    let grossCount = 0;
    let refundCount = 0;
    let itemTotals = {};
    let topItem = "None";
    let maxQty = 0;
    
    currentDayLog.forEach(log => {
        grossCount += log.qty;
        itemTotals[log.item] = (itemTotals[log.item] || 0) + log.qty;
        if (itemTotals[log.item] > maxQty) {
            maxQty = itemTotals[log.item];
            topItem = log.item;
        }
    });
    
    currentRefundLog.forEach(log => {
        refundCount += log.qty;
        itemTotals[log.item] = (itemTotals[log.item] || 0) - log.qty;
    });
    
    let itemsHtml = '';
    for (let itm in itemTotals) {
        if (itemTotals[itm] !== 0) {
            itemsHtml += `
                <div class="report-row">
                    <span>${itm}</span>
                    <span>${itemTotals[itm]} Pcs</span>
                </div>`;
        }
    }
    
    let reportDiv = document.createElement('div');
    reportDiv.className = 'thermal-slip-node';
    reportDiv.innerHTML = `
        <div class="report-title">AHMED HANIF RAJPUT</div>
        <div class="meta-line">LIVE MID-SHIFT COUNTER RUNTIME METRICS</div>
        <div class="pos-divider"></div>
        <div class="meta-line" style="text-align:left;">SHIFT INITIATION: ${shiftStartDate || getFormattedSystemDate()} (${shiftStartTime || 'N/A'})</div>
        <div class="meta-line" style="text-align:left;">PRINT SNAPSHOT: ${new Date().toLocaleTimeString()}</div>
        <div class="pos-divider"></div>
        <div class="report-row" style="font-weight:900;"><span>NET REGISTERED QUANTITY:</span><span>${grossCount - refundCount} PCS</span></div>
        <div class="report-row" style="font-weight:900;"><span>GROSS SALES SIGNALS:</span><span>${grossCount} UNITS</span></div>
        <div class="report-row" style="font-weight:900;"><span>VOID ACTION SIGNALS:</span><span>${refundCount} UNITS</span></div>
        <div class="pos-divider"></div>
        <div class="report-category-header">Live Rolling Aggregates</div>
        ${itemsHtml || '<div class="meta-line">No actions logged in buffer.</div>'}
        <div class="pos-divider"></div>
        <div class="report-category-header">Highest Velocity Output Velocity Node</div>
        <div style="padding:4px 0; text-align:center;">
            <div style="font-size: 14px; font-weight: 900; text-transform: uppercase; margin: 2px 0;">${topItem}</div>
            <div style="font-size: 12px; font-weight: 900;">Quantity: ${maxQty}</div>
        </div>
        <div class="pos-divider"></div>
    `;
    printArea.appendChild(reportDiv);
    
    setTimeout(() => {
        window.print();
        printArea.innerHTML = '';
    }, 250);
}

function getItemWeight(name) {
    let match = customItems.find(i => i.name === name);
    return match ? (match.weight || 0) : 0;
}

function getAllConsumptionData() {
    let master = [];
    allTimeHistory.forEach(day => {
        if (day.detailedTimeline) {
            day.detailedTimeline.forEach(t => {
                master.push({
                    date: day.date,
                    time: t.time ? (t.time.split(" - ")[1] || t.time) : '',
                    tokenNum: t.tokenNum,
                    customer: t.customer,
                    item: t.item,
                    qty: t.qty,
                    type: t.type
                });
            });
        }
    });
    
    currentDayLog.forEach(t => {
        master.push({
            date: activeShiftDate || getCalculatedShiftDate(),
            time: t.time ? (t.time.split(" - ")[1] || t.time) : '',
            tokenNum: t.tokenNum,
            customer: t.customer,
            item: t.item,
            qty: t.qty,
            type: 'SALE'
        });
    });
    
    currentRefundLog.forEach(t => {
        master.push({
            date: activeShiftDate || getCalculatedShiftDate(),
            time: t.time ? (t.time.split(" - ")[1] || t.time) : '',
            tokenNum: t.tokenNum,
            customer: t.customer,
            item: t.item,
            qty: t.qty,
            type: 'REFUND'
        });
    });
    return master;
}

function populateConsumptionFilters() {
    let data = getAllConsumptionData();
    let customers = new Set();
    let items = new Set();
    let dates = new Set();
    
    data.forEach(r => {
        if(r.customer) customers.add(r.customer);
        if(r.item) items.add(r.item);
        if(r.date) dates.add(r.date);
    });
    
    let custSel = document.getElementById('filter-customer');
    let itemSel = document.getElementById('filter-item');
    let dateSel = document.getElementById('filter-date');
    
    if(!custSel || !itemSel || !dateSel) return;
    
    custSel.innerHTML = '<option value="ALL">-- All Riders / Identity Profiles --</option>';
    itemSel.innerHTML = '<option value="ALL">-- All Menu Item Labels --</option>';
    dateSel.innerHTML = '<option value="ALL">-- All Recorded Dates Matrices --</option>';
    
    Array.from(customers).sort().forEach(c => custSel.innerHTML += `<option value="${c}">${c}</option>`);
    Array.from(items).sort().forEach(i => itemSel.innerHTML += `<option value="${i}">${i}</option>`);
    Array.from(dates).sort((a,b)=> new Date(b)-new Date(a)).forEach(d => dateSel.innerHTML += `<option value="${d}">${d}</option>`);
}

function renderConsumptionReport() {
    const tbody = document.getElementById('consumption-report-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let data = getAllConsumptionData();
    
    let fCust = document.getElementById('filter-customer').value;
    let fItem = document.getElementById('filter-item').value;
    let fDate = document.getElementById('filter-date').value;
    let fType = document.getElementById('filter-type').value;
    
    if(fCust !== "ALL") data = data.filter(r => r.customer === fCust);
    if(fItem !== "ALL") data = data.filter(r => r.item === fItem);
    if(fDate !== "ALL") data = data.filter(r => r.date === fDate);
    if(fType !== "ALL") data = data.filter(r => r.type === fType);
    
    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No consumption vectors matching parameters found.</td></tr>`;
        document.getElementById('report-total-qty').innerText = "0 Pieces";
        document.getElementById('report-total-weight').innerText = "0.00 KG";
        return;
    }
    
    let totalQty = 0;
    let totalWeightGrams = 0;
    
    data.forEach(r => {
        let weight = getItemWeight(r.item);
        let rowQty = r.qty;
        let rowWeight = rowQty * weight;
        
        if (r.type === 'REFUND') {
            totalQty -= rowQty;
            totalWeightGrams -= rowWeight;
        } else {
            totalQty += rowQty;
            totalWeightGrams += rowWeight;
        }
        
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.date} <span style="font-size:11px; color:var(--text-muted);">${r.time || 'N/A'}</span></td>
            <td><b>#${r.tokenNum || 'N/A'}</b></td>
            <td>${r.customer || 'Walk-In'}</td>
            <td style="font-weight:600;">${r.item}</td>
            <td><span class="badge ${r.type === 'REFUND' ? 'badge-danger' : 'badge-success'}">${r.type === 'REFUND' ? '-' : ''}${r.qty} Pcs</span></td>
            <td>${((rowQty * weight)/1000).toFixed(2)} KG</td>
            <td><span class="badge ${r.type === 'REFUND' ? 'badge-danger' : 'badge-info'}">${r.type}</span></td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('report-total-qty').innerText = `${totalQty} Pieces`;
    document.getElementById('report-total-weight').innerText = `${(totalWeightGrams / 1000).toFixed(2)} KG`;
}

function exportConsumptionReportCSV() {
    let data = getAllConsumptionData();
    let fCust = document.getElementById('filter-customer').value;
    let fItem = document.getElementById('filter-item').value;
    let fDate = document.getElementById('filter-date').value;
    let fType = document.getElementById('filter-type').value;
    
    if(fCust !== "ALL") data = data.filter(r => r.customer === fCust);
    if(fItem !== "ALL") data = data.filter(r => r.item === fItem);
    if(fDate !== "ALL") data = data.filter(r => r.date === fDate);
    if(fType !== "ALL") data = data.filter(r => r.type === fType);
    
    if(data.length === 0) return alert("Structural target storage layer empty.");
    
    let csvContent = "data:text/csv;charset=utf-8,Timestamp Block Node,Token Reference,Profile Mapping ID,Menu Label,Quantity Scalar,Retroactive Weight Metric(KG),State Vector\n";
    data.forEach(r => {
        let val = r.type === 'REFUND' ? `-${r.qty}` : r.qty;
        let wVal = ((r.qty * getItemWeight(r.item)) / 1000).toFixed(2);
        let wStr = r.type === 'REFUND' ? `-${wVal}` : wVal;
        csvContent += `"${r.date}, ${r.time || 'N/A'}", "${r.tokenNum || 'N/A'}", "${r.customer}","${r.item}",${val},${wStr},"${r.type}"\n`;
    });
    
    let encodedUri = encodeURI(csvContent);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Shift_Matrix_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderSettingsMenuManagement() {
    const tbody = document.getElementById('settings-menu-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    customItems.forEach((item, index) => {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="input-field" style="padding:6px;" value="${item.name}" onchange="updateMenuField(${index}, 'name', this.value)"></td>
            <td>
                <select class="select-field" style="padding:6px;" onchange="updateMenuField(${index}, 'category', this.value)">
                    <option value="Rice" ${item.category === 'Rice' ? 'selected' : ''}>Rice</option>
                    <option value="Curry" ${item.category === 'Curry' ? 'selected' : ''}>Curry</option>
                    <option value="Bread" ${item.category === 'Bread' ? 'selected' : ''}>Bread</option>
                    <option value="Sides" ${item.category === 'Sides' ? 'selected' : ''}>Sides</option>
                </select>
            </td>
            <td><input type="number" class="input-field" style="padding:6px; width:100px;" value="${item.weight || 0}" onchange="updateMenuField(${index}, 'weight', parseInt(this.value) || 0)"> Grams</td>
            <td style="text-align:right;"><button class="btn btn-danger" style="padding:6px 12px;" onclick="deleteMenuItem(${index})">Remove</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateMenuField(index, field, value) {
    customItems[index][field] = value;
    localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
    renderMenuGrid();
}

function addNewMenuItemRow() {
    customItems.push({ name: "New Recipe Entry", category: "Rice", weight: 0 });
    localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
    renderSettingsMenuManagement();
    renderMenuGrid();
}

function deleteMenuItem(index) {
    if (confirm("Wipe this product matrix configuration array row node layout?")) {
        customItems.splice(index, 1);
        localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
        renderSettingsMenuManagement();
        renderMenuGrid();
    }
}

function exportSystemBackupJSON(fileName = '') {
    let backupPackage = {
        categorizedMenu: customItems,
        currentCart: currentCart,
        currentDayLog: currentDayLog,
        currentRefundLog: currentRefundLog,
        allTimeHistory: allTimeHistory,
        knownCustomers: knownCustomers,
        auditLogs: auditLogs,
        activeShiftDate: activeShiftDate,
        shiftStartTime: shiftStartTime,
        shiftStartDate: shiftStartDate,
        globalTokenCounter: globalTokenCounter
    };
    
    let jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPackage));
    let name = fileName || `AHRP_POS_SystemBackup_${new Date().toISOString().slice(0,10)}.json`;
    
    let link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logAuditEvent("SETTINGS_CHANGED", "Database configuration state snapshot exported to file architecture.");
}

function importSystemBackupJSON(event) {
    let file = event.target.files[0];
    if (!file) return;
    
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let parsedData = JSON.parse(e.target.result);
            if (!confirm("Overwrite entire system database registry structures from backup target file link?")) return;
            
            localStorage.setItem('categorizedMenu', JSON.stringify(parsedData.categorizedMenu || defaultStructuredItems));
            localStorage.setItem('currentCart', JSON.stringify(parsedData.currentCart || {}));
            localStorage.setItem('currentDayLog', JSON.stringify(parsedData.currentDayLog || []));
            localStorage.setItem('currentRefundLog', JSON.stringify(parsedData.currentRefundLog || []));
            localStorage.setItem('allTimeHistory', JSON.stringify(parsedData.allTimeHistory || []));
            localStorage.setItem('knownCustomers', JSON.stringify(parsedData.knownCustomers || []));
            localStorage.setItem('auditLogs', JSON.stringify(parsedData.auditLogs || []));
            
            if(parsedData.activeShiftDate) localStorage.setItem('activeShiftDate', parsedData.activeShiftDate);
            if(parsedData.shiftStartTime) localStorage.setItem('shiftStartTime', parsedData.shiftStartTime);
            if(parsedData.shiftStartDate) localStorage.setItem('shiftStartDate', parsedData.shiftStartDate);
            if(parsedData.globalTokenCounter) localStorage.setItem('globalTokenCounter', parsedData.globalTokenCounter);
            
            logAuditEvent("DATA_RESTORED", "System infrastructure architecture successfully rebuilt from external snapshot reference.");
            alert("Database array registry restore node synchronized. Rebooting app state.");
            window.location.reload();
        } catch(err) {
            alert("Corrupted data syntax exception error. Import aborted.");
        }
    };
    reader.readAsText(file);
}

function clearEntireDatabaseSignal() {
    if (!confirm("DANGER! This action deletes all logs, history, items, and settings forever!")) return;
    openPinModal("CRITICAL AUTHORIZATION LEVEL SECURITY ACCESS KEY CHALLENGE", "settings", function() {
        localStorage.clear();
        alert("Memory blocks localized matrices zeroed out. Reverting state.");
        window.location.reload();
    });
}

function populateShiftSelectorOptions() {
    const sel = document.getElementById('rule-shift-selector');
    if (!sel) return;
    sel.innerHTML = '';
    
    allTimeHistory.forEach((day, index) => {
        let opt = document.createElement('option');
        opt.value = index;
        opt.innerText = normalizeToSystemDate(day.date);
        sel.appendChild(opt);
    });
}

function runAnomaliesAnalysisEngine() {
    const breadLimit = parseInt(document.getElementById('rule-bread-limit').value) || 30;
    const shiftIndex = document.getElementById('rule-shift-selector').value;
    const tbody = document.getElementById('anomalies-tbody');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (shiftIndex === "") {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:10px;">Select a shift node context frame parameters to filter anomalies.</td></tr>`;
        return;
    }
    
    let day = allTimeHistory[shiftIndex];
    if (!day || !day.detailedTimeline) return;
    
    let anomaliesFound = false;
    
    day.detailedTimeline.forEach(t => {
        let shouldFlag = false;
        let ruleName = "";
        
        let matchItem = customItems.find(i => i.name === t.item);
        let category = matchItem ? matchItem.category : "";
        
        if (category === "Bread" && t.qty >= breadLimit && t.type === 'SALE') {
            shouldFlag = true;
            ruleName = `Bulk Unit Bread Overflow Logic (≥ ${breadLimit} Pieces)`;
        }
        
        if (shouldFlag) {
            anomaliesFound = true;
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--danger);">${ruleName}</td>
                <td>Token #${t.tokenNum} (${t.time ? (t.time.split(" - ")[1] || t.time) : 'N/A'})</td>
                <td><b>${t.customer || 'Walk-In'}</b></td>
                <td>${t.item} x${t.qty} <span class="badge badge-danger">${t.type}</span></td>
            `;
            tbody.appendChild(tr);
        }
    });
    
    if (!anomaliesFound) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No operational threshold compliance anomalies discovered for the selected shift.</td></tr>`;
    }
}

// ----------------------------------------------------
// UI Document Node Dynamic Binding Entry Setup
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    renderMenuGrid();
    renderCart();
    renderLogs();
    populateCustomerDatalist();
    populateMergeDropdowns();
    renderCustomerManagement();
    renderAuditLog();
    
    if (document.getElementById('filter-customer')) {
        populateConsumptionFilters();
        renderConsumptionReport();
    }
    
    if (document.getElementById('settings-menu-tbody')) {
        renderSettingsMenuManagement();
    }
    
    if (document.getElementById('rule-shift-selector')) {
        populateShiftSelectorOptions();
        runAnomaliesAnalysisEngine();
    }
    updateLiveBreakdown();
});

// Event Listeners for Input Elements
const modalPinInput = document.getElementById('modal-pin-input');
if (modalPinInput) {
    modalPinInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') submitPinModal(); });
}

const custModalNameInput = document.getElementById('cust-modal-name-input');
if (custModalNameInput) {
    custModalNameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') submitCustomerModal(); });
}
