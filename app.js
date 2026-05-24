const STORE_KEY = "elements-dashboard-records-v1";
const ADMIN_KEY = "elements-dashboard-admin-v1";
const ADMIN_USER = "admin";
const ADMIN_PASS = "elements@2026";

const state = {
  activeCategory: "all",
  query: "",
  admin: sessionStorage.getItem(ADMIN_KEY) === "true",
  categories: [],
  dbMode: "local",
  chartPrefs: {},
};

const palette = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#9333ea", "#0891b2", "#db2777", "#475569"];

const els = {
  nav: document.querySelector("#categoryNav"),
  pageTitle: document.querySelector("#pageTitle"),
  search: document.querySelector("#globalSearch"),
  stats: document.querySelector("#statsGrid"),
  primaryChartTitle: document.querySelector("#primaryChartTitle"),
  categoryChart: document.querySelector("#categoryChart"),
  breakdownChart: document.querySelector("#breakdownChart"),
  breakdownTitle: document.querySelector("#breakdownTitle"),
  primaryChartControls: document.querySelector("#primaryChartControls"),
  secondaryChartControls: document.querySelector("#secondaryChartControls"),
  resultTitle: document.querySelector("#resultTitle"),
  recordsList: document.querySelector("#recordsList"),
  addRecordBtn: document.querySelector("#addRecordBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  detailDialog: document.querySelector("#detailDialog"),
  dialogCategory: document.querySelector("#dialogCategory"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  dialogActions: document.querySelector("#dialogActions"),
  adminDialog: document.querySelector("#adminDialog"),
  adminForm: document.querySelector("#adminForm"),
  adminToggle: document.querySelector("#adminToggle"),
  adminState: document.querySelector("#adminState"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadData() {
  const config = window.ELEMENTS_APP_CONFIG || {};
  const saved = localStorage.getItem(STORE_KEY);
  state.categories = saved ? JSON.parse(saved) : clone(window.ELEMENTS_SEED_DATA.categories);

  if (config.database === "mongodb") {
    await loadMongoData(config);
    return;
  }

  state.dbMode = "local";
}

async function loadMongoData(config) {
  state.dbMode = "mongodb";
  const apiBaseUrl = (config.apiBaseUrl || "").replace(/\/$/, "");
  const apiRoot = apiBaseUrl || window.location.origin;

  try {
    const response = await fetch(`${apiRoot}/api/assets`);
    if (!response.ok) {
      let detail = `API returned ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload.error) detail = errorPayload.error;
      } catch {
        detail = `API returned ${response.status}`;
      }
      throw new Error(detail);
    }
    const data = await response.json();
    const byCategory = data.reduce((acc, item) => {
      acc[item.categoryId] ||= [];
      acc[item.categoryId].push({
        id: item.id,
        categoryId: item.categoryId,
        displayName: item.displayName,
        fields: item.fields || {},
      });
      return acc;
    }, {});

    state.categories = clone(window.ELEMENTS_SEED_DATA.categories).map((category) => ({
      ...category,
      records: byCategory[category.id] || [],
    }));
  } catch (error) {
    alert(`MongoDB API is not available. Start the Python server first. Using local data for now. ${error.message}`);
    state.dbMode = "local";
  }
}

function saveData() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.categories));
}

async function persistRecord(category, record) {
  saveData();
  if (state.dbMode === "mongodb") {
    const apiBaseUrl = (window.ELEMENTS_APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const apiRoot = apiBaseUrl || window.location.origin;
    const response = await fetch(`${apiRoot}/api/assets/${encodeURIComponent(record.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: record.id,
        categoryId: category.id,
        categoryTitle: category.title,
        displayName: record.displayName,
        fields: record.fields,
      }),
    });
    if (!response.ok) {
      let detail = `MongoDB update failed: ${response.status}`;
      try {
        const payload = await response.json();
        if (payload.error) detail = payload.error;
      } catch {
        detail = `MongoDB update failed: ${response.status}`;
      }
      throw new Error(detail);
    }
    return;
  }
}

async function removeRecordOnline(recordId) {
  saveData();
  if (state.dbMode === "mongodb") {
    const apiBaseUrl = (window.ELEMENTS_APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const apiRoot = apiBaseUrl || window.location.origin;
    const response = await fetch(`${apiRoot}/api/assets/${encodeURIComponent(recordId)}`, { method: "DELETE" });
    if (!response.ok) {
      let detail = `MongoDB delete failed: ${response.status}`;
      try {
        const payload = await response.json();
        if (payload.error) detail = payload.error;
      } catch {
        detail = `MongoDB delete failed: ${response.status}`;
      }
      throw new Error(detail);
    }
    return;
  }
}

function getActiveCategory() {
  return state.categories.find((category) => category.id === state.activeCategory);
}

function allRecords() {
  return state.categories.flatMap((category) =>
    category.records.map((record) => ({ record, category }))
  );
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function recordText(record) {
  return [record.displayName, ...Object.values(record.fields)].map(normalize).join(" ");
}

function filteredRecords() {
  const query = normalize(state.query).trim();
  return allRecords().filter(({ record, category }) => {
    const categoryMatches = state.activeCategory === "all" || category.id === state.activeCategory;
    const searchMatches = !query || recordText(record).includes(query);
    return categoryMatches && searchMatches;
  });
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toFixed(2);
  return value;
}

function getPrimaryFields(category, record) {
  return category.summaryFields
    .filter((field) => Object.prototype.hasOwnProperty.call(record.fields, field))
    .map((field) => ({ field, value: record.fields[field] }))
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
}

function getBreakdownField(category) {
  const candidates = [
    "Category",
    "Voltage Level",
    "Voltage Level (in X/Y/Z kV)",
    "voltage   (kV)",
    "voltage (kV)",
    "Type of Fuel",
    "Owner",
    "Ownership",
  ];
  return candidates.find((field) => category.fields.includes(field)) || category.fields[0];
}

function getPreferredFields(category) {
  const candidatesByCategory = {
    substations: [
      "Location (State/UT)",
      "Voltage Level (in X/Y/Z kV)",
      "Ownership",
      "Bus type (Load/Generator/Switching)",
      "AIS/GIS/\nAIS+GIS",
      "Category",
    ],
    transmission_lines: [
      "Category",
      "voltage   (kV)",
      "O&M by",
      "Owner at End-I",
      "Owner at End-II",
      "Tower Configuration   (S/C or D/C or M/C) ",
      "Type of conductor",
    ],
    ict_data: [
      "Category",
      "Voltage Level",
      "Owner",
      "Capacity in MVA",
      "Tap provided which side",
      "Present tap position",
    ],
    line_reactors: [
      "Category",
      "voltage (kV)",
      "O&M by",
      "Owner at End-I",
      "Owner at End-II",
      "End 1 L/R MVAR",
      "End 2 L/R MVAR",
    ],
    bus_reactors: [
      "Voltage Level",
      "Owner",
      "Unit Type",
      "Reactor (MVAr)",
      "MVAR rating",
      "No.s",
    ],
    units: [
      "Type of Fuel",
      "Owner",
      "Generator Group",
      "Unit Size",
      "Make",
      "Voltage Ratio",
    ],
  };
  const preferred = candidatesByCategory[category.id] || [];
  const usable = category.fields.filter((field) => {
    const values = category.records.map((record) => record.fields[field]).filter((value) => value !== null && value !== undefined && value !== "");
    return values.length && new Set(values.map(formatValue)).size > 1;
  });
  return [...preferred.filter((field) => usable.includes(field)), ...usable.filter((field) => !preferred.includes(field))];
}

function getChartPrefs(category) {
  if (!category) {
    return {
      primaryField: "categoryTitle",
      primaryType: "bar",
      secondaryField: "categoryTitle",
      secondaryType: "donut",
    };
  }

  const fields = getPreferredFields(category);
  const defaults = {
    primaryField: fields[0] || getBreakdownField(category),
    primaryType: "bar",
    secondaryField: fields[1] || fields[0] || getBreakdownField(category),
    secondaryType: "donut",
  };
  state.chartPrefs[category.id] = { ...defaults, ...(state.chartPrefs[category.id] || {}) };
  return state.chartPrefs[category.id];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countBy(records, field) {
  return records.reduce((acc, { record }) => {
    const key = formatValue(record.fields[field]);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function setAdmin(isAdmin) {
  state.admin = isAdmin;
  sessionStorage.setItem(ADMIN_KEY, String(isAdmin));
  els.adminState.textContent = isAdmin ? "Editing unlocked" : "Viewer mode";
  els.adminToggle.textContent = isAdmin ? "Logout" : "Login";
  els.addRecordBtn.classList.toggle("hidden", !isAdmin || state.activeCategory === "all");
}

function renderNav() {
  const total = allRecords().length;
  const items = [
    { id: "all", title: "All Categories", color: "#38bdf8", count: total },
    ...state.categories.map((category) => ({
      id: category.id,
      title: category.title,
      color: category.color,
      count: category.records.length,
    })),
  ];

  els.nav.innerHTML = items
    .map(
      (item) => `
        <button class="nav-item ${state.activeCategory === item.id ? "active" : ""}" data-category="${item.id}" type="button">
          <span><span class="nav-dot" style="background:${item.color}"></span> ${item.title}</span>
          <strong>${item.count}</strong>
        </button>
      `
    )
    .join("");
}

function renderStats(records) {
  const active = getActiveCategory();
  const owners = new Set();
  const voltage = new Set();
  records.forEach(({ record }) => {
    ["Owner", "Ownership", "O&M by"].forEach((field) => {
      if (record.fields[field]) owners.add(record.fields[field]);
    });
    ["Voltage Level", "Voltage Level (in X/Y/Z kV)", "voltage   (kV)", "voltage (kV)"].forEach((field) => {
      if (record.fields[field]) voltage.add(record.fields[field]);
    });
  });

  const cards = [
    ["Records", records.length, "#2563eb"],
    ["Categories", active ? 1 : state.categories.length, "#16a34a"],
    ["Owners / Operators", owners.size, "#f59e0b"],
    [state.dbMode === "mongodb" ? "MongoDB" : "Local DB", state.dbMode === "local" ? "Browser" : "Live", "#9333ea"],
  ];

  els.stats.innerHTML = cards
    .map(
      ([label, value, color]) => `
        <article class="stat-card">
          <div class="stat-strip" style="background:${color}"></div>
          <span class="muted">${label}</span>
          <strong>${formatValue(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderCategoryChart() {
  els.primaryChartTitle.textContent = "Category Size";
  els.primaryChartControls.innerHTML = "";
  els.categoryChart.className = "bar-chart";
  const max = Math.max(...state.categories.map((category) => category.records.length), 1);
  els.categoryChart.innerHTML = state.categories
    .map(
      (category) => `
        <div class="bar-row">
          <strong>${category.title}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${(category.records.length / max) * 100}%; background:${category.color}"></div></div>
          <span>${category.records.length}</span>
        </div>
      `
    )
    .join("");
}

function renderChartControls(container, chartKey, fields, selectedField, chartType) {
  container.innerHTML = `
    <select data-chart-field="${chartKey}" aria-label="Chart field">
      ${fields.map((field) => `<option value="${escapeHtml(field)}" ${field === selectedField ? "selected" : ""}>${escapeHtml(field)}</option>`).join("")}
    </select>
    <div class="segmented" aria-label="Chart type">
      <button type="button" data-chart-type="${chartKey}" data-type="bar" class="${chartType === "bar" ? "active" : ""}">Bar</button>
      <button type="button" data-chart-type="${chartKey}" data-type="donut" class="${chartType === "donut" ? "active" : ""}">Donut</button>
    </div>
  `;
}

function getCountsForField(records, field) {
  if (field === "categoryTitle") {
    return records.reduce((acc, item) => {
      acc[item.category.title] = (acc[item.category.title] || 0) + 1;
      return acc;
    }, {});
  }
  return countBy(records, field);
}

function renderBarChart(container, entries, max) {
  if (!entries.length) {
    container.innerHTML = `<div class="chart-empty">No chart data available.</div>`;
    return;
  }
  container.className = "bar-chart";
  container.innerHTML = entries
    .map(
      ([name, value], index) => `
        <div class="bar-row">
          <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%; background:${palette[index % palette.length]}"></div></div>
          <span>${value}</span>
        </div>
      `
    )
    .join("");
}

function renderDonutChart(container, entries, total) {
  if (!entries.length) {
    container.innerHTML = `<div class="chart-empty">No chart data available.</div>`;
    return;
  }
  let cursor = 0;
  const segments = entries.map(([name, value], index) => {
    const start = cursor;
    const end = cursor + (value / total) * 100;
    cursor = end;
    return `${palette[index % palette.length]} ${start}% ${end}%`;
  });

  container.className = "donut-wrap";
  container.innerHTML = `
    <div class="donut" data-total="${total}" style="background: conic-gradient(${segments.join(",")})"></div>
    <div class="legend">
      ${entries
        .map(
          ([name, value], index) => `
            <div class="legend-item">
              <span class="nav-dot" style="background:${palette[index % palette.length]}"></span>
              <span>${escapeHtml(name)} - ${value}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFieldChart(container, records, field, chartType) {
  const counts = getCountsForField(records, field);
  const entries = Object.entries(counts)
    .filter(([name]) => name !== "Not available")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  const total = entries.reduce((sum, item) => sum + item[1], 0) || 1;

  if (chartType === "donut") {
    renderDonutChart(container, entries, total);
  } else {
    renderBarChart(container, entries, max);
  }
}

function renderBreakdown(records) {
  const category = getActiveCategory();
  if (!category) {
    els.secondaryChartControls.innerHTML = "";
    els.breakdownTitle.textContent = "Category Mix";
    renderFieldChart(els.breakdownChart, records, "categoryTitle", "donut");
    return;
  }

  const fields = getPreferredFields(category);
  const prefs = getChartPrefs(category);
  els.primaryChartTitle.textContent = `${prefs.primaryField} Distribution`;
  els.breakdownTitle.textContent = `${prefs.secondaryField} Breakdown`;
  renderChartControls(els.primaryChartControls, "primary", fields, prefs.primaryField, prefs.primaryType);
  renderChartControls(els.secondaryChartControls, "secondary", fields, prefs.secondaryField, prefs.secondaryType);
  renderFieldChart(els.categoryChart, records, prefs.primaryField, prefs.primaryType);
  renderFieldChart(els.breakdownChart, records, prefs.secondaryField, prefs.secondaryType);
}

function renderRecords(records) {
  els.resultTitle.textContent = `${records.length} ${records.length === 1 ? "Record" : "Records"}`;
  if (!records.length) {
    els.recordsList.innerHTML = `<p class="muted">No records match this search.</p>`;
    return;
  }

  els.recordsList.innerHTML = records
    .slice(0, 120)
    .map(({ record, category }) => {
      const summary = getPrimaryFields(category, record)
        .slice(0, 6)
        .map(({ field, value }) => `<span class="pill">${field}: ${formatValue(value)}</span>`)
        .join("");
      return `
        <article class="record-row">
          <div>
            <span class="eyebrow" style="color:${category.color}">${category.title}</span>
            <div class="record-title">${record.displayName}</div>
          </div>
          <div class="summary-fields">${summary || '<span class="muted">Open to view all fields</span>'}</div>
          <button class="ghost-button" data-open-record="${record.id}" type="button">Open</button>
        </article>
      `;
    })
    .join("");
}

function render() {
  const records = filteredRecords();
  const active = getActiveCategory();
  els.pageTitle.textContent = active ? active.title : "All Categories";
  setAdmin(state.admin);
  renderNav();
  renderStats(records);
  renderCategoryChart();
  renderBreakdown(records);
  renderRecords(records);
}

function findRecord(recordId) {
  for (const category of state.categories) {
    const record = category.records.find((item) => item.id === recordId);
    if (record) return { category, record };
  }
  return null;
}

function openRecord(recordId, editMode = false) {
  const found = findRecord(recordId);
  if (!found) return;
  const { category, record } = found;
  els.dialogCategory.textContent = category.title;
  els.dialogCategory.style.color = category.color;
  els.dialogTitle.textContent = record.displayName;

  if (editMode) {
    renderEditForm(category, record);
  } else {
    els.dialogBody.innerHTML = category.fields
      .map(
        (field) => `
          <div class="field-view">
            <span>${field}</span>
            <strong>${formatValue(record.fields[field])}</strong>
          </div>
        `
      )
      .join("");
    els.dialogActions.innerHTML = state.admin
      ? `
        <button class="ghost-button" type="button" data-edit-record="${record.id}">Edit</button>
        <button class="danger-button" type="button" data-delete-record="${record.id}">Delete</button>
      `
      : "";
  }

  if (!els.detailDialog.open) {
    els.detailDialog.showModal();
  }
}

function renderEditForm(category, record = null) {
  const isNew = !record;
  const workingRecord = record || {
    id: `${category.id}-${Date.now()}`,
    categoryId: category.id,
    displayName: "",
    fields: Object.fromEntries(category.fields.map((field) => [field, ""])),
  };

  els.dialogCategory.textContent = category.title;
  els.dialogCategory.style.color = category.color;
  els.dialogTitle.textContent = isNew ? `Add ${category.title} Record` : `Edit ${workingRecord.displayName}`;
  els.dialogBody.innerHTML = category.fields
    .map((field) => {
      const value = workingRecord.fields[field] ?? "";
      const tag = String(value).length > 80 ? "textarea" : "input";
      return `
        <label class="field-edit">
          <span>${field}</span>
          ${tag === "textarea"
            ? `<textarea data-field="${field}">${value}</textarea>`
            : `<input data-field="${field}" value="${String(value).replaceAll('"', "&quot;")}" />`}
        </label>
      `;
    })
    .join("");
  els.dialogActions.innerHTML = `
    <button class="ghost-button" type="button" data-cancel-edit="${workingRecord.id}">Cancel</button>
    <button class="primary-button" type="button" data-save-record="${workingRecord.id}" data-new="${isNew}">Save Record</button>
  `;
  els.detailDialog.dataset.editCategory = category.id;
  els.detailDialog.dataset.editRecord = workingRecord.id;
}

async function saveRecord(recordId, isNew) {
  try {
    const category = state.categories.find((item) => item.id === els.detailDialog.dataset.editCategory);
    if (!category) throw new Error("No category selected for this record.");

    const fields = Object.fromEntries(
      [...els.dialogBody.querySelectorAll("[data-field]")].map((input) => [input.dataset.field, input.value.trim()])
    );
    const displayName =
      category.nameFields.map((field) => fields[field]).find(Boolean) ||
      fields.Name ||
      fields.Station ||
      `${category.title} Record`;

    let savedRecord;
    if (isNew) {
      savedRecord = { id: recordId, categoryId: category.id, displayName, fields };
      category.records.unshift(savedRecord);
    } else {
      savedRecord = category.records.find((item) => item.id === recordId);
      if (!savedRecord) throw new Error("The selected record was not found.");
      savedRecord.displayName = displayName;
      savedRecord.fields = fields;
    }

    await persistRecord(category, savedRecord);
    els.detailDialog.close();
    render();
    alert("Record saved successfully.");
  } catch (error) {
    alert(`Save failed: ${error.message}`);
  }
}

async function deleteRecord(recordId) {
  try {
    const found = findRecord(recordId);
    if (!found) return;
    const ok = confirm(`Delete "${found.record.displayName}" from ${found.category.title}?`);
    if (!ok) return;
    found.category.records = found.category.records.filter((record) => record.id !== recordId);
    await removeRecordOnline(recordId);
    els.detailDialog.close();
    render();
    alert("Record deleted successfully.");
  } catch (error) {
    alert(`Delete failed: ${error.message}`);
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ categories: state.categories }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "elements-dashboard-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

els.nav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  render();
});

document.querySelector(".dashboard-grid").addEventListener("change", (event) => {
  const select = event.target.closest("[data-chart-field]");
  const category = getActiveCategory();
  if (!select || !category) return;

  const prefs = getChartPrefs(category);
  prefs[`${select.dataset.chartField}Field`] = select.value;
  render();
});

document.querySelector(".dashboard-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-chart-type]");
  const category = getActiveCategory();
  if (!button || !category) return;

  const prefs = getChartPrefs(category);
  prefs[`${button.dataset.chartType}Type`] = button.dataset.type;
  render();
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

els.recordsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-record]");
  if (button) openRecord(button.dataset.openRecord);
});

els.detailDialog.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-record]");
  const save = event.target.closest("[data-save-record]");
  const cancel = event.target.closest("[data-cancel-edit]");
  const remove = event.target.closest("[data-delete-record]");
  if (edit) openRecord(edit.dataset.editRecord, true);
  if (save) saveRecord(save.dataset.saveRecord, save.dataset.new === "true");
  if (cancel) {
    if (findRecord(cancel.dataset.cancelEdit)) {
      openRecord(cancel.dataset.cancelEdit);
    } else {
      els.detailDialog.close();
    }
  }
  if (remove) deleteRecord(remove.dataset.deleteRecord);
});

els.addRecordBtn.addEventListener("click", () => {
  const category = getActiveCategory();
  if (!category) return;
  renderEditForm(category);
  els.detailDialog.showModal();
});

els.exportBtn.addEventListener("click", exportJson);

els.adminToggle.addEventListener("click", () => {
  if (state.admin) {
    setAdmin(false);
    render();
  } else {
    els.adminDialog.showModal();
  }
});

document.querySelector("[data-close-admin]").addEventListener("click", () => els.adminDialog.close());

els.adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const user = document.querySelector("#adminUser").value.trim();
  const pass = document.querySelector("#adminPass").value;
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    setAdmin(true);
    els.adminDialog.close();
    render();
  } else {
    alert("Invalid admin login.");
  }
});

loadData().then(render);
