// Store for Passport/Visited cities using localStorage
// kyt_passport schema: { "udaipur": { date: "Oct 09, 2026" }, ... }

window.PassportStore = (function() {
  const STORE_KEY = 'kyt_passport';
  
  // Default mock data to seed the store if it's empty for the first time
  const INITIAL_MOCK = {};

  function getStore() {
    try {
      const data = localStorage.getItem(STORE_KEY);
      if (!data) {
        // Seed with initial mock data
        localStorage.setItem(STORE_KEY, JSON.stringify(INITIAL_MOCK));
        return INITIAL_MOCK;
      }
      const parsed = JSON.parse(data);
      
      // Migration: if the old data was an array (e.g. from V1 passport), convert it
      if (Array.isArray(parsed)) {
        const newStore = { ...INITIAL_MOCK }; // Start with mock data
        parsed.forEach(item => {
          // If array item is a string (city id)
          if (typeof item === 'string') {
            newStore[item] = { date: "Previous Trip" };
          } else if (item && item.id) {
            newStore[item.id] = { date: item.date || "Previous Trip" };
          }
        });
        localStorage.setItem(STORE_KEY, JSON.stringify(newStore));
        return newStore;
      }
      
      return parsed;
    } catch (e) {
      console.warn("Could not read from localStorage, using in-memory store", e);
      return INITIAL_MOCK;
    }
  }

  function saveStore(data) {
    try {
      const json = JSON.stringify(data);
      if (window.KYT && KYT.backup) KYT.backup.safeSet(STORE_KEY, json); else localStorage.setItem(STORE_KEY, json);
    } catch (e) {
      console.warn("Could not write to localStorage", e);
    }
  }

  function getCityStyles(index, visited) {
    if (!visited) {
      return {
        color: "text-slate-400",
        bg: "bg-slate-50",
        border: "border-slate-200",
        actionColor: "text-slate-500"
      };
    }
    
    const styles = [
      { color: "text-rose-500", bg: "bg-rose-50", border: "border-rose-100", actionColor: "text-rose-600" },
      { color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100", actionColor: "text-blue-600" },
      { color: "text-orange-500", bg: "bg-orange-50", border: "border-orange-100", actionColor: "text-orange-600" },
      { color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100", actionColor: "text-emerald-600" },
      { color: "text-purple-500", bg: "bg-purple-50", border: "border-purple-100", actionColor: "text-purple-600" }
    ];
    return styles[index % styles.length];
  }

  function getPassportCities() {
    if (!window.KYT_CITIES) return [];
    const store = getStore();
    
    return window.KYT_CITIES.map((city, index) => {
      const isVisited = !!store[city.id];
      const styles = getCityStyles(index, isVisited);
      
      let dateStr = 'Not visited';
      let isoDate = '';
      if (isVisited) {
        const d = store[city.id].date;
        // Attempt to convert "Oct 09, 2026" or similar to YYYY-MM-DD for the input
        if (d.includes(',')) {
          
        const dateObj = new Date(d);
        isoDate = dateObj.getFullYear() + "-" + String(dateObj.getMonth() + 1).padStart(2, "0") + "-" + String(dateObj.getDate()).padStart(2, "0");

        } else {
          isoDate = d; // Assume it's already YYYY-MM-DD
        }
        
        // Format for display if needed, but input type="date" handles its own display
        dateStr = isoDate; 
      }
      
      return {
        id: city.id,
        name: city.name,
        icon: city.icon || 'landmark',
        desc: city.notes || city.description || '',
        notes: city.notes || city.description || '',
        state: city.state || '',
        district: city.district || '',
        aliases: city.aliases || [],
        date: dateStr,
        visited: isVisited,
        lat: city.lat,
        lng: city.lng,
        ...styles
      };
    });
  }

  function lockCity(cityId) {
    const store = getStore();
    if (store[cityId]) {
      delete store[cityId];
      saveStore(store);
      return true;
    }
    return false;
  }

  function unlockCity(cityId) {
    const store = getStore();
    if (!store[cityId]) {
      
      const now = new Date();
      const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

      store[cityId] = { date: today };
      saveStore(store);
      return true; // Newly unlocked
    }
    return false; // Already unlocked
  }

  function updateDate(cityId, newDate) {
    const store = getStore();
    if (store[cityId]) {
      store[cityId].date = newDate;
      saveStore(store);
      return true;
    }
    return false;
  }

  return {
    getPassportCities,
    unlockCity,
    lockCity,
    updateDate
  };
})();



