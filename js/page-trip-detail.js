/* Page script for trip_detail.html, moved out of the HTML so HTML auto-formatters cannot corrupt it. Loaded as a classic script at the same position. */
    // Optional Cloudflare Worker endpoint for ultra-short 55-char links (e.g. 'https://kyt-share.<subdomain>.workers.dev')
    window.KYT_SHORTENER_URL = 'https://kyt-share.deshvenkatesh.workers.dev';

    function getShortenerEndpoint() {
      let endpoint = (window.KYT_SHORTENER_URL || '').trim();
      if (!endpoint) return '';
      if (!/^https?:\/\//i.test(endpoint)) {
        endpoint = 'https://' + endpoint;
      }
      return endpoint.replace(/\/+$/, '');
    }

    document.addEventListener('DOMContentLoaded', async () => {
      const params = new URLSearchParams(window.location.search);
      let tripName = params.get('trip') || 'My Trip';
      let citiesParam = params.get('cities');
      let tasteParam = params.get('taste') || '';
      let curatedParam = params.get('curated') || '';
      let originParam = params.get('origin') || '';
      let daysParam = parseInt(params.get('days'), 10) || 0;
      let tripId = params.get('id');
      const aiParam = params.get('ai');

      // Setup Unified Header Navigation
      const isFromCurated = Boolean(curatedParam && !tripId && (document.referrer.includes('curated_trips.html') || !document.referrer.includes('virtual_trip.html')));
      const backUrl = isFromCurated ? 'curated_trips.html' : 'virtual_trip.html';
      const backLabel = isFromCurated ? 'Curated Trips' : 'My Trips';

      const backLink = document.getElementById('detail-back-link');
      const backLinkText = document.getElementById('detail-back-label');
      if (backLink) backLink.href = backUrl;
      if (backLinkText) backLinkText.textContent = `Back to ${backLabel}`;

      if (window.KYT && window.KYT.header) {
        KYT.header.renderMainToolbar('main-toolbar', { active: isFromCurated ? 'curated' : 'virtual' });
      }

      if (tripId) {
        try {
          const vtrips = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
          const trip = vtrips.find(t => t.id === tripId);
          if (trip) {
            tripName = trip.name || 'My Trip';
            if (trip.curatedId) curatedParam = trip.curatedId;
            originParam = trip.originCity || 'already_there';
            daysParam = trip.duration || (trip.cities ? trip.cities.length : 1);

            const shortC = trip.cities.map(id => {
              const c = KYT.ui.resolveCity(id);
              return c && c.code ? c.code : id;
            });
            citiesParam = shortC.join(',');

            const codeMap = {
              intent: { mixed: 'm', spiritual: 's', cultural: 'c', adventure: 'a', culinary: 'u' },
              diet: { any: 'a', veg: 'v', jain: 'j', satvik: 'k' },
              pace: { short: 'h', standard: 's', deep: 'd' }
            };
            const tasteObj = trip.taste || { intent: 'mixed', diet: 'any', pace: 'standard' };
            tasteParam = (codeMap.intent[tasteObj.intent] || 'm') + (codeMap.diet[tasteObj.diet] || 'a') + (codeMap.pace[tasteObj.pace] || 's');
            const curQ = curatedParam ? `&curated=${encodeURIComponent(curatedParam)}` : '';
            window.history.replaceState({}, '', `?trip=${encodeURIComponent(tripName)}&cities=${citiesParam}&taste=${tasteParam}${curQ}&origin=${encodeURIComponent(originParam)}&days=${daysParam}&id=${encodeURIComponent(tripId)}`);
          }
        } catch (e) { }
      }

      try {
        tripName = decodeURIComponent(tripName.replace(/\+/g, ' '));
      } catch (e) { }
      document.getElementById('trip-title').textContent = tripName;

      let cTrip = null;
      if (curatedParam && window.KYT_CURATED_TRIPS) {
        cTrip = window.KYT_CURATED_TRIPS.find(t => t.id === curatedParam);
        if (cTrip) {
          if (cTrip.tagline) {
            const descEl = document.getElementById('trip-desc');
            if (descEl) descEl.textContent = cTrip.tagline;
          }
          if (!originParam && cTrip.originCity) {
            originParam = cTrip.originCity;
          }
          if (!daysParam && cTrip.durationDays) {
            daysParam = cTrip.durationDays;
          }
        }
      }

      let cityIds = citiesParam ? citiesParam.split(',').map(code => {
        const c = KYT.ui.resolveCity(code);
        return c ? c.id : code;
      }) : [];

      function extractCitiesFromTrip(trip) {
        if (!trip) return [];
        if (trip.cities && Array.isArray(trip.cities) && trip.cities.length) {
          return trip.cities.map(code => {
            const c = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(code) : null;
            return c ? c.id : code;
          }).filter(Boolean);
        }
        if (trip.curatedId && window.KYT_CURATED_TRIPS) {
          const c = window.KYT_CURATED_TRIPS.find(t => t.id === trip.curatedId);
          if (c && c.cities && c.cities.length) {
            return c.cities.map(code => {
              const rc = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(code) : null;
              return rc ? rc.id : code;
            }).filter(Boolean);
          }
        }
        const found = [];
        if (trip.steps && Array.isArray(trip.steps)) {
          trip.steps.forEach(s => {
            const candidates = [s.cityId, s.cityName, s.where];
            for (const cand of candidates) {
              if (!cand) continue;
              const c = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(cand) : null;
              if (c && !found.includes(c.id)) {
                found.push(c.id);
                break;
              }
            }
          });
        }
        return found;
      }

      // Render Hero Banner Trip Metadata Badges (Origin, Duration, Taste Profile)
      function renderMetaPills() {
        const pillsContainer = document.getElementById('trip-meta-pills');
        if (!pillsContainer) return;
        const pillItems = [];
        const esc = (s) => (window.KYT && KYT.utils && KYT.utils.escapeHTML) ? KYT.utils.escapeHTML(s) : s;
        const pillClass = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-blue-900 border border-blue-200/80 shadow-2xs';

        // 1. Starting Point (Origin)
        if (originParam === '0' || originParam === 'already_there') {
          pillItems.push(`<span class="${pillClass}">📍 Starts in destination</span>`);
        } else if (originParam) {
          const originCity = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(originParam) : null;
          if (originCity && originCity.name) {
            pillItems.push(`<span class="${pillClass}">📍 From ${esc(originCity.name)}</span>`);
          } else {
            pillItems.push(`<span class="${pillClass}">📍 From ${esc(originParam)}</span>`);
          }
        }

        // (The length of the trip is in the title chip below the name, so no pill repeats it.)
        const totalDays = daysParam || (cityIds && cityIds.length ? cityIds.length : 1);

        // 3. Taste Profile
        const tasteCodeMap = {
          intent: { m: 'Mixed', s: 'Spiritual', c: 'Cultural', a: 'Adventure', u: 'Culinary', n: 'Nature' },
          diet: { a: 'Any food', v: 'Vegetarian', j: 'Jain', k: 'Satvik' },
          pace: { h: 'Short', s: 'Standard', d: 'Deep', r: 'Relaxed', f: 'Fast' }
        };
        const tasteLabels = {
          intent: { mixed: 'Mixed', spiritual: 'Spiritual', cultural: 'Cultural', adventure: 'Adventure', culinary: 'Culinary', nature: 'Nature' },
          diet: { any: 'Any food', veg: 'Vegetarian', jain: 'Jain', satvik: 'Satvik' },
          pace: { short: 'Short', standard: 'Standard', deep: 'Deep', relaxed: 'Relaxed', fast: 'Fast' }
        };

        let tasteIntent = '';
        let tasteDiet = '';
        let tastePace = '';

        if (tasteParam && tasteParam.length === 3) {
          tasteIntent = tasteCodeMap.intent[tasteParam[0]] || '';
          tasteDiet = tasteCodeMap.diet[tasteParam[1]] || '';
          tastePace = tasteCodeMap.pace[tasteParam[2]] || '';
        } else if (tasteParam && tasteParam.includes('|')) {
          const parts = tasteParam.split('|');
          tasteIntent = tasteLabels.intent[parts[0]] || parts[0] || '';
          tasteDiet = tasteLabels.diet[parts[1]] || parts[1] || '';
          tastePace = tasteLabels.pace[parts[2]] || parts[2] || '';
        } else if (cTrip && cTrip.taste) {
          tasteIntent = tasteLabels.intent[cTrip.taste.intent] || cTrip.taste.intent || '';
          tasteDiet = tasteLabels.diet[cTrip.taste.diet] || cTrip.taste.diet || '';
          tastePace = tasteLabels.pace[cTrip.taste.pace] || cTrip.taste.pace || '';
        }

        if (tasteIntent) pillItems.push(`<span class="${pillClass}">${esc(tasteIntent)}</span>`);
        if (tasteDiet) pillItems.push(`<span class="${pillClass}">${esc(tasteDiet)}</span>`);
        if (tastePace) pillItems.push(`<span class="${pillClass}">${esc(tastePace)}</span>`);

        pillsContainer.innerHTML = pillItems.join('');

        // Own plans have no tagline: show a plain summary instead of marketing copy.
        const descEl = document.getElementById('trip-desc');
        if (descEl && !descEl.textContent.trim() && cityIds && cityIds.length) {
          descEl.textContent = `${cityIds.length} ${cityIds.length > 1 ? 'cities' : 'city'} · ${totalDays} day${totalDays > 1 ? 's' : ''}`;
        }
      }
      renderMetaPills();

      // ── Share Privacy Consent Modal Controller ──────────────────────────────
      const shareModal = document.getElementById('share-consent-modal');
      const shareConsentCb = document.getElementById('share-privacy-consent-cb');
      const btnConfirmShare = document.getElementById('btn-confirm-share-url');
      const btnCloseShare = document.getElementById('btn-close-share-consent');
      const btnCancelShare = document.getElementById('btn-cancel-share-consent');

      function openShareConsent() {
        if (!shareModal) return;
        if (shareConsentCb) shareConsentCb.checked = false;
        if (btnConfirmShare) btnConfirmShare.disabled = true;
        shareModal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
      }

      function closeShareConsent() {
        if (!shareModal) return;
        shareModal.classList.add('hidden');
      }

      if (shareConsentCb && btnConfirmShare) {
        shareConsentCb.addEventListener('change', () => {
          btnConfirmShare.disabled = !shareConsentCb.checked;
        });
      }
      if (btnCloseShare) btnCloseShare.addEventListener('click', closeShareConsent);
      if (btnCancelShare) btnCancelShare.addEventListener('click', closeShareConsent);

      const btnShare = document.getElementById('btn-share-trip');
      if (btnShare) {
        btnShare.addEventListener('click', () => {
          openShareConsent();
        });
      }

      if (btnConfirmShare) {
        btnConfirmShare.addEventListener('click', async () => {
          closeShareConsent();
          const url = new URL(window.location.href);
          const activeId = (loadedVirtualTrip && loadedVirtualTrip.id) || tripId;
          if (activeId) {
            url.searchParams.set('id', activeId);
          }
          // Never include bulky serialized AI data in share URLs to stay well within WhatsApp/messaging limits (<200 chars)
          url.searchParams.delete('ai');

          // Ensure standard short query params are present
          if (tripName) url.searchParams.set('trip', tripName);
          if (citiesParam) url.searchParams.set('cities', citiesParam);
          if (tasteParam) url.searchParams.set('taste', tasteParam);
          if (originParam) url.searchParams.set('origin', originParam);
          if (daysParam) url.searchParams.set('days', String(daysParam));
          if (curatedParam) url.searchParams.set('curated', curatedParam);

          let usedShortCode = false;
          const shortenerEndpoint = getShortenerEndpoint();
          if (shortenerEndpoint && loadedVirtualTrip && loadedVirtualTrip.steps && loadedVirtualTrip.steps.length) {
            try {
              const res = await fetch(`${shortenerEndpoint}/api/trip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loadedVirtualTrip)
              });
              if (res.ok) {
                const data = await res.json();
                if (data && data.id) {
                  url.search = `?c=${encodeURIComponent(data.id)}`;
                  usedShortCode = true;
                }
              }
            } catch (e) {
              console.warn('Cloudflare shortener error, falling back to compact plan:', e);
            }
          }

          // Fallback: If shortener was not used, pack & compress into &plan=
          if (!usedShortCode && loadedVirtualTrip && loadedVirtualTrip.steps && loadedVirtualTrip.steps.length) {
            try {
              const dayBuckets = {};
              loadedVirtualTrip.steps.forEach(s => {
                const d = s.dayId != null ? s.dayId : (s.day != null ? s.day : 1);
                if (!dayBuckets[d]) dayBuckets[d] = [];
                dayBuckets[d].push([
                  s.hour != null ? s.hour : 9,
                  s.minute || 0,
                  s.title || '',
                  s.where || '',
                  s.icon || 'map-pin'
                ]);
              });
              const compactSeq = Object.keys(dayBuckets).map(d => ({
                d: Number(d),
                s: dayBuckets[d]
              }));
              if (window.KYT && KYT.ui && KYT.ui.compressPlan) {
                const compressedPlan = await KYT.ui.compressPlan(compactSeq);
                if (compressedPlan && compressedPlan.length < 1800) {
                  url.searchParams.set('plan', compressedPlan);
                }
              }
            } catch (e) {
              console.warn('Could not compress plan for share:', e);
            }
          }

          const shareTripName = (loadedVirtualTrip && loadedVirtualTrip.name) || tripName;
          const shareData = {
            title: `Check out ${shareTripName} on KYT`,
            text: (cTrip && cTrip.tagline) || `A day-by-day plan on KYT: ${shareTripName}`,
            url: url.toString()
          };
          if (navigator.share) {
            navigator.share(shareData).catch(err => console.log('Error sharing:', err));
          } else {
            navigator.clipboard.writeText(url.toString())
              .then(() => alert('Trip link copied to clipboard!'))
              .catch(err => console.error('Error copying link:', err));
          }
        });
      }

      const btnEditPlan = document.getElementById('btn-edit-plan');
      if (btnEditPlan) {
        btnEditPlan.addEventListener('click', () => {
          const activeId = (loadedVirtualTrip && loadedVirtualTrip.id) || tripId;
          let hasSteps = false;
          if (loadedVirtualTrip && loadedVirtualTrip.steps && loadedVirtualTrip.steps.length > 0) {
            hasSteps = true;
          } else if (tripId) {
            try {
              const vts = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
              const t = vts.find(x => x.id === tripId);
              if (t && t.steps && t.steps.length > 0) hasSteps = true;
            } catch (e) { }
          }
          const targetScreen = hasSteps ? 'builder' : 'canvas';
          if (activeId) {
            window.location.href = `virtual_trip.html?id=${encodeURIComponent(activeId)}&screen=${targetScreen}`;
          } else {
            window.location.href = `virtual_trip.html${window.location.search}&screen=${targetScreen}`;
          }
        });
      }

      // ── AI Refine Controller & Itinerary Renderer ─────────────────────────────
      let loadedVirtualTrip = null;
      if (tripId) {
        try {
          const vtrips = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
          loadedVirtualTrip = vtrips.find(t => t.id === tripId) || null;
        } catch (e) { }
      }

      // Check for Cloudflare / micro-shortener code parameter across devices
      const shortCodeParam = params.get('c');
      const shortenerEndpoint = getShortenerEndpoint();
      if (shortCodeParam && shortenerEndpoint && (!loadedVirtualTrip || !loadedVirtualTrip.steps || !loadedVirtualTrip.steps.length)) {
        try {
          const res = await fetch(`${shortenerEndpoint}/api/trip/${encodeURIComponent(shortCodeParam)}`);
          if (res.ok) {
            const remoteTrip = await res.json();
            if (remoteTrip && remoteTrip.steps) {
              const stored = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
              const existingIdx = stored.findIndex(t => t.id === remoteTrip.id);
              if (existingIdx >= 0) {
                stored[existingIdx] = remoteTrip;
              } else {
                stored.unshift(remoteTrip);
              }
              localStorage.setItem('kyt_virtual_trips', JSON.stringify(stored));
              loadedVirtualTrip = remoteTrip;
              tripId = remoteTrip.id;

              if (remoteTrip.name) {
                tripName = remoteTrip.name;
                const titleEl = document.getElementById('trip-title');
                if (titleEl) titleEl.textContent = remoteTrip.name;
              }
              if (remoteTrip.curatedId && window.KYT_CURATED_TRIPS) {
                cTrip = window.KYT_CURATED_TRIPS.find(t => t.id === remoteTrip.curatedId) || cTrip;
                if (cTrip && cTrip.tagline) {
                  const descEl = document.getElementById('trip-desc');
                  if (descEl) descEl.textContent = cTrip.tagline;
                }
              }

              // Synchronize cities and trip metadata
              const extractedCities = extractCitiesFromTrip(remoteTrip);
              if (extractedCities.length) {
                cityIds = extractedCities;
                citiesParam = cityIds.join(',');
              }
              if (remoteTrip.originCity) originParam = remoteTrip.originCity;
              if (remoteTrip.duration) daysParam = remoteTrip.duration;
              if (remoteTrip.taste) {
                if (typeof remoteTrip.taste === 'string') {
                  tasteParam = remoteTrip.taste;
                } else if (typeof remoteTrip.taste === 'object') {
                  const codeMap = {
                    intent: { mixed: 'm', spiritual: 's', cultural: 'c', adventure: 'a', culinary: 'u' },
                    diet: { any: 'a', veg: 'v', jain: 'j', satvik: 'k' },
                    pace: { short: 'h', standard: 's', deep: 'd' }
                  };
                  tasteParam = (codeMap.intent[remoteTrip.taste.intent] || 'm') +
                               (codeMap.diet[remoteTrip.taste.diet] || 'a') +
                               (codeMap.pace[remoteTrip.taste.pace] || 's');
                }
              }

              renderMetaPills();
              renderCitiesAndVideos();
            }
          }
        } catch (e) {
          console.warn('Could not fetch trip from shortener:', e);
        }
      }

      // Check for shared compressed plan parameter across devices
      const planParam = params.get('plan');
      if (planParam && (!loadedVirtualTrip || !loadedVirtualTrip.steps || !loadedVirtualTrip.steps.length)) {
        try {
          const restoredPlan = await (window.KYT && KYT.ui && KYT.ui.decompressPlan ? KYT.ui.decompressPlan(planParam) : null);
          if (restoredPlan && Array.isArray(restoredPlan)) {
            const baseId = tripId || ('plan_' + Date.now().toString(36));
            const newSteps = [];
            const cList = (cityIds || []).map(cId => KYT.ui.resolveCity(cId)).filter(Boolean);

            restoredPlan.forEach(dItem => {
              const dNum = dItem.d;
              const cityIdx = dNum === 0 ? 0 : Math.min(dNum - 1, (cityIds.length ? cityIds.length - 1 : 0));
              const cityName = cList[cityIdx]?.name || 'Destination';
              (dItem.s || []).forEach(tuple => {
                const hour = tuple[0];
                const minute = tuple[1] || 0;
                const title = tuple[2] || 'Sightseeing';
                const where = tuple[3] || cityName;
                const icon = tuple[4] || 'map-pin';
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title + (where ? (', ' + where) : ''))}`;
                newSteps.push({
                  dayId: dNum,
                  day: dNum,
                  hour,
                  minute,
                  title,
                  where,
                  icon,
                  mapsUrl,
                  cityName
                });
              });
            });

            if (newSteps.length > 0) {
              const vTrip = {
                id: baseId,
                name: tripName || 'Shared Itinerary',
                duration: daysParam || Math.max(1, restoredPlan.length),
                cities: cityIds,
                originCity: originParam || 'already_there',
                taste: { intent: 'mixed', diet: 'any', pace: 'standard' },
                isAiRefined: true,
                steps: newSteps
              };
              const stored = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
              const existingIdx = stored.findIndex(t => t.id === vTrip.id);
              if (existingIdx >= 0) {
                stored[existingIdx] = vTrip;
              } else {
                stored.unshift(vTrip);
              }
              localStorage.setItem('kyt_virtual_trips', JSON.stringify(stored));
              loadedVirtualTrip = vTrip;
              tripId = vTrip.id;

              const extractedPlanCities = extractCitiesFromTrip(vTrip);
              if (extractedPlanCities.length) {
                cityIds = extractedPlanCities;
                citiesParam = cityIds.join(',');
              }
              renderMetaPills();
              renderCitiesAndVideos();
            }
          }
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('plan');
          if (tripId) cleanUrl.searchParams.set('id', tripId);
          window.history.replaceState({}, '', cleanUrl.toString());
        } catch (e) {
          console.error('Error importing plan from URL:', e);
        }
      }

      // Check for shared AI-refined trip parameter across devices (legacy support)
      let aiRefinedData = null;
      if (aiParam) {
        try {
          aiRefinedData = (window.KYT && KYT.ui && KYT.ui.decodeAiTrip) ? KYT.ui.decodeAiTrip(aiParam) : null;
          if (aiRefinedData && !loadedVirtualTrip) {
            const baseId = tripId || aiRefinedData.id || ('ai_' + Date.now().toString(36));
            const vTrip = KYT.ui.convertCuratedTripToVirtual(aiRefinedData, baseId);
            if (vTrip) {
              vTrip.isAiRefined = true;
              const stored = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
              const existingIdx = stored.findIndex(t => t.id === vTrip.id);
              if (existingIdx >= 0) {
                stored[existingIdx] = vTrip;
              } else {
                stored.unshift(vTrip);
              }
              localStorage.setItem('kyt_virtual_trips', JSON.stringify(stored));
              loadedVirtualTrip = vTrip;
              tripId = vTrip.id;
            }
          }
          // Clean up the massive ?ai= parameter from the address bar immediately so it doesn't linger or propagate to shares
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('ai');
          if (tripId) cleanUrl.searchParams.set('id', tripId);
          window.history.replaceState({}, '', cleanUrl.toString());
        } catch (e) { }
      }

      function getTripForPrompt() {
        if (curatedParam && window.KYT_CURATED_TRIPS) {
          const c = window.KYT_CURATED_TRIPS.find(t => t.id === curatedParam);
          if (c) return c;
        }
        if (loadedVirtualTrip) {
          if (loadedVirtualTrip.curatedId && window.KYT_CURATED_TRIPS) {
            const c = window.KYT_CURATED_TRIPS.find(t => t.id === loadedVirtualTrip.curatedId);
            if (c) return c;
          }
          const dayBuckets = {};
          (loadedVirtualTrip.steps || []).forEach(s => {
            const d = s.dayId != null ? s.dayId : (s.day != null ? s.day : 1);
            if (!dayBuckets[d]) dayBuckets[d] = [];
            dayBuckets[d].push({
              hour: s.hour != null ? s.hour : 9,
              minute: s.minute || 0,
              title: s.title || 'Sightseeing',
              where: s.where || '',
              mapsUrl: s.mapsUrl || '',
              icon: s.icon || 'map-pin',
              notes: s.notes || ''
            });
          });
          const dayKeys = Object.keys(dayBuckets).sort((a, b) => Number(a) - Number(b));
          const days = dayKeys.map(dNum => ({
            day: Number(dNum),
            title: Number(dNum) === 0 ? 'Day 0: Travel & Arrival' : ('Day ' + dNum),
            cityId: loadedVirtualTrip.cities ? (Number(dNum) === 0 ? (loadedVirtualTrip.cities[0] || '') : (loadedVirtualTrip.cities[Number(dNum) - 1] || loadedVirtualTrip.cities[0])) : '',
            steps: dayBuckets[dNum]
          }));
          if (days.length > 0) {
            return {
              id: loadedVirtualTrip.id,
              ideaId: loadedVirtualTrip.id,
              title: loadedVirtualTrip.name || tripName,
              tagline: 'Custom trip plan',
              originCity: (loadedVirtualTrip.originCity === 'already_there' || loadedVirtualTrip.originCity === '0') ? 'already_there' : (loadedVirtualTrip.originCity || 'already_there'),
              originName: (loadedVirtualTrip.originCity === 'already_there' || loadedVirtualTrip.originCity === '0') ? 'the destination' : (KYT.ui.resolveCity(loadedVirtualTrip.originCity)?.name || loadedVirtualTrip.originCity || 'the destination'),
              durationDays: loadedVirtualTrip.duration || days.length || 1,
              cities: loadedVirtualTrip.cities || cityIds,
              taste: loadedVirtualTrip.taste || { intent: 'mixed', diet: 'any', pace: 'standard' },
              days: days
            };
          }
        }

        // Fallback: synthesize from selected cities & catalog
        const cList = (cityIds || []).map(cId => KYT.ui.resolveCity(cId)).filter(Boolean);
        const synthDays = cList.map((city, idx) => {
          const topAttractions = (city.beats || []).slice(0, 4).map((att, aIdx) => ({
            hour: att.hour != null ? att.hour : (9 + aIdx * 2),
            minute: 0,
            title: att.title || 'Visit Attraction',
            where: att.where || city.name,
            mapsUrl: att.mapsUrl || '',
            icon: att.icon || 'map-pin',
            notes: att.notes || ''
          }));
          return {
            day: idx + 1,
            title: 'Explore ' + city.name,
            cityId: city.id,
            cityName: city.name,
            steps: topAttractions.length ? topAttractions : [{ hour: 9, minute: 0, title: 'Explore ' + city.name, where: city.name, icon: 'map-pin' }]
          };
        });

        return {
          id: 'trip_' + Date.now().toString(36),
          ideaId: 'trip_' + Date.now().toString(36),
          title: tripName || 'Curated Journey',
          tagline: 'Custom trip plan',
          originCity: (originParam === '0' || originParam === 'already_there') ? 'already_there' : (originParam || 'already_there'),
          originName: (originParam === '0' || originParam === 'already_there') ? 'the destination' : (KYT.ui.resolveCity(originParam)?.name || originParam || 'the destination'),
          durationDays: daysParam || synthDays.length || 1,
          cities: cityIds,
          taste: { intent: 'mixed', diet: 'any', pace: 'standard' },
          days: synthDays.length ? synthDays : [{ day: 1, title: 'Day 1', steps: [{ hour: 9, minute: 0, title: 'Sightseeing', where: 'Destination', icon: 'map-pin' }] }]
        };
      }

      // AI modal prompt generation, JSON parsing, diff engine, and state are handled by window.KYT.aiRefine

      function renderRefinedItinerary(vTrip, curatedTrip, isAiRefined = false) {
        const container = document.getElementById('refined-itinerary-section');
        if (!container) return;

        const title = (vTrip && vTrip.name) || (curatedTrip && curatedTrip.title) || tripName;
        const tagline = (curatedTrip && curatedTrip.tagline) || '';
        const duration = (vTrip && vTrip.duration) || (curatedTrip && curatedTrip.durationDays) || 1;
        const targetId = (vTrip && vTrip.id) || tripId || '';

        // Generate day cards
        let daysHtml = '';
        if (curatedTrip && curatedTrip.days && curatedTrip.days.length) {
          daysHtml = curatedTrip.days.map(d => {
            const stepsHtml = (d.steps || []).map(s =>
              KYT.ui.renderStepCard(s, { variant: 'curated-preview' })
            ).join('');
            return `
              <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                  <span class="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-black uppercase tracking-wider">Day ${d.day}</span>
                  <h5 class="text-xs font-bold text-slate-800">${KYT.utils.escapeHTML(d.title || 'Sightseeing')}</h5>
                </div>
                <div class="mt-2 space-y-1">
                  ${stepsHtml}
                </div>
              </div>
            `;
          }).join('');
        } else if (vTrip && vTrip.steps && vTrip.steps.length) {
          const dayBuckets = {};
          vTrip.steps.forEach(s => {
            const d = s.dayId != null ? s.dayId : (s.day != null ? s.day : 1);
            if (!dayBuckets[d]) dayBuckets[d] = [];
            dayBuckets[d].push(s);
          });
          const dayKeys = Object.keys(dayBuckets).sort((a, b) => Number(a) - Number(b));
          daysHtml = dayKeys.map(d => {
            const stepsHtml = dayBuckets[d].map(s =>
              KYT.ui.renderStepCard(s, { variant: 'curated-preview' })
            ).join('');
            const dayNum = Number(d);
            const dayLabel = dayNum === 0 ? 'Day 0: Travel & Arrival' : `Day ${d}`;
            const daySub = KYT.utils.escapeHTML(dayBuckets[d][0]?.cityName || 'Itinerary Schedule');
            return `
              <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                  <span class="px-2 py-0.5 ${dayNum === 0 ? 'bg-slate-500' : 'bg-indigo-600'} text-white rounded-md text-[10px] font-black uppercase tracking-wider">${dayLabel}</span>
                  <h5 class="text-xs font-bold text-slate-800">${daySub}</h5>
                </div>
                <div class="mt-2 space-y-1">
                  ${stepsHtml}
                </div>
              </div>
            `;
          }).join('');
        }

        if (!daysHtml) return;

        const highlightsHtml = (curatedTrip && curatedTrip.highlights && curatedTrip.highlights.length) ? `
          <div>
            <h4 class="text-xs font-black uppercase tracking-wider text-indigo-900 mb-2">Key Highlights</h4>
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 font-medium">
              ${curatedTrip.highlights.map(h => `
                <li class="flex items-start gap-2 bg-white/80 border border-indigo-100/70 p-2.5 rounded-xl shadow-2xs">
                  <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5"></i>
                  <span>${KYT.utils.escapeHTML(h)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : '';

        const bygHtml = (curatedTrip && curatedTrip.beforeYouGo && curatedTrip.beforeYouGo.length) ? `
          <div class="p-4 bg-amber-50/70 border border-amber-200/70 rounded-2xl">
            <h4 class="text-xs font-black uppercase tracking-wider text-amber-900 mb-2 flex items-center gap-1.5">
              <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-amber-600"></i> Before You Go
            </h4>
            <div class="space-y-1.5 text-xs text-amber-900 font-medium">
              ${curatedTrip.beforeYouGo.map(b => `
                <div class="flex items-start gap-2">
                  <span class="font-bold uppercase text-[10px] px-1.5 py-0.5 bg-amber-200/60 rounded text-amber-800">${KYT.utils.escapeHTML(b.type || 'info')}</span>
                  <span>${KYT.utils.escapeHTML(b.text || b)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '';

        const customizeUrl = targetId ? `virtual_trip.html?id=${encodeURIComponent(targetId)}` : `virtual_trip.html${window.location.search}`;

        let planBadgeLabel = 'Day-by-Day Plan';
        let planBadgeBg = 'bg-slate-700 text-white';
        let planBadgeIcon = 'calendar';
        if (isAiRefined) {
          planBadgeLabel = 'AI-Refined Plan';
          planBadgeBg = 'bg-indigo-600 text-white';
          planBadgeIcon = 'sparkles';
        } else if ((curatedTrip && (curatedTrip.id || curatedTrip.days)) || (vTrip && vTrip.curatedId)) {
          planBadgeLabel = 'Curated Blueprint';
          planBadgeBg = 'bg-blue-600 text-white';
          planBadgeIcon = 'bookmark';
        }

        container.innerHTML = `
          <div class="bg-gradient-to-b from-indigo-50/70 to-white rounded-3xl border border-indigo-100 p-5 sm:p-6 shadow-sm space-y-6">
            ${(planBadgeLabel !== 'Day-by-Day Plan' || tagline) ? `<div class="space-y-1 pb-4 border-b border-indigo-100/60">
              ${planBadgeLabel !== 'Day-by-Day Plan' ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${planBadgeBg} shadow-xs">
                <i data-lucide="${planBadgeIcon}" class="w-3.5 h-3.5 ${isAiRefined ? 'text-amber-300' : 'text-white'}"></i> ${planBadgeLabel}
              </span>` : ''}
              ${tagline ? `<p class="text-xs sm:text-sm text-slate-600">${KYT.utils.escapeHTML(tagline)}</p>` : ''}
            </div>` : ''}

            ${highlightsHtml}

            ${planBadgeLabel === 'Curated Blueprint' ? '' : KYT.ui.renderGeneratedPlanNotice()}

            <div>
              <h4 class="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Day-by-Day Schedule</h4>
              <div class="space-y-4">
                ${daysHtml}
              </div>
            </div>

            ${bygHtml}
          </div>
        `;

        const refineBtnSpan = document.querySelector('#btn-open-ai-refine span:last-child');
        if (refineBtnSpan) {
          refineBtnSpan.textContent = isAiRefined ? 'Refine Again' : 'Refine with AI';
        }
        if (window.lucide) lucide.createIcons();
      }

      // Initial render of itinerary if steps exist
      if (loadedVirtualTrip && loadedVirtualTrip.steps && loadedVirtualTrip.steps.length) {
        renderRefinedItinerary(loadedVirtualTrip, cTrip, Boolean(loadedVirtualTrip.id && loadedVirtualTrip.id.startsWith('ai_')));
      } else if (cTrip && cTrip.days && cTrip.days.length) {
        renderRefinedItinerary(null, cTrip, false);
      }

      // Initialize AI Refine Module
      if (window.KYT && KYT.aiRefine) {
        KYT.aiRefine.init({
          getTripContext: getTripForPrompt,
          onAccept: (vTrip, curatedTrip) => {
            loadedVirtualTrip = vTrip;
            tripId = vTrip.id;

            // Update URL to link tripId and clean up URL for instant, lightweight sharing
            try {
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.set('id', vTrip.id);
              currentUrl.searchParams.delete('ai');
              window.history.replaceState({}, '', currentUrl.toString());
            } catch (e) { }

            // Update hero banner titles if present
            if (vTrip.name) {
              const titleEl = document.getElementById('trip-title');
              if (titleEl) titleEl.textContent = vTrip.name;
            }
            if (curatedTrip && curatedTrip.tagline) {
              const descEl = document.getElementById('trip-desc');
              if (descEl) descEl.textContent = curatedTrip.tagline;
            }

            renderRefinedItinerary(vTrip, curatedTrip, true);
            renderMetaPills();
            renderCitiesAndVideos();
            refreshStartButton();

            const refEl = document.getElementById('refined-itinerary-section');
            if (refEl) {
              refEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });

        if (params.get('refine') === '1' || params.get('refine') === 'true') {
          setTimeout(() => {
            const btn = document.getElementById('btn-open-ai-refine');
            if (btn) btn.click();
          }, 200);
        }
      }

      function renderCitiesAndVideos() {
        const citiesGrid = document.getElementById('cities-grid');
        const videoGallery = document.getElementById('video-gallery');
        const videoFilters = document.getElementById('video-filters');
        if (!citiesGrid || !videoGallery) return;

        // Auto-extract city IDs if not yet set
        if ((!cityIds || !cityIds.length) && loadedVirtualTrip) {
          cityIds = extractCitiesFromTrip(loadedVirtualTrip);
          if (cityIds.length) citiesParam = cityIds.join(',');
        }
        if ((!cityIds || !cityIds.length) && cTrip) {
          cityIds = extractCitiesFromTrip(cTrip);
          if (cityIds.length) citiesParam = cityIds.join(',');
        }

        if (!cityIds || !cityIds.length) {
          citiesGrid.innerHTML = `
            <div class="col-span-full text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <div class="w-10 h-10 mx-auto mb-2 text-slate-400 flex items-center justify-center bg-white rounded-full shadow-xs">
                <i data-lucide="map-pin" class="w-5 h-5"></i>
              </div>
              <p class="font-bold text-slate-700 mb-1">No destinations added to this trip yet</p>
              <p class="text-xs text-slate-400 mb-4 max-w-sm mx-auto">Add cities to build your day-by-day itinerary and explore attractions.</p>
              <button type="button" onclick="document.getElementById('btn-edit-plan').click()" class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-full text-sm shadow-xs transition-colors cursor-pointer">
                <i data-lucide="plus" class="w-4 h-4"></i> Add Destinations
              </button>
            </div>
          `;
          videoGallery.innerHTML = '<p class="text-sm text-slate-500 p-4 border border-dashed border-slate-200 rounded-xl text-center w-full col-span-full">No videos available.</p>';
          if (videoFilters) videoFilters.innerHTML = '';
          if (window.lucide) lucide.createIcons();
          return;
        }

        let citiesHtml = '';
        const allVideos = [];
        const filterCities = [];

        cityIds.forEach(cId => {
          const city = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(cId) : null;
          if (!city) return;

          filterCities.push({ id: city.id, name: city.name });
          citiesHtml += KYT.ui.renderCityCard(city, { variant: 'summary' });

          const cityVideos = window.KYT_CITY_VIDEOS ? (window.KYT_CITY_VIDEOS[city.id] || []) : [];
          cityVideos.forEach(vid => {
            allVideos.push({ ...vid, cityName: city.name, cityId: city.id });
          });
        });

        citiesGrid.innerHTML = citiesHtml || '<p class="text-sm text-slate-500">Could not load city details.</p>';

        let currentFilter = 'all';

        function updateVideosDisplay() {
          const filtered = currentFilter === 'all' ? allVideos : allVideos.filter(v => v.cityId === currentFilter);
          if (filtered.length === 0) {
            videoGallery.innerHTML = '<p class="text-sm text-slate-500 p-4 border border-dashed border-slate-200 rounded-xl text-center w-full col-span-full">No videos available.</p>';
            return;
          }

          videoGallery.innerHTML = filtered.map(vid => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all duration-300" data-video-card="${KYT.utils.escapeHTML(vid.id)}">
              <div class="relative w-full aspect-video bg-slate-100">
                <iframe class="absolute inset-0 w-full h-full" src="https://www.youtube-nocookie.com/embed/${KYT.utils.escapeHTML(vid.id)}?enablejsapi=1&rel=0" frameborder="0" allowfullscreen=""></iframe>
              </div>
              <div class="p-3 flex-1 flex flex-col justify-between">
                <p class="text-sm font-bold text-slate-800 line-clamp-2 mb-2">${KYT.utils.escapeHTML(vid.title)}</p>
                <div class="flex justify-between items-center mt-auto">
                  <span class="text-[10px] font-bold text-blue-500 uppercase">${KYT.utils.escapeHTML(vid.cityName)}</span>
                  <span class="text-[10px] text-slate-400 font-bold">${KYT.utils.escapeHTML(vid.channel)}</span>
                </div>
              </div>
            </div>
          `).join('');
        }

        function updateFiltersDisplay() {
          if (!videoFilters) return;
          if (allVideos.length === 0) {
            videoFilters.innerHTML = '';
            return;
          }

          let filtersHtml = `
            <button class="filter-btn px-3 py-1 rounded-full text-xs font-bold transition-colors ${currentFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-id="all">
              All
            </button>
          `;

          filterCities.forEach(city => {
            if (allVideos.some(v => v.cityId === city.id)) {
              const isActive = currentFilter === city.id;
              filtersHtml += `
                <button class="filter-btn px-3 py-1 rounded-full text-xs font-bold transition-colors ${isActive ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-id="${KYT.utils.escapeHTML(city.id)}">
                  ${KYT.utils.escapeHTML(city.name)}
                </button>
              `;
            }
          });

          videoFilters.innerHTML = filtersHtml;

          videoFilters.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              currentFilter = e.currentTarget.dataset.id;
              updateFiltersDisplay();
              updateVideosDisplay();
            });
          });
        }

        updateFiltersDisplay();
        updateVideosDisplay();
        if (window.lucide) lucide.createIcons();
      }

      renderCitiesAndVideos();

      // Just-in-time removal for any video that restricts embedding at playback time (error 101/150/100)
      window.addEventListener('message', (e) => {
        try {
          const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data && (data.event === 'onError' || (data.info && data.info.error))) {
            const iframes = document.querySelectorAll('#video-gallery iframe');
            for (const iframe of iframes) {
              if (iframe.contentWindow === e.source) {
                const card = iframe.closest('[data-video-card]');
                if (card) {
                  card.style.opacity = '0';
                  card.style.transform = 'scale(0.95)';
                  setTimeout(() => {
                    card.remove();
                    const remaining = document.querySelectorAll('#video-gallery [data-video-card]');
                    if (remaining.length === 0) {
                      const gallery = document.getElementById('video-gallery');
                      if (gallery) {
                        gallery.innerHTML = '<p class="text-sm text-slate-500 p-4 border border-dashed border-slate-200 rounded-xl text-center w-full col-span-full">No videos available.</p>';
                      }
                    }
                  }, 200);
                }
                break;
              }
            }
          }
        } catch (err) {}
      });

      // Configure Unified City Detail Slide-Over
      KYT.ui.cityDetail.configure({
        mode: 'explore',
        onPrimaryAction: () => {
          document.getElementById('btn-edit-plan').click();
        }
      });

      const cityOverlay = document.getElementById('city-detail-overlay');
      const btnCloseCity = document.getElementById('btn-close-city-detail');
      const btnBackCity = document.getElementById('btn-back-city-detail');
      const btnShareCity = document.getElementById('btn-share-city');

      const citiesGridEl = document.getElementById('cities-grid');
      if (citiesGridEl) {
        citiesGridEl.addEventListener('click', (e) => {
          const card = e.target.closest('[data-city-id]');
          if (card) {
            KYT.ui.cityDetail.open(card.dataset.cityId, true);
          }
        });
      }

      const nearbyContainer = document.getElementById('cd-nearby-list');
      if (nearbyContainer) {
        nearbyContainer.addEventListener('click', (e) => {
          const nCard = e.target.closest('[data-nearby-id]');
          if (nCard) {
            KYT.ui.cityDetail.open(nCard.dataset.nearbyId, true);
          }
        });
      }

      if (btnCloseCity) {
        btnCloseCity.addEventListener('click', () => KYT.ui.cityDetail.close(true));
      }
      if (btnBackCity) {
        btnBackCity.addEventListener('click', () => window.history.back());
      }
      if (btnShareCity) {
        btnShareCity.addEventListener('click', () => {
          const currentCityId = document.getElementById('cd-title').dataset.cityId;
          const currentCityName = document.getElementById('cd-title').textContent;
          const url = new URL(window.location.href);
          url.searchParams.set('city', currentCityId);
          const shareData = {
            title: `${currentCityName} - KYT Destination`,
            text: `Explore ${currentCityName} on KYT: attractions, travel styles, and nearby gems!`,
            url: url.toString()
          };
          if (navigator.share) {
            navigator.share(shareData).catch(() => { });
          } else {
            navigator.clipboard.writeText(url.toString())
              .then(() => alert(`Link for ${currentCityName} copied to clipboard!`))
              .catch(() => { });
          }
        });
      }

      if (cityOverlay) {
        cityOverlay.addEventListener('click', (e) => {
          if (e.target === cityOverlay) KYT.ui.cityDetail.close(true);
        });
      }

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cityOverlay && !cityOverlay.classList.contains('hidden')) {
          KYT.ui.cityDetail.close(true);
        }
      });

      window.addEventListener('popstate', () => {
        const p = new URLSearchParams(window.location.search);
        const cityParam = p.get('city');
        if (cityParam) {
          KYT.ui.cityDetail.open(cityParam, false);
        } else if (cityOverlay && !cityOverlay.classList.contains('hidden')) {
          KYT.ui.cityDetail.close(false);
        }
      });

      const initialCity = params.get('city');
      if (initialCity) {
        KYT.ui.cityDetail.open(initialCity, false);
      }

      // ── Start this trip ─────────────────────────────────────────────────────────
      // The plan page's main action: make this plan the live trip. Shown only when there
      // is an actual itinerary to start (a saved plan with steps, or a curated trip).
      function findStartableTrip() {
        let t = null;
        if (tripId) {
          try {
            t = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]').find(x => x.id === tripId) || null;
          } catch (e) { }
        }
        if (!t && loadedVirtualTrip) t = loadedVirtualTrip;
        if (t && t.steps && t.steps.length) return t;
        if (cTrip && KYT.ui.convertCuratedTripToVirtual) {
          const v = KYT.ui.convertCuratedTripToVirtual(cTrip);
          if (v && v.steps && v.steps.length) return v;
        }
        return null;
      }

      function refreshStartButton() {
        const btn = document.getElementById('btn-start-trip');
        if (!btn) return;
        const startable = !!findStartableTrip();
        btn.classList.toggle('hidden', !startable);
        btn.classList.toggle('flex', startable);
      }

      const startBtn = document.getElementById('btn-start-trip');
      if (startBtn) {
        let starting = false;
        startBtn.addEventListener('click', async () => {
          const t = findStartableTrip();
          if (!t || starting) return;
          starting = true;
          try { await KYT.ui.startTripLive(t); } finally { starting = false; }
        });
      }
      refreshStartButton();

      lucide.createIcons();
    });
