// Centralized Persistent State Management
let procedures = [];
let medicines = [];
let history = [];
let selectedPaymentRecord = null;

// Default Room Accommodation Rates & Service Catalog
const DEFAULT_ROOM_RATES = [
  { code: 'OPD', name: 'Outpatient / No Room Stay', category: 'Accommodation', unit: 'Per day', cost: 0.00 },
  { code: 'WARD', name: 'General Ward', category: 'Accommodation', unit: 'Per day', cost: 1000.00 },
  { code: 'SEMI', name: 'Semi-Private Room', category: 'Accommodation', unit: 'Per day', cost: 2000.00 },
  { code: 'SUITE', name: 'Private Suite', category: 'Accommodation', unit: 'Per day', cost: 4000.00 },
  { code: 'ICU', name: 'ICU - Intensive Care Unit', category: 'Accommodation', unit: 'Per day', cost: 8000.00 }
];

const DEFAULT_SERVICE_RATES = [
  { code: 'CON-001', name: 'Physician Consultation Fee', category: 'Consultation', unit: 'Per visit', cost: 500.00 },
  { code: 'RAD-001', name: 'X-Ray', category: 'Radiology', unit: 'Per procedure', cost: 500.00 },
  { code: 'LAB-001', name: 'Complete Blood Count (CBC)', category: 'Laboratory', unit: 'Per test', cost: 350.00 },
  { code: 'LAB-002', name: 'Urinalysis', category: 'Laboratory', unit: 'Per test', cost: 150.00 },
  { code: 'RAD-002', name: 'Abdominal Ultrasound', category: 'Radiology', unit: 'Per procedure', cost: 1200.00 },
  { code: 'PRC-001', name: 'Wound Dressing', category: 'Procedure', unit: 'Per procedure', cost: 300.00 },
  { code: 'DIA-001', name: 'Electrocardiogram (ECG)', category: 'Diagnostics', unit: 'Per procedure', cost: 650.00 }
];

const $ = id => document.getElementById(id);
const fmt = num => '₱' + Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Load stored rates or fallback to defaults
function getStoredRates() {
  const saved = localStorage.getItem('pasig_health_service_rates_v1');
  if (saved) {
    try { return JSON.parse(saved); } catch { return [...DEFAULT_ROOM_RATES, ...DEFAULT_SERVICE_RATES]; }
  }
  const initial = [...DEFAULT_ROOM_RATES, ...DEFAULT_SERVICE_RATES];
  localStorage.setItem('pasig_health_service_rates_v1', JSON.stringify(initial));
  return initial;
}

function saveStoredRates(rates) {
  localStorage.setItem('pasig_health_service_rates_v1', JSON.stringify(rates));
}

window.onload = () => {
  const dateDisplay = $('current-date-display');
  if (dateDisplay) {
    dateDisplay.innerText = new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  loadHistory();
  if ($('billingForm')) initBillingForm();
  if ($('roomRatesTableBody')) renderRatesCatalog();
};

async function loadHistory() {
  const stored = localStorage.getItem('metro_billing_history_v2');
  if (stored) {
    try { history = JSON.parse(stored); } catch { await fetchInitialJSON(); }
  } else {
    await fetchInitialJSON();
  }
  if ($('historyTableBody')) renderHistoryTable();
  if ($('reportsTableBody')) renderReports();
  if ($('paySearchInput')) loadInitialPaymentInvoice();
}

async function fetchInitialJSON() {
  try {
    const res = await fetch('data/history.json');
    history = await res.json();
    saveHistory();
  } catch (e) {
    history = [];
  }
}

function saveHistory() {
  localStorage.setItem('metro_billing_history_v2', JSON.stringify(history));
}

/* ==========================================================================
   BILLING FORM & RATES SYNC
   ========================================================================== */
function initBillingForm() {
  const allRates = getStoredRates();
  const roomSelect = $('roomCategory');
  const procSelect = $('procSelectCatalog');

  if (roomSelect) {
    const rooms = allRates.filter(r => r.category === 'Accommodation');
    roomSelect.innerHTML = rooms.map(r => `<option value="${r.code}" data-cost="${r.cost}">${r.name} (${fmt(r.cost)} / day)</option>`).join('');
  }

  if (procSelect) {
    const procs = allRates.filter(r => r.category !== 'Accommodation');
    procSelect.innerHTML = `<option value="">-- Choose from Room & Service Rates --</option>` + 
      procs.map(p => `<option value="${p.code}" data-name="${p.name}" data-cost="${p.cost}">${p.name} - ${fmt(p.cost)}</option>`).join('');
  }

  handleRoomChange();
  calculateTotals();
}

function fillProcedureRate() {
  const select = $('procSelectCatalog');
  const opt = select.options[select.selectedIndex];
  if (opt && opt.value) {
    $('procName').value = opt.getAttribute('data-name');$('procCost').value = opt.getAttribute('data-cost');
  }
}

function handleRoomChange() {
  const roomSelect = $('roomCategory');
  if (!roomSelect) return;
  const opt = roomSelect.options[roomSelect.selectedIndex];
  const dailyRate = opt ? parseFloat(opt.getAttribute('data-cost')) || 0 : 0;
  const isOutpatient = roomSelect.value === 'OPD' || dailyRate === 0;

  const daysInput = $('daysStayed');
  daysInput.disabled = isOutpatient;
  daysInput.classList.toggle('class-disabled', isOutpatient);

  if (isOutpatient) daysInput.value = 0;
  else if (parseInt(daysInput.value) === 0) daysInput.value = 1;

  $('roomRateNote').innerText = isOutpatient ? "Daily rate: ₱0.00 (Outpatient / Day Visit)" : `Daily rate: ${fmt(dailyRate)}`;
  calculateTotals();
}

function addProcedure() {
  const name = $('procName').value.trim();
  const cost = parseFloat($('procCost').value);
  if (!name || isNaN(cost) || cost < 0) return alert('Please enter a valid procedure name and cost.');

  procedures.push({ id: Date.now(), name, cost });
  $('procName').value =$('procCost').value = '';
  if ($('procSelectCatalog'))$('procSelectCatalog').selectedIndex = 0;
  renderProcedures();
  calculateTotals();
}

function removeProcedure(id) {
  procedures = procedures.filter(p => p.id !== id);
  renderProcedures();
  calculateTotals();
}

function renderProcedures() {
  const container = $('proceduresList');
  if (!container) return;
  if (!procedures.length) {
    container.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; font-style: italic;">No procedures added yet.</td></tr>`;
    return;
  }
  container.innerHTML = procedures.map(p => `
    <tr>
      <td style="font-weight: bold;">${p.name}</td>
      <td style="text-align: right; font-family: monospace;">${fmt(p.cost)}</td>
      <td style="text-align: center;"><button type="button" onclick="removeProcedure(${p.id})" style="border:none;background:none;color:#dc2626;cursor:pointer;"><i class="fa-solid fa-trash-can"></i></button></td>
    </tr>
  `).join('');
}

function addMedicine() {
  const name = $('medName').value.trim();
  const dosage = $('medDosage').value.trim();
  const unit = $('medUnit').value;
  const qty = parseInt($('medQty').value) || 1;
  const unitCost = parseFloat($('medUnitCost').value);

  if (!name || !dosage || isNaN(unitCost) || unitCost < 0) return alert('Please enter valid medicine details.');

  const totalCost = qty * unitCost;

  medicines.push({ id: Date.now(), name, dosage, unit, qty, unitCost, cost: totalCost });
  $('medName').value =$('medDosage').value = $('medUnitCost').value = '';$('medQty').value = '1';
  renderMedicines();
  calculateTotals();
}

function renderMedicines() {
  const container = $('medicinesList');
  if (!container) return;
  if (!medicines.length) {
    container.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; font-style: italic;">No medicines added yet.</td></tr>`;
    return;
  }
  container.innerHTML = medicines.map(m => `
    <tr>
      <td style="font-weight: bold;">${m.name} - <span style="background: #f1f5f9; padding: 2px 5px; border-radius: 3px; font-family: monospace;">${m.dosage} ${m.unit}</span></td>
      <td style="text-align: center;">${m.qty} @ ${fmt(m.unitCost)}</td>
      <td style="text-align: right; font-family: monospace;">${fmt(m.cost)}</td>
      <td style="text-align: center;">
        <button type="button" onclick="removeMedicine(${m.id})" style="border: none; background: none; color: #dc2626; cursor: pointer;"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

function calculateTotals() {
  if (!$('consultationFee')) return;
  const consultationFee = parseFloat($('consultationFee').value) || 0;
  const days = parseInt($('daysStayed').value) || 0;
  
  const roomSelect = $('roomCategory');
  const opt = roomSelect ? roomSelect.options[roomSelect.selectedIndex] : null;
  const dailyRate = opt ? parseFloat(opt.getAttribute('data-cost')) || 0 : 0;
  const roomTotal = dailyRate * days;

  const proceduresTotal = procedures.reduce((sum, p) => sum + p.cost, 0);
  const medicinesTotal = medicines.reduce((sum, m) => sum + m.cost, 0);
  const grandTotal = consultationFee + roomTotal + proceduresTotal + medicinesTotal;

  $('summaryConsultation').innerText = fmt(consultationFee);
  $('summaryRoom').innerText = fmt(roomTotal);$('summaryProcedures').innerText = fmt(proceduresTotal);
  $('summaryMedicines').innerText = fmt(medicinesTotal);$('summaryGrandTotal').innerText = fmt(grandTotal);

  return { consultationFee, roomTotal, proceduresTotal, medicinesTotal, grandTotal, days, dailyRate, roomLabel: opt ? opt.text : '' };
}

function handleFormSubmit(e) {
  e.preventDefault();
  const name = $('patientName').value.trim();
  const age = $('patientAge').value;
  const physician = $('attendingPhysician').value.trim();
  if (!name || !age || !physician) return alert('Please complete all required fields.');

  const totals = calculateTotals();

  const newRecord = {
    id: 'INV-' + Math.floor(100000 + Math.random() * 900000),
    formattedDate: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    patientName: name,
    patientAge: age,
    patientGender: $('patientGender').value,
    physician: physician,
    roomCategoryLabel: totals.roomLabel,
    daysStayed: totals.days,
    dailyRate: totals.dailyRate,
    consultationFee: totals.consultationFee,
    roomTotal: totals.roomTotal,
    proceduresTotal: totals.proceduresTotal,
    medicinesTotal: totals.medicinesTotal,
    grandTotal: totals.grandTotal,
    amountPaid: 0,
    status: 'Unpaid',
    procedures: [...procedures],
    medicines: [...medicines]
  };

  history.unshift(newRecord);
  saveHistory();
  alert('Patient record saved successfully!');
  openInvoiceModal(newRecord.id);
  resetBillingForm();
}

function resetBillingForm() {
  $('billingForm').reset();
  procedures = [];
  medicines = [];
  renderProcedures();
  renderMedicines();
  handleRoomChange();
}

/* ==========================================================================
   ROOM & SERVICE RATES CATALOG MANAGEMENT
   ========================================================================== */
function renderRatesCatalog() {
  const rates = getStoredRates();
  const roomTBody = $('roomRatesTableBody');
  const serviceTBody = $('serviceRatesTableBody');

  if (roomTBody) {
    const rooms = rates.filter(r => r.category === 'Accommodation');
    roomTBody.innerHTML = rooms.map(r => `
      <tr>
        <td style="font-family: monospace;">${r.code}</td>
        <td style="font-weight: bold;">${r.name}</td>
        <td style="color: #64748b;">${r.unit}</td>
        <td style="text-align: right; font-weight: bold; font-family: monospace;">${fmt(r.cost)}</td>
      </tr>
    `).join('');
  }

  if (serviceTBody) {
    const services = rates.filter(r => r.category !== 'Accommodation');
    serviceTBody.innerHTML = services.map(r => `
      <tr>
        <td style="font-family: monospace; font-weight: bold; color: #2563eb;">${r.code}</td>
        <td style="font-weight: bold;">${r.name}</td>
        <td>${r.category}</td>
        <td style="color: #64748b;">${r.unit}</td>
        <td style="text-align: right; font-weight: bold; font-family: monospace;">${fmt(r.cost)}</td>
      </tr>
    `).join('');
  }
}

function toggleRateForm(showForm) {
  if ($('rateCatalogView'))$('rateCatalogView').style.display = showForm ? 'none' : 'block';
  if ($('addRateFormView'))$('addRateFormView').style.display = showForm ? 'block' : 'none';
}

function saveNewRate(e) {
  e.preventDefault();
  const code = $('newRateCode').value.trim();
  const name = $('newRateName').value.trim();
  const category = $('newRateCategory').value;
  const unit = $('newRateUnit').value;
  const cost = parseFloat($('newRateAmount').value) || 0;

  if (!code || !name) return alert('Please complete all required fields.');

  const rates = getStoredRates();
  rates.push({ code, name, category, unit, cost });
  saveStoredRates(rates);

  renderRatesCatalog();
  toggleRateForm(false);
  if ($('rateSavedAlert')) {$('alertRateTitle').innerText = `Rate saved successfully: ${code} - ${name} (${fmt(cost)})`;
    $('rateSavedAlert').style.display = 'block';
  }
}

/* ==========================================================================
   RECORDS & HISTORY MODULE
   ========================================================================== */
function renderHistoryTable() {
  const tbody = $('historyTableBody');
  if (!tbody) return;
  const search = $('historySearch') ?$('historySearch').value.toLowerCase().trim() : '';
  const filtered = history.filter(r => r.patientName.toLowerCase().includes(search) || r.id.toLowerCase().includes(search) || r.physician.toLowerCase().includes(search));

  if ($('recordCount'))$('recordCount').innerText = filtered.length;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">No patient billing records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td style="font-family: monospace;"><strong>${r.id}</strong><br><span style="font-size: 11px; color: #64748b;">${r.formattedDate}</span></td>
      <td><strong>${r.patientName}</strong><br><span style="font-size: 11px; color: #64748b;">${r.patientAge} yrs • ${r.patientGender} • ${r.physician}</span></td>
      <td>${r.daysStayed > 0 ? `${r.roomCategoryLabel} (${r.daysStayed} days)` : 'Outpatient'}</td>
      <td>${r.procedures.length} Procedure(s), ${r.medicines.length} Medicine(s)</td>
      <td style="text-align: right; font-family: monospace; font-weight: bold; color: #2563eb;">${fmt(r.grandTotal)}</td>
      <td style="text-align: center;">
        <button onclick="openInvoiceModal('${r.id}')" class="class19" style="padding: 4px 8px; width: auto; margin-right: 4px;"><i class="fa-solid fa-file-invoice"></i> Invoice</button>
        <button onclick="deleteRecord('${r.id}')" class="class25" style="padding: 4px 8px; color: #dc2626; font-weight: bold;"><i class="fa-solid fa-trash-can"></i> Delete</button>
      </td>
    </tr>
  `).join('');
}

/* ==========================================================================
   PAYMENT COLLECTION MODULE
   ========================================================================== */
function loadInitialPaymentInvoice() {
  if (history.length > 0) selectInvoiceForPayment(history[0]);
}

function handlePaymentSearch() {
  const query = $('paySearchInput').value.trim().toUpperCase();
  const rec = history.find(r => r.id === query || r.patientName.toUpperCase().includes(query));
  if (!rec) return alert('Invoice not found.');
  selectInvoiceForPayment(rec);
}

function selectInvoiceForPayment(rec) {
  selectedPaymentRecord = rec;
  const paid = rec.amountPaid || 0;
  const balance = Math.max(0, rec.grandTotal - paid);

  $('invHeaderId').innerText = rec.id;
  $('invHeaderPatient').innerText = rec.patientName;
  $('cardDueAmount').innerText = fmt(balance);$('payTenderedInput').value = balance > 0 ? balance : 0;
  updateReceiptPreview();
}

function updateReceiptPreview() {
  if (!selectedPaymentRecord) return;
  const rec = selectedPaymentRecord;
  const balance = Math.max(0, rec.grandTotal - (rec.amountPaid || 0));
  const tendered = parseFloat($('payTenderedInput').value) || 0;
  const change = Math.max(0, tendered - balance);

  $('payChangeOutput').innerText = fmt(change);
  $('prevGrandTotal').innerText = fmt(rec.grandTotal);$('prevChange').innerText = fmt(change);
}

function submitPaymentAndPost() {
  if (!selectedPaymentRecord) return;
  selectedPaymentRecord.amountPaid = selectedPaymentRecord.grandTotal;
  selectedPaymentRecord.status = 'Paid';
  saveHistory();

  $('paymentActiveWorkflow').style.display = 'none';
  $('officialReceiptView').style.display = 'block';$('rcptSummaryText').innerText = `Official Receipt issued for ${selectedPaymentRecord.id} (${fmt(selectedPaymentRecord.grandTotal)} paid in full).`;
}

/* ==========================================================================
   BILLING REPORTS MODULE
   ========================================================================== */
function renderReports() {
  const tbody = $('reportsTableBody');
  if (!tbody) return;

  let totalBilled = 0;
  let totalCollected = 0;

  tbody.innerHTML = history.map(r => {
    const paid = r.amountPaid || 0;
    const balance = Math.max(0, r.grandTotal - paid);
    const status = r.status || (balance === 0 ? 'Paid' : 'Unpaid');

    totalBilled += r.grandTotal;
    totalCollected += paid;

    let statusColor = '#16a34a';
    if (status === 'Unpaid') statusColor = '#dc2626';

    return `
      <tr>
        <td style="font-family: monospace;"><strong>${r.id}</strong><br><span style="font-size: 11px; color: #64748b;">${r.formattedDate}</span></td>
        <td><strong>${r.patientName}</strong><br><span style="font-size: 11px; color: #64748b;">${r.patientAge} yrs • ${r.patientGender}</span></td>
        <td>${r.daysStayed > 0 ? 'Inpatient' : 'Outpatient'}</td>
        <td style="text-align: right; font-family: monospace; color: #2563eb;">${fmt(r.grandTotal)}</td>
        <td style="text-align: right; font-family: monospace; color: #16a34a;">${fmt(paid)}</td>
        <td style="text-align: right; font-family: monospace; color: #dc2626;">${fmt(balance)}</td>
        <td style="text-align: center;"><span style="color: ${statusColor}; font-weight: bold;">${status}</span></td>
      </tr>
    `;
  }).join('');

  if ($('repTotalBilled'))$('repTotalBilled').innerText = fmt(totalBilled);
  if ($('repCollected'))$('repCollected').innerText = fmt(totalCollected);
  if ($('repBalance'))$('repBalance').innerText = fmt(Math.max(0, totalBilled - totalCollected));
  if ($('repPatientCount'))$('repPatientCount').innerText = history.length;
}

/* ==========================================================================
   INVOICE MODAL HELPERS
   ========================================================================== */
function openInvoiceModal(recordId) {
  const r = history.find(item => item.id === recordId);
  if (!r) return;

  $('inv-id').innerText = r.id;
  $('inv-date').innerText = r.formattedDate;
  $('inv-patientName').innerText = r.patientName;
  $('inv-patientInfo').innerText = `${r.patientAge} Years Old / ${r.patientGender}`;
  $('inv-physician').innerText = r.physician;
  $('inv-roomCategory').innerText = `${r.roomCategoryLabel} (${r.daysStayed} days)`;

  let itemsHtml = `<tr><td style="font-weight: bold;">Physician Consultation Fee</td><td style="text-align: center;">Consultation</td><td style="text-align: right;">${fmt(r.consultationFee)}</td></tr>`;
  if (r.daysStayed > 0) {
    itemsHtml += `<tr><td style="font-weight: bold;">${r.roomCategoryLabel}</td><td style="text-align: center;">Accommodation</td><td style="text-align: right;">${fmt(r.roomTotal)}</td></tr>`;
  }
  r.procedures.forEach(p => {
    itemsHtml += `<tr><td style="font-weight: bold;">${p.name}</td><td style="text-align: center;">Procedure</td><td style="text-align: right;">${fmt(p.cost)}</td></tr>`;
  });
  r.medicines.forEach(m => {
    itemsHtml += `<tr><td style="font-weight: bold;">${m.name} (${m.dosage}) x ${m.qty}</td><td style="text-align: center;">Pharmacy</td><td style="text-align: right;">${fmt(m.cost)}</td></tr>`;
  });

  $('inv-itemsTable').innerHTML = itemsHtml;
  $('inv-subConsultation').innerText = fmt(r.consultationFee);
  $('inv-subRoom').innerText = fmt(r.roomTotal);$('inv-subProcedures').innerText = fmt(r.proceduresTotal);
  $('inv-subMedicines').innerText = fmt(r.medicinesTotal);$('inv-grandTotal').innerText = fmt(r.grandTotal);

  $('invoiceModal').classList.remove('class28');
}

function closeInvoiceModal() { $('invoiceModal').classList.add('class28'); }

function deleteRecord(id) {
  if (confirm(`Are you sure you want to delete billing record ${id}?`)) {
    history = history.filter(r => r.id !== id);
    saveHistory();
    renderHistoryTable();
    renderReports();
    alert('Record deleted permanently.');
  }
}