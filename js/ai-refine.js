/**
 * js/ai-refine.js — KYT (Know Your Travel)
 * Standalone module for "Refine with AI":
 * 1. buildEnrichPrompt(tripContext, twistText)
 * 2. parseAndDiff(rawText, originalTripContext)
 * 3. 3-Step Modal UI Controller (init, open, close, goToStep)
 *
 * Exposes: window.KYT.aiRefine
 */

(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : globalThis);
  root.KYT = root.KYT || {};

  function resolveCity(idOrCode) {
    if (!idOrCode) return null;
    const needle = String(idOrCode).toLowerCase().trim();
    if (root.KYT?.ui?.resolveCity) {
      const found = root.KYT.ui.resolveCity(needle);
      if (found) return found;
    }
    const list = Array.isArray(root.KYT_CITIES) ? root.KYT_CITIES : [];
    return list.find(c =>
      c.id === needle ||
      (c.code && c.code.toLowerCase() === needle) ||
      (c.name && c.name.toLowerCase() === needle)
    ) || null;
  }

  // ── 1. Prompt Generator ───────────────────────────────────────────────────────
  function buildEnrichPrompt(tripContext, twistText) {
    if (!tripContext) return '';

    const title = tripContext.title || 'Custom Trip Plan';
    const durationDays = tripContext.durationDays || tripContext.duration || (tripContext.cities ? tripContext.cities.length : 1);
    const originDesc = (tripContext.originCity === 'already_there' || tripContext.originCity === '0')
      ? 'Already in destination'
      : (tripContext.originName || resolveCity(tripContext.originCity)?.name || tripContext.originCity || 'Bengaluru');

    const cityIds = Array.isArray(tripContext.cities) ? tripContext.cities : [];
    const cityList = cityIds.map(cId => {
      const c = resolveCity(cId);
      return c ? c.name : cId;
    });
    const destinationsList = cityList.join(' → ') || 'Destination';

    const taste = tripContext.taste || {};
    const intent = taste.intent || 'mixed';
    const diet = taste.diet || 'any';
    const pace = taste.pace || 'standard';

    // Candidate attractions & city beats from catalog
    let cityBeatsSummary = '';
    cityIds.forEach(cId => {
      const city = resolveCity(cId);
      if (city) {
        cityBeatsSummary += `\nCity: ${city.name} (${city.state || 'India'})\n`;
        if (city.desc) cityBeatsSummary += `Overview: ${city.desc}\n`;
        const beats = city.beats || [];
        if (beats.length) {
          cityBeatsSummary += `Key Candidate Attractions & Experiences:\n`;
          beats.forEach(b => {
            const timeHint = b.hour != null ? `${String(b.hour).padStart(2, '0')}:00` : '';
            const verifyHint = (b.verify && b.verify.length) ? ` [Rules/Timings: ${b.verify.join('; ')}]` : '';
            const mapHint = b.mapsUrl ? ` [Map: ${b.mapsUrl}]` : '';
            cityBeatsSummary += `  - ${b.title} (${b.where || city.name})${timeHint ? ' ~ ' + timeHint : ''}${verifyHint}${mapHint}\n`;
            if (b.notes) cityBeatsSummary += `    Notes: ${b.notes}\n`;
          });
        }
      }
    });

    // Existing draft schedule
    let draftSummary = '';
    if (Array.isArray(tripContext.days) && tripContext.days.length) {
      draftSummary = '\nCURRENT DRAFT SCHEDULE:\n';
      tripContext.days.forEach(d => {
        draftSummary += `Day ${d.day} (${d.cityName || d.title || 'Day ' + d.day}):\n`;
        (d.steps || []).forEach(s => {
          draftSummary += `  - [${s.phase || 'Anytime'}] ${s.title} (${s.where || ''})\n`;
        });
      });
    }

    return `You are an expert Indian travel planner and itinerary curator for KYT (Know Your Travel).
Enrich and refine this trip itinerary with verified local knowledge, temple opening hours, afternoon closures, and exact Google Maps links.

TRIP DETAILS:
- Trip Title: ${title}
- Starting Point: ${originDesc}
- Duration: ${durationDays} Days
- Destinations: ${destinationsList}
- Travel Style: Intent: ${intent}, Diet: ${diet}, Pace: ${pace}
${twistText ? `- Special Requests / Customizations: ${twistText}\n` : ''}${draftSummary}
CANDIDATE ATTRACTIONS & CITY BEATS:${cityBeatsSummary || '\nNo catalog beats available. Synthesize popular attractions for ' + destinationsList + '.\n'}

INSTRUCTIONS:
1. DESTINATIONS: Lock itinerary strictly to the selected cities: ${destinationsList} (plus worthwhile nearby spots directly on route).
2. TASTE & PACE FILTERING: Select only the attractions that comfortably fit each day for a "${pace}" pace and "${intent}" travel style. Do not overpack the day.
3. CHRONOLOGICAL FLOW: Sequence attractions logically within each city using natural day phases ("Morning", "Midday", "Afternoon", "Evening") rather than rigid timetable slots.
4. TIMINGS & CLOSURES: In "verify" and "notes", specify exact temple timings, afternoon darshan closure windows (e.g. 12:30 PM - 4:00 PM), dress codes, photography bans, booking links, and closed days.
5. GOOGLE MAPS LINKS: Provide a direct Google Maps link ("mapsUrl") for every attraction/temple/restaurant (e.g. "https://www.google.com/maps/search/?api=1&query=Shaniwar+Wada+Pune") and inter-city driving directions (e.g. "https://www.google.com/maps/dir/?api=1&origin=Pune&destination=Nashik&travelmode=driving").
6. OUTPUT FORMAT: Respond ONLY with a single valid JSON object enclosed in a \`\`\`json code block. No conversational preamble.

JSON SCHEMA:
{
  "title": "${title}",
  "tagline": "A short, vivid tagline summarizing the journey",
  "highlights": ["Key highlight 1", "Key highlight 2"],
  "tips": ["Practical local travel tip 1", "Practical local travel tip 2"],
  "beforeYouGo": ["Crucial booking / attire / timing notice 1"],
  "days": [
    {
      "day": 1,
      "title": "Title for Day 1",
      "cityName": "${cityList[0] || 'City'}",
      "steps": [
        {
          "phase": "Morning",
          "hour": 9,
          "minute": 0,
          "title": "Attraction or Activity Name",
          "where": "Place or Landmark, City",
          "icon": "landmark",
          "durationMin": 90,
          "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Place+Name+City",
          "notes": "Practical tips, darshan guidance, or scenic recommendations",
          "verify": ["Temple closed 12:30 PM - 4:00 PM", "Traditional attire mandatory"]
        }
      ]
    }
  ]
}`;
  }

  function repairJson(s) {
    let out = s;
    out = out.replace(/\u00A0/g, ' ').replace(/[“”„\u201C\u201D]/g, '"').replace(/[‘’\u2018\u2019]/g, "'");
    out = out.replace(/^\s*\/\/.*$/gm, '');
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return out;
  }

  function extractJson(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    let s = rawText.trim();

    // Strip markdown code fences
    const fenceMatch = s.match(/```(?:json)?([\s\S]*?)```/i);
    if (fenceMatch) s = fenceMatch[1].trim();

    // Find outermost braces
    const firstOpen = s.indexOf('{');
    const lastClose = s.lastIndexOf('}');
    if (firstOpen >= 0 && lastClose > firstOpen) {
      s = s.slice(firstOpen, lastClose + 1);
    }

    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch (e1) {
      const fixed = repairJson(s);
      try {
        const parsed = JSON.parse(fixed);
        return Array.isArray(parsed) ? parsed[0] : parsed;
      } catch (err) {
        throw new Error('Could not parse valid JSON from the AI response. Please make sure you copied the full JSON block.');
      }
    }
  }

  function parseAndDiff(rawText, originalTripContext) {
    const rawObj = extractJson(rawText);
    if (!rawObj || typeof rawObj !== 'object') {
      throw new Error('No valid trip JSON structure found in the response.');
    }

    const trip = {
      title: rawObj.title || originalTripContext?.title || 'Refined Trip',
      tagline: rawObj.tagline || '',
      highlights: Array.isArray(rawObj.highlights) ? rawObj.highlights : [],
      tips: Array.isArray(rawObj.tips) ? rawObj.tips : [],
      beforeYouGo: Array.isArray(rawObj.beforeYouGo) ? rawObj.beforeYouGo : [],
      cities: originalTripContext?.cities || [],
      originCity: originalTripContext?.originCity || 'already_there',
      durationDays: rawObj.durationDays || (Array.isArray(rawObj.days) ? rawObj.days.length : (originalTripContext?.durationDays || 1)),
      taste: originalTripContext?.taste || { intent: 'mixed', diet: 'any', pace: 'standard' },
      days: []
    };

    const daysInput = Array.isArray(rawObj.days) ? rawObj.days : [];
    trip.days = daysInput.map((d, dIdx) => {
      const dayNum = Number(d.day != null ? d.day : dIdx + 1);
      const cityName = d.cityName || (originalTripContext?.cities && originalTripContext.cities[dIdx]) || '';
      const stepsInput = Array.isArray(d.steps) ? d.steps : [];

      const steps = stepsInput.map((s, sIdx) => {
        const title = String(s.title || 'Sightseeing').trim();
        const where = String(s.where || cityName || '').trim();
        let mapsUrl = String(s.mapsUrl || '').trim();
        if (!mapsUrl) {
          mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((title + ' ' + where).trim())}`;
        }
        let verify = [];
        if (Array.isArray(s.verify)) {
          verify = s.verify.map(v => String(v).trim()).filter(Boolean);
        } else if (typeof s.verify === 'string' && s.verify.trim()) {
          verify = [s.verify.trim()];
        }

        return {
          phase: s.phase || (sIdx === 0 ? 'Morning' : (sIdx === 1 ? 'Midday' : (sIdx === 2 ? 'Afternoon' : 'Evening'))),
          hour: s.hour != null ? Number(s.hour) : (9 + sIdx * 2),
          minute: s.minute != null ? Number(s.minute) : 0,
          title: title,
          where: where,
          icon: s.icon || 'map-pin',
          durationMin: s.durationMin || 90,
          mapsUrl: mapsUrl,
          notes: String(s.notes || '').trim(),
          verify: verify
        };
      });

      return {
        day: dayNum,
        title: d.title || `Day ${dayNum}: Explore ${cityName || 'Destination'}`,
        cityName: cityName,
        steps: steps
      };
    });

    if (!trip.days.length) {
      throw new Error('The trip contains no scheduled days or steps.');
    }

    // Compute Diff Summary
    let totalSteps = 0;
    let mapsCount = 0;
    let verifyCount = (trip.beforeYouGo || []).length;
    const addedOrEnriched = [];
    const aiStepTitleSet = new Set();

    trip.days.forEach(d => {
      (d.steps || []).forEach(s => {
        totalSteps++;
        if (s.mapsUrl && s.mapsUrl.startsWith('http')) mapsCount++;
        if (s.verify && s.verify.length) verifyCount += s.verify.length;
        addedOrEnriched.push(s.title);
        aiStepTitleSet.add(s.title.toLowerCase().trim());
      });
    });

    // Gather candidate attractions
    const candidateTitles = [];
    const candidateSet = new Set();
    const cityIds = Array.isArray(originalTripContext?.cities) ? originalTripContext.cities : [];
    cityIds.forEach(cId => {
      const city = resolveCity(cId);
      if (city && Array.isArray(city.beats)) {
        city.beats.forEach(b => {
          if (b.title && !candidateSet.has(b.title.toLowerCase().trim())) {
            candidateSet.add(b.title.toLowerCase().trim());
            candidateTitles.push(b.title);
          }
        });
      }
    });

    if (Array.isArray(originalTripContext?.days)) {
      originalTripContext.days.forEach(d => {
        (d.steps || []).forEach(s => {
          if (s.title && !candidateSet.has(s.title.toLowerCase().trim())) {
            candidateSet.add(s.title.toLowerCase().trim());
            candidateTitles.push(s.title);
          }
        });
      });
    }

    // Compute filtered out attractions
    const removedSteps = candidateTitles.filter(cand => {
      const candLower = cand.toLowerCase().trim();
      for (const aiTitle of aiStepTitleSet) {
        if (aiTitle.includes(candLower) || candLower.includes(aiTitle)) return false;
      }
      return true;
    });

    const diff = {
      totalSteps,
      mapsCount,
      verifyCount,
      addedOrEnriched,
      removedSteps
    };

    return { trip, diff };
  }

  // ── 3. 3-Step Modal UI Controller ─────────────────────────────────────────────
  let config = {
    getTripContext: null,
    onAccept: null,
    modalId: 'ai-refine-modal',
    panelId: 'ai-refine-panel'
  };

  let currentParsedResult = null;

  function getModal() {
    return document.getElementById(config.modalId);
  }

  function getPanel() {
    return document.getElementById(config.panelId);
  }

  function getSelectedTwists() {
    const selectedChips = Array.from(document.querySelectorAll('.ai-twist-chip.active')).map(el => el.dataset.value);
    const customTwist = document.getElementById('ai-custom-twist')?.value.trim();
    const allTwists = [...selectedChips];
    if (customTwist) allTwists.push(customTwist);
    return allTwists.join('; ');
  }

  function updatePromptPreview() {
    const previewEl = document.getElementById('ai-raw-prompt-preview');
    if (!previewEl || !config.getTripContext) return;
    const tripCtx = config.getTripContext();
    previewEl.value = buildEnrichPrompt(tripCtx, getSelectedTwists());
  }

  function goToStep(stepNum) {
    const s1 = document.getElementById('ai-step-1');
    const s2 = document.getElementById('ai-step-2');
    const s3 = document.getElementById('ai-step-3');
    if (s1) s1.classList.toggle('hidden', stepNum !== 1);
    if (s2) s2.classList.toggle('hidden', stepNum !== 2);
    if (s3) s3.classList.toggle('hidden', stepNum !== 3);

    const statusEl = document.getElementById('ai-paste-status');
    if (statusEl && stepNum !== 2) statusEl.textContent = '';
    if (root.lucide) root.lucide.createIcons();
  }

  function open() {
    const modal = getModal();
    const panel = getPanel();
    if (!modal || !panel) return;

    currentParsedResult = null;
    goToStep(1);
    updatePromptPreview();

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
      modal.classList.add('opacity-100');
      panel.classList.remove('translate-y-full');
      panel.classList.add('translate-y-0');
    });

    if (root.lucide) root.lucide.createIcons();
  }

  function close() {
    const modal = getModal();
    const panel = getPanel();
    if (!modal || !panel) return;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    panel.classList.remove('translate-y-0');
    panel.classList.add('translate-y-full');

    setTimeout(() => {
      modal.classList.add('hidden');
      currentParsedResult = null;
    }, 300);
  }

  function showStatus(msg, type = 'info') {
    const el = document.getElementById('ai-paste-status');
    if (!el) return;
    el.textContent = msg;
    if (type === 'error') {
      el.className = 'text-xs font-semibold py-1.5 px-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 mt-2 block';
    } else if (type === 'success') {
      el.className = 'text-xs font-semibold py-1.5 px-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 mt-2 block';
    } else {
      el.className = 'text-xs font-semibold py-1.5 px-3 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 mt-2 block';
    }
  }

  function renderDiffPreview(parsedResult) {
    const container = document.getElementById('ai-step-3-content');
    if (!container || !parsedResult) return;

    const { trip, diff } = parsedResult;
    const esc = (s) => (root.KYT?.utils?.escapeHTML ? root.KYT.utils.escapeHTML(s) : (s || ''));

    // 1. Summary Badges Banner
    const badgesHtml = `
      <div class="grid grid-cols-3 gap-2 p-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-2xl border border-indigo-100/80 shadow-2xs">
        <div class="flex flex-col items-center justify-center p-2 bg-white/90 rounded-xl shadow-2xs text-center">
          <span class="text-sm font-black text-indigo-700">📍 ${diff.mapsCount}</span>
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Map Links</span>
        </div>
        <div class="flex flex-col items-center justify-center p-2 bg-white/90 rounded-xl shadow-2xs text-center">
          <span class="text-sm font-black text-amber-600">⚠️ ${diff.verifyCount}</span>
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Timing Alerts</span>
        </div>
        <div class="flex flex-col items-center justify-center p-2 bg-white/90 rounded-xl shadow-2xs text-center">
          <span class="text-sm font-black text-emerald-700">🗓️ ${diff.totalSteps}</span>
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Steps Sequenced</span>
        </div>
      </div>
    `;

    // 2. Filtered & Sequenced Day Plan
    const daysHtml = (trip.days || []).map(d => {
      const stepsHtml = (d.steps || []).map(s => {
        const verifyTags = (s.verify || []).map(v => `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-bold">
            <i data-lucide="alert-circle" class="w-3 h-3 text-amber-600 shrink-0"></i> ${esc(v)}
          </span>
        `).join('');

        const mapBtn = s.mapsUrl ? `
          <a href="${esc(s.mapsUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline shrink-0">
            <i data-lucide="navigation" class="w-3 h-3"></i> Maps
          </a>
        ` : '';

        return `
          <div class="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                  ${esc(s.phase || 'Explore')}
                </span>
                <h5 class="text-xs font-bold text-slate-800">${esc(s.title)}</h5>
              </div>
              ${mapBtn}
            </div>
            ${s.where ? `<p class="text-[11px] text-slate-500 font-medium">${esc(s.where)}</p>` : ''}
            ${s.notes ? `<p class="text-[11px] text-slate-600 leading-snug">${esc(s.notes)}</p>` : ''}
            ${verifyTags ? `<div class="flex flex-wrap gap-1 pt-1">${verifyTags}</div>` : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="space-y-2">
          <div class="flex items-center justify-between pb-1 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-black uppercase tracking-wider">Day ${d.day}</span>
              <h4 class="text-xs font-bold text-slate-800">${esc(d.title || d.cityName || 'Itinerary')}</h4>
            </div>
            ${d.cityName ? `<span class="text-[10px] font-bold text-slate-400">${esc(d.cityName)}</span>` : ''}
          </div>
          <div class="space-y-2">${stepsHtml}</div>
        </div>
      `;
    }).join('');

    // 3. Collapsible Filtered Out Attractions List
    let removedHtml = '';
    if (diff.removedSteps && diff.removedSteps.length > 0) {
      const items = diff.removedSteps.map(r => `
        <li class="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <i data-lucide="minus-circle" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
          <span>${esc(r)}</span>
        </li>
      `).join('');

      removedHtml = `
        <details class="group bg-slate-50 rounded-2xl border border-slate-200/80 p-3 text-xs">
          <summary class="cursor-pointer font-bold text-slate-600 select-none flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <i data-lucide="filter" class="w-3.5 h-3.5 text-slate-400"></i>
              Filtered out to fit your pace (${diff.removedSteps.length})
            </span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition-transform"></i>
          </summary>
          <div class="mt-2.5 pt-2 border-t border-slate-200/60 space-y-1.5">
            <p class="text-[11px] text-slate-400 leading-snug mb-2">
              The AI excluded these candidate attractions to maintain a comfortable pace without fatigue:
            </p>
            <ul class="space-y-1 pl-1">${items}</ul>
          </div>
        </details>
      `;
    }

    container.innerHTML = `
      <div class="space-y-4">
        ${badgesHtml}
        <div class="space-y-4">
          <div class="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i> Filtered & Sequenced Plan
          </div>
          ${daysHtml}
        </div>
        ${removedHtml}
      </div>
    `;

    if (root.lucide) root.lucide.createIcons();
  }

  function handlePreviewAiChanges() {
    const textarea = document.getElementById('ai-response-textarea');
    const rawText = textarea ? textarea.value.trim() : '';

    if (!rawText) {
      showStatus('Please paste the JSON response from Gemini before previewing.', 'error');
      return;
    }

    showStatus('Analyzing AI output...', 'info');

    try {
      const originalTrip = config.getTripContext ? config.getTripContext() : {};
      const parsed = parseAndDiff(rawText, originalTrip);
      currentParsedResult = parsed;

      renderDiffPreview(parsed);
      goToStep(3);

      const statusEl = document.getElementById('ai-paste-status');
      if (statusEl) statusEl.textContent = '';
    } catch (err) {
      console.error('Error previewing AI changes:', err);
      showStatus(err.message || 'Could not parse response. Please verify the JSON format.', 'error');
    }
  }

  function handleAcceptAi() {
    if (!currentParsedResult || !currentParsedResult.trip) {
      showStatus('No parsed trip available to apply.', 'error');
      return;
    }

    const { trip } = currentParsedResult;
    const origCtx = config.getTripContext ? config.getTripContext() : {};
    const baseId = origCtx?.id || ('ai_' + Date.now().toString(36));

    let vTrip = null;
    if (root.KYT?.ui?.convertCuratedTripToVirtual) {
      vTrip = root.KYT.ui.convertCuratedTripToVirtual(trip, baseId);
    } else {
      vTrip = {
        id: baseId,
        name: trip.title,
        duration: trip.durationDays || trip.days.length,
        cities: trip.cities,
        originCity: trip.originCity,
        taste: trip.taste,
        steps: []
      };
    }
    vTrip.isAiRefined = true;

    // Save to localStorage
    try {
      const stored = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
      const existingIdx = stored.findIndex(t => t.id === vTrip.id);
      if (existingIdx >= 0) {
        stored[existingIdx] = vTrip;
      } else {
        stored.unshift(vTrip);
      }
      if (window.KYT && KYT.backup) KYT.backup.safeSet('kyt_virtual_trips', JSON.stringify(stored)); else localStorage.setItem('kyt_virtual_trips', JSON.stringify(stored));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }

    // Update hero banner titles if present
    const titleEl = document.getElementById('trip-title');
    if (titleEl && trip.title) titleEl.textContent = trip.title;
    const descEl = document.getElementById('trip-desc');
    if (descEl && (trip.tagline || trip.desc)) descEl.textContent = trip.tagline || trip.desc;

    if (navigator.vibrate) {
      try { navigator.vibrate(40); } catch(e) {}
    }

    close();

    if (typeof config.onAccept === 'function') {
      config.onAccept(vTrip, trip);
    }
  }

  function handleRejectAi() {
    currentParsedResult = null;
    close();
  }

  function init(options) {
    if (options) {
      config = { ...config, ...options };
    }

    const btnOpenAiRefine = document.getElementById('btn-open-ai-refine');
    if (btnOpenAiRefine) btnOpenAiRefine.onclick = () => open();

    document.querySelectorAll('.btn-close-ai-modal').forEach(btn => {
      btn.onclick = () => close();
    });

    const modalEl = getModal();
    if (modalEl) {
      modalEl.onclick = (e) => {
        if (e.target === modalEl) close();
      };
    }

    // Step 1: Twist Chips
    document.querySelectorAll('.ai-twist-chip').forEach(btn => {
      btn.onclick = () => {
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          btn.className = 'ai-twist-chip active text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 bg-indigo-600 text-white border-indigo-600 shadow-xs';
        } else {
          btn.className = 'ai-twist-chip text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';
        }
        updatePromptPreview();
      };
    });

    const customTwistInput = document.getElementById('ai-custom-twist');
    if (customTwistInput) {
      customTwistInput.oninput = () => updatePromptPreview();
    }

    // Step 1: Copy Prompt with emerald feedback
    const btnCopyPrompt = document.getElementById('btn-copy-prompt') || document.getElementById('btn-copy-open-gemini');
    const btnGoToStep2 = document.getElementById('btn-go-to-step-2');
    const nextActionsEl = document.getElementById('ai-step-1-next-actions');

    if (btnCopyPrompt) {
      btnCopyPrompt.onclick = async () => {
        const previewEl = document.getElementById('ai-raw-prompt-preview');
        const promptText = previewEl ? previewEl.value : (config.getTripContext ? buildEnrichPrompt(config.getTripContext(), getSelectedTwists()) : '');

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(promptText);
          }
        } catch (err) {
          console.warn('Clipboard write error:', err);
        }

        const originalHtml = btnCopyPrompt.innerHTML;
        const originalClass = btnCopyPrompt.className;

        btnCopyPrompt.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> ✓ Copied to Clipboard!`;
        btnCopyPrompt.className = 'w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer';
        if (root.lucide) root.lucide.createIcons();

        if (btnGoToStep2) btnGoToStep2.classList.remove('hidden');
        if (nextActionsEl) {
          nextActionsEl.classList.remove('hidden');
          nextActionsEl.classList.add('flex');
        }

        setTimeout(() => {
          btnCopyPrompt.innerHTML = originalHtml;
          btnCopyPrompt.className = originalClass;
          if (root.lucide) root.lucide.createIcons();
        }, 2500);
      };
    }

    if (btnGoToStep2) {
      btnGoToStep2.onclick = () => goToStep(2);
    }

    const btnShareNative = document.getElementById('btn-share-prompt-native');
    if (btnShareNative) {
      if (!navigator.share) {
        btnShareNative.classList.add('hidden');
      } else {
        btnShareNative.onclick = async () => {
          const previewEl = document.getElementById('ai-raw-prompt-preview');
          const promptText = previewEl ? previewEl.value : '';
          try {
            await navigator.share({
              title: 'Refine KYT Trip with AI',
              text: promptText
            });
            goToStep(2);
          } catch(e) {
            goToStep(2);
          }
        };
      }
    }

    const btnCopyRaw = document.getElementById('btn-copy-raw-prompt');
    if (btnCopyRaw) {
      btnCopyRaw.onclick = () => {
        const previewEl = document.getElementById('ai-raw-prompt-preview');
        if (previewEl && previewEl.value) {
          navigator.clipboard.writeText(previewEl.value).then(() => {
            btnCopyRaw.textContent = 'Copied!';
            setTimeout(() => { btnCopyRaw.textContent = 'Copy text'; }, 1500);
          }).catch(() => {});
        }
      };
    }

    // Step 2 Handlers
    const btnBack1 = document.getElementById('btn-back-to-step-1');
    if (btnBack1) btnBack1.onclick = () => goToStep(1);

    const btnPasteClip = document.getElementById('btn-paste-clipboard');
    if (btnPasteClip) {
      btnPasteClip.onclick = async () => {
        if (navigator.clipboard && navigator.clipboard.readText) {
          try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
              const textarea = document.getElementById('ai-response-textarea');
              if (textarea) textarea.value = text;
              handlePreviewAiChanges();
              return;
            }
          } catch (err) {
            console.warn('Clipboard read error/denied:', err);
          }
        }
        const textarea = document.getElementById('ai-response-textarea');
        if (textarea) {
          textarea.focus();
          showStatus('Please tap the box below and paste your AI response.', 'info');
        }
      };
    }

    const btnPreview = document.getElementById('btn-preview-ai-changes') || document.getElementById('btn-apply-ai-plan');
    if (btnPreview) btnPreview.onclick = () => handlePreviewAiChanges();

    // Step 3 Handlers
    const btnBack2 = document.getElementById('btn-back-to-step-2');
    if (btnBack2) btnBack2.onclick = () => goToStep(2);

    const btnReject = document.getElementById('btn-reject-ai');
    if (btnReject) btnReject.onclick = () => handleRejectAi();

    const btnAccept = document.getElementById('btn-accept-ai');
    if (btnAccept) btnAccept.onclick = () => handleAcceptAi();

    // Paste auto-trigger
    const aiTextarea = document.getElementById('ai-response-textarea');
    if (aiTextarea) {
      aiTextarea.onpaste = (e) => {
        const text = (e.clipboardData || root.clipboardData)?.getData('text') || '';
        if (text.includes('{') && text.includes('}')) {
          setTimeout(() => {
            aiTextarea.value = text;
            handlePreviewAiChanges();
          }, 100);
        }
      };
    }
  }

  // ── 4. Public API ─────────────────────────────────────────────────────────────
  root.KYT.aiRefine = {
    buildEnrichPrompt,
    parseAndDiff,
    init,
    open,
    close,
    goToStep
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.KYT.aiRefine;
  }
})();
