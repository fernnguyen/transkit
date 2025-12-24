
function populateSourceLanguageSelector(popup) {
  const select = popup.querySelector('.bt-selection-source-select');
  const languages = [
    { code: 'auto', name: 'Auto-detect' },
    { code: 'en', name: 'English' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' }
  ];
  
  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    select.appendChild(option);
  });
  
  select.value = 'auto';
}

function getLanguageName(code) {
  const names = {
    'en': 'English',
    'vi': 'Vietnamese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German'
  };
  return names[code] || code.toUpperCase();
}
