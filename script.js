// Local Persistence & State Engine Configuration
let isAdminLoggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
let adminPassword = localStorage.getItem('adminPassword') || 'smoekys';
let currentModalMode = 'login'; 

// Sequential Automated Token Engine Tracker Initialization
let currentTokenCounter = parseInt(localStorage.getItem('currentTokenCounter')) || 1001;
let activeTokensDatabase = JSON.parse(localStorage.getItem('activeTokensDatabase')) || {};

// Wire Up Document Interface Load Lifecycle Listeners Safely
document.addEventListener('DOMContentLoaded', () => {
  updateAdminUI();
});

function updateAdminUI() {
  const statusEl = document.getElementById('adminStatus');
  const actionBtn = document.getElementById('adminActionBtn');
  const changeBtn = document.getElementById('changePassBtn');

  if (!statusEl || !actionBtn || !changeBtn) return;

  if (isAdminLoggedIn) {
    statusEl.textContent = 'Admin Mode (Active)';
    statusEl.className = 'admin-status logged-in';
    actionBtn.textContent = 'Log Out';
    actionBtn.className = 'admin-btn admin-btn-logout';
    changeBtn.style.display = 'inline-block';
  } else {
    statusEl.textContent = 'Staff Mode';
    statusEl.className = 'admin-status';
    actionBtn.textContent = 'Log In';
    actionBtn.className = 'admin-btn';
    changeBtn.style.display = 'none';
  }
}

// Authentication Engine Controls Implementation
function handleAdminAction() {
  if (isAdminLoggedIn) {
    isAdminLoggedIn = false;
    localStorage.setItem('isAdminLoggedIn', 'false');
    updateAdminUI();
  } else {
    currentModalMode = 'login';
    document.getElementById('adminModalTitle').textContent = 'Admin Authentication';
    document.getElementById('adminModalDesc').textContent = 'Enter your password to access global bypass mode.';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminModal').style.display = 'flex';
  }
}

function openPasswordModal() {
  currentModalMode = 'change';
  document.getElementById('adminModalTitle').textContent = 'Change Admin Password';
  document.getElementById('adminModalDesc').textContent = 'Set a new secure password for this device.';
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminModal').style.display = 'flex';
}

function closeAdminModal() {
  document.getElementById('adminModal').style.display = 'none';
}

function submitAdminPassword() {
  const inputVal = document.getElementById('adminPasswordInput').value;

  if (currentModalMode === 'login') {
    if (inputVal === adminPassword) {
      isAdminLoggedIn = true;
      localStorage.setItem('isAdminLoggedIn', 'true');
      closeAdminModal();
      updateAdminUI();
    } else {
      alert('Incorrect password!');
    }
  } else if (currentModalMode === 'change') {
    if (inputVal.trim().length < 4) {
      alert('Password must be at least 4 characters long.');
      return;
    }
    adminPassword = inputVal;
    localStorage.setItem('adminPassword', adminPassword);
    alert('Password updated successfully!');
    closeAdminModal();
  }
}

/**
 * NEW ADVANCED FEATURE: Auto-Assign Token Database Engine
 * Run this logic within your successful order checkout callback blocks.
 */
function autoAssignNewToken(orderTotalAmount) {
  const assignedToken = currentTokenCounter++;
  
  activeTokensDatabase[assignedToken] = {
    amount: orderTotalAmount,
    timestamp: new Date().toLocaleString(),
    status: "Paid"
  };
  
  localStorage.setItem('currentTokenCounter', currentTokenCounter);
  localStorage.setItem('activeTokensDatabase', JSON.stringify(activeTokensDatabase));
  
  return assignedToken;
}

/**
 * NEW ADVANCED FEATURE: Navbar POS Customer Token Refund Automation Entry Point
 * Completely bypasses security validations if an active Admin session is running.
 */
function triggerTokenRefund() {
  const tokenInput = prompt("Enter Token Number to process refund:");
  if (!tokenInput) return;

  const targetTokenId = tokenInput.trim();

  // Validate existence inside system database
  if (!activeTokensDatabase[targetTokenId]) {
    alert("Token ID not found inside database storage parameters.");
    return;
  }

  if (activeTokensDatabase[targetTokenId].status === "Refunded") {
    alert("Error Validation: This target token reference has already been processed as refunded.");
    return;
  }

  // Bypass Switch Check
  if (isAdminLoggedIn) {
    executeRefundProcessing(targetTokenId);
  } else {
    // Standard validation route context for employees
    const securityConfirm = prompt(`Admin approval needed. Enter system password to refund Token #${targetTokenId}:`);
    if (securityConfirm === adminPassword) {
      executeRefundProcessing(targetTokenId);
    } else {
      alert("Authorization Denied: Invalid security password provided.");
    }
  }
}

function executeRefundProcessing(tokenId) {
  activeTokensDatabase[tokenId].status = "Refunded";
  localStorage.setItem('activeTokensDatabase', JSON.stringify(activeTokensDatabase));
  alert(`Success Execution: Token #${tokenId} has been completely refunded.`);
}
