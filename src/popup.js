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

let currentAliases = {};

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
  } else {
    enabledCheckbox.checked = true;
    nativeSelect.value = "en";
    targetSelect.value = "es";
    timeoutInput.value = 10;
    preferNative.checked = true;
    confirmModal.checked = true;
    currentAliases = {};
  }
  renderAliases();
  updateSettingsVisibility();
}

async function saveSettings() {
  const settings = {
    enabled: enabledCheckbox.checked,
    nativeLanguageCode: nativeSelect.value,
    targetLanguageCode: targetSelect.value,
    dialogTimeout: parseInt(timeoutInput.value, 10) || 10,
    preferNativeAsSource: preferNative.checked,
    showConfirmModal: confirmModal.checked,
    aliases: currentAliases
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

saveBtn.addEventListener("click", saveSettings);

loadSettings();
