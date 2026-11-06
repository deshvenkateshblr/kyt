/**
 * step-form.js — Add / Edit step form with attachment management
 */

window.KYT = window.KYT || {};

window.KYT.stepForm = (() => {
  const stepFormView        = document.getElementById('step-form-view');
  const configView          = document.getElementById('config-view');
  const formViewTitle       = document.getElementById('form-view-title');
  const formStepId          = document.getElementById('form-step-id');
  const formStepTitle       = document.getElementById('form-step-title');
  const formStepTime        = document.getElementById('form-step-time');
  const formStepWhere       = document.getElementById('form-step-where');
  const formStepMapUrl      = document.getElementById('form-step-map-url');
  const formStepNotes       = document.getElementById('form-step-notes');
  const formStepFile        = document.getElementById('form-step-file');
  const formAttachmentsList = document.getElementById('form-attachments-list');
  const linkInputContainer  = document.getElementById('link-input-container');
  const formStepLinkUrl     = document.getElementById('form-step-link-url');
  const btnShowLinkInput    = document.getElementById('btn-show-link-input');
  const btnAddLink          = document.getElementById('btn-add-link');
  const attachmentError     = document.getElementById('attachment-error');
  const attachmentErrorText = document.getElementById('attachment-error-text');
  const attachmentCountBadge = document.getElementById('attachment-count-badge');
  const attachmentControls  = document.getElementById('attachment-controls');

  const MAX_ATTACHMENTS = 4;
  const MAX_FILE_SIZE   = 2 * 1024 * 1024;

  let tempAttachments = [];

  // ── Utilities ─────────────────────────────────────────────────────────────
  function toDatetimeLocal(date) {
    if (!date) date = new Date();
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      date = new Date(date);
    }
    if (isNaN(date.getTime())) date = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function showAttachmentError(msg) {
    if (msg) { attachmentErrorText.textContent = msg; attachmentError.classList.remove('hidden'); }
    else      { attachmentError.classList.add('hidden'); }
  }

  // ── Attachment list render ────────────────────────────────────────────────
  function renderFormAttachments() {
    attachmentCountBadge.textContent = `${tempAttachments.length}/${MAX_ATTACHMENTS}`;
    if (tempAttachments.length >= MAX_ATTACHMENTS) {
      attachmentControls.classList.add('hidden');
      linkInputContainer.classList.add('hidden');
    } else {
      attachmentControls.classList.remove('hidden');
    }

    formAttachmentsList.innerHTML = tempAttachments.map((att, i) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in shadow-sm">
        <div class="flex items-center gap-2 overflow-hidden">
          <i data-lucide="${att.type === 'file' ? 'file' : 'link'}" class="w-4 h-4 text-kyt-accent shrink-0"></i>
          <span class="text-[13px] font-semibold text-slate-700 truncate">${KYT.utils.escapeHTML(att.name || 'Attachment')}</span>
        </div>
        <button type="button" onclick="KYT.stepForm.removeAttachment(${i})"
                class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>`).join('');
    lucide.createIcons();
  }

  function removeAttachment(index) {
    tempAttachments.splice(index, 1);
    showAttachmentError('');
    renderFormAttachments();
  }

  // ── File upload ───────────────────────────────────────────────────────────
  formStepFile.addEventListener('change', e => {
    showAttachmentError('');
    const files = Array.from(e.target.files);
    if (tempAttachments.length + files.length > MAX_ATTACHMENTS) {
      showAttachmentError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`); return;
    }
    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        showAttachmentError(`"${file.name}" exceeds 2 MB. Use a Drive/Web link instead.`); return;
      }
      const reader = new FileReader();
      reader.onload = ev => { tempAttachments.push({ type: 'file', name: file.name, data: ev.target.result }); renderFormAttachments(); };
      reader.readAsDataURL(file);
    });
    formStepFile.value = '';
  });

  // ── Link ─────────────────────────────────────────────────────────────────
  btnShowLinkInput.addEventListener('click', () => {
    linkInputContainer.classList.toggle('hidden');
    if (!linkInputContainer.classList.contains('hidden')) formStepLinkUrl.focus();
  });

  btnAddLink.addEventListener('click', () => {
    const url = formStepLinkUrl.value.trim();
    if (!url) return;
    let name = 'Web Link';
    if (url.includes('drive.google.com')) name = 'Google Drive';
    else if (url.includes('dropbox.com')) name = 'Dropbox';
    else if (url.includes('onedrive.'))   name = 'OneDrive';
    tempAttachments.push({ type: 'link', name, url });
    formStepLinkUrl.value = '';
    linkInputContainer.classList.add('hidden');
    showAttachmentError('');
    renderFormAttachments();
  });

  // ── Open form ─────────────────────────────────────────────────────────────
  function open(id = null) {
    formStepId.value    = '';
    formStepTitle.value = '';
    formStepWhere.value = '';
    formStepMapUrl.value = '';
    formStepNotes.value  = '';
    const defaultRadio = document.querySelector('input[name="step-icon"][value="plane"]');
    if (defaultRadio) defaultRadio.checked = true;
    showAttachmentError('');
    linkInputContainer.classList.add('hidden');

    if (id != null) {
      const { stepsData } = KYT.store.get();
      // Look up by id (use == for string/number tolerance), or if id is array index
      let step = stepsData.find(s => s.id == id);
      if (!step && typeof id === 'number' && id >= 0 && id < stepsData.length) {
        step = stepsData[id];
      }
      if (step) {
        if (step.id == null) step.id = Date.now();
        formViewTitle.textContent = 'Edit Step';
        formStepId.value    = step.id;
        formStepTitle.value = step.title || '';
        formStepTime.value  = toDatetimeLocal(step.targetTime);
        formStepWhere.value = step.where || '';
        formStepMapUrl.value = step.mapUrl || '';
        formStepNotes.value  = step.notes  || '';
        tempAttachments = step.attachments ? [...step.attachments] : [];
        const iconRadio = document.querySelector(`input[name="step-icon"][value="${step.icon}"]`);
        if (iconRadio) iconRadio.checked = true;
      }
    } else {
      formViewTitle.textContent = 'Add Step';
      const { stepsData } = KYT.store.get();
      let defaultTime = new Date();
      if (stepsData.length > 0) {
        const lastTarget = stepsData[stepsData.length - 1].targetTime;
        const lastTime = lastTarget instanceof Date ? lastTarget.getTime() : new Date(lastTarget).getTime();
        if (!isNaN(lastTime)) defaultTime = new Date(lastTime + 3_600_000);
      }
      formStepTime.value = toDatetimeLocal(defaultTime);
      tempAttachments = [];
    }

    renderFormAttachments();
    stepFormView.classList.remove('hidden');
    configView.classList.add('hidden');
  }

  function openEdit(indexOrId) {
    const { stepsData } = KYT.store.get();
    let step = null;

    // Check if passed as an array index first (config.js passes ${index})
    if (typeof indexOrId === 'number' && indexOrId >= 0 && indexOrId < stepsData.length) {
      step = stepsData[indexOrId];
    }
    // If not found by index, look up by step id
    if (!step && indexOrId != null) {
      step = stepsData.find(s => s.id == indexOrId);
    }

    if (!step) {
      console.warn('KYT.stepForm.openEdit: Step not found for identifier', indexOrId);
      return;
    }

    if (step.id == null) {
      step.id = Date.now();
    }

    open(step.id);
  }

  function close() {
    stepFormView.classList.add('hidden');
    configView.classList.remove('hidden');
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    const id         = formStepId.value;
    const title      = formStepTitle.value.trim() || 'Untitled Step';
    const targetTime = new Date(formStepTime.value);
    const where      = formStepWhere.value.trim();
    const mapUrl     = formStepMapUrl.value.trim();
    const notes      = formStepNotes.value.trim();
    const iconRadio  = document.querySelector('input[name="step-icon"]:checked');
    const icon       = iconRadio ? iconRadio.value : 'map-pin';

    const { stepsData, currentIndex } = KYT.store.get();
    const currentActiveId = stepsData[currentIndex]?.id;

    if (id) {
      const idx = stepsData.findIndex(s => s.id == id);
      if (idx > -1) stepsData[idx] = { ...stepsData[idx], title, targetTime, where, mapUrl, notes, icon, attachments: [...tempAttachments] };
    } else {
      stepsData.push({ id: Date.now(), title, icon, where, mapUrl, targetTime, notes, attachments: [...tempAttachments], status: 'todo' });
    }

    stepsData.sort((a, b) => a.targetTime - b.targetTime);

    if (currentActiveId) {
      const newIdx = stepsData.findIndex(s => s.id === currentActiveId);
      KYT.store.setCurrentIndex(newIdx > -1 ? newIdx : 0);
    } else {
      KYT.store.setCurrentIndex(0);
    }

    const saveBtn = document.getElementById('btn-save-step');
    if (saveBtn) saveBtn.disabled = true;                         // one tap, one save
    try { await KYT.store.saveData(); }                            // wait for the device write, so leaving the page at once cannot lose the edit
    finally { if (saveBtn) saveBtn.disabled = false; }
    if (KYT.config && typeof KYT.config.renderConfigSteps === 'function') {
      KYT.config.renderConfigSteps();
    }
    if (KYT.carousel && typeof KYT.carousel.renderCard === 'function') {
      KYT.carousel.renderCard();
    }
    close();
  }

  // Wire buttons
  document.getElementById('btn-add-step').addEventListener('click',   () => open());
  document.getElementById('btn-close-form').addEventListener('click',  close);
  document.getElementById('btn-save-step').addEventListener('click',   save);

  return { open, openEdit, close, removeAttachment };
})();

