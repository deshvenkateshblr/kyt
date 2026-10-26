/**
 * quests.js — Curated Explorer Quests & Thematic Hit-Lists for KYT Passport
 *
 * Every quest has < 15 cities, verified against data/cities.js.
 * Pure data and read helpers — no external dependencies.
 */
(function (global) {
  'use strict';

  const QUESTS = [
    // ── I. Spiritual & Sacred Quests ─────────────────────────────────────────
    {
      id: 'jyotirlinga',
      title: 'The 12 Jyotirlingas',
      subtitle: 'Sacred Swayambhu light manifestations of Lord Shiva',
      icon: 'flame',
      category: 'spiritual',
      cityIds: [
        'somnath', 'srisailam', 'ujjain', 'omkareshwar', 'kedarnath',
        'bhimashankar', 'varanasi', 'nashik', 'deoghar', 'dwarka',
        'rameswaram', 'aurangabad'
      ]
    },
    {
      id: 'maha-vishnu',
      title: 'The Maha Vishnu Shrines',
      subtitle: 'Prime Vaishnava, Krishna & Rama sanctuaries across India',
      icon: 'sparkles',
      category: 'spiritual',
      cityIds: [
        'tirupati', 'badrinath', 'puri', 'dwarka', 'thiruvananthapuram',
        'vrindavan', 'mathura', 'ayodhya', 'tiruchirappalli', 'kancheepuram',
        'guruvayur'
      ]
    },
    {
      id: 'sapta-puri',
      title: 'Sapta Moksha Kshetra',
      subtitle: 'The 7 sacred cities granting spiritual liberation',
      icon: 'sunrise',
      category: 'spiritual',
      cityIds: [
        'ayodhya', 'mathura', 'haridwar', 'varanasi', 'kancheepuram',
        'ujjain', 'dwarka'
      ]
    },
    {
      id: 'sapta-nadi',
      title: 'Sapta Nadi River Ghats',
      subtitle: "Iconic sanctified river ghats on India's seven holy waters",
      icon: 'waves',
      category: 'spiritual',
      cityIds: [
        'varanasi', 'mathura', 'nashik', 'maheshwar', 'tiruchirappalli',
        'vijayawada', 'guwahati'
      ]
    },
    {
      id: 'char-dham',
      title: 'The Bada Char Dham',
      subtitle: 'The four cardinal abodes established by Adi Shankara',
      icon: 'compass',
      category: 'spiritual',
      cityIds: ['badrinath', 'puri', 'rameswaram', 'dwarka']
    },
    {
      id: 'kumbh-tirthas',
      title: 'The 4 Kumbh Tirthas',
      subtitle: 'The four sacred gathering spots of eternal nectar',
      icon: 'droplets',
      category: 'spiritual',
      cityIds: ['prayagraj', 'haridwar', 'ujjain', 'nashik']
    },
    {
      id: 'shakti-peethas',
      title: 'Major Shakti Peethas',
      subtitle: 'Venerated seats of divine feminine cosmic energy',
      icon: 'eye',
      category: 'spiritual',
      cityIds: [
        'guwahati', 'kolkata', 'varanasi', 'madurai', 'kancheepuram',
        'mysore', 'vijayawada', 'deoghar', 'gaya', 'srisailam', 'kolhapur'
      ]
    },
    {
      id: 'buddhist-trail',
      title: 'The Buddhist Footsteps',
      subtitle: 'From Enlightenment at Bodh Gaya to sacred monastic peaks',
      icon: 'flower-2',
      category: 'spiritual',
      cityIds: [
        'bodh-gaya', 'sarnath', 'nalanda', 'rajgir', 'dharamshala',
        'tawang', 'gangtok'
      ]
    },
    {
      id: 'sacred-ganga',
      title: 'Sacred Ganga & Tirthas',
      subtitle: 'From glacial origins in the Garhwal to timeless Kashi',
      icon: 'bell',
      category: 'spiritual',
      cityIds: [
        'haridwar', 'rishikesh', 'varanasi', 'prayagraj', 'kedarnath',
        'badrinath', 'chopta', 'gaya'
      ]
    },
    {
      id: 'sikh-heritage',
      title: 'Sikh Sacred Takhts & Heritage',
      subtitle: 'Historic seats of Sikh spiritual authority and gurdwaras',
      icon: 'shield',
      category: 'spiritual',
      cityIds: ['amritsar', 'patna', 'delhi', 'chandigarh', 'patiala']
    },

    // ── II. Empires, Citadels & Heritage Quests ──────────────────────────────
    {
      id: 'unesco-top10',
      title: 'Top 10 UNESCO Wonders',
      subtitle: 'Monuments of universal value and architectural genius',
      icon: 'award',
      category: 'heritage',
      cityIds: [
        'agra', 'jaipur', 'hampi', 'khajuraho', 'aurangabad',
        'konark', 'bodh-gaya', 'chittorgarh', 'goa', 'delhi'
      ]
    },
    {
      id: 'maratha-forts',
      title: 'Maratha Strongholds',
      subtitle: 'Impregnable Sahyadri mountain fortresses & historic seats',
      icon: 'castle',
      category: 'heritage',
      cityIds: [
        'pune', 'mahabaleshwar', 'lonavala', 'aurangabad', 'matheran',
        'thanjavur', 'kolhapur', 'alibaug'
      ]
    },
    {
      id: 'royal-rajasthan',
      title: 'Forts & Palaces of Rajputana',
      subtitle: 'Living citadels, gilded palaces and desert chivalry',
      icon: 'crown',
      category: 'heritage',
      cityIds: [
        'jaipur', 'udaipur', 'jodhpur', 'jaisalmer', 'bikaner',
        'chittorgarh', 'pushkar', 'mount-abu'
      ]
    },
    {
      id: 'dravidian-temples',
      title: 'Great Dravidian Temple Empires',
      subtitle: 'Gopurams, pillared corridors & stone marvels of the South',
      icon: 'landmark',
      category: 'heritage',
      cityIds: [
        'madurai', 'thanjavur', 'hampi', 'belur', 'halebidu',
        'badami', 'pattadakal', 'kancheepuram', 'mysore', 'tiruchirappalli',
        'thrissur', 'mahabalipuram'
      ]
    },
    {
      id: 'mughal-nawabi',
      title: 'Mughal & Nawabi Splendour',
      subtitle: 'Imperial domes, red sandstone forts & courtly refinement',
      icon: 'dome',
      category: 'heritage',
      cityIds: ['delhi', 'agra', 'lucknow', 'hyderabad', 'bhopal', 'gwalior']
    },
    {
      id: 'central-heartland',
      title: 'Heartland of Central India',
      subtitle: 'Cenotaphs, sandstone ramparts & Narmada river palaces',
      icon: 'scroll',
      category: 'heritage',
      cityIds: [
        'orchha', 'gwalior', 'khajuraho', 'bhopal', 'indore',
        'maheshwar', 'ujjain'
      ]
    },
    {
      id: 'golden-triangle',
      title: 'The Classic Golden Triangle',
      subtitle: "India's quintessential beginner circuit of royalty and heritage",
      icon: 'triangle',
      category: 'heritage',
      cityIds: ['delhi', 'agra', 'jaipur']
    },
    {
      id: 'toy-trains',
      title: 'Heritage Mountain Toy Trains',
      subtitle: 'Steam whistles, looping tracks & colonial hill railway wonders',
      icon: 'train',
      category: 'heritage',
      cityIds: ['darjeeling', 'shimla', 'ooty', 'matheran']
    },

    // ── III. Nature, Mountains, Coasts & Adventure ───────────────────────────
    {
      id: 'himalayan-high',
      title: 'High Himalaya Passes & Valleys',
      subtitle: 'Dramatic high-altitude moonscapes, alpine meadows and passes',
      icon: 'mountain-snow',
      category: 'nature',
      cityIds: [
        'leh', 'kargil', 'spiti-valley', 'manali', 'gulmarg',
        'sonamarg', 'pahalgam', 'srinagar', 'auli', 'jammu'
      ]
    },
    {
      id: 'colonial-hills',
      title: 'Colonial Hills & Tea Trails',
      subtitle: 'Mist-clad plantations, cool pine breezes and mountain ridgelines',
      icon: 'trees',
      category: 'nature',
      cityIds: [
        'shimla', 'darjeeling', 'ooty', 'munnar', 'kodaikanal',
        'nainital', 'mussoorie', 'coorg', 'kalimpong', 'shillong',
        'dalhousie', 'mirik'
      ]
    },
    {
      id: 'tropical-coasts',
      title: 'Tropical Coasts & Backwaters',
      subtitle: 'Golden sands, swaying palms and serene emerald waterways',
      icon: 'palmtree',
      category: 'nature',
      cityIds: [
        'goa', 'gokarna', 'alleppey', 'kumarakom', 'varkala',
        'kovalam', 'kochi', 'udupi', 'pondicherry', 'digha',
        'mandarmoni'
      ]
    },
    {
      id: 'northeast-frontiers',
      title: 'Northeast Living Frontiers',
      subtitle: 'Living root bridges, sacred monoliths and biodiversity peaks',
      icon: 'sprout',
      category: 'nature',
      cityIds: [
        'guwahati', 'shillong', 'cherrapunji', 'mawlynnong', 'tawang',
        'ziro', 'majuli', 'kaziranga', 'gangtok', 'pelling', 'kohima'
      ]
    },
    {
      id: 'wild-safari',
      title: 'Wild India: Tiger & Jungle Trail',
      subtitle: 'Ancient sal forests, mangrove deltas and royal tiger habitats',
      icon: 'paw-print',
      category: 'nature',
      cityIds: [
        'ranthambore', 'jim-corbett', 'kaziranga', 'sundarbans', 'wayanad',
        'bhimashankar', 'thekkady', 'gir'
      ]
    },
    {
      id: 'emerald-islands',
      title: 'Emerald Islands & Ocean Seas',
      subtitle: 'Coral atolls, turquoise lagoons and tropical maritime frontiers',
      icon: 'shell',
      category: 'nature',
      cityIds: [
        'andaman-islands', 'havelock-island', 'neil-island', 'lakshadweep',
        'kanyakumari'
      ]
    },
    {
      id: 'desert-trail',
      title: 'The Great Desert & White Salt',
      subtitle: 'Rolling golden sand dunes and the boundless white salt desert',
      icon: 'sun-medium',
      category: 'nature',
      cityIds: ['jaisalmer', 'jodhpur', 'bikaner', 'kutch']
    },

    // ── IV. Regional Heartlands ──────────────────────────────────────────────
    {
      id: 'gujarat-heritage',
      title: 'Heritage of Gujarat',
      subtitle: 'Stepwells, white desert salt flats and coastal sanctums',
      icon: 'gem',
      category: 'regional',
      cityIds: [
        'ahmedabad', 'kutch', 'vadodara', 'surat', 'rajkot',
        'somnath', 'dwarka', 'gandhinagar'
      ]
    },
    {
      id: 'punjab-heartland',
      title: 'Punjab & Grand Trunk Heartland',
      subtitle: 'Vibrant culinary trails, royal estates and fertile plains',
      icon: 'wheat',
      category: 'regional',
      cityIds: ['amritsar', 'chandigarh', 'patiala', 'ludhiana', 'jalandhar']
    },
    {
      id: 'great-metros',
      title: 'The Great Metros of India',
      subtitle: 'Bustling commercial powerhouses and modern cultural hubs',
      icon: 'building-2',
      category: 'regional',
      cityIds: ['mumbai', 'delhi', 'bengaluru', 'kolkata', 'chennai', 'hyderabad']
    }
  ];

  // Freeze entries for immutability
  Object.freeze(QUESTS);

  // Helper methods
  const QuestStore = {
    getAll: () => QUESTS,
    getById: id => QUESTS.find(q => q.id === id) || null,
    getByCategory: cat => cat && cat !== 'all' ? QUESTS.filter(q => q.category === cat) : QUESTS,
    getForCity: cityId => QUESTS.filter(q => q.cityIds.includes(cityId)),
    getCategories: () => [
      { id: 'all', label: 'All Pillars' },
      { id: 'spiritual', label: 'Spiritual & Sacred', icon: 'sparkles' },
      { id: 'heritage', label: 'Empires & Citadels', icon: 'castle' },
      { id: 'nature', label: 'Nature & Coasts', icon: 'mountain-snow' },
      { id: 'regional', label: 'Regional Heartlands', icon: 'compass' }
    ]
  };

  global.KYT_QUESTS = QUESTS;
  global.KYT_QUEST_STORE = QuestStore;

})(typeof window !== 'undefined' ? window : global);

