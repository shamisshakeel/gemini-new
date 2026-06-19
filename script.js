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
// Automated Shift Engine (10 AM to 3 AM Rollover)
// ----------------------------------------------------
function getCalculatedShiftDate() {
    let now = new Date();
    let hours = now.getHours();
    let shiftStart = new Date(now);
    
    // Any transaction before 10 AM gets grouped into yesterday's shift record
    if (hours < 10) {
        shiftStart.setDate(shiftStart.getDate() - 1);
    }
    return getFormattedSystemDate(shiftStart);
}

function processAutomatedShiftRollover() {
    let currentCalculatedShift = getCalculatedShiftDate();
    
    if (!activeShiftDate) {
        activeShiftDate = currentCalculatedShift;
        localStorage.setItem('activeShiftDate', activeShiftDate);
        return;
    }

    if (currentCalculatedShift !== activeShiftDate) {
        let hasDataToSave = saveCurrentShiftToHistory();
        
        // Auto-download JSON backup to hard drive immediately when the shift ends
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

// Checks the clock every 1 minute to trigger the rollover exactly at 10 AM
setInterval(processAutomatedShiftRollover, 60000);

// Exact Timestamps for every log action
function getExactTimestamp() {
    let now = new Date();
    let timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    let dateStr = getFormattedSystemDate(now);
    return `${dateStr} - ${timeStr}`;
}

// Date String Sanitizer & Normalizer Engine
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
    dataList.innerHTML = '';
    knownCustomers.sort().forEach(name => {
        let option = document.createElement('option');
        option.value = name;
        dataList.appendChild(option);
    });
}

function switchView(tabId) {
    document.querySelectorAll('.tab-content').forEach(element => element.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(element => element.classList.remove('active'));
    document.getElementById('btn-' + tabId).classList.add('active');
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

function logAuditEvent(type, description) {
    let timestamp = getExactTimestamp();
    auditLogs.push({ time: timestamp, type: type, description: description, status: "SUCCESS" });
    localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
    
    if (document.getElementById('audit-tab') && document.getElementById('audit-tab').classList.contains('active')) {
        renderAuditLog();
    }
}

function renderAuditLog() {
    const tbody = document.getElementById('audit-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let filterType = document.getElementById('audit-filter-type').value;

    let filtered = auditLogs;
    if (filterType !== "ALL") {
        filtered = auditLogs.filter(log => log.type === filterType);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No audit records found.</td></tr>`;
        return;
    }

    for(let i = filtered.length - 1; i >= 0; i--) {
        let log = filtered[i];
        let tr = `<tr>
            <td style="font-size:12px; color:var(--text-muted);">${log.time}</td>
            <td style="font-weight:700; color:var(--primary);">${log.type}</td>
            <td>${log.description}</td>
            <td><span style="color:var(--accent); font-weight:700;">${log.status}</span></td>
        </tr>`;
        tbody.insertAdjacentHTML('beforeend', tr);
    }
}

function clearAuditLog() {
    if(!confirm("Purge all audit records?")) return;
    openPinModal("Enter Management Keys to Clear Audit Logs", "admin", function() {
        auditLogs = [];
        localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
        renderAuditLog();
    });
}

function closePinModal() {
    document.getElementById('secure-pin-modal').style.display = 'none';
    activeCallback = null;
}

function submitPinModal() {
    let enteredPin = document.getElementById('modal-pin-input').value.trim();
    let targetPin = (requiredPinType === 'refund') ? '1414' : 'smoekys444';
    if (enteredPin === targetPin) {
        document.getElementById('secure-pin-modal').style.display = 'none';
        if (activeCallback) activeCallback();
        activeCallback = null;
    } else {
        alert("Security failure. Operation Denied.");
        document.getElementById('modal-pin-input').value = '';
    }
}

function attemptOpenCustomers() {
    openPinModal("Enter Management Keys to Unlock Configuration Panel", "admin", function() {
        switchView('customers-tab');
        renderCustomerManagement();
        renderMenuWeightsManagement();
        populateMergeDropdowns();
    });
}

function attemptOpenConsumption() {
    openPinModal("Enter Management Keys to Unlock Analytic Engine", "admin", function() {
        switchView('consumption-tab');
        populateFilterOptions();
        populateShiftSelectorOptions();
        renderConsumptionReport();
    });
}

function attemptOpenAudit() {
    openPinModal("Enter Management Keys to Unlock Security Audit Logs", "admin", function() {
        switchView('audit-tab');
        renderAuditLog();
    });
}

function handleCustomerSearchFilter() {
    activeCustomerSearchQuery = document.getElementById('customer-search-input').value.trim().toLowerCase();
    renderCustomerManagement();
}

function populateMergeDropdowns() {
    let srcSelect = document.getElementById('merge-source-select');
    let tgtSelect = document.getElementById('merge-target-select');
    
    srcSelect.innerHTML = '<option value="">-- Select Duplicate Profile (To Merge From) --</option>';
    tgtSelect.innerHTML = '<option value="">-- Select Target Primary Master Profile --</option>';
    
    let sortedCustomers = [...knownCustomers].sort();
    sortedCustomers.forEach(cust => {
        srcSelect.innerHTML += `<option value="${cust}">${cust}</option>`;
        tgtSelect.innerHTML += `<option value="${cust}">${cust}</option>`;
    });
}

function renderCustomerManagement() {
    const listDiv = document.getElementById('customer-management-list');
    listDiv.innerHTML = '';
    
    let filteredCustomers = knownCustomers.filter(cust => 
        cust.toLowerCase().includes(activeCustomerSearchQuery)
    );

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
        
    filteredCustomers.forEach((cust) => {
        let actualIndex = knownCustomers.indexOf(cust);
        table += `<tr>
            <td style="font-weight:600; color:var(--text-main);">${cust}</td>
            <td style="text-align:right;">
                <button class="btn-action-small btn-edit" onclick="editCustomer(${actualIndex})">Modify</button>
                <button class="btn-action-small btn-refund" onclick="deleteCustomer(${actualIndex})">Purge</button>
            </td>
        </tr>`;
    });
    table += `</tbody></table>`;
    listDiv.innerHTML = table;
}

function executeCustomerMerge() {
    let source = document.getElementById('merge-source-select').value;
    let target = document.getElementById('merge-target-select').value;
    
    if(!source || !target) {
        alert("Please select both a source duplicate profile and a target master profile.");
        return;
    }
    if(source === target) {
        alert("Cannot merge a profile into itself.");
        return;
    }
    
    if(!confirm(`Are you absolutely sure you want to merge "${source}" into "${target}"?\nAll history records, shift logs, and analytics data will be combined into "${target}", and "${source}" will be deleted.`)) {
        return;
    }
    
    currentDayLog.forEach(log => {
        if(log.customer === source) log.customer = target;
    });
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    
    currentRefundLog.forEach(log => {
        if(log.customer === source) log.customer = target;
    });
    localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
    
    allTimeHistory.forEach(day => {
        if (day.detailedTimeline) {
            day.detailedTimeline.forEach(entry => {
                if (entry.customer === source) entry.customer = target;
            });
        }
    });
    localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
    
    let srcIdx = knownCustomers.indexOf(source);
    if(srcIdx > -1) knownCustomers.splice(srcIdx, 1);
    localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
    
    alert(`Worker Record Integration Successful! "${source}" has been combined into "${target}".`);
    
    populateCustomerDatalist();
    populateMergeDropdowns();
    renderCustomerManagement();
    renderLogs();
}

function exportSystemBackupJSON(customFilename) {
    let backupPayload = {
        categorizedMenu: JSON.parse(localStorage.getItem('categorizedMenu')) || customItems,
        currentDayLog: JSON.parse(localStorage.getItem('currentDayLog')) || currentDayLog,
        currentRefundLog: JSON.parse(localStorage.getItem('currentRefundLog')) || currentRefundLog,
        allTimeHistory: JSON.parse(localStorage.getItem('allTimeHistory')) || allTimeHistory,
        knownCustomers: JSON.parse(localStorage.getItem('knownCustomers')) || knownCustomers,
        shiftStartTime: localStorage.getItem('shiftStartTime') || shiftStartTime,
        shiftStartDate: localStorage.getItem('shiftStartDate') || shiftStartDate,
        activeShiftDate: localStorage.getItem('activeShiftDate') || activeShiftDate,
        globalTokenCounter: globalTokenCounter
    };
    
    let filename = customFilename || `AHRP_POS_SYSTEM_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPayload, null, 2));
    let downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
}

function importSystemBackupJSON() {
    let fileInput = document.getElementById('import-backup-file');
    if(fileInput.files.length === 0) {
        alert("Please select a valid (.json) backup database template file first.");
        return;
    }
    
    if(!confirm("CRITICAL WARNING: This action will completely overwrite all local application data, current shift data, history ledgers, and configurations. Proceed?")) {
        return;
    }
    
    let selectedFile = fileInput.files[0];
    let reader = new FileReader();
    reader.onload = function(event) {
        try {
            let parsedData = JSON.parse(event.target.result);
            
            if(!parsedData.categorizedMenu || !parsedData.knownCustomers || !parsedData.allTimeHistory) {
                throw new Error("Invalid schema tracking configuration variables.");
            }
            
            localStorage.setItem('categorizedMenu', JSON.stringify(parsedData.categorizedMenu));
            localStorage.setItem('currentDayLog', JSON.stringify(parsedData.currentDayLog || []));
            localStorage.setItem('currentRefundLog', JSON.stringify(parsedData.currentRefundLog || []));
            localStorage.setItem('allTimeHistory', JSON.stringify(parsedData.allTimeHistory || []));
            localStorage.setItem('knownCustomers', JSON.stringify(parsedData.knownCustomers || []));
            
            if(parsedData.activeShiftDate) localStorage.setItem('activeShiftDate', parsedData.activeShiftDate);
            
            if(parsedData.shiftStartTime) {
                localStorage.setItem('shiftStartTime', parsedData.shiftStartTime);
            } else {
                localStorage.removeItem('shiftStartTime');
            }

            if(parsedData.shiftStartDate) {
                localStorage.setItem('shiftStartDate', parsedData.shiftStartDate);
            } else {
                localStorage.removeItem('shiftStartDate');
            }

            if(parsedData.globalTokenCounter) {
                localStorage.setItem('globalTokenCounter', parsedData.globalTokenCounter);
                globalTokenCounter = parseInt(parsedData.globalTokenCounter);
            }
            
            customItems = parsedData.categorizedMenu;
            currentDayLog = parsedData.currentDayLog || [];
            currentRefundLog = parsedData.currentRefundLog || [];
            allTimeHistory = parsedData.allTimeHistory || [];
            knownCustomers = parsedData.knownCustomers || [];
            shiftStartTime = parsedData.shiftStartTime || null;
            shiftStartDate = parsedData.shiftStartDate || null;
            activeShiftDate = parsedData.activeShiftDate || null;
            
            alert("Database Memory Override Successfully Restored!");
            location.reload(); 
            
        } catch(err) {
            alert("Error parsing memory file: Invalid or corrupted JSON backup package schema layout.\n" + err.message);
        }
    };
    reader.readAsText(selectedFile);
}

function renderMenuWeightsManagement() {
    const container = document.getElementById('menu-weights-management-container');
    container.innerHTML = '';
    let table = `<div class="section-title" style="margin-top:16px;">Active Dynamic Mass Multiplier Factors</div>
    <table class="styled-table">
        <thead>
            <tr>
                <th>Menu Item Label</th>
                <th>Category Mapping</th>
                <th style="width:120px;">Unit Grams (g)</th>
                <th style="text-align:right; width:80px;">Execution</th>
            </tr>
        </thead>
        <tbody>`;
    customItems.forEach((itemObj, index) => {
        table += `<tr>
            <td style="font-weight:600; color:var(--text-main);">${itemObj.name}</td>
            <td style="color:var(--text-muted); font-size:12px;">${itemObj.category}</td>
            <td>
                <input type="number" class="input-field" id="weight-input-${index}" value="${itemObj.weight || 0}" style="padding:6px; font-size:13px; text-align:center;">
            </td>
            <td style="text-align:right;">
                <button class="btn-action-small btn-edit" style="background:var(--accent); color:white; border:none;" onclick="updateItemWeightRow(${index})">Bind</button>
            </td>
        </tr>`;
    });
    table += `</tbody></table>`;
    container.innerHTML = table;
}

function updateItemWeightRow(index) {
    let inputField = document.getElementById(`weight-input-${index}`);
    let newW = parseInt(inputField.value);
    if (isNaN(newW) || newW < 0) {
        alert("Entry out of bounds range parameters.");
        return;
    }
    customItems[index].weight = newW;
    localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
    alert(`Retroactive execution mapping successful. Item weight altered to ${newW}g.`);
    renderMenu();
    updateLiveBreakdown();
}

function addCustomerManually() {
    let input = document.getElementById('new-manual-customer');
    let name = input.value.trim().replace(/\b\w/g, char => char.toUpperCase());
    if (!name) return;
    if (!knownCustomers.includes(name)) {
        knownCustomers.push(name);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        populateCustomerDatalist();
        populateMergeDropdowns();
        renderCustomerManagement();
        input.value = '';
    } else {
        alert("Account key already exists.");
    }
}

function editCustomer(index) {
    let oldName = knownCustomers[index];
    let newName = prompt("Alter tracked worker profile string:", oldName);
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
    let formattedName = newName.trim().replace(/\b\w/g, char => char.toUpperCase());
    if (knownCustomers.includes(formattedName) && formattedName !== oldName) {
        alert("Target token value collision identifier detected.");
        return;
    }
    knownCustomers[index] = formattedName;
    localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
    currentDayLog.forEach(log => { if (log.customer === oldName) log.customer = formattedName; });
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    allTimeHistory.forEach(day => {
        if (day.detailedTimeline) {
            day.detailedTimeline.forEach(entry => { if (entry.customer === oldName) entry.customer = formattedName; });
        }
    });
    localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
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
        populateCustomerDatalist();
        populateMergeDropdowns();
        renderCustomerManagement();
    }
}

function openCustomerModal() {
    document.getElementById('cust-modal-name-input').value = '';
    document.getElementById('customer-name-modal').style.display = 'flex';
    document.getElementById('cust-modal-name-input').focus();
}

function closeCustomerModal() { document.getElementById('customer-name-modal').style.display = 'none'; }

function submitCustomerModal() {
    let rawName = document.getElementById('cust-modal-name-input').value.trim();
    if (rawName === "") {
        alert("Valid identification matrix required.");
        return;
    }
    let finalName = "";
    let matchedName = findClosestCustomerName(rawName);
    if (matchedName) {
        finalName = matchedName;
    } else {
        finalName = rawName.replace(/\b\w/g, char => char.toUpperCase());
        knownCustomers.push(finalName);
        localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        populateCustomerDatalist(); 
    }
    closeCustomerModal();
    executeTokenPrinting(finalName); 
}

function renderCategoryFilters() {
    const container = document.getElementById('category-filter-container');
    container.innerHTML = '';
    let categories = ["All", "Rice", "Curry", "Bread", "Others"];
    categories.forEach(cat => {
        let btn = document.createElement('button');
        btn.className = `category-filter-btn ${currentActiveCategory === cat ? 'active' : ''}`;
        btn.innerText = cat;
        btn.onclick = () => {
            currentActiveCategory = cat;
            renderCategoryFilters();
            renderMenu();
        };
        container.appendChild(btn);
    });
}

function getItemCategory(itemName) {
    let found = customItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    return found ? found.category : "Others";
}

function getItemWeight(itemName) {
    let found = customItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    return found && found.weight ? parseFloat(found.weight) : 0;
}

function renderMenu() {
    const grid = document.getElementById('items-grid');
    grid.innerHTML = '';
    customItems.forEach((itemObj, index) => {
        if (currentActiveCategory !== "All" && itemObj.category !== currentActiveCategory) return;
        let card = document.createElement('div');
        card.className = 'menu-card';
        card.innerText = itemObj.name;
        card.onclick = () => { addToCart(itemObj.name); };
        grid.appendChild(card);
    });
}

function addNewItem() {
    const nameInput = document.getElementById('new-item-name');
    const catSelect = document.getElementById('new-item-category');
    const weightInput = document.getElementById('new-item-weight');
    const name = nameInput.value.trim();
    const weight = parseInt(weightInput.value) || 0;
    if(!name) return;
    customItems.push({ name: name, category: catSelect.value, weight: weight });
    localStorage.setItem('categorizedMenu', JSON.stringify(customItems));
    nameInput.value = '';
    weightInput.value = '';
    alert(`Successfully mapped item allocation array schema instance.`);
    renderMenu();
    renderMenuWeightsManagement();
}

function renderCart() {
    const container = document.getElementById('cart-container');
    container.innerHTML = '';
    if (Object.keys(currentCart).length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding-top:45px; margin:0; font-size: 13px;">Queue Array Buffer Allocation Empty</p>';
        return;
    }
    for (let item in currentCart) {
        let div = document.createElement('div');
        div.className = 'cart-row';
        div.innerHTML = `
            <span style="font-weight: 600;">${item}</span>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty('${item}', -1)">-</button>
                <span style="font-weight:700; width:24px; text-align:center;">${currentCart[item]}</span>
                <button class="qty-btn" onclick="changeQty('${item}', 1)">+</button>
            </div>
        `;
        container.appendChild(div);
    }
}

function addToCart(item) { currentCart[item] = (currentCart[item] || 0) + 1; renderCart(); }

function changeQty(item, amount) { 
    currentCart[item] += amount; 
    if (currentCart[item] <= 0) delete currentCart[item]; 
    renderCart();
}

function updateLiveBreakdown() {
    const container = document.getElementById('live-total-container');
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center; margin:0; font-size:13px;">Live operational transaction vectors empty.</p>';
        return;
    }
    let grossCount = 0; let refundCount = 0; let itemTotals = {};

    currentDayLog.forEach(log => { grossCount += log.qty; itemTotals[log.item] = (itemTotals[log.item] || 0) + log.qty; });
    currentRefundLog.forEach(log => { refundCount += log.qty; });

    let rangeStr = shiftStartTime ? ` (Opened: ${shiftStartTime})` : '';
    let html = `
        <div style="font-size:13px; margin-bottom:12px; color:var(--text-muted);">
            <div style="font-size:11px; font-weight:700; color:var(--primary); margin-bottom:6px;">${rangeStr}</div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Gross Generated Logs:</span><span style="font-weight:600; color:var(--text-main);">${grossCount + refundCount} Units</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:var(--danger);">
                <span>Liquidated Void Logs:</span><span style="font-weight:600;">-${refundCount} Units</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-weight:800; border-top:1px solid var(--border); padding-top:6px; font-size:14px; color:var(--accent);">
                <span>Net Verified Shift Inventory:</span><span>${grossCount} Units</span>
            </div>
        </div>
        <div style="font-weight:700; font-size:11px; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px; border-bottom:1px solid var(--border); padding-bottom:4px;">Dynamic Mass Metrics Breakdown</div>
        <table style="width:100%; font-size:13px; color:var(--text-main); border-collapse:collapse;">
    `;

    let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
    categoryOrder.forEach(cat => {
        let catHeaderAdded = false;
        for (let item in itemTotals) {
            if (getItemCategory(item) === cat) {
                if (!catHeaderAdded) {
                    html += `<tr><td colspan="2" style="font-size:11px; font-weight:800; color:var(--primary); padding:6px 0 2px 0; text-transform:uppercase;">${cat}</td></tr>`;
                    catHeaderAdded = true;
                }
                let calcWeightKg = ((itemTotals[item] * getItemWeight(item)) / 1000).toFixed(2);
                html += `<tr>
                    <td style="padding:2px 0 2px 8px; font-weight:500;">${item}</td>
                    <td style="text-align:right; font-weight:700; color:var(--text-main);">x${itemTotals[item]} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${calcWeightKg} KG)</span></td>
                </tr>`;
            }
        }
    });
    html += `</table>`;
    container.innerHTML = html;
}

function renderLogs() {
    const logBody = document.getElementById('live-log');
    logBody.innerHTML = '';
    if(currentDayLog.length === 0){ logBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No item array stream signals captured.</td></tr>`; }
    
    for(let i = currentDayLog.length - 1; i >= 0; i--) {
        let log = currentDayLog[i];
        let customerDisplay = log.customer ? `<div style="font-size:11px; color:var(--primary); font-weight:700;">Worker Name: ${log.customer}</div>` : '';
        let itemWeightKg = ((log.qty * getItemWeight(log.item)) / 1000).toFixed(2);
        
        let tokenDisplay = `<div style="font-size:11px; font-weight:800; color:var(--danger); margin-bottom:2px;">TOKEN #${log.tokenNum || 'N/A'}</div>`;

        let row = `<tr>
            <td style="color:var(--text-muted); font-weight:500; font-size:11px;">${log.time}</td>
            <td>
                ${tokenDisplay}
                <div style="font-weight:600; color:var(--text-main);">${log.item}</div>
                ${customerDisplay}
            </td>
            <td style="text-align:center; font-weight:700; color:var(--primary);">x${log.qty}<br><span style="font-size:10px; color:var(--text-muted); font-weight:normal;">${itemWeightKg} KG</span></td>
            <td style="text-align:center;"><button class="btn-action-small btn-refund" onclick="refundLogItem(${i})">Void</button></td>
        </tr>`;
        logBody.insertAdjacentHTML('beforeend', row);
    }

    const refundBody = document.getElementById('refund-log');
    refundBody.innerHTML = '';
    if(currentRefundLog.length === 0) { refundBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No historical void signals logs generated.</td></tr>`; }
    
    for(let j = currentRefundLog.length - 1; j >= 0; j--) {
        let rLog = currentRefundLog[j];
        let itemWeightKg = ((rLog.qty * getItemWeight(rLog.item)) / 1000).toFixed(2);
        let row = `<tr>
            <td style="color:var(--danger); font-weight:500; font-size:11px;">${rLog.time}</td>
            <td style="font-weight:600; color:var(--text-main);">${rLog.customer || 'Walk-In'}</td>
            <td style="font-weight:600; color:var(--text-muted); text-decoration: line-through;">
                <div style="font-size:11px; font-weight:800; color:var(--text-muted); margin-bottom:2px;">TOKEN #${rLog.tokenNum || 'N/A'}</div>
                ${rLog.item}
            </td>
            <td style="text-align:center; font-weight:700; color:var(--danger);">x${rLog.qty}<br><span style="font-size:10px; font-weight:normal;">-${itemWeightKg} KG</span></td>
        </tr>`;
        refundBody.insertAdjacentHTML('beforeend', row);
    }

    updateLiveBreakdown();

    const histContainer = document.getElementById('history-container');
    histContainer.innerHTML = '';
    if(allTimeHistory.length === 0) { histContainer.innerHTML = '<p style="color:#94a3b8; text-align:center; font-size:14px; padding-top:20px; width:100%;">Vault ledger history index empty array structure.</p>'; }
    
    allTimeHistory.forEach((day, index) => {
        let normalizedDateLabel = normalizeToSystemDate(day.date);
        let rangeSuffix = (day.startTime && day.endTime) ? ` (${day.startTime} to ${day.endTime})` : '';

        let html = `<div class="history-card">
            <button class="delete-history-btn" onclick="deleteHistoryItem(${index})">×</button>
            <div class="history-header">
                <span>Date Scope Trace: <strong>${normalizedDateLabel}</strong></span>
                <span style="color:var(--primary); font-size:11px;">Timeline Boundary: <strong>${rangeSuffix || 'N/A'}</strong></span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:11px; color:var(--text-muted);">
                <span>Gross: ${day.grossItems || day.totalItems} | Voided: ${day.refundedItems || 0}</span>
                <span style="color:var(--accent); font-weight:bold;">Net Operational Sum: ${day.totalItems}</span>
            </div>
            <table style="width:100%; font-size:13px; color:#475569;">`;
        
        let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
        categoryOrder.forEach(cat => {
            let catHeaderAdded = false;
            for(let itm in day.summary) {
                if(getItemCategory(itm) === cat) {
                    if(!catHeaderAdded) {
                        html += `<tr><td colspan="2" style="font-size:11px; font-weight:700; color:var(--primary); padding-top:6px; text-transform:uppercase;">${cat}</td></tr>`;
                        catHeaderAdded = true;
                    }
                    let histItemWeight = ((day.summary[itm] * getItemWeight(itm)) / 1000).toFixed(2);
                    html += `<tr><td style="padding:2px 0 2px 6px;">${itm}</td><td style="text-align:right; font-weight:600; color:var(--text-main);">x${day.summary[itm]} <span style="font-size:11px; font-weight:normal; color:var(--text-muted);">(${histItemWeight} KG)</span></td></tr>`;
                }
            }
        });
        html += `</table>`;
        
        if (day.detailedTimeline && day.detailedTimeline.length > 0) {
            html += `<div style="font-weight:700; font-size:11px; margin-top:12px; color:var(--text-muted); text-transform:uppercase; border-top: 1px dashed var(--border); padding-top: 8px;">Chronological Action Log Flow</div><div class="timeline-box">`;
            day.detailedTimeline.forEach(t => {
                let styleRule = t.type === 'REFUND' ? 'color:var(--danger); font-weight:700;' : 'color:var(--text-main);';
                let nameSuffix = t.customer ? ` (${t.customer})` : '';
                let wCalc = ((t.qty * getItemWeight(t.item)) / 1000).toFixed(2);
                let tNumDisplay = t.tokenNum ? `[#${t.tokenNum}] ` : '';
                html += `<div style="margin-bottom:4px; ${styleRule}">[${t.time}] ${tNumDisplay}${t.type}: ${t.item}${nameSuffix} x${t.qty} (${wCalc} KG)</div>`;
            });
            html += `</div>`;
        }
        
        html += `<div style="display:flex; gap:8px; margin-top:16px;">
                    <button class="print-report-btn" style="margin-top:0; flex:1;" onclick="printSummaryReport(${index})">Summary Report</button>
                    <button class="print-report-btn" style="margin-top:0; flex:1; background:#f0fdf4; color:#166534; border-color:#bbf7d0;" onclick="printHistoricalShiftLogs(${index})">Detailed Logs</button>
                 </div>
            </div>`;
        histContainer.insertAdjacentHTML('afterbegin', html);
    });
}

function refundLogItem(index) {
    if (!confirm("Execute target data structure mutation termination override script?")) return;
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
        currentDayLog.splice(index, 1);
        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        renderLogs();
        printSingleRefundToken(refundObject);
    });
}

function printSingleRefundToken(refundObj) {
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    let token = document.createElement('div');
    token.className = 'pos-token';
    let weightStr = ((refundObj.qty * getItemWeight(refundObj.item)) / 1000).toFixed(2);
    token.innerHTML = `
        <div class="brand-main">AHMED HANIF RAJPUT</div>
        <div style="font-size: 14px; font-weight: 900; text-align: center; color: #ffffff !important; background-color: #000000 !important; padding: 2px 0; margin: 4px 0;">[ VOID CANCEL ]</div>
        <div style="font-family: Arial, sans-serif !important; font-size: 14px; font-weight: 900; text-align: center; color: #000000 !important; margin: 4px 0;">VOIDED TOKEN: #${refundObj.tokenNum || 'N/A'}</div>
        <div class="pos-divider"></div>
        <div class="item-container">
            <div class="pos-item" style="text-decoration: line-through;">${refundObj.item}</div>
            <div class="pos-qty">TERMINATED: [ ${refundObj.qty} ]</div>
            <div style="font-weight:900; font-size:14px; margin-top:4px;">-${weightStr} KG</div>
        </div>
        <div class="pos-divider"></div>
        <div class="meta-line">EXACT TIMESTAMP: ${refundObj.time}</div>
        <div style="font-size:12px; font-weight:900; margin-top:4px; text-transform:uppercase; text-align:center;">WORKER NAME: ${refundObj.customer}</div>
    `;
    printArea.appendChild(token);
    setTimeout(() => { window.print(); printArea.innerHTML = ''; }, 50);
}

// Thermal Report Generator for Historical Summary
function printSummaryReport(index) {
    const day = allTimeHistory[index];
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    let topItem = "None"; let maxQty = 0;
    for (let itm in day.summary) { if (day.summary[itm] > maxQty) { maxQty = day.summary[itm]; topItem = itm; } }
    let reportDiv = document.createElement('div');
    reportDiv.className = 'pos-report';
    let itemsHtml = '';
    let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
    categoryOrder.forEach(cat => {
        let catHeaderPrinted = false;
        for (let itm in day.summary) {
            if (getItemCategory(itm) === cat) {
                if (!catHeaderPrinted) {
                    itemsHtml += `<div class="report-category-header">${cat}</div>`;
                    catHeaderPrinted = true;
                }
                let wStr = ((day.summary[itm] * getItemWeight(itm)) / 1000).toFixed(2);
                itemsHtml += `<div class="report-row"><span>&nbsp;&nbsp;${itm.toUpperCase()}</span><span>x${day.summary[itm]} (${wStr} KG)</span></div>`;
            }
        }
    });
    let timeRangeTitle = (day.startTime && day.endTime) ? `${day.startTime} TO ${day.endTime}` : 'SHIFT REPORT';
    reportDiv.innerHTML = `
        <div class="brand-main">AHMED HANIF RAJPUT</div>
        <div class="report-title">SHIFT ANALYSIS METRICS</div>
        <div class="meta-line">DATE: ${normalizeToSystemDate(day.date)}</div>
        <div class="meta-line">SHIFT BLOCK: ${timeRangeTitle}</div>
        <div class="pos-divider"></div>
        <div class="report-row"><span>GROSS EMITTED:</span><span>${day.grossItems || day.totalItems} Units</span></div>
        <div class="report-row"><span>VOIDED EXECUTIONS:</span><span>${day.refundedItems || 0} Units</span></div>
        <div class="report-row" style="border-top:2px solid #000000 !important; padding-top:4px;"><span>NET INVENTORY TOTAL:</span><span>${day.totalItems} Units</span></div>
        <div class="pos-divider-thin"></div>
        <div style="font-size:11px; font-weight:900; margin-bottom:4px; text-align:center; text-transform:uppercase;">Dynamic Net Mass Quantization</div>
        ${itemsHtml}
        <div class="pos-divider-thin" style="margin-top:6px;"></div>
        <div class="highlight-box">
            <div style="font-size: 11px; font-weight: 900;">MAX ACCUMULATED VOLUME</div>
            <div style="font-size: 18px; font-weight: 900; text-transform: uppercase; margin: 2px 0;">${topItem}</div>
            <div style="font-size: 12px; font-weight: 900;">Quantity: ${maxQty}</div>
        </div>
        <div class="pos-divider"></div>
    `;
    printArea.appendChild(reportDiv);
    setTimeout(() => { window.print(); printArea.innerHTML = ''; }, 50);
}

// Thermal Report Generator for Historical Detailed Shift Logs (Grouped by Worker A-Z)
function printHistoricalShiftLogs(index) {
    const day = allTimeHistory[index];
    if (!day) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';

    let timeRangeTitle = (day.startTime && day.endTime) ? `${day.startTime} TO ${day.endTime}` : 'SHIFT LOGS';
    
    let customerGroups = {};
    if (day.detailedTimeline && day.detailedTimeline.length > 0) {
        day.detailedTimeline.forEach(t => {
            let custName = t.customer || 'Walk-In';
            if (!customerGroups[custName]) {
                customerGroups[custName] = [];
            }
            customerGroups[custName].push(t);
        });
    }

    let sortedCustomers = Object.keys(customerGroups).sort((a, b) => a.localeCompare(b));
    let logsHtml = '';

    if (sortedCustomers.length > 0) {
        sortedCustomers.forEach(cust => {
            logsHtml += `
                <div style="font-size:13px; font-weight:900; color:#000000 !important; text-align:center; margin-top:8px; border-bottom: 2px solid #000000; padding-bottom: 2px;">
                    WORKER: ${cust}
                </div>
            `;
            
            let custLogs = customerGroups[cust].sort((a, b) => (parseInt(a.tokenNum) || 0) - (parseInt(b.tokenNum) || 0));
            
            custLogs.forEach(t => {
                let tNumDisplay = t.tokenNum ? `T#${t.tokenNum}` : 'N/A';
                
                if (t.type === 'SALE') {
                    logsHtml += `
                        <div style="display:flex; justify-content:space-between; font-size:11px !important; font-family: Arial, sans-serif !important; color:#000000 !important; font-weight:900 !important; border-bottom:1px dotted #000000; padding:4px 0; align-items:center;">
                            <div style="flex:1; line-height:1.2;">
                                <span style="font-size:11px;">${tNumDisplay} | ${t.time}</span><br>
                                ${t.item}
                            </div>
                            <div style="text-align:right;">
                                x${t.qty}
                            </div>
                        </div>
                    `;
                } else if (t.type === 'REFUND') {
                    logsHtml += `
                        <div style="display:flex; justify-content:space-between; font-size:11px !important; font-family: Arial, sans-serif !important; color:#000000 !important; font-weight:900 !important; border-bottom:1px dotted #000000; padding:4px 0; align-items:center; text-decoration:line-through;">
                            <div style="flex:1; line-height:1.2;">
                                <span style="font-size:11px;">${tNumDisplay} | ${t.time}</span><br>
                                [VOID] ${t.item}
                            </div>
                            <div style="text-align:right;">
                                -x${t.qty}
                            </div>
                        </div>
                    `;
                }
            });
        });
    } else {
        logsHtml = '<div style="font-size:12px; font-weight:900; color:#000000; text-align:center; margin-bottom:10px;">No logs recorded.</div>';
    }

    let reportDiv = document.createElement('div');
    reportDiv.className = 'pos-report';
    reportDiv.innerHTML = `
        <div class="brand-main" style="color:#000000 !important; font-weight:900 !important;">AHMED HANIF RAJPUT</div>
        <div class="report-title" style="color:#000000 !important; font-weight:900 !important;">WORKER DETAILED LOGS</div>
        <div class="meta-line" style="color:#000000 !important; font-weight:900 !important;">DATE: ${normalizeToSystemDate(day.date)}</div>
        <div class="meta-line" style="color:#000000 !important; font-weight:900 !important;">SHIFT: ${timeRangeTitle}</div>
        <div class="pos-divider"></div>
        ${logsHtml}
        <div class="pos-divider" style="margin-top:6px;"></div>
        <div style="font-size:12px; font-weight:900; color:#000000 !important; text-align:center;">END OF LOGS</div>
    `;
    
    printArea.appendChild(reportDiv);
    setTimeout(() => { window.print(); printArea.innerHTML = ''; }, 50);
}

// Thermal Report Generator for Active Live Shift Logs
function printActiveShiftLogs() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) {
        alert("No active shift log data available to print.");
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
    });
    
    currentRefundLog.forEach(log => { 
        refundCount += log.qty; 
    });

    for (let itm in itemTotals) { 
        if (itemTotals[itm] > maxQty) { 
            maxQty = itemTotals[itm]; 
            topItem = itm; 
        } 
    }

    let itemsHtml = '';
    let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
    categoryOrder.forEach(cat => {
        let catHeaderPrinted = false;
        for (let itm in itemTotals) {
            if (getItemCategory(itm) === cat) {
                if (!catHeaderPrinted) {
                    itemsHtml += `<div class="report-category-header">${cat}</div>`;
                    catHeaderPrinted = true;
                }
                let wStr = ((itemTotals[itm] * getItemWeight(itm)) / 1000).toFixed(2);
                itemsHtml += `<div class="report-row"><span>&nbsp;&nbsp;${itm.toUpperCase()}</span><span>x${itemTotals[itm]} (${wStr} KG)</span></div>`;
            }
        }
    });

    let timeRangeTitle = shiftStartTime ? `${shiftStartTime} TO LIVE` : 'ACTIVE SHIFT';
    let finalDate = shiftStartDate || activeShiftDate || getCalculatedShiftDate();

    let reportDiv = document.createElement('div');
    reportDiv.className = 'pos-report';
    reportDiv.innerHTML = `
        <div class="brand-main">AHMED HANIF RAJPUT</div>
        <div class="report-title">LIVE SHIFT LOGS REPORT</div>
        <div class="meta-line">DATE: ${finalDate}</div>
        <div class="meta-line">SHIFT BLOCK: ${timeRangeTitle}</div>
        <div class="pos-divider"></div>
        <div class="report-row"><span>GROSS EMITTED:</span><span>${grossCount + refundCount} Units</span></div>
        <div class="report-row"><span>VOIDED EXECUTIONS:</span><span>${refundCount} Units</span></div>
        <div class="report-row" style="border-top:2px solid #000000 !important; padding-top:4px;"><span>NET INVENTORY TOTAL:</span><span>${grossCount} Units</span></div>
        <div class="pos-divider-thin"></div>
        <div style="font-size:11px; font-weight:900; margin-bottom:4px; text-align:center; text-transform:uppercase;">Dynamic Net Mass Quantization</div>
        ${itemsHtml}
        <div class="pos-divider-thin" style="margin-top:6px;"></div>
        <div class="highlight-box">
            <div style="font-size: 11px; font-weight: 900;">MAX LIVE VOLUME</div>
            <div style="font-size: 18px; font-weight: 900; text-transform: uppercase; margin: 2px 0;">${topItem}</div>
            <div style="font-size: 12px; font-weight: 900;">Quantity: ${maxQty}</div>
        </div>
        <div class="pos-divider"></div>
    `;

    printArea.appendChild(reportDiv);
    setTimeout(() => { window.print(); printArea.innerHTML = ''; }, 50);
}

function printTokens() {
    if (Object.keys(currentCart).length === 0) return;
    processAutomatedShiftRollover(); // Double check logic right before a print
    openCustomerModal();
}

// Token Printing Generator 
function executeTokenPrinting(customerName) {
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = ''; 
    let exactTime = getExactTimestamp();

    if (!shiftStartTime) {
        shiftStartTime = exactTime;
        shiftStartDate = activeShiftDate || getCalculatedShiftDate();
        localStorage.setItem('shiftStartTime', shiftStartTime);
        localStorage.setItem('shiftStartDate', shiftStartDate);
    }

    for (let item in currentCart) {
        let qty = currentCart[item];
        
        globalTokenCounter++;
        localStorage.setItem('globalTokenCounter', globalTokenCounter);

        currentDayLog.push({ 
            tokenNum: globalTokenCounter,
            time: exactTime, 
            item: item, 
            qty: qty, 
            customer: customerName 
        });

        let token = document.createElement('div');
        token.className = 'pos-token';
        
        token.innerHTML = `
            <div class="brand-main">AHMED HANIF RAJPUT</div>
            <div style="font-family: Arial, sans-serif !important; font-size: 12px; font-weight: 900; text-align: center; color: #000000 !important; border: 1px solid #000000; padding: 2px 0; margin: 2px 0;">TOKEN NO: ${globalTokenCounter}</div>
            <div class="pos-divider"></div>
            <div class="item-container">
                <div class="pos-item">${item}</div>
                <div class="pos-qty">QUANTITY: [ ${qty} ]</div>
            </div>
            <div class="pos-divider"></div>
            <div class="meta-line">TIMESTAMP: ${exactTime}</div>
            <div style="font-size:12px; font-weight:900; margin-top:4px; text-transform:uppercase; text-align:center;">WORKER NAME: ${customerName}</div>
        `;
        printArea.appendChild(token);
    }
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    setTimeout(() => { window.print(); currentCart = {}; renderCart(); renderLogs(); }, 50);
}

function deleteHistoryItem(index) {
    if (!confirm("Permanently drop selected ledger sequence index container?")) return;
    openPinModal("Management authentication validation parameters active.", "admin", function() {
        allTimeHistory.splice(index, 1);
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        renderLogs();
    });
}

function clearAllHistory() {
    if (!confirm("Purge entire core relational historical index architecture? Warning: Action is terminal.")) return;
    openPinModal("Administrative security credentials requested.", "admin", function() {
        allTimeHistory = [];
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        renderLogs();
    });
}

function saveCurrentShiftToHistory() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) return false;

    let netItems = 0; let grossItemsCount = 0; let summary = {}; let detailedTimeline = [];

    currentDayLog.forEach(log => { 
        netItems += log.qty; grossItemsCount += log.qty;
        summary[log.item] = (summary[log.item] || 0) + log.qty; 
        detailedTimeline.push({time: log.time, type: 'SALE', item: log.item, qty: log.qty, customer: log.customer, tokenNum: log.tokenNum});
    });
    currentRefundLog.forEach(log => {
        grossItemsCount += log.qty;
        detailedTimeline.push({time: log.time, type: 'REFUND', item: log.item, qty: log.qty, customer: log.customer || "Walk-In", tokenNum: log.tokenNum});
    });
    
    detailedTimeline.sort((a, b) => b.time.localeCompare(a.time));
    
    let shiftClosingTime = getExactTimestamp();
    let shiftOpeningTime = shiftStartTime || (currentDayLog.length > 0 ? currentDayLog[0].time : shiftClosingTime);
    let finalShiftDate = activeShiftDate || shiftStartDate || getCalculatedShiftDate();
    
    let dayRecord = { 
        date: finalShiftDate, 
        startTime: shiftOpeningTime,
        endTime: shiftClosingTime,
        totalItems: netItems, 
        grossItems: grossItemsCount,
        refundedItems: currentRefundLog.length, 
        summary: summary, 
        detailedTimeline: detailedTimeline
    };
    allTimeHistory.push(dayRecord);
    localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
    return true;
}

function getAllConsumptionData() {
    let rows = [];
    let liveLabel = activeShiftDate || shiftStartDate || getCalculatedShiftDate();
    currentDayLog.forEach(l => {
        rows.push({ date: liveLabel, shiftId: "LIVE", time: l.time, customer: l.customer || "Walk-In", item: l.item, qty: l.qty, type: "SALE", tokenNum: l.tokenNum });
    });
    currentRefundLog.forEach(r => {
        rows.push({ date: liveLabel, shiftId: "LIVE", time: r.time, customer: r.customer || "Walk-In", item: r.item, qty: r.qty, type: "REFUND", tokenNum: r.tokenNum });
    });
    allTimeHistory.forEach((day, idx) => {
        if (day.detailedTimeline) {
            day.detailedTimeline.forEach(t => {
                let rangeStr = (day.startTime && day.endTime) ? ` [Closed]` : '';
                rows.push({ date: normalizeToSystemDate(day.date) + rangeStr, shiftId: `SHIFT-${idx}`, time: t.time, customer: t.customer || "Walk-In", item: t.item, qty: t.qty, type: t.type, tokenNum: t.tokenNum });
            });
        }
    });
    return rows;
}

function populateFilterOptions() {
    let data = getAllConsumptionData();
    let customers = new Set(); let items = new Set(); let dates = new Set();
    data.forEach(r => {
        if(r.customer) customers.add(r.customer);
        if(r.item) items.add(r.item);
        if(r.date) dates.add(r.date);
    });
    let custSel = document.getElementById('filter-cust');
    let itemSel = document.getElementById('filter-item');
    let dateSel = document.getElementById('filter-date');
    custSel.innerHTML = '<option value="ALL">-- All Registry Profiles --</option>';
    itemSel.innerHTML = '<option value="ALL">-- All Menu Labels --</option>';
    dateSel.innerHTML = '<option value="ALL">-- All Epoch Shifts --</option>';
    customers.forEach(c => custSel.innerHTML += `<option value="${c}">${c}</option>`);
    items.forEach(i => itemSel.innerHTML += `<option value="${i}">${i}</option>`);
    dates.forEach(d => dateSel.innerHTML += `<option value="${d}">${d}</option>`);
}

function populateShiftSelectorOptions() {
    let selector = document.getElementById('rule-shift-selector');
    let currentSelection = selector.value;
    
    let liveRange = shiftStartTime ? ` (Opened: ${shiftStartTime})` : ' (Matrix structural space null)';
    selector.innerHTML = `<option value="LIVE">Active Operational Runtime Engine Segment${liveRange}</option>`;
    
    allTimeHistory.forEach((day, idx) => {
        let label = normalizeToSystemDate(day.date);
        let timeStr = (day.startTime && day.endTime) ? ` (${day.startTime} to ${day.endTime})` : '';
        selector.innerHTML += `<option value="SHIFT-${idx}">Ledger Segment: ${label}${timeStr}</option>`;
    });

    if (currentSelection && selector.querySelector(`option[value="${currentSelection}"]`)) {
        selector.value = currentSelection;
    } else {
        selector.value = "LIVE";
    }
}

function calculateHighConsumptionMatrix(data) {
    let selectedShift = document.getElementById('rule-shift-selector').value;

    let riceVal = document.getElementById('rule-rice-limit').value.trim();
    let curryVal = document.getElementById('rule-curry-limit').value.trim();
    let breadVal = document.getElementById('rule-bread-limit').value.trim();

    let riceLimit = riceVal !== "" ? parseInt(riceVal) : null;
    let curryLimit = curryVal !== "" ? parseInt(curryVal) : null;
    let breadLimit = breadVal !== "" ? parseInt(breadVal) : null;

    let aggregation = {};
    
    data.forEach(r => {
        if (r.shiftId !== selectedShift) return;
        if (r.type !== 'SALE' || r.customer === 'Walk-In') return;
        
        let cat = getItemCategory(r.item);
        let key = `${r.customer}||${r.item}||${cat}`;
        aggregation[key] = (aggregation[key] || 0) + r.qty;
    });
    
    let tbody = document.getElementById('high-consumption-tbody');
    tbody.innerHTML = '';
    let anomaliesFound = false;

    for (let key in aggregation) {
        let [customer, item, category] = key.split('||');
        let totalQty = aggregation[key];
        let shouldFlag = false; 
        let alertMsg = "";
        let calculatedW = ((totalQty * getItemWeight(item)) / 1000).toFixed(2);

        if (category === "Rice" && riceLimit !== null && totalQty >= riceLimit) {
            shouldFlag = true;
            alertMsg = `Rice Limit Breach Alert (≥ ${riceLimit} Units)`;
        } else if (category === "Curry" && curryLimit !== null && totalQty >= curryLimit) {
            shouldFlag = true;
            alertMsg = `Curry Threshold Flagged Trigger (≥ ${curryLimit} Orders)`;
        } else if (category === "Bread" && breadLimit !== null && totalQty >= breadLimit) {
            shouldFlag = true;
            alertMsg = `Bulk Unit Bread Overflow Logic (≥ ${breadLimit} Pieces)`;
        }
        
        if (shouldFlag) {
            anomaliesFound = true;
            let tr = `<tr>
                <td style="font-weight:700; color:var(--text-main);">${customer}</td>
                <td>${item}</td>
                <td style="font-weight:600; color:var(--primary);">${category}</td>
                <td style="text-align:right; font-weight:800; color:var(--danger);">x${totalQty}</td>
                <td style="text-align:right; font-weight:800;">${calculatedW} KG</td>
                <td><span class="flag-pill flag-high">⚠️ ${alertMsg}</span></td>
            </tr>`;
            tbody.insertAdjacentHTML('beforeend', tr);
        }
    }
    if (!anomaliesFound) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px; font-size:13px;">No critical boundary tracking triggers flagged. System context baseline stable.</td></tr>`;
    }
}

function renderConsumptionReport() {
    let data = getAllConsumptionData();
    calculateHighConsumptionMatrix(data);
    let fCust = document.getElementById('filter-cust').value;
    let fItem = document.getElementById('filter-item').value;
    let fDate = document.getElementById('filter-date').value;
    let tbody = document.getElementById('consumption-report-tbody');
    tbody.innerHTML = '';

    let filtered = data.filter(r => {
        if (fCust !== "ALL" && r.customer !== fCust) return false;
        if (fItem !== "ALL" && r.item !== fItem) return false;
        if (fDate !== "ALL" && r.date !== fDate) return false;
        return true;
    });
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No ledger entries matched filter constraint attributes.</td></tr>`;
        return;
    }
    filtered.forEach(r => {
        let statusStyle = r.type === 'REFUND' ? 'color:var(--danger); font-weight:700; background:#fee2e2; padding:4px 8px; border-radius:4px;' : 'color:var(--accent); font-weight:700; background:#dcfce7; padding:4px 8px; border-radius:4px;';
        let qtyStyle = r.type === 'REFUND' ? 'color:var(--danger); font-weight:700; text-align:right;' : 'font-weight:700; text-align:right;';
        let displayQty = r.type === 'REFUND' ? `-${r.qty}` : r.qty;
        let calcWeightKg = ((r.qty * getItemWeight(r.item)) / 1000).toFixed(2);
        let displayWeight = r.type === 'REFUND' ? `-${calcWeightKg}` : calcWeightKg;
        let tokenString = r.tokenNum ? ` [T-#${r.tokenNum}]` : '';
        let dateTimeDisplay = `${r.date}, ${r.time || 'N/A'}${tokenString}`;

        let tr = `<tr>
            <td style="font-weight: 500; color: var(--text-muted); font-size:11px;">${dateTimeDisplay}</td>
            <td style="font-weight:600;">${r.customer}</td>
            <td>${r.item}</td>
            <td style="${qtyStyle}">${displayQty}</td>
            <td style="text-align:right; font-weight:600;">${displayWeight} KG</td>
            <td><span style="${statusStyle}">${r.type}</span></td>
        </tr>`;
        tbody.insertAdjacentHTML('beforeend', tr);
    });
}

function clearConsumptionFilters() {
    document.getElementById('filter-cust').value = "ALL";
    document.getElementById('filter-item').value = "ALL";
    document.getElementById('filter-date').value = "ALL";
    renderConsumptionReport();
}

function exportConsumptionToCSV() {
    let data = getAllConsumptionData();
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

document.getElementById('modal-pin-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitPinModal(); });
document.getElementById('cust-modal-name-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitCustomerModal(); });
document.getElementById('new-manual-customer').addEventListener('keypress', function(e) { if (e.key === 'Enter') addCustomerManually(); });

// Initialization sequence
processAutomatedShiftRollover();
renderCategoryFilters();
renderMenu();
renderLogs();
populateCustomerDatalist();
