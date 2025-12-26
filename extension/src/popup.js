import { normalizeLanguageToCode } from "./common/language-map.js";
import { i18n } from "./common/i18n.js";

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

// Provider List elements
const providerListEl = document.querySelector("#provider-list");
const btnAddProvider = document.querySelector("#btn-add-provider");
const providerForm = document.querySelector("#provider-form");
const formTitle = document.querySelector("#form-title");
const formType = document.querySelector("#form-type");
const formName = document.querySelector("#form-name");
const formDynamicFields = document.querySelector("#form-dynamic-fields");
const btnFormCancel = document.querySelector("#form-cancel");
const btnFormSave = document.querySelector("#form-save");

let currentAliases = {};
let currentDomains = [];
let providers = [];
let activeProviderId = "builtin";
let editingProviderId = null;

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

function translateUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.innerHTML = i18n.t(key);
  });
  
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", i18n.t(key));
  });
  
  if (saveBtn.textContent.includes("✅")) {
    saveBtn.textContent = i18n.t("popup.saved");
  } else {
    saveBtn.textContent = i18n.t("popup.savePreferences");
  }
}

function populateSelects() {
  const currentNative = nativeSelect.value;
  const currentTarget = targetSelect.value;

  const options = LANGUAGES.map(
    (l) => `<option value="${l.code}">${i18n.t("lang." + l.code) || l.name} (${l.code})</option>`
  ).join("");
  
  nativeSelect.innerHTML = options;
  targetSelect.innerHTML = options;

  if (currentNative) nativeSelect.value = currentNative;
  if (currentTarget) targetSelect.value = currentTarget;
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
      saveSettings();
    });
  });
}

function renderDomains() {
  if (!domainListEl) return;
  
  domainListEl.innerHTML = "";
  currentDomains.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "bt-domain-item";
    const position = item.position || 'auto'; // Default to 'auto'
    div.innerHTML = `
      <input type="checkbox" ${item.enabled ? 'checked' : ''} data-index="${index}" />
      <span class="bt-domain-name">${item.domain}</span>
      <select class="bt-position-select" data-index="${index}">
        <option value="auto" ${position === 'auto' ? 'selected' : ''}>Auto</option>
        <option value="bottom" ${position === 'bottom' ? 'selected' : ''}>Bottom</option>
        <option value="top" ${position === 'top' ? 'selected' : ''}>Top</option>
      </select>
      <button class="bt-remove-alias" data-index="${index}">×</button>
    `;
    domainListEl.appendChild(div);
  });
  
  domainListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      currentDomains[e.target.dataset.index].enabled = e.target.checked;
      saveSettings();
    });
  });
  
  domainListEl.querySelectorAll('.bt-position-select').forEach(select => {
    select.addEventListener('change', (e) => {
      currentDomains[e.target.dataset.index].position = e.target.value;
      saveSettings();
    });
  });
  
  domainListEl.querySelectorAll('.bt-remove-alias').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentDomains.splice(e.target.dataset.index, 1);
      renderDomains();
      saveSettings();
    });
  });
}

function renderProviderList() {
  providerListEl.innerHTML = "";
  
  providers.forEach(p => {
    const isActive = p.id === activeProviderId;
    const isBuiltin = p.id === "builtin";
    
    const el = document.createElement("div");
    el.className = `bt-provider-item ${isActive ? 'active' : ''}`;
    
    // Actions
    let actionsHtml = '';
    if (isActive) {
      actionsHtml += `<span class="bt-badge-active">${i18n.t("popup.active")}</span>`;
    } else {
      actionsHtml += `<button class="bt-btn-text btn-set-active" data-id="${p.id}">${i18n.t("popup.use")}</button>`;
    }
    
    if (!isBuiltin) {
      actionsHtml += `<button class="bt-btn-text btn-edit" data-id="${p.id}">${i18n.t("popup.edit")}</button>`;
      actionsHtml += `<button class="bt-btn-text btn-delete" data-id="${p.id}">${i18n.t("popup.delete")}</button>`;
    }

    el.innerHTML = `
      <div class="bt-provider-info">
        <div class="bt-provider-name">${p.name}</div>
        <div class="bt-provider-type">${p.type}</div>
      </div>
      <div class="bt-provider-actions">
        ${actionsHtml}
      </div>
    `;
    providerListEl.appendChild(el);
  });

  // Attach events
  providerListEl.querySelectorAll(".btn-set-active").forEach(btn => {
    btn.addEventListener("click", (e) => {
      activeProviderId = e.target.dataset.id;
      renderProviderList();
      saveSettings();
    });
  });

  providerListEl.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      if (confirm("Delete this provider?")) {
        providers = providers.filter(p => p.id !== e.target.dataset.id);
        if (activeProviderId === e.target.dataset.id) {
          activeProviderId = "builtin";
        }
        renderProviderList();
        saveSettings();
      }
    });
  });

  providerListEl.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const p = providers.find(item => item.id === e.target.dataset.id);
      if (p) openProviderForm(p);
    });
  });
}

function getProviderInfo(type) {
  switch (type) {
    case 'gemini':
      return {
        link: 'https://aistudio.google.com/app/apikey',
        text: 'Google AI Studio'
      };
    case 'openai':
      return {
        link: 'https://platform.openai.com/api-keys',
        text: 'OpenAI Platform'
      };
    case 'openrouter':
      return {
        link: 'https://openrouter.ai/keys',
        text: 'OpenRouter'
      };
    case 'deepl':
      return {
        link: 'https://www.deepl.com/your-account/keys',
        text: 'DeepL Account'
      };
    default:
      return null;
  }
}

function renderFormFields(type, config = {}) {
  formDynamicFields.innerHTML = "";
  
  // Info Link
  const info = getProviderInfo(type);
  if (info) {
    const infoDiv = document.createElement("div");
    infoDiv.className = "bt-provider-help";
    infoDiv.innerHTML = `
      <a href="${info.link}" target="_blank" class="bt-link">${i18n.t("popup.getApiKey")} (${info.text}) ↗</a>
    `;
    formDynamicFields.appendChild(infoDiv);
  }

  if (type === "gemini") {
    const model = config.model || "gemini-flash-latest";
    formDynamicFields.insertAdjacentHTML('beforeend', `
      <div class="bt-field">
        <label>${i18n.t("popup.apiKey")}</label>
        <input type="password" id="field-apiKey" class="bt-input api-key-input" value="${config.apiKey || ''}" />
      </div>
      <div class="bt-field">
        <label>${i18n.t("popup.model")}</label>
        <input type="text" id="field-model" class="bt-input" value="${model}" placeholder="gemini-flash-latest" />
      </div>
    `);
  } else if (type === "openai") {
    const model = config.model || "gpt-3.5-turbo";
    formDynamicFields.insertAdjacentHTML('beforeend', `
      <div class="bt-field">
        <label>${i18n.t("popup.apiKey")}</label>
        <input type="password" id="field-apiKey" class="bt-input api-key-input" value="${config.apiKey || ''}" />
      </div>
      <div class="bt-field">
        <label>${i18n.t("popup.model")}</label>
        <input type="text" id="field-model" class="bt-input" value="${model}" placeholder="gpt-3.5-turbo" />
      </div>
      <div class="bt-field">
        <label>${i18n.t("popup.baseUrl")}</label>
        <input type="text" id="field-baseUrl" class="bt-input" value="${config.baseUrl || ''}" placeholder="https://api.openai.com/v1" />
      </div>
    `);
  } else if (type === "openrouter") {
    const model = config.model || "google/gemini-2.0-flash-exp:free";
    formDynamicFields.insertAdjacentHTML('beforeend', `
      <div class="bt-field">
        <label>${i18n.t("popup.apiKey")}</label>
        <input type="password" id="field-apiKey" class="bt-input api-key-input" value="${config.apiKey || ''}" />
      </div>
      <div class="bt-field">
        <label>${i18n.t("popup.model")}</label>
        <input type="text" id="field-model" class="bt-input" value="${model}" placeholder="google/gemini-2.0-flash-exp:free" />
      </div>
    `);
  } else if (type === "deepl") {
    formDynamicFields.insertAdjacentHTML('beforeend', `
      <div class="bt-field">
        <label>${i18n.t("popup.apiKey")}</label>
        <input type="password" id="field-apiKey" class="bt-input api-key-input" value="${config.apiKey || ''}" />
      </div>
    `);
  }
  
  // Security Note
  formDynamicFields.insertAdjacentHTML('beforeend', `
    <div class="bt-security-note">
      <span class="bt-icon-shield">🛡️</span> ${i18n.t("popup.securityNote")}
    </div>
  `);
}

function openProviderForm(provider = null) {
  editingProviderId = provider ? provider.id : null;
  formTitle.textContent = provider ? i18n.t("popup.edit") : i18n.t("popup.addProvider");
  formType.value = provider ? provider.type : "gemini";
  formType.disabled = !!provider; // Cannot change type when editing
  formName.value = provider ? provider.name : "";
  
  renderFormFields(formType.value, provider ? provider.config : {});
  
  providerListEl.parentElement.hidden = true;
  providerForm.hidden = false;
  
  // Hide main save button
  saveBtn.style.display = 'none';
}

function closeProviderForm() {
  providerForm.hidden = true;
  providerListEl.parentElement.hidden = false;
  editingProviderId = null;
  
  // Show main save button
  saveBtn.style.display = 'block';
}

function saveProviderFromForm() {
  const type = formType.value;
  const name = formName.value.trim() || type;
  const config = {};
  
  const apiKeyEl = document.querySelector("#field-apiKey");
  if (apiKeyEl) config.apiKey = apiKeyEl.value.trim();
  
  const modelEl = document.querySelector("#field-model");
  if (modelEl) config.model = modelEl.value;
  
  const baseUrlEl = document.querySelector("#field-baseUrl");
  if (baseUrlEl) config.baseUrl = baseUrlEl.value.trim();

  if (editingProviderId) {
    // Update
    const idx = providers.findIndex(p => p.id === editingProviderId);
    if (idx !== -1) {
      providers[idx].name = name;
      providers[idx].config = config;
    }
  } else {
    // Create
    const newId = crypto.randomUUID();
    providers.push({
      id: newId,
      type,
      name,
      config
    });
    // If it's the first custom provider, maybe set it as default? No, keep builtin default.
  }
  
  saveSettings();
  renderProviderList();
  closeProviderForm();
}

// Event Listeners for Form
btnAddProvider.addEventListener("click", () => openProviderForm(null));
btnFormCancel.addEventListener("click", closeProviderForm);
btnFormSave.addEventListener("click", saveProviderFromForm);
formType.addEventListener("change", () => renderFormFields(formType.value));

function updateSettingsVisibility() {
  if (enabledCheckbox.checked) {
    settingsContainer.removeAttribute("disabled");
  } else {
    settingsContainer.setAttribute("disabled", "true");
  }
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
    
    const lang = res.settings.interfaceLanguage || "en";
    updateLangToggleUI(lang);
    i18n.setLanguage(lang);
    populateSelects();
    translateUI();
    
    if (instantEnabledCheckbox) {
      instantEnabledCheckbox.checked = res.settings.instantTranslateEnabled || false;
    }
    if (instantDelayInput) {
      instantDelayInput.value = (res.settings.instantDelay || 3000) / 1000;
    }
    currentDomains = res.settings.instantDomains || [];

    // Load Providers
    providers = res.settings.providers || [
      { id: "builtin", type: "gemini-nano", name: "Chrome Built-in AI", config: {} }
    ];
    activeProviderId = res.settings.activeProviderId || "builtin";
    
  } else {
    // Defaults
    enabledCheckbox.checked = true;
    nativeSelect.value = "en";
    targetSelect.value = "es";
    timeoutInput.value = 10;
    preferNative.checked = true;
    confirmModal.checked = true;
    currentAliases = {};
    
    updateLangToggleUI("en");
    i18n.setLanguage("en");
    populateSelects();
    translateUI();
    
    if (instantEnabledCheckbox) instantEnabledCheckbox.checked = false;
    if (instantDelayInput) instantDelayInput.value = 3;
    currentDomains = [];
    
    providers = [{ id: "builtin", type: "gemini-nano", name: "Chrome Built-in AI", config: {} }];
    activeProviderId = "builtin";
  }
  
  renderAliases();
  renderDomains();
  renderProviderList();
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
    interfaceLanguage: document.querySelector("#lang-toggle .active").getAttribute("data-lang"),
    instantTranslateEnabled: instantEnabledCheckbox?.checked || false,
    instantDelay: (parseInt(instantDelayInput?.value, 10) || 3) * 1000,
    instantDomains: currentDomains,
    // New Provider Structure
    providers,
    activeProviderId
  };

  const res = await chrome.runtime.sendMessage({
    type: "set-settings",
    settings
  });

  if (res?.ok) {
    saveBtn.textContent = i18n.t("popup.saved");
    setTimeout(() => {
      saveBtn.textContent = i18n.t("popup.savePreferences");
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
    saveSettings();
  }
});

enabledCheckbox.addEventListener("change", () => {
  updateSettingsVisibility();
  saveSettings();
});

nativeSelect.addEventListener("change", saveSettings);
targetSelect.addEventListener("change", saveSettings);
timeoutInput.addEventListener("change", saveSettings);
preferNative.addEventListener("change", saveSettings);
confirmModal.addEventListener("change", saveSettings);

const langToggle = document.querySelector("#lang-toggle");

langToggle.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-lang")) {
    const lang = e.target.getAttribute("data-lang");
    i18n.setLanguage(lang);
    translateUI();
    populateSelects();
    renderAliases();
    renderDomains();
    renderProviderList();
    updateLangToggleUI(lang);
    saveSettings();
  }
});

function updateLangToggleUI(lang) {
  langToggle.querySelectorAll("span[data-lang]").forEach(span => {
    if (span.getAttribute("data-lang") === lang) {
      span.classList.add("active");
    } else {
      span.classList.remove("active");
    }
  });
}

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
      currentDomains.push({ domain, enabled: true, position: 'auto' });
      newDomainInput.value = "";
      renderDomains();
      saveSettings();
    }
  });
}

document.querySelectorAll('.bt-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bt-tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    const contentId = 'tab-' + tab.dataset.tab;
    document.getElementById(contentId).classList.add('active');

    // Hide save button on help tab
    if (tab.dataset.tab === 'help') {
      saveBtn.style.display = 'none';
    } else {
      // Only show if not in provider form
      if (providerForm.hidden) {
        saveBtn.style.display = 'block';
      }
    }
  });
});

saveBtn.addEventListener("click", saveSettings);

loadSettings();
