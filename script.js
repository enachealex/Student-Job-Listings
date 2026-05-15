function setCurrentYear() {
  const nodes = document.querySelectorAll('[data-year]');
  const year = new Date().getFullYear();
  nodes.forEach((node) => {
    node.textContent = year;
  });
}

function initActiveNav() {
  const page = document.body.dataset.page;
  const links = document.querySelectorAll('.nav-link');
  links.forEach((link) => {
    if (link.dataset.page === page) {
      link.classList.add('active');
    }
  });
}

function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const storageKey = 'ptaStudentJobHubTheme';
  const storedTheme = localStorage.getItem(storageKey);
  const preferredTheme = storedTheme || 'light';

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }

    if (themeToggle) {
      const isDark = theme === 'dark';
      themeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
      themeToggle.setAttribute('aria-label', isDark ? 'Light Mode' : 'Dark Mode');
      themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }
  };

  applyTheme(preferredTheme);

  if (!themeToggle) {
    return;
  }

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.dataset.theme === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  });
}

function initSettingsMenu() {
  const menus = document.querySelectorAll('.settings-menu');
  if (!menus.length) {
    return;
  }

  const closeMenu = (menu) => {
    const trigger = menu.querySelector('.settings-trigger');
    const panel = menu.querySelector('.settings-panel');
    menu.classList.remove('open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (panel) {
      panel.setAttribute('aria-hidden', 'true');
    }
  };

  const openMenu = (menu) => {
    const trigger = menu.querySelector('.settings-trigger');
    const panel = menu.querySelector('.settings-panel');
    menu.classList.add('open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'true');
    }
    if (panel) {
      panel.setAttribute('aria-hidden', 'false');
    }
  };

  const closeAllMenus = () => {
    menus.forEach((menu) => closeMenu(menu));
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector('.settings-trigger');
    const panel = menu.querySelector('.settings-panel');
    if (!trigger || !panel) {
      return;
    }

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const shouldOpen = !menu.classList.contains('open');
      closeAllMenus();
      if (shouldOpen) {
        openMenu(menu);
      }
    });

    panel.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.settings-menu')) {
      return;
    }

    closeAllMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllMenus();
    }
  });
}

function initQuickGuideTooltip() {
  const trigger = document.getElementById('quickGuideTrigger');
  const tooltip = document.getElementById('quickGuideTooltip');

  if (!trigger || !tooltip) {
    return;
  }

  const setTooltipOpen = (isOpen) => {
    tooltip.classList.toggle('open', isOpen);
    tooltip.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = tooltip.classList.contains('open');
    setTooltipOpen(!isOpen);
  });

  document.addEventListener('click', (event) => {
    if (!tooltip.classList.contains('open')) {
      return;
    }

    if (!tooltip.contains(event.target) && !trigger.contains(event.target)) {
      setTooltipOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tooltip.classList.contains('open')) {
      setTooltipOpen(false);
    }
  });
}

function initJobsModal() {
  const modal = document.getElementById('uploadModal');
  if (!modal) {
    return;
  }

  const storageKey = 'ptaStudentJobHubListings';
  const detailsModal = document.getElementById('jobDetailsModal');

  const openBtn = document.getElementById('openUpload');
  const closeBtn = document.getElementById('closeUpload');
  const cancelBtns = document.querySelectorAll('[data-close-modal]');
  const overlay = modal.querySelector('.modal-overlay');
  const tabButtons = modal.querySelectorAll('.tab-btn');
  const tabPanels = modal.querySelectorAll('.tab-panel');
  const urlForm = document.getElementById('urlForm');
  const templateForm = document.getElementById('templateForm');
  const uploadHeading = document.getElementById('uploadHeading');
  const flash = document.getElementById('flashMessage');
  const jobsList = document.getElementById('jobsList');
  const urlSubmitButton = urlForm.querySelector('button[type="submit"]');
  const templateSubmitButton = document.getElementById('templateSubmitButton');
  const contactPhoneInput = document.getElementById('contactPhone');
  const payRateInput = document.getElementById('payRate');
  const benefitInput = document.getElementById('benefitInput');
  const benefitsEditorList = document.getElementById('benefitsEditorList');
  const urlStateSelect = document.getElementById('urlState');
  const urlCitySelect = document.getElementById('urlCity');
  const templateStateSelect = document.getElementById('state');
  const templateCitySelect = document.getElementById('city');
  const detailsCloseBtn = document.getElementById('closeJobDetails');
  const editJobDetailsBtn = document.getElementById('editJobDetails');
  const detailsOverlay = detailsModal ? detailsModal.querySelector('.modal-overlay') : null;
  const detailsType = document.getElementById('detailsType');
  const detailsOrganization = document.getElementById('detailsOrganization');
  const detailsRole = document.getElementById('detailsRole');
  const detailsMeta = document.getElementById('detailsMeta');
  const detailsDescription = document.getElementById('detailsDescription');
  const detailsPhoneSection = document.getElementById('detailsPhoneSection');
  const detailsPhone = document.getElementById('detailsPhone');
  const detailsPaySection = document.getElementById('detailsPaySection');
  const detailsPay = document.getElementById('detailsPay');
  const detailsBenefitsSection = document.getElementById('detailsBenefitsSection');
  const detailsBenefitsList = document.getElementById('detailsBenefitsList');
  const detailsSource = document.getElementById('detailsSource');
  const detailsOpenLink = document.getElementById('detailsOpenLink');
  let editingJobId = null;
  let currentDetailsJobId = null;
  let benefitItems = [];
  let editingBenefitIndex = null;

  const stateCityOptions = {
    ID: ['Aberdeen', 'Acequia', 'Albion', 'American Falls', 'Ammon', 'Arco', 'Arimo', 'Ashton', 'Athol', 'Bancroft', 'Basalt', 'Bellevue', 'Blackfoot', 'Bliss', 'Bloomington', 'Boise', 'Bonners Ferry', 'Bovill', 'Buhl', 'Burley', 'Butte City', 'Caldwell', 'Cambridge', 'Carey', 'Cascade', 'Castleford', 'Challis', 'Chubbuck', 'Clark Fork', 'Clayton', 'Clifton', 'Coeur d\'Alene', 'Cottonwood', 'Council', 'Craigmont', 'Crouch', 'Culdesac', 'Dalton Gardens', 'Dayton', 'Deary', 'Declo', 'Dietrich', 'Donnelly', 'Dover', 'Downey', 'Driggs', 'Drummond', 'Dubois', 'Eagle', 'East Hope', 'Eden', 'Elk River', 'Emmett', 'Fairfield', 'Ferdinand', 'Fernan Lake Village', 'Filer', 'Firth', 'Franklin', 'Fruitland', 'Garden City', 'Genesee', 'Georgetown', 'Glenns Ferry', 'Gooding', 'Grace', 'Grand View', 'Grangeville', 'Greenleaf', 'Hagerman', 'Hailey', 'Hansen', 'Harrison', 'Hauser', 'Hayden', 'Hayden Lake', 'Hazelton', 'Heyburn', 'Hollister', 'Homedale', 'Hope', 'Horseshoe Bend', 'Huetter', 'Idaho City', 'Idaho Falls', 'Inkom', 'Iona', 'Irwin', 'Island Park', 'Jerome', 'Juliaetta', 'Kamiah', 'Kellogg', 'Kendrick', 'Ketchum', 'Kimberly', 'Kooskia', 'Kootenai', 'Kuna', 'Lapwai', 'Lava Hot Springs', 'Leadore', 'Lewiston', 'Lewisville', 'Lost River', 'Mackay', 'Malad City', 'Malta', 'Marsing', 'McCall', 'McCammon', 'Melba', 'Menan', 'Meridian', 'Midvale', 'Middleton', 'Minidoka', 'Montpelier', 'Moore', 'Moscow', 'Mountain Home', 'Moyie Springs', 'Mud Lake', 'Mullan', 'Murtaugh', 'Nampa', 'Nezperce', 'New Meadows', 'New Plymouth', 'Newdale', 'Notus', 'Oakley', 'Oldtown', 'Onaway', 'Orofino', 'Osburn', 'Oxford', 'Paris', 'Parma', 'Paul', 'Payette', 'Peck', 'Pierce', 'Pinehurst', 'Placerville', 'Plummer', 'Pocatello', 'Ponderay', 'Post Falls', 'Potlatch', 'Preston', 'Priest River', 'Rathdrum', 'Reubens', 'Rexburg', 'Richfield', 'Rigby', 'Riggins', 'Ririe', 'Roberts', 'Rockland', 'Rupert', 'St. Anthony', 'St. Charles', 'St. Maries', 'Salmon', 'Sandpoint', 'Shelley', 'Shoshone', 'Smelterville', 'Soda Springs', 'Spirit Lake', 'Spencer', 'Stanley', 'Star', 'State Line', 'Stites', 'Sugar City', 'Sun Valley', 'Swan Valley', 'Tensed', 'Tetonia', 'Teton', 'Troy', 'Twin Falls', 'Ucon', 'Victor', 'Wallace', 'Warm River', 'Weippe', 'Weiser', 'Wendell', 'Weston', 'White Bird', 'Wilder', 'Winchester', 'Worley'],
    WA: ['Aberdeen', 'Airway Heights', 'Albion', 'Algona', 'Almira', 'Anacortes', 'Arlington', 'Asotin', 'Auburn', 'Bainbridge Island', 'Battle Ground', 'Beaux Arts Village', 'Bellevue', 'Bellingham', 'Benton City', 'Bingen', 'Black Diamond', 'Blaine', 'Bonney Lake', 'Bothell', 'Bremerton', 'Brewster', 'Bridgeport', 'Brier', 'Buckley', 'Bucoda', 'Burien', 'Burlington', 'Camas', 'Carbonado', 'Carnation', 'Cashmere', 'Castle Rock', 'Cathlamet', 'Centralia', 'Chehalis', 'Chelan', 'Cheney', 'Chewelah', 'Clarkston', 'Cle Elum', 'Clyde Hill', 'Colfax', 'College Place', 'Colton', 'Colville', 'Conconully', 'Concrete', 'Connell', 'Cosmopolis', 'Coulee City', 'Coulee Dam', 'Coupeville', 'Covington', 'Creston', 'Cusick', 'Darrington', 'Davenport', 'Dayton', 'Deer Park', 'Des Moines', 'DuPont', 'Duvall', 'East Wenatchee', 'Eatonville', 'Edgewood', 'Edmonds', 'Electric City', 'Ellensburg', 'Elma', 'Elmer City', 'Endicott', 'Entiat', 'Enumclaw', 'Ephrata', 'Everett', 'Everson', 'Fairfield', 'Farmington', 'Federal Way', 'Ferndale', 'Fife', 'Fircrest', 'Forks', 'Friday Harbor', 'Garfield', 'George', 'Gig Harbor', 'Gold Bar', 'Goldendale', 'Grand Coulee', 'Grandview', 'Granger', 'Granite Falls', 'Hamilton', 'Harrah', 'Harrington', 'Hartline', 'Hatton', 'Hoquiam', 'Hunts Point', 'Ilwaco', 'Index', 'Ione', 'Issaquah', 'Kahlotus', 'Kalama', 'Kelso', 'Kenmore', 'Kennewick', 'Kent', 'Kettle Falls', 'Kirkland', 'Kittitas', 'Krupp', 'La Center', 'La Conner', 'LaCrosse', 'Lacey', 'Lake Forest Park', 'Lake Stevens', 'Lakewood', 'Lamont', 'Langley', 'Latah', 'Leavenworth', 'Liberty Lake', 'Lind', 'Long Beach', 'Longview', 'Lyman', 'Lynden', 'Lynnwood', 'Mabton', 'Malden', 'Mansfield', 'Maple Valley', 'Marcus', 'Marysville', 'Mattawa', 'McCleary', 'Medical Lake', 'Medina', 'Mercer Island', 'Mesa', 'Metaline', 'Metaline Falls', 'Mill Creek', 'Millwood', 'Milton', 'Monroe', 'Montesano', 'Morton', 'Moses Lake', 'Mossyrock', 'Mount Vernon', 'Mountlake Terrace', 'Moxee', 'Mukilteo', 'Naches', 'Napavine', 'Nespelem', 'Newcastle', 'Newport', 'Nooksack', 'Normandy Park', 'North Bend', 'North Bonneville', 'Northport', 'Oak Harbor', 'Oakesdale', 'Oakville', 'Ocean Shores', 'Odessa', 'Okanogan', 'Olympia', 'Omak', 'Oroville', 'Orting', 'Othello', 'Pacific', 'Palouse', 'Pasco', 'Pateros', 'Pe Ell', 'Pomeroy', 'Port Angeles', 'Port Orchard', 'Port Townsend', 'Poulsbo', 'Prescott', 'Prosser', 'Pullman', 'Puyallup', 'Quincy', 'Rainier', 'Raymond', 'Reardan', 'Redmond', 'Renton', 'Republic', 'Richland', 'Ridgefield', 'Ritzville', 'Riverside', 'Rock Island', 'Rockford', 'Rosalia', 'Roslyn', 'Roy', 'Royal City', 'Ruston', 'Sammamish', 'SeaTac', 'Seattle', 'Sedro-Woolley', 'Selah', 'Sequim', 'Shelton', 'Shoreline', 'Skykomish', 'Snohomish', 'Snoqualmie', 'Soap Lake', 'South Bend', 'South Cle Elum', 'South Prairie', 'Spangle', 'Spokane', 'Spokane Valley', 'Sprague', 'Springdale', 'St. John', 'Stanwood', 'Starbuck', 'Steilacoom', 'Stevenson', 'Sultan', 'Sumas', 'Sumner', 'Sunnyside', 'Tacoma', 'Tekoa', 'Tenino', 'Tieton', 'Toledo', 'Tonasket', 'Toppenish', 'Tukwila', 'Tumwater', 'Twisp', 'Union Gap', 'Uniontown', 'University Place', 'Vader', 'Vancouver', 'Waitsburg', 'Walla Walla', 'Wapato', 'Warden', 'Washougal', 'Washtucna', 'Waterville', 'Waverly', 'Wenatchee', 'West Richland', 'Westport', 'White Salmon', 'Wilbur', 'Wilkeson', 'Wilson Creek', 'Winlock', 'Winthrop', 'Woodinville', 'Woodland', 'Woodway', 'Yacolt', 'Yakima', 'Yarrow Point', 'Yelm', 'Zillah'],
  };

  const escapeHtml = (value) => {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  const generateJobId = () => {
    return `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  };

  const isLikelyUrl = (value) => {
    return /^https?:\/\//i.test((value || '').trim());
  };

  const parseLocation = (location) => {
    const [city = '', state = ''] = (location || '').split(',').map((segment) => segment.trim());
    return {
      city,
      state,
    };
  };

  const buildLocation = (city, state) => {
    return city && state ? `${city}, ${state}` : city || state || 'Location';
  };

  const formatPhoneNumber = (value) => {
    const digits = (value || '').replaceAll(/\D/g, '').slice(0, 10);

    if (digits.length === 0) {
      return '';
    }

    if (digits.length < 4) {
      return `(${digits}`;
    }

    if (digits.length < 7) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const normalizeJob = (job) => {
    const normalizedPay = job.pay === '' || job.pay == null
      ? ''
      : Math.max(0, Number(job.pay) || 0);
    const parsedLocation = parseLocation(job.location || '');

    return {
      id: job.id || generateJobId(),
      entryMode: job.entryMode || (job.postingUrl ? 'url' : 'template'),
      role: job.role || 'PTA Listing',
      organization: job.organization || 'Organization',
      location: buildLocation(job.city || parsedLocation.city, job.state || parsedLocation.state),
      state: job.state || parsedLocation.state || '',
      city: job.city || parsedLocation.city || '',
      type: job.type || 'Listing',
      details: job.details || 'No additional details provided.',
      sourceLabel: job.sourceLabel || 'listing',
      postingUrl: job.postingUrl || '',
      phone: job.phone || '',
      pay: normalizedPay,
      benefits: Array.isArray(job.benefits) ? job.benefits.filter(Boolean) : [],
    };
  };

  const formatPayDisplay = (pay) => {
    if (pay === '' || pay == null || Number.isNaN(Number(pay))) {
      return '';
    }

    return `$${Number(pay).toFixed(2)}`;
  };

  const formatPayInputValue = (value) => {
    if (value === '' || value == null || Number.isNaN(Number(value))) {
      return '';
    }

    return Number(Math.max(0, Number(value))).toFixed(2);
  };

  const populateCitySelect = (stateSelect, citySelect, selectedCity = '') => {
    if (!stateSelect || !citySelect) {
      return;
    }

    const state = stateSelect.value;
    citySelect.innerHTML = '<option value="">Select city</option>';

    if (!state || !stateCityOptions[state]) {
      citySelect.disabled = true;
      citySelect.value = '';
      return;
    }

    stateCityOptions[state].forEach((city) => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      citySelect.append(option);
    });

    citySelect.disabled = false;
    citySelect.value = selectedCity && stateCityOptions[state].includes(selectedCity) ? selectedCity : '';
  };

  const attachLocationDropdownBehavior = (stateSelect, citySelect) => {
    if (!stateSelect || !citySelect) {
      return;
    }

    stateSelect.addEventListener('change', () => {
      populateCitySelect(stateSelect, citySelect);
    });
  };

  const loadStoredJobs = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((job) => normalizeJob(job)) : [];
    } catch {
      return [];
    }
  };

  const saveStoredJobs = (jobs) => {
    localStorage.setItem(storageKey, JSON.stringify(jobs));
  };

  const decorateJobCard = (item, jobData) => {
    item.classList.add('clickable');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Open details for ${jobData.role}`);

    item.dataset.id = jobData.id;
    item.dataset.entryMode = jobData.entryMode;
    item.dataset.role = jobData.role;
    item.dataset.organization = jobData.organization;
    item.dataset.location = jobData.location;
    item.dataset.state = jobData.state || '';
    item.dataset.city = jobData.city || '';
    item.dataset.type = jobData.type;
    item.dataset.details = jobData.details;
    item.dataset.sourceLabel = jobData.sourceLabel;
    item.dataset.postingUrl = jobData.postingUrl || '';
    item.dataset.phone = jobData.phone || '';
    item.dataset.pay = jobData.pay === '' ? '' : String(jobData.pay);
    item.dataset.benefits = JSON.stringify(jobData.benefits || []);
  };

  const inferCardData = (item) => {
    const role = item.dataset.role || item.querySelector('.job-role')?.textContent?.trim() || 'PTA Listing';
    const type = item.dataset.type || item.querySelector('.job-tag')?.textContent?.trim() || 'Listing';
    const orgText = item.querySelector('.job-organization')?.textContent?.trim() || '';
    const locationText = item.querySelector('.job-location')?.textContent?.trim() || '';
    const metaText = item.querySelector('.job-meta')?.textContent?.trim() || '';
    const [organizationRaw = '', locationRaw = ''] = metaText.split('|');
    const organization = item.dataset.organization || orgText || organizationRaw.trim() || 'Organization';
    const location = item.dataset.location || locationText || locationRaw.trim() || 'Location';
    const parsedLocation = parseLocation(location);
    const notes = Array.from(item.querySelectorAll('.job-notes')).map((node) => node.textContent.trim());
    const details = item.dataset.details || notes[0] || 'No additional details provided.';
    const sourceLine = notes.find((line) => line.toLowerCase().startsWith('posted via')) || '';
    const sourceLabel = item.dataset.sourceLabel || sourceLine.replace(/^Posted via\s*/i, '') || 'listing';
    const postingUrl = item.dataset.postingUrl || (isLikelyUrl(details) ? details : '');
    let benefits = [];

    try {
      benefits = JSON.parse(item.dataset.benefits || '[]');
    } catch {
      benefits = [];
    }

    return normalizeJob({
      id: item.dataset.id || generateJobId(),
      entryMode: item.dataset.entryMode || (postingUrl ? 'url' : 'template'),
      role,
      organization,
      location,
      state: item.dataset.state || parsedLocation.state,
      city: item.dataset.city || parsedLocation.city,
      type,
      details,
      sourceLabel,
      postingUrl,
      phone: item.dataset.phone || '',
      pay: item.dataset.pay === '' ? '' : item.dataset.pay,
      benefits,
    });
  };

  const seedJobsFromDom = () => {
    const seededJobs = Array.from(jobsList.querySelectorAll('.job-item')).map((card) => inferCardData(card));
    saveStoredJobs(seededJobs);
    return seededJobs;
  };

  const getJobs = () => {
    const storedJobs = loadStoredJobs();
    if (storedJobs.length > 0) {
      return storedJobs;
    }

    return seedJobsFromDom();
  };

  const findJobById = (jobId) => {
    return getJobs().find((job) => job.id === jobId) || null;
  };

  const resetJobForms = () => {
    urlForm.reset();
    templateForm.reset();
    benefitItems = [];
    editingBenefitIndex = null;
    if (benefitInput) {
      benefitInput.placeholder = 'Type a benefit and press Enter';
    }
    if (benefitsEditorList) {
      benefitsEditorList.innerHTML = '';
    }
  };

  const renderBenefitsEditor = () => {
    if (!benefitsEditorList) {
      return;
    }

    benefitsEditorList.innerHTML = '';
    benefitItems.forEach((benefit, index) => {
      const item = document.createElement('li');
      item.className = 'benefit-item';
      item.innerHTML = `
        <span class="benefit-text">${escapeHtml(benefit)}</span>
        <div class="benefit-actions">
          <button class="benefit-action-btn" type="button" data-action="move-up" data-index="${index}" aria-label="Move benefit up">↑</button>
          <button class="benefit-action-btn" type="button" data-action="move-down" data-index="${index}" aria-label="Move benefit down">↓</button>
          <button class="benefit-action-btn" type="button" data-action="edit" data-index="${index}">Edit</button>
          <button class="benefit-action-btn" type="button" data-action="delete" data-index="${index}">Delete</button>
        </div>
      `;
      benefitsEditorList.append(item);
    });
  };

  const commitBenefitInput = () => {
    if (!benefitInput) {
      return;
    }

    const value = benefitInput.value.trim();
    if (!value) {
      return;
    }

    if (editingBenefitIndex == null) {
      benefitItems.push(value);
    } else {
      benefitItems.splice(editingBenefitIndex, 1, value);
      editingBenefitIndex = null;
    }

    benefitInput.value = '';
    benefitInput.placeholder = 'Type a benefit and press Enter';
    renderBenefitsEditor();
  };

  const renderDetailsBenefits = (benefits) => {
    detailsBenefitsList.innerHTML = '';
    benefits.forEach((benefit) => {
      const item = document.createElement('li');
      item.className = 'details-benefit-item';
      item.textContent = benefit;
      detailsBenefitsList.append(item);
    });
  };

  const setUploadMode = ({ entryMode, isEditing }) => {
    uploadHeading.textContent = isEditing ? 'Edit Job Listing' : 'Upload a Job Listing';
    urlSubmitButton.textContent = isEditing ? 'Save URL Listing' : 'Add URL Listing';
    templateSubmitButton.textContent = isEditing ? 'Save Listing' : 'Create Listing';
    activateTab(entryMode === 'url' ? 'urlPanel' : 'templatePanel');
  };

  const renderJobCard = (job) => {
    const item = document.createElement('li');
    const displayDetails = job.entryMode === 'url' && isLikelyUrl(job.details)
      ? 'External posting available. Select this listing to view details.'
      : job.details;

    item.className = 'job-item reveal';
    item.innerHTML = `
      <div class="job-item-head">
        <div class="job-heading-stack">
          <p class="job-organization">${escapeHtml(job.organization)}</p>
          <h3 class="job-role">${escapeHtml(job.role)}</h3>
        </div>
        <span class="job-tag">${escapeHtml(job.type)}</span>
      </div>
      <p class="job-location">${escapeHtml(job.location)}</p>
      <p class="job-notes">${escapeHtml(displayDetails)}</p>
      <p class="job-notes">Posted via ${escapeHtml(job.sourceLabel)}</p>
    `;

    decorateJobCard(item, job);
    return item;
  };

  const renderJobs = () => {
    const jobs = getJobs();
    jobsList.innerHTML = '';
    jobs.forEach((job) => {
      jobsList.append(renderJobCard(job));
    });
  };

  const upsertJob = (job) => {
    const normalizedJob = normalizeJob(job);
    const jobs = getJobs();
    const updatedJobs = editingJobId
      ? jobs.map((existingJob) => (existingJob.id === normalizedJob.id ? normalizedJob : existingJob))
      : [normalizedJob, ...jobs];

    saveStoredJobs(updatedJobs);
    renderJobs();
    return normalizedJob;
  };

  const populateUrlForm = (job) => {
    document.getElementById('urlRoleTitle').value = job.role;
    document.getElementById('jobUrl').value = job.postingUrl;
    document.getElementById('urlOrganization').value = job.organization;
    urlStateSelect.value = job.state;
    populateCitySelect(urlStateSelect, urlCitySelect, job.city);
  };

  const populateTemplateForm = (job) => {
    document.getElementById('role').value = job.role;
    document.getElementById('organization').value = job.organization;
    templateStateSelect.value = job.state;
    populateCitySelect(templateStateSelect, templateCitySelect, job.city);
    document.getElementById('employmentType').value = job.type;
    document.getElementById('description').value = job.details;
    document.getElementById('contactPhone').value = formatPhoneNumber(job.phone);
    document.getElementById('payRate').value = formatPayInputValue(job.pay);
    benefitItems = [...job.benefits];
    editingBenefitIndex = null;
    if (benefitInput) {
      benefitInput.value = '';
      benefitInput.placeholder = 'Type a benefit and press Enter';
    }
    renderBenefitsEditor();
  };

  const getDefaultTitleForLegacyUrlListing = (jobData) => {
    if (jobData.role !== 'PTA Job Link') {
      return jobData.role;
    }

    if (!isLikelyUrl(jobData.postingUrl)) {
      return 'PTA External Listing';
    }

    try {
      const host = new URL(jobData.postingUrl).hostname.replace('www.', '');
      return `${host} PTA Listing`;
    } catch {
      return 'PTA External Listing';
    }
  };

  const closeDetailsModal = () => {
    if (!detailsModal) {
      return;
    }

    detailsModal.classList.remove('open');
    detailsModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    currentDetailsJobId = null;
  };

  const openDetailsModal = (jobData) => {
    if (!detailsModal) {
      return;
    }

    const safeRoleTitle = getDefaultTitleForLegacyUrlListing(jobData);
    const hasUrl = isLikelyUrl(jobData.postingUrl);
    const isUrlOnlyDescription = isLikelyUrl(jobData.details);
    currentDetailsJobId = jobData.id;

    detailsType.textContent = jobData.type;
    detailsOrganization.textContent = jobData.organization;
    detailsRole.textContent = safeRoleTitle;
    detailsMeta.textContent = jobData.location;
    detailsDescription.textContent = hasUrl && isUrlOnlyDescription
      ? 'This listing links out to the original posting. Use the button below to view the full job description.'
      : jobData.details;
    detailsSource.textContent = `Posted via ${jobData.sourceLabel}`;

    detailsPhoneSection.hidden = !jobData.phone;
    detailsPhone.textContent = jobData.phone;
    detailsPaySection.hidden = jobData.pay === '';
    detailsPay.textContent = formatPayDisplay(jobData.pay);
    detailsBenefitsSection.hidden = !jobData.benefits.length;
    renderDetailsBenefits(jobData.benefits);

    detailsModal.classList.add('open');
    detailsModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    detailsCloseBtn.focus();

    if (hasUrl) {
      detailsOpenLink.href = jobData.postingUrl;
      detailsOpenLink.classList.remove('hidden');
    } else {
      detailsOpenLink.classList.add('hidden');
      detailsOpenLink.removeAttribute('href');
    }
  };

  const openCreateModal = () => {
    editingJobId = null;
    resetJobForms();
    setUploadMode({ entryMode: 'url', isEditing: false });
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    clearFlash();
    const activeTab = modal.querySelector('.tab-btn[aria-selected="true"]');
    if (activeTab) {
      activeTab.focus();
    }
  };

  const startEditingJob = (jobId) => {
    const job = findJobById(jobId);
    if (!job) {
      return;
    }

    editingJobId = job.id;
    closeDetailsModal();
    resetJobForms();
    setUploadMode({ entryMode: job.entryMode, isEditing: true });

    if (job.entryMode === 'url') {
      populateUrlForm(job);
    } else {
      populateTemplateForm(job);
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    clearFlash();
  };

  const showFlash = (message, type = 'ok') => {
    flash.className = `flash ${type}`;
    flash.textContent = message;
  };

  const clearFlash = () => {
    flash.className = 'flash';
    flash.textContent = '';
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    editingJobId = null;
    resetJobForms();
    setUploadMode({ entryMode: 'url', isEditing: false });
    openBtn.focus();
  };

  const activateTab = (targetId) => {
    tabButtons.forEach((btn) => {
      const selected = btn.dataset.target === targetId;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === targetId);
    });

    clearFlash();
  };

  const openDetailsForCard = (card) => {
    const jobData = inferCardData(card);
    openDetailsModal(jobData);
  };

  renderJobs();
  attachLocationDropdownBehavior(urlStateSelect, urlCitySelect);
  attachLocationDropdownBehavior(templateStateSelect, templateCitySelect);

  openBtn.addEventListener('click', openCreateModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  if (detailsCloseBtn && detailsOverlay) {
    detailsCloseBtn.addEventListener('click', closeDetailsModal);
    detailsOverlay.addEventListener('click', closeDetailsModal);
  }

  if (editJobDetailsBtn) {
    editJobDetailsBtn.addEventListener('click', () => {
      if (currentDetailsJobId) {
        startEditingJob(currentDetailsJobId);
      }
    });
  }

  cancelBtns.forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }

    if (event.key === 'Escape' && detailsModal?.classList.contains('open')) {
      closeDetailsModal();
    }
  });

  jobsList.addEventListener('click', (event) => {
    const card = event.target.closest('.job-item');
    if (!card) {
      return;
    }

    openDetailsForCard(card);
  });

  jobsList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const card = event.target.closest('.job-item');
    if (!card) {
      return;
    }

    event.preventDefault();
    openDetailsForCard(card);
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.target);
    });
  });

  if (contactPhoneInput) {
    contactPhoneInput.addEventListener('input', () => {
      contactPhoneInput.value = formatPhoneNumber(contactPhoneInput.value);
    });

    contactPhoneInput.addEventListener('paste', (event) => {
      event.preventDefault();
      const pastedText = event.clipboardData?.getData('text') || '';
      contactPhoneInput.value = formatPhoneNumber(pastedText);
    });
  }

  if (payRateInput) {
    payRateInput.addEventListener('input', () => {
      if (payRateInput.value === '') {
        return;
      }

      const sanitized = payRateInput.value
        .replaceAll(/[^\d.]/g, '')
        .replaceAll(/(\..*)\./g, '$1');

      if (sanitized === '') {
        payRateInput.value = '';
        return;
      }

      const numericValue = Math.max(0, Number(sanitized) || 0);
      payRateInput.value = sanitized.endsWith('.') ? `${numericValue}.` : sanitized;
    });

    const finalizePayInput = () => {
      payRateInput.value = formatPayInputValue(payRateInput.value);
    };

    payRateInput.addEventListener('change', finalizePayInput);
    payRateInput.addEventListener('blur', finalizePayInput);
  }

  if (benefitInput) {
    benefitInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitBenefitInput();
      }
    });
  }

  if (benefitsEditorList) {
    benefitsEditorList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) {
        return;
      }

      const index = Number(button.dataset.index);
      if (Number.isNaN(index) || !benefitItems[index]) {
        return;
      }

      const action = button.dataset.action;
      if (action === 'move-up' && index > 0) {
        [benefitItems[index - 1], benefitItems[index]] = [benefitItems[index], benefitItems[index - 1]];
      } else if (action === 'move-down' && index < benefitItems.length - 1) {
        [benefitItems[index], benefitItems[index + 1]] = [benefitItems[index + 1], benefitItems[index]];
      } else if (action === 'edit') {
        editingBenefitIndex = index;
        benefitInput.value = benefitItems[index];
        benefitInput.focus();
        benefitInput.placeholder = 'Edit benefit and press Enter';
      } else if (action === 'delete') {
        benefitItems.splice(index, 1);
        if (editingBenefitIndex === index) {
          editingBenefitIndex = null;
          benefitInput.value = '';
          benefitInput.placeholder = 'Type a benefit and press Enter';
        }
      }

      renderBenefitsEditor();
    });
  }

  urlForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const role = document.getElementById('urlRoleTitle').value.trim();
    const url = document.getElementById('jobUrl').value.trim();
    const organization = document.getElementById('urlOrganization').value.trim();
    const state = urlStateSelect.value;
    const city = urlCitySelect.value;
    const location = buildLocation(city, state);

    if (!role || !url || !organization || !state || !city) {
      showFlash('Please add a job title, job URL, organization name, state, and city.', 'err');
      return;
    }

    const savedJob = upsertJob({
      id: editingJobId || generateJobId(),
      entryMode: 'url',
      role,
      organization,
      location,
      state,
      city,
      type: 'URL',
      details: url,
      sourceLabel: 'URL upload',
      postingUrl: url,
      phone: '',
      pay: '',
      payBenefits: '',
    });

    closeModal();
    showFlash(editingJobId ? 'URL listing updated successfully.' : 'URL listing added successfully. You can publish another one.', 'ok');
    openDetailsModal(savedJob);
  });

  templateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    commitBenefitInput();
    const role = document.getElementById('role').value.trim();
    const organization = document.getElementById('organization').value.trim();
    const state = templateStateSelect.value;
    const city = templateCitySelect.value;
    const location = buildLocation(city, state);
    const type = document.getElementById('employmentType').value;
    const details = document.getElementById('description').value.trim();
    const phone = formatPhoneNumber(document.getElementById('contactPhone').value);
    const payValue = payRateInput.value === '' ? '' : Math.max(0, Number(payRateInput.value) || 0);

    if (!role || !organization || !state || !city || !type || !details) {
      showFlash('Please complete all template fields before posting.', 'err');
      return;
    }

    const savedJob = upsertJob({
      id: editingJobId || generateJobId(),
      entryMode: 'template',
      role,
      organization,
      location,
      state,
      city,
      type,
      details,
      sourceLabel: 'template form',
      postingUrl: '',
      phone,
      pay: payValue,
      benefits: [...benefitItems],
    });

    closeModal();
    showFlash(editingJobId ? 'Listing updated successfully.' : 'Template listing created. It now appears in current listings.', 'ok');
    openDetailsModal(savedJob);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSettingsMenu();
  initThemeToggle();
  setCurrentYear();
  initActiveNav();
  initQuickGuideTooltip();
  initJobsModal();
});
