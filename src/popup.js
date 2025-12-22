import { normalizeLanguageToCode } from "./common/language-map.js";

const enabledCheckbox = document.querySelector("#enabled");
const settingsContainer = document.querySelector("#settings-container");
const nativeSelect = document.querySelector("#native");
const targetSelect = document.querySelector("#target");
const timeoutInput = document.querySelector("#timeout");
const preferNative = document.querySelector("#prefer-native");
const confirmModal = document.querySelector("#confirm-modal");
const saveBtn = document.querySelector("#save");
const aliasListEl = document.querySelector("#alias-list");
const aliasKeyInput = document.querySelector("#alias-key");
const aliasValueInput = document.querySelector("#alias-value");
const addAliasBtn = document.querySelector("#add-alias");

// Instant translate elements
const instantEnabledCheckbox = document.querySelector("#instant-translate-enabled");
const instantSettings = document.querySelector("#instant-settings");
const instantDelayInput = document.querySelector("#instant-delay");
const domainListEl = document.querySelector("#instant-domain-list");
const newDomainInput = document.querySelector("#new-domain");
const addDomainBtn = document.querySelector("#add-domain");

let currentAliases = {};
let currentDomains = [];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "pt", name: "Portuguese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "ko", name: "Korean" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" }
];

function populateSelects() {
  const options = LANGUAGES.map(
    (l) => `<option value="${l.code}">${l.name} (${l.code})</option>`
  ).join("");
  nativeSelect.innerHTML = options;
  targetSelect.innerHTML = options;
}

function renderAliases() {
  aliasListEl.innerHTML = "";
  Object.entries(currentAliases).forEach(([key, value]) => {
    const item = document.createElement("div");
    item.className = "bt-alias-item";
    item.innerHTML = `
      <span><b>${key}</b> → ${value}</span>
      <button data-key="${key}" class="bt-remove-alias">×</button>
    `;
    aliasListEl.appendChild(item);
  });

  document.querySelectorAll(".bt-remove-alias").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.target.dataset.key;
      delete currentAliases[key];
      renderAliases();
    });
  });
}

function updateSettingsVisibility() {
  if (enabledCheckbox.checked) {
    settingsContainer.removeAttribute("disabled");
  } else {
    settingsContainer.setAttribute("disabled", "true");
  }
}

function renderDomains() {
  if (!domainListEl) return;
  
  domainListEl.innerHTML = "";
  currentDomains.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "bt-domain-item";
    div.innerHTML = `
      <input type="checkbox" ${item.enabled ? 'checked' : ''} data-index="${index}" />
      <span class="bt-domain-name">${item.domain}</span>
      <select class="bt-position-select" data-index="${index}">
        <option value="bottom" ${item.position === 'bottom' ? 'selected' : ''}>Bottom</option>
        <option value="top" ${item.position === 'top' ? 'selected' : ''}>Top</option>
      </select>
      <button class="bt-remove-alias" data-index="${index}">×</button>
    `;
    domainListEl.appendChild(div);
  });
  
  // Add event listeners for checkboxes
  domainListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      currentDomains[e.target.dataset.index].enabled = e.target.checked;
      saveSettings();
    });
  });
  
  // Add event listeners for position selects
  domainListEl.querySelectorAll('.bt-position-select').forEach(select => {
    select.addEventListener('change', (e) => {
      currentDomains[e.target.dataset.index].position = e.target.value;
      saveSettings();
    });
  });
  
  // Add event listeners for remove buttons
  domainListEl.querySelectorAll('.bt-remove-alias').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentDomains.splice(e.target.dataset.index, 1);
      renderDomains();
      saveSettings();
    });
  });
}

function toggleInstantSettings() {
  if (!instantEnabledCheckbox || !instantSettings) return;
  
  if (instantEnabledCheckbox.checked) {
    instantSettings.removeAttribute('hidden');
  } else {
    instantSettings.setAttribute('hidden', 'true');
  }
}

async function loadSettings() {
  const res = await chrome.runtime.sendMessage({ type: "get-settings" });

  populateSelects();

  if (res?.ok) {
    enabledCheckbox.checked = res.settings.enabled !== false;
    nativeSelect.value = res.settings.nativeLanguageCode || "en";
    targetSelect.value = res.settings.targetLanguageCode || "es";
    timeoutInput.value = res.settings.dialogTimeout || 10;
    preferNative.checked = res.settings.preferNativeAsSource !== false;
    confirmModal.checked = res.settings.showConfirmModal !== false;
    currentAliases = res.settings.aliases || {};
    
    // Load instant translate settings
    if (instantEnabledCheckbox) {
      instantEnabledCheckbox.checked = res.settings.instantTranslateEnabled || false;
    }
    if (instantDelayInput) {
      instantDelayInput.value = (res.settings.instantDelay || 3000) / 1000;
    }
    currentDomains = res.settings.instantDomains || [];
  } else {
    enabledCheckbox.checked = true;
    nativeSelect.value = "en";
    targetSelect.value = "es";
    timeoutInput.value = 10;
    preferNative.checked = true;
    confirmModal.checked = true;
    currentAliases = {};
    
    if (instantEnabledCheckbox) {
      instantEnabledCheckbox.checked = false;
    }
    if (instantDelayInput) {
      instantDelayInput.value = 3;
    }
    currentDomains = [];
  }
  
  renderAliases();
  renderDomains();
  updateSettingsVisibility();
  toggleInstantSettings();
}

async function saveSettings() {
  const settings = {
    enabled: enabledCheckbox.checked,
    nativeLanguageCode: nativeSelect.value,
    targetLanguageCode: targetSelect.value,
    dialogTimeout: parseInt(timeoutInput.value, 10) || 10,
    preferNativeAsSource: preferNative.checked,
    showConfirmModal: confirmModal.checked,
    aliases: currentAliases,
    // Instant translate settings
    instantTranslateEnabled: instantEnabledCheckbox?.checked || false,
    instantDelay: (parseInt(instantDelayInput?.value, 10) || 3) * 1000,
    instantDomains: currentDomains
  };

  const res = await chrome.runtime.sendMessage({
    type: "set-settings",
    settings
  });

  if (res?.ok) {
    saveBtn.textContent = "✅ Saved";
    setTimeout(() => {
      saveBtn.textContent = "Save preferences";
    }, 1800);
  }
}

addAliasBtn.addEventListener("click", () => {
  const key = aliasKeyInput.value.trim();
  const value = aliasValueInput.value.trim();
  if (key && value) {
    currentAliases[key] = value;
    aliasKeyInput.value = "";
    aliasValueInput.value = "";
    renderAliases();
    saveSettings(); // Auto-save when alias added
  }
});

// Auto-save on any setting change
enabledCheckbox.addEventListener("change", () => {
  updateSettingsVisibility();
  saveSettings();
});

nativeSelect.addEventListener("change", saveSettings);
targetSelect.addEventListener("change", saveSettings);
timeoutInput.addEventListener("change", saveSettings);
preferNative.addEventListener("change", saveSettings);
confirmModal.addEventListener("change", saveSettings);

// Instant translate event listeners
if (instantEnabledCheckbox) {
  instantEnabledCheckbox.addEventListener("change", () => {
    toggleInstantSettings();
    saveSettings();
  });
}

if (instantDelayInput) {
  instantDelayInput.addEventListener("change", saveSettings);
}

if (addDomainBtn && newDomainInput) {
  addDomainBtn.addEventListener("click", () => {
    const domain = newDomainInput.value.trim();
    if (domain && !currentDomains.some(d => d.domain === domain)) {
      currentDomains.push({ domain, enabled: true, position: 'bottom' });
      newDomainInput.value = "";
      renderDomains();
      saveSettings();
    }
  });
}

saveBtn.addEventListener("click", saveSettings);

loadSettings();
