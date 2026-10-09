// State Variables
let procedures = [];
let medicines = [];
let history = [];

const $ = id => document.getElementById(id);
const fmt = num => '₱' + Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROOM_RATES = { outpatient: 0, ward: 1000, semi: 2500, private: 5000, icu: 15000 };
const ROOM_LABELS = {
  outpatient: "Outpatient / No Room Stay",
  ward: "General Ward",
  semi: "Semi-Private Room",
  private: "Private Room",
  icu: "ICU - Intensive Care Unit"
};

window.onload = () => {
  const dateDisplay = $('current-date-display');
  if (dateDisplay) {
    dateDisplay.innerText = new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  loadHistory();
  if ($('billingForm')) {
    calculateTotals();
  }
};

async function loadHistory() {
  const stored = localStorage.getItem('metro_billing_history_v2');
  if (stored) {
    try { 
      history = JSON.parse(stored); 
    } catch { 
      await fetchInitialJSON();
    }
  } else {
    await fetchInitialJSON();
  }
  if ($('historyTableBody')) {
    renderHistoryTable();
  }
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

function handleRoomChange() {
  const cat = $('roomCategory').value;
  const daysInput = $('daysStayed');
  const isOutpatient = cat === 'outpatient';

  daysInput.disabled = isOutpatient;
  daysInput.classList.toggle('class-disabled', isOutpatient);

  if (isOutpatient) daysInput.value = 0;
  else if (parseInt(daysInput.value) === 0) daysInput.value = 1;

  $('roomRateNote').innerText = isOutpatient ? "Daily rate: ₱0.00 (Outpatient / Day Visit)" : `Daily rate: ${fmt(ROOM_RATES[cat])}`;
  calculateTotals();
}

function addProcedure() {
  const name = $('procName').value.trim();
  const cost = parseFloat($('procCost').value);

  if (!name || isNaN(cost) || cost < 0) return alert('Please enter a valid procedure name and cost.');

  procedures.push({ id: Date.now(), name, cost });
  $('procName').value =$('procCost').value = '';
  renderProcedures();
  calculateTotals();
  alert(`Added procedure: ${name}`);
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
      <td style="text-align: center;">
        <button type="button" onclick="removeProcedure(${p.id})" style="border: none; background: none; color: #dc2626; cursor: pointer;"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

function addMedicine() {
  const name = $('medName').value.trim();
  const dosage = $('medDosage').value.trim();
  const unit = $('medUnit').value;
  const cost = parseFloat($('medCost').value);

  if (!name || !dosage || isNaN(cost) || cost < 0) return alert('Please enter valid medicine details.');

  medicines.push({ id: Date.now(), name, dosage, unit, cost });
  $('medName').value = $('medDosage').value =$('medCost').value = '';
  renderMedicines();
  calculateTotals();
  alert(`Added medicine: ${name} - ${dosage} ${unit}`);
}

function removeMedicine(id) {
  medicines = medicines.filter(m => m.id !== id);
  renderMedicines();
  calculateTotals();
}

function renderMedicines() {
  const container = $('medicinesList');
  if (!container) return;
  if (!medicines.length) {
    container.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; font-style: italic;">No medicines added yet.</td></tr>`;
    return;
  }
  container.innerHTML = medicines.map(m => `
    <tr>
      <td style="font-weight: bold;">${m.name} - <span style="background: #f1f5f9; padding: 2px 5px; border-radius: 3px; font-family: monospace;">${m.dosage} ${m.unit}</span></td>
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
  const roomTotal = (ROOM_RATES[$('roomCategory').value] || 0) * days;
  const proceduresTotal = procedures.reduce((sum, p) => sum + p.cost, 0);
  const medicinesTotal = medicines.reduce((sum, m) => sum + m.cost, 0);
  const grandTotal = consultationFee + roomTotal + proceduresTotal + medicinesTotal;

  $('summaryConsultation').innerText = fmt(consultationFee);
  $('summaryRoom').innerText = fmt(roomTotal);$('summaryProcedures').innerText = fmt(proceduresTotal);
  $('summaryMedicines').innerText = fmt(medicinesTotal);$('summaryGrandTotal').innerText = fmt(grandTotal);

  return { consultationFee, roomTotal, proceduresTotal, medicinesTotal, grandTotal, days };
}

function handleFormSubmit(e) {
  e.preventDefault();
  const name = $('patientName').value.trim();
  const age = $('patientAge').value;
  const physician = $('attendingPhysician').value.trim();

  if (!name || !age || !physician) return alert('Please complete all required fields.');

  const totals = calculateTotals();
  const roomCat = $('roomCategory').value;

  const newRecord = {
    id: 'INV-' + Math.floor(100000 + Math.random() * 900000),
    formattedDate: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    patientName: name,
    patientAge: age,
    patientGender: $('patientGender').value,
    physician: physician,
    roomCategoryLabel: ROOM_LABELS[roomCat],
    daysStayed: totals.days,
    dailyRate: ROOM_RATES[roomCat],
    consultationFee: totals.consultationFee,
    roomTotal: totals.roomTotal,
    proceduresTotal: totals.proceduresTotal,
    medicinesTotal: totals.medicinesTotal,
    grandTotal: totals.grandTotal,
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

function renderHistoryTable() {
  const tbody = $('historyTableBody');
  if (!tbody) return;
  const searchInput = $('historySearch');
  const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
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
      <td>${r.daysStayed > 0 ? `${r.roomCategoryLabel} (${r.daysStayed} days)` : 'Outpatient (0 days)'}</td>
      <td>${r.procedures.length} Procedure(s), ${r.medicines.length} Medicine(s)</td>
      <td style="text-align: right; font-family: monospace; font-weight: bold; color: #2563eb;">${fmt(r.grandTotal)}</td>
      <td style="text-align: center;">
        <button onclick="openInvoiceModal('${r.id}')" class="class19" style="padding: 4px 8px; width: auto; margin-right: 4px;"><i class="fa-solid fa-file-invoice"></i> Invoice</button>
        <button onclick="deleteRecord('${r.id}')" class="class25" style="padding: 4px 8px; color: #dc2626; font-weight: bold;"><i class="fa-solid fa-trash-can"></i> Delete</button>
      </td>
    </tr>
  `).join('');
}

function openInvoiceModal(recordId) {
  const r = history.find(item => item.id === recordId);
  if (!r) return;

  $('inv-id').innerText = r.id;
  $('inv-date').innerText = r.formattedDate;
  $('inv-patientName').innerText = r.patientName;
  $('inv-patientInfo').innerText = `${r.patientAge} Years Old / ${r.patientGender}`;
  $('inv-physician').innerText = r.physician;
  $('inv-roomCategory').innerText = `${r.roomCategoryLabel} (${r.daysStayed} days Stayed)`;

  let itemsHtml = `<tr><td style="font-weight: bold;">Physician Consultation Fee</td><td style="text-align: center; color: #64748b;">Consultation</td><td style="text-align: right; font-family: monospace;">${fmt(r.consultationFee)}</td></tr>`;

  if (r.daysStayed > 0) {
    itemsHtml += `<tr><td style="font-weight: bold;">${r.roomCategoryLabel} (${r.daysStayed} days @ ₱${r.dailyRate.toLocaleString()}/day)</td><td style="text-align: center; color: #64748b;">Accommodation</td><td style="text-align: right; font-family: monospace;">${fmt(r.roomTotal)}</td></tr>`;
  }

  r.procedures.forEach(p => {
    itemsHtml += `<tr><td style="font-weight: bold;">${p.name}</td><td style="text-align: center; color: #64748b;">Procedure/Lab</td><td style="text-align: right; font-family: monospace;">${fmt(p.cost)}</td></tr>`;
  });

  r.medicines.forEach(m => {
    itemsHtml += `<tr><td style="font-weight: bold;">${m.name} - ${m.dosage} ${m.unit}</td><td style="text-align: center; color: #64748b;">Pharmacy</td><td style="text-align: right; font-family: monospace;">${fmt(m.cost)}</td></tr>`;
  });

  $('inv-itemsTable').innerHTML = itemsHtml;
  $('inv-subConsultation').innerText = fmt(r.consultationFee);
  $('inv-subRoom').innerText = fmt(r.roomTotal);$('inv-subProcedures').innerText = fmt(r.proceduresTotal);
  $('inv-subMedicines').innerText = fmt(r.medicinesTotal);$('inv-grandTotal').innerText = fmt(r.grandTotal);

  $('invoiceModal').classList.remove('class28');
}

function closeInvoiceModal() { $('invoiceModal').classList.add('class28'); }
function printInvoice() { window.print(); }

function deleteRecord(id) {
  if (confirm(`Are you sure you want to delete billing record ${id}?`)) {
    history = history.filter(r => r.id !== id);
    saveHistory();
    renderHistoryTable();
    alert('Record deleted permanently.');
  }
}