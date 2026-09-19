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

const teacherAuthState = {
  configured: false,
  loading: false,
  session: null,
  isAuthenticated: false,
  isAdmin: false,
  mustChangePassword: false,
  isLocalDevAuth: false,
  supabase: null,
  listeners: [],
};

function getAdminEmail() {
  const configuredAdmin = (globalThis.APP_CONFIG?.adminEmail || '').trim().toLowerCase();
  return configuredAdmin || 'lazyboy64@yahoo.com';
}

function isLocalDevHost() {
  const host = (globalThis.location?.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function createLocalDevSession() {
  const email = getAdminEmail();
  return {
    access_token: 'local-dev-token',
    token_type: 'bearer',
    user: {
      id: 'local-dev-user',
      email,
      user_metadata: {
        first_name: 'Local',
        last_name: 'Dev',
      },
      app_metadata: {
        can_manage_users: true,
      },
    },
  };
}

// Clears persisted Supabase auth so the client cannot call refresh_token.
// Needed while api.thejumpvault.com returns 500 on OPTIONS preflights for /auth/v1/token.
function clearSupabaseAuthStorage() {
  try {
    const keysToRemove = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) {
        continue;
      }
      if (/^sb-.*-auth-token/i.test(key) || key.toLowerCase().includes('supabase.auth')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage access errors (private mode, etc.).
  }
}

function getPathname() {
  return (globalThis.location?.pathname || '/').replace(/\/+$/, '') || '/';
}

function isLoginPage() {
  return getPathname() === '/login';
}

function isChangePasswordPage() {
  return getPathname() === '/change-password';
}

function isAdminUsersPage() {
  return getPathname() === '/admin-users';
}

function isReviewRequestsPage() {
  return getPathname() === '/review-requests';
}


function closeOpenSettingsMenus() {
  const menus = document.querySelectorAll('.settings-menu');
  menus.forEach((menu) => {
    const trigger = menu.querySelector('.settings-trigger');
    const panel = menu.querySelector('.settings-panel');
    menu.classList.remove('open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (panel) {
      panel.setAttribute('aria-hidden', 'true');
    }
  });

  closeSchoolThemeSubmenus();
}

function notifyTeacherAuthChange() {
  teacherAuthState.listeners.forEach((listener) => {
    listener({
      configured: teacherAuthState.configured,
      loading: teacherAuthState.loading,
      session: teacherAuthState.session,
      isAuthenticated: teacherAuthState.isAuthenticated,
      isAdmin: teacherAuthState.isAdmin,
      mustChangePassword: teacherAuthState.mustChangePassword,
    });
  });
}

function onTeacherAuthChange(listener) {
  if (typeof listener !== 'function') {
    return;
  }

  teacherAuthState.listeners.push(listener);
  listener({
    configured: teacherAuthState.configured,
    loading: teacherAuthState.loading,
    session: teacherAuthState.session,
    isAuthenticated: teacherAuthState.isAuthenticated,
    isAdmin: teacherAuthState.isAdmin,
    mustChangePassword: teacherAuthState.mustChangePassword,
  });
}

async function initTeacherAuth() {
  // Initialize the Supabase client on every page — this must run even on pages
  // that have no settings UI (e.g. /login), otherwise those pages see configured=false.
  const config = globalThis.APP_CONFIG || {};
  const supabaseUrl = config.supabaseUrl || '';
  const supabaseAnonKey = config.supabaseAnonKey || '';
  const localDevHost = isLocalDevHost();
  const hasRuntimeAuthConfig = Boolean(supabaseUrl && supabaseAnonKey && globalThis.supabase?.createClient);

  // api.thejumpvault.com currently fails CORS preflight (OPTIONS -> 500) for auth token
  // routes. Clear any stored session once per tab so supabase-js cannot enter a refresh_token loop.
  try {
    const corsAuthResetKey = 'sjhAuthCorsResetV1';
    if (!sessionStorage.getItem(corsAuthResetKey)) {
      clearSupabaseAuthStorage();
      sessionStorage.setItem(corsAuthResetKey, '1');
    }
  } catch {
    clearSupabaseAuthStorage();
  }

  teacherAuthState.configured = hasRuntimeAuthConfig;
  teacherAuthState.supabase = hasRuntimeAuthConfig
    ? globalThis.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Keep disabled until api.thejumpvault.com handles OPTIONS correctly for /auth/v1/token.
          autoRefreshToken: false,
          persistSession: !localDevHost,
          detectSessionInUrl: !localDevHost,
          ...(localDevHost
            ? {
                storage: {
                  getItem: () => null,
                  setItem: () => {},
                  removeItem: () => {},
                },
              }
            : {}),
        },
      })
    : null;

  if (!hasRuntimeAuthConfig) {
    teacherAuthState.session = null;
    teacherAuthState.isAuthenticated = false;
    teacherAuthState.isAdmin = false;
    teacherAuthState.mustChangePassword = false;
    teacherAuthState.isLocalDevAuth = false;
    notifyTeacherAuthChange();
  }

  // Settings UI wiring — only present on pages with the header settings menu.
  const authActionButton = document.getElementById('authActionButton');
  const settingsUserStatus = document.getElementById('settingsUserStatus');
  const manageUsersButton = document.getElementById('manageUsersButton');
  const reviewRequestsButton = document.getElementById('reviewRequestsButton');
  const profileButton = document.getElementById('profileButton');
  const hasSettingsUi = Boolean(authActionButton && settingsUserStatus);

  const updateSettingsAuthUi = (statusMessage = '') => {
    if (!hasSettingsUi) {
      notifyTeacherAuthChange();
      return;
    }

    const isSignedIn = Boolean(teacherAuthState.isAuthenticated && teacherAuthState.session);

    if (profileButton) {
      profileButton.classList.toggle('hidden', !isSignedIn);
    }
    if (manageUsersButton) {
      manageUsersButton.classList.toggle('hidden',
        !teacherAuthState.isAdmin && !teacherAuthState.session?.user?.app_metadata?.can_manage_users);
    }
    // Any signed-in staff member can review employer requests — the same people
    // who can add listings directly.
    if (reviewRequestsButton) {
      reviewRequestsButton.classList.toggle('hidden', !isSignedIn);
      if (isSignedIn) refreshPendingRequestCount();
    }

    if (settingsUserStatus) {
      const showStatus = Boolean(statusMessage);
      settingsUserStatus.hidden = !showStatus;
      settingsUserStatus.classList.toggle('hidden', !showStatus);
      settingsUserStatus.textContent = statusMessage || '';
    }

    if (!teacherAuthState.configured) {
      authActionButton.textContent = 'Sign In';
      authActionButton.disabled = false;
      notifyTeacherAuthChange();
      return;
    }

    if (!teacherAuthState.session) {
      authActionButton.textContent = 'Sign In';
      authActionButton.disabled = false;
      notifyTeacherAuthChange();
      return;
    }

    authActionButton.textContent = 'Sign Out';
    authActionButton.disabled = false;
    notifyTeacherAuthChange();
  };

  const applyLocalDevAuth = () => {
    if (!isLocalDevHost()) {
      return false;
    }

    teacherAuthState.isLocalDevAuth = true;
    teacherAuthState.configured = true;
    teacherAuthState.session = createLocalDevSession();
    teacherAuthState.isAuthenticated = true;
    teacherAuthState.isAdmin = true;
    teacherAuthState.mustChangePassword = false;
    teacherAuthState.loading = false;
    updateSettingsAuthUi();

    if (isLoginPage()) {
      globalThis.location.href = '/jobs';
    }

    return true;
  };

  // Apply a session snapshot to global auth state and handle page redirects.
  // Called both from onAuthStateChange (with the session the SDK provides directly)
  // and on initial load (with the result of getSession). Never calls getSession()
  // inside onAuthStateChange — doing so deadlocks the Supabase JS client because
  // it holds an internal lock during auth state change events.
  const applySession = (session, allowRedirect = false) => {
    if (session) {
      teacherAuthState.isLocalDevAuth = false;
    } else if (teacherAuthState.isLocalDevAuth && isLocalDevHost()) {
      teacherAuthState.session = createLocalDevSession();
      teacherAuthState.isAuthenticated = true;
      teacherAuthState.isAdmin = true;
      teacherAuthState.mustChangePassword = false;
      teacherAuthState.loading = false;
      updateSettingsAuthUi();
      return;
    }

    teacherAuthState.session = session || null;
    teacherAuthState.isAuthenticated = Boolean(session);
    const userEmail = (session?.user?.email || '').toLowerCase();
    teacherAuthState.isAdmin = Boolean(session && userEmail === getAdminEmail());
    teacherAuthState.mustChangePassword = Boolean(session?.user?.user_metadata?.must_change_password);
    teacherAuthState.loading = false;
    updateSettingsAuthUi();

    if (!allowRedirect) return;

    if (teacherAuthState.mustChangePassword && !isChangePasswordPage() && !isLoginPage()) {
      globalThis.location.href = '/change-password';
      return;
    }

    if (teacherAuthState.isAuthenticated && isLoginPage() && !teacherAuthState.mustChangePassword) {
      globalThis.location.href = '/jobs';
      return;
    }

    if (isAdminUsersPage() && (!teacherAuthState.isAuthenticated ||
        (!teacherAuthState.isAdmin && !session?.user?.app_metadata?.can_manage_users))) {
      globalThis.location.href = '/';
      return;
    }

    // The queue holds employer contact details and unreviewed public text, so
    // it is staff-only. RLS enforces this server-side; this is just the redirect.
    if (isReviewRequestsPage() && !teacherAuthState.isAuthenticated) {
      globalThis.location.href = '/login';
      return;
    }

  };

  if (hasSettingsUi) {
    authActionButton.addEventListener('click', async () => {
      if (teacherAuthState.session) {
        authActionButton.disabled = true;

        if (teacherAuthState.isLocalDevAuth || !teacherAuthState.supabase) {
          teacherAuthState.isLocalDevAuth = false;
          teacherAuthState.session = null;
          teacherAuthState.isAuthenticated = false;
          teacherAuthState.isAdmin = false;
          teacherAuthState.mustChangePassword = false;
          authActionButton.disabled = false;
          updateSettingsAuthUi();
          closeOpenSettingsMenus();
          return;
        }

        await teacherAuthState.supabase.auth.signOut();
        teacherAuthState.session = null;
        teacherAuthState.isAuthenticated = false;
        teacherAuthState.isAdmin = false;
        teacherAuthState.mustChangePassword = false;
        authActionButton.disabled = false;
        updateSettingsAuthUi();
        closeOpenSettingsMenus();
        return;
      }

      if (!teacherAuthState.configured || !teacherAuthState.supabase) {
        closeOpenSettingsMenus();
        globalThis.location.href = '/login';
        return;
      }

      authActionButton.disabled = false;
      closeOpenSettingsMenus();
      globalThis.location.href = '/login';
    });
  }

  if (teacherAuthState.supabase && !localDevHost) {
    let initialLoadDone = false;

    // Use the session passed directly by the SDK — never call getSession() here.
    teacherAuthState.supabase.auth.onAuthStateChange((event, session) => {
      // Only allow redirects after getSession() has confirmed the real session,
      // OR when a meaningful auth event fires (not the cold INITIAL_SESSION with null).
      const isSignificantEvent = event !== 'INITIAL_SESSION';
      applySession(session, initialLoadDone || (isSignificantEvent && Boolean(session)));
    });

    // Initial load: safe to call getSession() here since we are outside the lock.
    teacherAuthState.loading = true;
    if (hasSettingsUi) updateSettingsAuthUi();
    teacherAuthState.supabase.auth.getSession().then(({ data, error }) => {
      initialLoadDone = true;
      if (error) {
        teacherAuthState.loading = false;
        // Clear a broken persisted session so the client stops retrying refresh_token.
        clearSupabaseAuthStorage();
        teacherAuthState.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        applySession(null, true);
        return;
      }

      if (data.session) {
        applySession(data.session, true);
        return;
      }

      applySession(null, true);
    }).catch(() => {
      initialLoadDone = true;
      teacherAuthState.loading = false;
      clearSupabaseAuthStorage();
      teacherAuthState.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      applySession(null, true);
    });
  } else if (localDevHost) {
    applyLocalDevAuth();
  }
}

function initLoginPage() {
  const loginForm = document.getElementById('loginForm');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginMessage = document.getElementById('loginMessage');
  const captchaContainer = document.getElementById('loginCaptcha');
  if (!loginForm || !loginEmail || !loginPassword || !loginMessage) {
    return;
  }

  // Render hCaptcha widget once the API script has loaded, using sitekey from config
  const sitekey = (globalThis.APP_CONFIG?.hcaptchaSitekey || '10000000-ffff-ffff-ffff-000000000001').trim();
  if (captchaContainer) {
    captchaContainer.dataset.sitekey = sitekey;
    captchaContainer.dataset.theme = 'auto';
    captchaContainer.classList.add('h-captcha');
    // hCaptcha auto-renders widgets with class h-captcha after its script loads.
    // If the script already fired (rare), render manually.
    if (globalThis.hcaptcha) globalThis.hcaptcha.render(captchaContainer, { sitekey });
  }

  const renderMessage = (message, isError = false) => {
    loginMessage.textContent = message;
    loginMessage.classList.toggle('error', isError);
  };

  onTeacherAuthChange((authState) => {
    if (!authState.configured) {
      renderMessage('Sign-in is not configured yet. Add Supabase values in app-config.js.', true);
      return;
    }

    if (authState.loading) {
      renderMessage('Checking session...');
      return;
    }

    if (authState.session && authState.mustChangePassword) {
      renderMessage('You must set a new password before continuing. Redirecting...');
      globalThis.location.href = '/change-password';
      return;
    }

    if (authState.session) {
      renderMessage('Signed in. Redirecting...');
      globalThis.location.href = '/jobs';
      return;
    }

    renderMessage('Sign in with an approved account to manage listings.');
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!teacherAuthState.configured || !teacherAuthState.supabase) {
      renderMessage('Sign-in is not configured.', true);
      return;
    }

    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      renderMessage('Email and password are required.', true);
      return;
    }

    // hCaptcha verification — token is set by the widget on completion
    const captchaToken = loginForm.querySelector('[name="h-captcha-response"]')?.value || '';
    const sitekey = (globalThis.APP_CONFIG?.hcaptchaSitekey || '').trim();
    const isLocalhost = globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1';
    const usingRealCaptcha = !isLocalhost && sitekey && sitekey !== '10000000-ffff-ffff-ffff-000000000001';
    if (usingRealCaptcha && !captchaToken) {
      renderMessage('Please complete the CAPTCHA before signing in.', true);
      return;
    }

    renderMessage('Signing in...');
    const { error } = await teacherAuthState.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      renderMessage('Sign-in failed. Check your credentials.', true);
      // Reset captcha so the user can try again
      if (globalThis.hcaptcha) globalThis.hcaptcha.reset();
      return;
    }

    renderMessage('Signed in successfully. Redirecting...');
  });
}

function initChangePasswordPage() {
  const form = document.getElementById('changePasswordForm');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const message = document.getElementById('changePasswordMessage');
  const strengthFill = document.getElementById('pwStrengthFill');
  const matchMsg = document.getElementById('pwMatchMsg');
  const submitBtn = document.getElementById('updatePasswordBtn');
  if (!form || !newPasswordInput || !confirmPasswordInput || !message) {
    return;
  }

  const rules = [
    { id: 'req-length',  test: (p) => p.length >= 8 },
    { id: 'req-upper',   test: (p) => /[A-Z]/.test(p) },
    { id: 'req-lower',   test: (p) => /[a-z]/.test(p) },
    { id: 'req-number',  test: (p) => /[0-9]/.test(p) },
    { id: 'req-special', test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  const getStrength = (password) => rules.filter((r) => r.test(password)).length;

  const allRulesMet = (password) => getStrength(password) === rules.length;

  const updateStrengthUi = () => {
    const password = newPasswordInput.value;
    const strength = getStrength(password);

    if (strengthFill) {
      strengthFill.dataset.strength = password.length === 0 ? '' : String(strength);
    }

    rules.forEach((rule) => {
      const el = document.getElementById(rule.id);
      if (el) el.classList.toggle('met', rule.test(password));
    });

    updateSubmitState();
  };

  const updateMatchUi = () => {
    const pw = newPasswordInput.value;
    const confirm = confirmPasswordInput.value;
    if (!matchMsg) return;

    if (confirm.length === 0) {
      matchMsg.textContent = '';
      matchMsg.className = 'pw-match-msg';
    } else if (pw === confirm) {
      matchMsg.textContent = 'Passwords match';
      matchMsg.className = 'pw-match-msg match';
    } else {
      matchMsg.textContent = 'Passwords do not match';
      matchMsg.className = 'pw-match-msg no-match';
    }

    updateSubmitState();
  };

  const updateSubmitState = () => {
    if (!submitBtn) return;
    const pw = newPasswordInput.value;
    const confirm = confirmPasswordInput.value;
    submitBtn.disabled = !(allRulesMet(pw) && pw === confirm);
  };

  newPasswordInput.addEventListener('input', () => {
    updateStrengthUi();
    if (confirmPasswordInput.value.length > 0) updateMatchUi();
  });

  confirmPasswordInput.addEventListener('input', updateMatchUi);

  const renderMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle('error', isError);
  };

  // Prevents the onAuthStateChange listener from redirecting mid-update
  let isUpdatingPassword = false;

  onTeacherAuthChange((authState) => {
    if (isUpdatingPassword) return;

    if (!authState.configured) {
      renderMessage('Password update is not configured yet.', true);
      return;
    }

    if (authState.loading) {
      renderMessage('Checking session...');
      return;
    }

    if (!authState.session) {
      renderMessage('Please sign in first. Redirecting...');
      globalThis.location.href = '/login';
      return;
    }

    if (!authState.mustChangePassword) {
      renderMessage('Password already updated. Redirecting...');
      globalThis.location.href = '/jobs';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!teacherAuthState.configured || !teacherAuthState.supabase) {
      renderMessage('Password update is not configured.', true);
      return;
    }

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!allRulesMet(newPassword)) {
      renderMessage('Password does not meet all requirements.', true);
      return;
    }

    if (newPassword !== confirmPassword) {
      renderMessage('Passwords do not match.', true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    isUpdatingPassword = true;
    renderMessage('Updating password...');

    // Call the GoTrue /user endpoint directly with fetch to avoid the Supabase JS
    // client's internal lock, which can deadlock when updateUser acquires it while
    // onAuthStateChange is already holding it.
    const session = teacherAuthState.session;
    const supabaseUrl = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = globalThis.APP_CONFIG?.supabaseAnonKey || '';

    let updateError = null;
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ password: newPassword, data: { must_change_password: false } }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        updateError = new Error(errJson.message || `HTTP ${resp.status}`);
      }
    } catch (err) {
      updateError = err;
    }

    isUpdatingPassword = false;

    if (updateError) {
      renderMessage(`Unable to update password: ${updateError.message || 'unknown error'}`, true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // Sign out so the user must log in fresh with the new password
    renderMessage('Password updated. Signing out...');
    try {
      await teacherAuthState.supabase.auth.signOut();
    } catch {
      // sign-out failure is non-fatal — session expires naturally
    }

    renderMessage('Password updated. Please sign in with your new password.');
    setTimeout(() => {
      globalThis.location.href = '/login';
    }, 1500);
  });
}

function canAccessUserManagement(authState) {
  if (!authState.configured || !authState.session) return false;
  return authState.isAdmin || Boolean(authState.session.user?.app_metadata?.can_manage_users);
}

// Shared state -> city/county dropdown behaviour, used by both the staff
// Upload form and the public employer wizard.
//
// Rules:
//   * City and county stay disabled until a state is chosen — neither list
//     means anything without one.
//   * Choosing a city fills in its county automatically.
//   * Choosing a county narrows the city list to that county's cities.
//   * Either city or county is enough; callers enforce that in validation.
function createLocationPicker({ stateSelect, citySelect, countySelect, placeholder = 'Select' }) {
  if (!stateSelect || !citySelect) {
    return null;
  }

  const helpers = globalThis.LOCATION_HELPERS;
  if (!helpers) {
    return null;
  }

  const fill = (select, values, blankLabel) => {
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = blankLabel;
    select.append(blank);
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  };

  const setDisabled = (disabled) => {
    citySelect.disabled = disabled;
    if (countySelect) countySelect.disabled = disabled;
  };

  // A clear button beside each select, so a wrong pick can be undone without
  // hunting for the blank row at the top of a 197-item list.
  const addClearButton = (select, label) => {
    const wrap = document.createElement('div');
    wrap.className = 'select-clear-wrap';
    select.parentNode.insertBefore(wrap, select);
    wrap.append(select);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select-clear-btn';
    button.textContent = '×';
    button.setAttribute('aria-label', `Clear ${label}`);
    button.title = `Clear ${label}`;
    wrap.append(button);

    const sync = () => {
      button.hidden = !select.value || select.disabled;
    };

    button.addEventListener('click', () => {
      select.value = '';
      // Let the picker's own change handlers run: clearing the county has to
      // widen the city list back out again.
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      select.focus();
    });

    select.addEventListener('change', sync);
    sync();
    return sync;
  };

  const syncCityClear = addClearButton(citySelect, 'city');
  const syncCountyClear = countySelect ? addClearButton(countySelect, 'county') : () => {};

  // refresh() and the city/county handlers set values in code, which does not
  // fire change, so the buttons have to be re-synced explicitly.
  const syncClearButtons = () => {
    syncCityClear();
    syncCountyClear();
  };

  // Repopulate both lists for the current state, keeping the passed values when
  // they are still valid. Used on state change and when loading a job to edit.
  const refresh = ({ city = '', county = '' } = {}) => {
    const state = stateSelect.value;

    if (!state) {
      fill(citySelect, [], 'Select state first');
      if (countySelect) fill(countySelect, [], 'Select state first');
      setDisabled(true);
      syncClearButtons();
      return;
    }

    const counties = helpers.countiesFor(state);
    const validCounty = counties.includes(county) ? county : '';

    fill(citySelect, helpers.citiesFor(state, validCounty), `${placeholder} city`);
    if (countySelect) fill(countySelect, counties, `${placeholder} county`);

    setDisabled(false);

    const validCity = helpers.countyForCity(state, city) ? city : '';
    citySelect.value = validCity;
    if (countySelect) {
      // A city always wins: its county is a fact, not a preference.
      countySelect.value = validCity ? helpers.countyForCity(state, validCity) : validCounty;
    }

    syncClearButtons();
  };

  stateSelect.addEventListener('change', () => refresh());

  // Setting .value in code does not fire change, so these cannot loop.
  citySelect.addEventListener('change', () => {
    if (!countySelect) return;
    const city = citySelect.value;
    if (city) {
      countySelect.value = helpers.countyForCity(stateSelect.value, city);
    }
    syncClearButtons();
  });

  countySelect?.addEventListener('change', () => {
    const state = stateSelect.value;
    const county = countySelect.value;
    const previousCity = citySelect.value;

    fill(citySelect, helpers.citiesFor(state, county), `${placeholder} city`);
    // Keep the city only if it is actually in the county they just picked.
    citySelect.value = county && helpers.countyForCity(state, previousCity) !== county
      ? ''
      : previousCity;
    syncClearButtons();
  });

  return {
    refresh,
    get city() { return citySelect.value; },
    get county() { return countySelect ? countySelect.value : ''; },
  };
}

// "Coeur d'Alene, ID" when there is a city, "Kootenai County, ID" when the
// employer only knew the county. Falls back to whichever part exists.
function buildLocationLabel(city, county, state) {
  const place = (city || '').trim() || ((county || '').trim() ? `${county.trim()} County` : '');
  const st = (state || '').trim();
  if (place && st) return `${place}, ${st}`;
  return place || st || 'Location';
}

// US phone formatting shared by the staff form and the employer wizard.
// Caps at 10 digits and formats progressively as the field is typed into:
// "(208", "(208) 555", "(208) 555-0123". Never produces a trailing character
// that a backspace would immediately re-add, which would make delete feel stuck.
function formatUsPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  // A pasted "1-208-555-0123" is a country code plus 10 digits, not 11 digits
  // of number — drop the 1 rather than truncating the last digit away.
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

// Digits only, for validation and for deciding whether the field is complete.
function phoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// Reformats a phone input on every keystroke and on paste.
function attachPhoneFormatting(input) {
  if (!input) return;
  const apply = () => { input.value = formatUsPhone(input.value); };
  input.addEventListener('input', apply);
  input.addEventListener('paste', (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || globalThis.clipboardData)?.getData('text') || '';
    input.value = formatUsPhone(pasted);
  });
  input.addEventListener('blur', apply);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatDate(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function callAdminApi(path, body) {
  const url = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
  return fetch(`${url}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherAuthState.session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
}

function initAdminUsersPage() {
  const form = document.getElementById('createUserForm');
  const emailInput = document.getElementById('newUserEmail');
  const passwordInput = document.getElementById('temporaryPassword');
  const firstNameInput = document.getElementById('newUserFirstName');
  const lastNameInput = document.getElementById('newUserLastName');
  const pageMessage = document.getElementById('adminUserMessage');
  const createMessage = document.getElementById('createUserMessage');
  const userList = document.getElementById('userList');
  const userListEmpty = document.getElementById('userListEmpty');
  const refreshBtn = document.getElementById('refreshUsersBtn');

  // Edit modal elements
  const editModal = document.getElementById('editUserModal');
  const editModalClose = document.getElementById('editUserModalClose');
  const editModalOverlay = document.getElementById('editUserModalOverlay');
  const editUserIdInput = document.getElementById('editUserId');
  const editFirstName = document.getElementById('editFirstName');
  const editLastName = document.getElementById('editLastName');
  const editEmail = document.getElementById('editEmail');
  const editCanManage = document.getElementById('editCanManage');
  const editCanManageWrap = document.getElementById('editCanManageWrap');
  const editUserForm = document.getElementById('editUserForm');
  const editUserCancel = document.getElementById('editUserCancel');
  const editUserMessage = document.getElementById('editUserMessage');

  if (!form || !emailInput || !passwordInput) return;

  const renderPageMessage = (text, isError = false) => {
    if (!pageMessage) return;
    pageMessage.textContent = text;
    pageMessage.classList.toggle('error', isError);
  };

  const renderCreateMessage = (text, isError = false) => {
    if (!createMessage) return;
    createMessage.textContent = text;
    createMessage.classList.toggle('error', isError);
  };

  const renderEditMessage = (text, isError = false) => {
    if (!editUserMessage) return;
    editUserMessage.textContent = text;
    editUserMessage.classList.toggle('error', isError);
  };

  const openEditModal = (user) => {
    if (!editModal) return;
    if (editUserIdInput) editUserIdInput.value = user.id;
    if (editFirstName) editFirstName.value = user.firstName || '';
    if (editLastName) editLastName.value = user.lastName || '';
    if (editEmail) editEmail.value = user.email || '';
    if (editCanManage) editCanManage.checked = user.canManageUsers || false;
    // Only admin can change permissions; hide toggle for non-admins and for admin user
    if (editCanManageWrap) {
      editCanManageWrap.classList.toggle('hidden', !teacherAuthState.isAdmin || user.isAdmin);
    }
    renderEditMessage('');
    editModal.classList.add('open');
    editModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  };

  const closeEditModal = () => {
    if (!editModal) return;
    editModal.classList.remove('open');
    editModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };

  if (editModalClose) editModalClose.addEventListener('click', closeEditModal);
  if (editModalOverlay) editModalOverlay.addEventListener('click', closeEditModal);
  if (editUserCancel) editUserCancel.addEventListener('click', closeEditModal);

  if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = editUserIdInput?.value;
      if (!userId) return;
      const saveBtn = document.getElementById('editUserSave');
      if (saveBtn) saveBtn.disabled = true;
      renderEditMessage('Saving...');

      const resp = await callAdminApi('admin-update-user', {
        userId,
        firstName: editFirstName?.value?.trim() || '',
        lastName: editLastName?.value?.trim() || '',
        canManageUsers: editCanManage?.checked,
      });

      if (saveBtn) saveBtn.disabled = false;
      if (!resp.ok) {
        renderEditMessage((await resp.text()) || 'Failed to save changes.', true);
        return;
      }
      renderEditMessage('Saved.');
      setTimeout(closeEditModal, 800);
      loadUsers();
    });
  }

  const loadUsers = async () => {
    if (!teacherAuthState.session) return;
    if (userList) userList.innerHTML = '';
    if (userListEmpty) {
      userListEmpty.textContent = 'Loading users...';
      userList?.append(userListEmpty);
    }

    const url = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
    const resp = await fetch(`${url}/functions/v1/list-users`, {
      headers: { Authorization: `Bearer ${teacherAuthState.session.access_token}` },
    });

    if (!resp.ok) {
      if (userListEmpty) userListEmpty.textContent = 'Could not load users.';
      return;
    }

    const { users } = await resp.json();
    if (userList) userList.innerHTML = '';

    if (!users || users.length === 0) {
      if (userListEmpty) {
        userListEmpty.textContent = 'No users found.';
        userList?.append(userListEmpty);
      }
      return;
    }

    users.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'user-list-item';

      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
      const badges = [];
      if (user.isAdmin) badges.push('<span class="user-item-badge">Admin</span>');
      if (user.mustChangePassword) badges.push('<span class="user-item-badge badge-warn">Must change password</span>');
      if (user.canManageUsers && !user.isAdmin) badges.push('<span class="user-item-badge">Can manage users</span>');

      const isAdminSelf = user.isAdmin;
      const editBtn = `<button class="btn btn-muted user-action-btn" data-action="edit" type="button">Edit</button>`;
      const resetBtn = `<button class="btn btn-muted user-action-btn" data-action="reset" type="button">Reset Password</button>`;
      const deleteBtn = teacherAuthState.isAdmin && !isAdminSelf
        ? `<button class="btn user-action-btn btn-danger" data-action="delete" type="button">Delete</button>`
        : '';

      li.innerHTML = `
        <p class="user-item-email">${escapeHtml(user.email || '—')}</p>
        <div class="user-item-meta"><span>${escapeHtml(displayName)}</span></div>
        <div class="user-item-meta">
          <span>Joined ${formatDate(user.createdAt)}</span>
          <span>Last sign-in: ${formatDate(user.lastSignIn)}</span>
        </div>
        ${badges.length ? `<div class="user-item-meta">${badges.join('')}</div>` : ''}
        <div class="user-item-action-row">${editBtn}${resetBtn}${deleteBtn}</div>
      `;

      // Store user data for button handlers
      li.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(user));

      li.querySelector('[data-action="reset"]')?.addEventListener('click', async () => {
        if (!globalThis.confirm(`Reset password for ${user.email}? They will be required to set a new password on next sign-in.`)) return;
        const resp2 = await callAdminApi('admin-update-user', { userId: user.id, resetPassword: true });
        if (resp2.ok) {
          renderPageMessage(`Password reset for ${user.email}. Temporary password: TempPass#1`, false);
        } else {
          renderPageMessage('Failed to reset password.', true);
        }
      });

      li.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!globalThis.confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
        const resp3 = await callAdminApi('delete-user', { userId: user.id });
        if (resp3.ok) {
          renderPageMessage(`${user.email} has been deleted.`);
          loadUsers();
        } else {
          renderPageMessage('Failed to delete user.', true);
        }
      });

      userList?.append(li);
    });
  };

  if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);

  onTeacherAuthChange((authState) => {
    if (!authState.configured) {
      renderPageMessage('User management is not configured yet.', true);
      return;
    }
    if (authState.loading) return;
    if (!authState.session) {
      globalThis.location.href = '/login';
      return;
    }
    if (!canAccessUserManagement(authState)) {
      globalThis.location.href = '/';
      return;
    }
    renderPageMessage('');
    loadUsers();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!teacherAuthState.session || !canAccessUserManagement(teacherAuthState)) {
      renderCreateMessage('You do not have permission to create users.', true);
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const temporaryPassword = passwordInput.value;
    if (!email || !temporaryPassword) {
      renderCreateMessage('Email and temporary password are required.', true);
      return;
    }
    if (temporaryPassword.length < 8) {
      renderCreateMessage('Temporary password must be at least 8 characters.', true);
      return;
    }

    const createBtn = document.getElementById('createUserBtn');
    if (createBtn) createBtn.disabled = true;
    renderCreateMessage('Creating user...');

    const url = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
    const response = await fetch(`${url}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherAuthState.session.access_token}`,
      },
      body: JSON.stringify({
        email,
        temporaryPassword,
        firstName: firstNameInput?.value?.trim() || '',
        lastName: lastNameInput?.value?.trim() || '',
      }),
    });

    if (createBtn) createBtn.disabled = false;
    if (!response.ok) {
      renderCreateMessage((await response.text()) || 'Unable to create user.', true);
      return;
    }

    renderCreateMessage('User created. They must change their password at first sign-in.');
    form.reset();
    loadUsers();
  });
}

function initProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  const overlay = document.getElementById('profileModalOverlay');
  const closeBtn = document.getElementById('profileModalClose');
  const profileBtn = document.getElementById('profileButton');

  const nameEl = document.getElementById('profileModalName');
  const emailEl = document.getElementById('profileModalEmail');
  const joinedEl = document.getElementById('profileModalJoined');

  const editNameBtn = document.getElementById('profileEditNameBtn');
  const editCancelBtn = document.getElementById('profileEditCancel');
  const tabPw = document.getElementById('profileTabPassword');
  const panelInfo = document.getElementById('profilePanelInfo');
  const panelPw = document.getElementById('profilePanelPassword');

  const editForm = document.getElementById('profileEditForm');
  const firstInput = document.getElementById('profileModalFirst');
  const lastInput = document.getElementById('profileModalLast');
  const editMsg = document.getElementById('profileEditMessage');

  const pwForm = document.getElementById('profilePwForm');
  const newPwInput = document.getElementById('profileNewPw');
  const confirmPwInput = document.getElementById('profileConfirmPw');
  const pwFill = document.getElementById('profilePwFill');
  const pwMatch = document.getElementById('profilePwMatch');
  const pwSaveBtn = document.getElementById('profilePwSave');
  const pwMsg = document.getElementById('profilePwMessage');

  const rules = [
    { id: 'profile-req-length',  test: (p) => p.length >= 8 },
    { id: 'profile-req-upper',   test: (p) => /[A-Z]/.test(p) },
    { id: 'profile-req-lower',   test: (p) => /[a-z]/.test(p) },
    { id: 'profile-req-number',  test: (p) => /[0-9]/.test(p) },
    { id: 'profile-req-special', test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];
  const allMet = (p) => rules.every((r) => r.test(p));

  const renderMsg = (el, text, isError = false) => {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', isError);
  };

  const populateInfo = (session) => {
    if (!session) return;
    const meta = session.user?.user_metadata || {};
    const displayName = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || '—';
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = session.user?.email || '—';
    if (joinedEl) joinedEl.textContent = formatDate(session.user?.created_at);
    if (firstInput) firstInput.value = meta.first_name || '';
    if (lastInput) lastInput.value = meta.last_name || '';
  };

  const showEditForm = (visible) => {
    if (panelInfo) panelInfo.hidden = !visible;
  };

  const showPwPanel = (visible) => {
    if (tabPw) tabPw.setAttribute('aria-pressed', visible ? 'true' : 'false');
    if (panelPw) panelPw.hidden = !visible;
  };

  const openModal = () => {
    populateInfo(teacherAuthState.session);
    showEditForm(false);
    showPwPanel(false);
    renderMsg(editMsg, '');
    renderMsg(pwMsg, '');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeOpenSettingsMenus();
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };

  if (profileBtn) profileBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);
  if (editNameBtn) editNameBtn.addEventListener('click', () => { showEditForm(true); showPwPanel(false); renderMsg(editMsg, ''); });
  if (editCancelBtn) editCancelBtn.addEventListener('click', () => showEditForm(false));
  if (tabPw) tabPw.addEventListener('click', () => { showPwPanel(panelPw?.hidden); showEditForm(false); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // Edit info form
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('profileEditSave');
      if (saveBtn) saveBtn.disabled = true;
      renderMsg(editMsg, 'Saving...');

      const supabaseUrl = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
      const anonKey = globalThis.APP_CONFIG?.supabaseAnonKey || '';
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, Authorization: `Bearer ${teacherAuthState.session?.access_token}` },
        body: JSON.stringify({ data: { first_name: firstInput?.value.trim() || '', last_name: lastInput?.value.trim() || '' } }),
      });

      if (saveBtn) saveBtn.disabled = false;
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        renderMsg(editMsg, errBody.message || `Failed to save (${resp.status}).`, true);
        return;
      }

      const updatedUser = await resp.json().catch(() => null);
      if (updatedUser && teacherAuthState.session) {
        const merged = { ...teacherAuthState.session.user, ...updatedUser };
        teacherAuthState.session = { ...teacherAuthState.session, user: merged };
        populateInfo(teacherAuthState.session);
      }
      // Refresh the JWT so updated user_metadata persists across page loads
      teacherAuthState.supabase?.auth.refreshSession().catch(() => {});
      renderMsg(editMsg, 'Profile saved.');
      setTimeout(() => { showEditForm(false); renderMsg(editMsg, ''); }, 1000);
    });
  }

  // Password form
  if (pwForm && newPwInput && confirmPwInput) {
    const updateStrength = () => {
      const p = newPwInput.value;
      if (pwFill) pwFill.dataset.strength = p.length === 0 ? '' : String(rules.filter((r) => r.test(p)).length);
      rules.forEach((r) => { const el = document.getElementById(r.id); if (el) el.classList.toggle('met', r.test(p)); });
      updatePwBtn();
    };

    const updateMatch = () => {
      const p = newPwInput.value; const c = confirmPwInput.value;
      if (!pwMatch) return;
      if (!c) { pwMatch.textContent = ''; pwMatch.className = 'pw-match-msg'; }
      else if (p === c) { pwMatch.textContent = 'Passwords match'; pwMatch.className = 'pw-match-msg match'; }
      else { pwMatch.textContent = 'Passwords do not match'; pwMatch.className = 'pw-match-msg no-match'; }
      updatePwBtn();
    };

    const updatePwBtn = () => {
      if (pwSaveBtn) pwSaveBtn.disabled = !(allMet(newPwInput.value) && newPwInput.value === confirmPwInput.value);
    };

    newPwInput.addEventListener('input', () => { updateStrength(); if (confirmPwInput.value) updateMatch(); });
    confirmPwInput.addEventListener('input', updateMatch);

    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = newPwInput.value;
      if (!allMet(p) || p !== confirmPwInput.value) return;
      if (pwSaveBtn) pwSaveBtn.disabled = true;
      renderMsg(pwMsg, 'Updating...');

      const supabaseUrl = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
      const anonKey = globalThis.APP_CONFIG?.supabaseAnonKey || '';
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, Authorization: `Bearer ${teacherAuthState.session?.access_token}` },
        body: JSON.stringify({ password: p }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        renderMsg(pwMsg, err.message || 'Failed to update password.', true);
        if (pwSaveBtn) pwSaveBtn.disabled = false;
        return;
      }

      pwForm.reset();
      if (pwFill) pwFill.dataset.strength = '';
      rules.forEach((r) => { const el = document.getElementById(r.id); if (el) el.classList.remove('met'); });
      if (pwMatch) { pwMatch.textContent = ''; pwMatch.className = 'pw-match-msg'; }
      renderMsg(pwMsg, 'Password updated successfully.');
    });
  }

  onTeacherAuthChange((authState) => {
    if (authState.session) populateInfo(authState.session);
  });
}

function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const storageKey = 'ptaStudentJobHubTheme';
  const storedTheme = localStorage.getItem(storageKey);
  const preferredTheme = storedTheme || 'light';

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
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
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
    closeOpenSettingsMenus();
  });
}

function closeSchoolThemeSubmenus() {
  document.querySelectorAll('.settings-submenu').forEach((submenu) => {
    const trigger = submenu.querySelector('.settings-submenu-trigger');
    submenu.classList.remove('open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function initSchoolThemeMenu() {
  const storageKey = 'studentJobHubSchoolTheme';
  const validSchools = new Set(['nic', 'uidaho']);
  const submenus = document.querySelectorAll('.settings-submenu');
  const storedSchool = localStorage.getItem(storageKey);
  const preferredSchool = validSchools.has(storedSchool) ? storedSchool : 'nic';

  const applySchoolTheme = (school) => {
    const nextSchool = validSchools.has(school) ? school : 'nic';
    document.documentElement.setAttribute('data-school', nextSchool);
    localStorage.setItem(storageKey, nextSchool);

    document.querySelectorAll('.school-theme-option').forEach((option) => {
      const isActive = option.dataset.school === nextSchool;
      option.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  };

  applySchoolTheme(preferredSchool);

  if (!submenus.length) {
    return;
  }

  submenus.forEach((submenu) => {
    const trigger = submenu.querySelector('.settings-submenu-trigger');
    if (!trigger) {
      return;
    }

    const setSubmenuOpen = (open) => {
      submenu.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    // Touch / click fallback — desktop visibility is hover-driven in CSS.
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setSubmenuOpen(!submenu.classList.contains('open'));
    });

    submenu.addEventListener('mouseenter', () => {
      trigger.setAttribute('aria-expanded', 'true');
    });

    submenu.addEventListener('mouseleave', () => {
      setSubmenuOpen(false);
    });

    submenu.querySelectorAll('.school-theme-option').forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        applySchoolTheme(option.dataset.school);
        setSubmenuOpen(false);
        trigger.blur();
      });
    });
  });
}

function initMobileNav() {
  const hamburger = document.getElementById('navHamburger');
  const nav = document.getElementById('mainNav');
  if (!hamburger || !nav) {
    return;
  }

  const setNavOpen = (open) => {
    nav.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  };

  hamburger.addEventListener('click', (event) => {
    event.stopPropagation();
    setNavOpen(!nav.classList.contains('open'));
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#mainNav') || event.target.closest('#navHamburger')) {
      return;
    }
    setNavOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setNavOpen(false);
    }
  });

  // Keep hamburger closed when resizing back to desktop.
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 641px)').matches) {
      setNavOpen(false);
    }
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
    closeSchoolThemeSubmenus();
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
  const requestListingLink = document.getElementById('requestListingLink');
  const postJobListingsBtn = document.getElementById('postJobListingsBtn');
  const quickGuideWrap = document.querySelector('.guide-tooltip-wrap');
  const teacherAccessNotice = document.getElementById('teacherAccessNotice');
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
  const urlCountySelect = document.getElementById('urlCounty');
  const templateStateSelect = document.getElementById('state');
  const templateCitySelect = document.getElementById('city');
  const templateCountySelect = document.getElementById('county');
  const detailsCloseBtn = document.getElementById('closeJobDetails');
  const editJobDetailsBtn = document.getElementById('editJobDetails');
  const deleteJobDetailsBtn = document.getElementById('deleteJobDetails');
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
  let canManageJobs = false;
  let jobsCache = [];
  let hasLoadedRemoteJobs = false;
  let activeCategory = 'pta';
  let jobTypeTabs = [];

  const categoriesStorageKey = 'studentJobHubJobTypes';
  const builtInJobCategoryMeta = {
    pta: {
      label: 'Physical Therapy Assistant',
      eyebrow: 'PTA Jobs Board',
      title: 'Opportunities for Physical Therapy Assistant Students',
      panelTitle: 'Graduating Soon?',
      panelBody:
        'Explore Idaho PTA openings from faculty posted links and detailed listings built for college students preparing to enter practice.',
      subtitle: 'These opportunities are for Physical Therapist Assistants searching for jobs.',
      empty: 'No Physical Therapy Assistant listings yet.',
      urlRolePlaceholder: 'PTA Rehab Technician',
      urlOrgPlaceholder: 'Clinic or Healthcare Organization',
      urlPlaceholder: 'https://exampleclinic.com/careers/pta-role',
      rolePlaceholder: 'PTA Student Assistant',
      orgPlaceholder: 'Organization name',
      descriptionPlaceholder: 'Describe duties, required skills, and ideal student profile.',
      builtIn: true,
    },
    'civil-engineering': {
      label: 'Civil Engineering',
      eyebrow: 'Civil Engineering Jobs Board',
      title: 'Opportunities for Civil Engineering Students',
      panelTitle: 'Graduating Soon or Exploring Careers?',
      panelBody:
        'Explore Idaho Civil Engineering job openings from faculty posted links and detailed listings built for college students that are preparing to enter the field.',
      subtitle: 'These opportunities are for Civil Engineering students searching for jobs.',
      empty: 'No Civil Engineering listings yet.',
      urlRolePlaceholder: 'Civil Engineering Intern',
      urlOrgPlaceholder: 'Engineering Firm or Agency',
      urlPlaceholder: 'https://examplefirm.com/careers/civil-engineering-intern',
      rolePlaceholder: 'Civil Engineering Student Assistant',
      orgPlaceholder: 'Organization name',
      descriptionPlaceholder: 'Describe duties, required skills, and ideal student profile.',
      builtIn: true,
    },
  };

  let jobCategoryMeta = { ...builtInJobCategoryMeta };

  const jobsTypeNav = document.getElementById('jobsTypeNav');
  const jobsTypeSelectTrigger = document.getElementById('jobsTypeSelectTrigger');
  const jobsTypeSelectLabel = document.getElementById('jobsTypeSelectLabel');
  const jobsTypeSidebar = document.querySelector('.jobs-type-sidebar');
  const addJobTypeBtn = document.getElementById('addJobTypeBtn');
  const addJobTypeModal = document.getElementById('addJobTypeModal');
  const addJobTypeForm = document.getElementById('addJobTypeForm');
  const newJobTypeNameInput = document.getElementById('newJobTypeName');
  const addJobTypeMessage = document.getElementById('addJobTypeMessage');
  const closeAddJobTypeBtn = document.getElementById('closeAddJobType');
  const cancelAddJobTypeBtn = document.getElementById('cancelAddJobType');
  const listingsSubtitle = document.getElementById('listingsSubtitle');
  const jobsHeroEyebrow = document.getElementById('jobsHeroEyebrow');
  const jobsHeroTitle = document.getElementById('jobsHeroTitle');
  const jobsHeroPanelTitle = document.getElementById('jobsHeroPanelTitle');
  const jobsHeroPanelBody = document.getElementById('jobsHeroPanelBody');
  const listingJobTypeSelect = document.getElementById('listingJobType');
  const listingJobTypeNote = document.getElementById('listingJobTypeNote');
  const listingJobTypeTemplateSelect = document.getElementById('listingJobTypeTemplate');
  const listingJobTypeTemplateNote = document.getElementById('listingJobTypeTemplateNote');
  const jobsSearchInput = document.getElementById('jobsSearch');
  const jobsFilterType = document.getElementById('jobsFilterType');
  const jobsFilterState = document.getElementById('jobsFilterState');
  const jobsFilterCity = document.getElementById('jobsFilterCity');
  const jobsSortSelect = document.getElementById('jobsSort');
  const jobsClearFiltersBtn = document.getElementById('jobsClearFilters');
  const jobsResultCount = document.getElementById('jobsResultCount');
  const jobsResultCountInline = document.getElementById('jobsResultCountInline');
  const jobsFiltersToggle = document.getElementById('jobsFiltersToggle');
  const jobsFiltersPanel = document.getElementById('jobsFiltersPanel');
  const detailsPostedBy = document.getElementById('detailsPostedBy');
  const urlRoleTitleInput = document.getElementById('urlRoleTitle');
  const urlOrganizationInput = document.getElementById('urlOrganization');
  const jobUrlInput = document.getElementById('jobUrl');
  const roleInput = document.getElementById('role');
  const organizationInput = document.getElementById('organization');
  const descriptionInput = document.getElementById('description');


  const escapeHtml = (value) => {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  const generateJobId = () => {
    return `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  };

  const slugifyJobType = (label) => {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  };

  const formatPosterName = (session = teacherAuthState.session) => {
    const meta = session?.user?.user_metadata || {};
    const first = String(meta.first_name || '').trim();
    const last = String(meta.last_name || '').trim();
    if (first && last) {
      return `${first} ${last.charAt(0).toUpperCase()}.`;
    }
    if (first) {
      return first;
    }
    const email = String(session?.user?.email || '').trim();
    if (email) {
      return email.split('@')[0];
    }
    return '';
  };

  const buildCategoryMeta = (label, { builtIn = false } = {}) => {
    const trimmed = String(label || '').trim();
    return {
      label: trimmed,
      eyebrow: `${trimmed} Jobs Board`,
      title: `Opportunities for ${trimmed} Students`,
      panelTitle: 'Graduating Soon or Exploring Careers?',
      panelBody: `Explore Idaho ${trimmed} job openings from faculty posted links and detailed listings built for college students preparing to enter the field.`,
      subtitle: `These opportunities are for ${trimmed} students searching for jobs.`,
      empty: `No ${trimmed} listings yet.`,
      urlRolePlaceholder: `${trimmed} Role`,
      urlOrgPlaceholder: 'Organization name',
      urlPlaceholder: 'https://example.com/careers/role',
      rolePlaceholder: `${trimmed} Student Role`,
      orgPlaceholder: 'Organization name',
      descriptionPlaceholder: 'Describe duties, required skills, and ideal student profile.',
      builtIn: Boolean(builtIn),
    };
  };

  const loadCustomCategories = () => {
    try {
      const raw = localStorage.getItem(categoriesStorageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const custom = {};
      Object.entries(parsed).forEach(([slug, entry]) => {
        if (!slug || builtInJobCategoryMeta[slug]) {
          return;
        }
        const label = typeof entry === 'string' ? entry : entry?.label;
        if (!label) {
          return;
        }
        custom[slug] = {
          ...buildCategoryMeta(label),
          ...(typeof entry === 'object' && entry ? entry : {}),
          label: String(label).trim(),
          builtIn: false,
        };
      });
      return custom;
    } catch {
      return {};
    }
  };

  const saveCustomCategories = () => {
    const custom = {};
    Object.entries(jobCategoryMeta).forEach(([slug, meta]) => {
      if (meta?.builtIn) {
        return;
      }
      custom[slug] = {
        label: meta.label,
        eyebrow: meta.eyebrow,
        title: meta.title,
        panelTitle: meta.panelTitle,
        panelBody: meta.panelBody,
        subtitle: meta.subtitle,
        empty: meta.empty,
        urlRolePlaceholder: meta.urlRolePlaceholder,
        urlOrgPlaceholder: meta.urlOrgPlaceholder,
        urlPlaceholder: meta.urlPlaceholder,
        rolePlaceholder: meta.rolePlaceholder,
        orgPlaceholder: meta.orgPlaceholder,
        descriptionPlaceholder: meta.descriptionPlaceholder,
      };
    });
    localStorage.setItem(categoriesStorageKey, JSON.stringify(custom));
  };

  const ensureCategoryMeta = (slug, labelHint = '') => {
    if (!slug) {
      return 'pta';
    }
    if (jobCategoryMeta[slug]) {
      return slug;
    }
    const label = labelHint
      || slug.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
      || slug;
    jobCategoryMeta[slug] = buildCategoryMeta(label);
    saveCustomCategories();
    return slug;
  };

  const refreshJobCategoryMeta = () => {
    jobCategoryMeta = {
      ...builtInJobCategoryMeta,
      ...loadCustomCategories(),
    };
  };

  const populateJobTypeSelects = (selectedCategory = activeCategory) => {
    const selected = jobCategoryMeta[selectedCategory] ? selectedCategory : 'pta';
    [listingJobTypeSelect, listingJobTypeTemplateSelect].forEach((select) => {
      if (!select) {
        return;
      }
      select.innerHTML = '';
      Object.entries(jobCategoryMeta).forEach(([slug, meta]) => {
        const option = document.createElement('option');
        option.value = slug;
        option.textContent = meta.label;
        select.append(option);
      });
      select.value = selected;
    });
  };

  const setJobsTypeDropdownOpen = (open) => {
    if (!jobsTypeSidebar || !jobsTypeSelectTrigger) {
      return;
    }
    jobsTypeSidebar.classList.toggle('types-open', open);
    jobsTypeSelectTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const syncJobsTypeSelectLabel = (category) => {
    const meta = jobCategoryMeta[category] || jobCategoryMeta.pta;
    if (jobsTypeSelectLabel && meta) {
      jobsTypeSelectLabel.textContent = meta.label;
    }
  };

  const renderJobTypeTabs = () => {
    if (!jobsTypeNav) {
      return;
    }

    jobsTypeNav.innerHTML = '';
    Object.entries(jobCategoryMeta).forEach(([slug, meta]) => {
      const button = document.createElement('button');
      button.className = 'jobs-type-link';
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.id = `jobType-${slug}`;
      button.dataset.category = slug;
      button.setAttribute('aria-controls', 'jobsList');
      button.textContent = meta.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        setActiveJobCategory(slug);
        setJobsTypeDropdownOpen(false);
      });
      jobsTypeNav.append(button);
    });

    jobTypeTabs = Array.from(jobsTypeNav.querySelectorAll('.jobs-type-link'));
    syncJobsTypeSelectLabel(activeCategory);
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

  const normalizeJob = (job) => {
    const normalizedPay = job.pay === '' || job.pay == null
      ? ''
      : Math.max(0, Number(job.pay) || 0);
    const parsedLocation = parseLocation(job.location || '');
    const categorySlug = ensureCategoryMeta(job.category || 'pta');

    return {
      id: job.id || generateJobId(),
      entryMode: job.entryMode || (job.postingUrl ? 'url' : 'template'),
      role: job.role || 'Job Listing',
      organization: job.organization || 'Organization',
      location: buildLocationLabel(
        job.city || parsedLocation.city,
        job.county || '',
        job.state || parsedLocation.state,
      ),
      state: job.state || parsedLocation.state || '',
      city: job.city || parsedLocation.city || '',
      county: job.county || '',
      type: job.type || 'Listing',
      category: categorySlug,
      details: job.details || 'No additional details provided.',
      sourceLabel: job.sourceLabel || 'listing',
      postingUrl: job.postingUrl || '',
      phone: job.phone || '',
      pay: normalizedPay,
      benefits: Array.isArray(job.benefits) ? job.benefits.filter(Boolean) : [],
      postedBy: String(job.postedBy || job.posted_by || '').trim(),
      isSponsored: Boolean(job.isSponsored),
      sponsoredUntil: job.sponsoredUntil || null,
    };
  };

  // A sponsorship that has run out stops counting, without needing a cleanup job.
  const isSponsorshipActive = (job) => {
    if (!job?.isSponsored) return false;
    if (!job.sponsoredUntil) return true;
    const until = new Date(job.sponsoredUntil);
    return Number.isNaN(until.getTime()) ? true : until.getTime() > Date.now();
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

  // Both Upload panels use the shared picker so staff and employers get
  // identical city/county behaviour.
  const urlLocationPicker = createLocationPicker({
    stateSelect: urlStateSelect, citySelect: urlCitySelect, countySelect: urlCountySelect,
  });
  const templateLocationPicker = createLocationPicker({
    stateSelect: templateStateSelect, citySelect: templateCitySelect, countySelect: templateCountySelect,
  });

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

  const mapDbRowToJob = (row) => {
    return normalizeJob({
      id: row.id,
      entryMode: row.entry_mode,
      role: row.role,
      organization: row.organization,
      location: row.location,
      state: row.state,
      city: row.city,
      county: row.county || '',
      type: row.type,
      category: row.category,
      details: row.details,
      sourceLabel: row.source_label,
      postingUrl: row.posting_url,
      phone: row.phone,
      pay: row.pay == null ? '' : Number(row.pay),
      benefits: Array.isArray(row.benefits) ? row.benefits : [],
      postedBy: row.posted_by || '',
      isSponsored: row.is_sponsored === true,
      sponsoredUntil: row.sponsored_until || null,
    });
  };

  const mapJobToDbRow = (job) => {
    return {
      id: job.id,
      entry_mode: job.entryMode,
      role: job.role,
      organization: job.organization,
      location: job.location,
      state: job.state,
      city: job.city,
      county: job.county || '',
      type: job.type,
      category: job.category,
      details: job.details,
      source_label: job.sourceLabel,
      posting_url: job.postingUrl || '',
      phone: job.phone || '',
      pay: job.pay === '' ? null : Number(job.pay),
      benefits: job.benefits || [],
      posted_by: job.postedBy || '',
      is_sponsored: Boolean(job.isSponsored),
      sponsored_until: job.sponsoredUntil || null,
      created_by: teacherAuthState.session?.user?.id || null,
    };
  };

  const fetchRemoteJobs = async () => {
    if (!teacherAuthState.configured || !teacherAuthState.supabase) {
      return null;
    }

    try {
      const { data, error } = await teacherAuthState.supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !Array.isArray(data)) {
        console.warn('Unable to load remote jobs; keeping local listings.', error?.message || error);
        return null;
      }

      return data.map((row) => mapDbRowToJob(row));
    } catch (error) {
      console.warn('Remote jobs request failed; keeping local listings.', error);
      return null;
    }
  };

  const persistRemoteJob = async (job) => {
    if (!teacherAuthState.configured || !teacherAuthState.supabase) {
      return {
        error: new Error('Teacher backend is not configured.'),
      };
    }

    return teacherAuthState.supabase
      .from('jobs')
      .upsert(mapJobToDbRow(job), { onConflict: 'id' });
  };

  const deleteRemoteJob = async (jobId) => {
    if (!teacherAuthState.configured || !teacherAuthState.supabase) {
      return {
        error: new Error('Teacher backend is not configured.'),
      };
    }

    return teacherAuthState.supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);
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
    item.dataset.county = jobData.county || '';
    item.dataset.type = jobData.type;
    item.dataset.category = jobData.category;
    item.dataset.details = jobData.details;
    item.dataset.sourceLabel = jobData.sourceLabel;
    item.dataset.postingUrl = jobData.postingUrl || '';
    item.dataset.phone = jobData.phone || '';
    item.dataset.pay = jobData.pay === '' ? '' : String(jobData.pay);
    item.dataset.benefits = JSON.stringify(jobData.benefits || []);
    item.dataset.postedBy = jobData.postedBy || '';
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
    const postedByLine = item.querySelector('.job-posted-by')?.textContent?.trim() || '';
    const postedBy = item.dataset.postedBy
      || postedByLine.replace(/^Posted by\s*/i, '').trim()
      || '';
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
      county: item.dataset.county || '',
      type,
      category: item.dataset.category || 'pta',
      details,
      sourceLabel,
      postingUrl,
      phone: item.dataset.phone || '',
      pay: item.dataset.pay === '' ? '' : item.dataset.pay,
      benefits,
      postedBy,
    });
  };

  const seedJobsFromDom = () => {
    const seededJobs = Array.from(jobsList.querySelectorAll('.job-item')).map((card) => inferCardData(card));
    saveStoredJobs(seededJobs);
    return seededJobs;
  };

  const initializeJobs = () => {
    const storedJobs = loadStoredJobs();
    jobsCache = storedJobs.length > 0 ? storedJobs : seedJobsFromDom();
  };

  const syncRemoteJobs = async () => {
    if (teacherAuthState.isLocalDevAuth) {
      return;
    }

    const remoteJobs = await fetchRemoteJobs();
    if (remoteJobs == null) {
      return;
    }

    jobsCache = remoteJobs;
    saveStoredJobs(remoteJobs);
    hasLoadedRemoteJobs = true;
    remoteJobs.forEach((job) => {
      ensureCategoryMeta(job.category);
    });
    renderJobTypeTabs();
    populateJobTypeSelects(activeCategory);
    setActiveJobCategory(activeCategory);
  };

  const getJobs = () => {
    return jobsCache;
  };

  const findJobById = (jobId) => {
    return getJobs().find((job) => job.id === jobId) || null;
  };

  const resetJobForms = () => {
    urlForm.reset();
    templateForm.reset();
    // form.reset() clears the state <select> without firing a change event, so
    // the dependent city/county lists have to be rebuilt by hand — otherwise
    // they keep the previous state's options and stay enabled.
    urlLocationPicker?.refresh();
    templateLocationPicker?.refresh();
    benefitItems = [];
    editingBenefitIndex = null;
    if (benefitInput) {
      benefitInput.placeholder = 'Flexible hours';
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
    benefitInput.placeholder = 'Flexible hours';
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
    const sponsored = isSponsorshipActive(job);
    if (sponsored) {
      item.classList.add('job-item-sponsored');
    }
    const postedByHtml = job.postedBy
      ? `<p class="job-posted-by">Posted by ${escapeHtml(job.postedBy)}</p>`
      : '';
    const sponsoredHtml = sponsored
      ? '<p class="job-sponsored-flag">Featured</p>'
      : '';

    item.innerHTML = `
      ${sponsoredHtml}
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
      ${postedByHtml}
    `;

    decorateJobCard(item, job);
    return item;
  };

  const applyCategoryPlaceholders = (category) => {
    const meta = jobCategoryMeta[category] || jobCategoryMeta.pta;

    if (urlRoleTitleInput) {
      urlRoleTitleInput.placeholder = meta.urlRolePlaceholder;
    }
    if (urlOrganizationInput) {
      urlOrganizationInput.placeholder = meta.urlOrgPlaceholder;
    }
    if (jobUrlInput) {
      jobUrlInput.placeholder = meta.urlPlaceholder;
    }
    if (roleInput) {
      roleInput.placeholder = meta.rolePlaceholder;
    }
    if (organizationInput) {
      organizationInput.placeholder = meta.orgPlaceholder;
    }
    if (descriptionInput) {
      descriptionInput.placeholder = meta.descriptionPlaceholder;
    }
  };

  const applyCategoryCopy = (category) => {
    const meta = jobCategoryMeta[category] || jobCategoryMeta.pta;

    if (jobsHeroEyebrow) {
      jobsHeroEyebrow.textContent = meta.eyebrow;
    }
    if (jobsHeroTitle) {
      jobsHeroTitle.textContent = meta.title;
    }
    if (jobsHeroPanelTitle) {
      jobsHeroPanelTitle.textContent = meta.panelTitle;
    }
    if (jobsHeroPanelBody) {
      jobsHeroPanelBody.textContent = meta.panelBody;
    }
    if (listingsSubtitle) {
      listingsSubtitle.textContent = meta.subtitle;
    }

    applyCategoryPlaceholders(category);
  };

  const syncListingJobTypeNote = (category) => {
    const meta = jobCategoryMeta[category] || jobCategoryMeta.pta;
    const noteText = `This listing will appear under ${meta.label}.`;

    if (listingJobTypeNote) {
      listingJobTypeNote.textContent = noteText;
    }
    if (listingJobTypeTemplateNote) {
      listingJobTypeTemplateNote.textContent = noteText;
    }
  };

  const setListingJobType = (category) => {
    const nextCategory = jobCategoryMeta[category] ? category : 'pta';
    if (listingJobTypeSelect) {
      listingJobTypeSelect.value = nextCategory;
    }
    if (listingJobTypeTemplateSelect) {
      listingJobTypeTemplateSelect.value = nextCategory;
    }
    syncListingJobTypeNote(nextCategory);
    applyCategoryPlaceholders(nextCategory);
  };

  const getSelectedListingCategory = () => {
    const activePanel = modal.querySelector('.tab-panel.active');
    const usingTemplate = activePanel?.id === 'templatePanel';
    const selected = usingTemplate
      ? listingJobTypeTemplateSelect?.value
      : listingJobTypeSelect?.value;
    return jobCategoryMeta[selected] ? selected : activeCategory;
  };

  const getCategoryJobs = () => {
    return getJobs().filter((job) => job.category === activeCategory);
  };

  const getJobSortTimestamp = (job) => {
    const match = String(job.id || '').match(/job-(\d+)/);
    return match ? Number(match[1]) : 0;
  };

  const getJobPayValue = (job) => {
    if (job.pay === '' || job.pay == null) {
      return null;
    }

    const value = Number(job.pay);
    return Number.isNaN(value) ? null : value;
  };

  const refreshLocationFilters = () => {
    if (!jobsFilterState || !jobsFilterCity) {
      return;
    }

    const categoryJobs = getCategoryJobs();
    const selectedState = jobsFilterState.value;
    const selectedCity = jobsFilterCity.value;
    const states = [...new Set(categoryJobs.map((job) => job.state).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    jobsFilterState.innerHTML = '<option value="">All states</option>';
    states.forEach((state) => {
      const option = document.createElement('option');
      option.value = state;
      option.textContent = state;
      jobsFilterState.append(option);
    });

    jobsFilterState.value = states.includes(selectedState) ? selectedState : '';

    const cities = [...new Set(
      categoryJobs
        .filter((job) => !jobsFilterState.value || job.state === jobsFilterState.value)
        .map((job) => job.city)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    jobsFilterCity.innerHTML = '<option value="">All cities</option>';
    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = city;
      jobsFilterCity.append(option);
    });

    jobsFilterCity.value = cities.includes(selectedCity) ? selectedCity : '';
  };

  const getFilteredSortedJobs = () => {
    const search = (jobsSearchInput?.value || '').trim().toLowerCase();
    const typeFilter = jobsFilterType?.value || '';
    const stateFilter = jobsFilterState?.value || '';
    const cityFilter = jobsFilterCity?.value || '';
    const sortBy = jobsSortSelect?.value || 'newest';

    let jobs = getCategoryJobs().filter((job) => {
      if (typeFilter && job.type !== typeFilter) {
        return false;
      }
      if (stateFilter && job.state !== stateFilter) {
        return false;
      }
      if (cityFilter && job.city !== cityFilter) {
        return false;
      }
      if (!search) {
        return true;
      }

      const haystack = [
        job.role,
        job.organization,
        job.location,
        job.details,
        job.type,
        job.sourceLabel,
      ].join(' ').toLowerCase();

      return haystack.includes(search);
    });

    const compareText = (left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' });

    jobs = [...jobs].sort((left, right) => {
      // Sponsored placement is what employers pay for, so it outranks the
      // chosen sort. Within the sponsored group the normal sort still applies.
      const leftSponsored = isSponsorshipActive(left);
      const rightSponsored = isSponsorshipActive(right);
      if (leftSponsored !== rightSponsored) {
        return leftSponsored ? -1 : 1;
      }

      if (sortBy === 'role-asc') {
        return compareText(left.role, right.role);
      }
      if (sortBy === 'role-desc') {
        return compareText(right.role, left.role);
      }
      if (sortBy === 'org-asc') {
        return compareText(left.organization, right.organization);
      }
      if (sortBy === 'location-asc') {
        return compareText(left.location, right.location);
      }
      if (sortBy === 'pay-asc' || sortBy === 'pay-desc') {
        const leftPay = getJobPayValue(left);
        const rightPay = getJobPayValue(right);
        if (leftPay == null && rightPay == null) {
          return 0;
        }
        if (leftPay == null) {
          return 1;
        }
        if (rightPay == null) {
          return -1;
        }
        return sortBy === 'pay-asc' ? leftPay - rightPay : rightPay - leftPay;
      }

      return getJobSortTimestamp(right) - getJobSortTimestamp(left);
    });

    return jobs;
  };

  const updateJobsResultCount = (shown, total) => {
    let text = '';

    if (total === 0) {
      text = 'No listings in this job type yet.';
    } else if (shown === total) {
      text = `Showing ${shown} listing${shown === 1 ? '' : 's'}.`;
    } else {
      text = `Showing ${shown} of ${total} listing${total === 1 ? '' : 's'}.`;
    }

    if (jobsResultCount) {
      jobsResultCount.textContent = text;
    }
    if (jobsResultCountInline) {
      jobsResultCountInline.textContent = text;
    }
  };

  const clearJobFilters = () => {
    if (jobsSearchInput) {
      jobsSearchInput.value = '';
    }
    if (jobsFilterType) {
      jobsFilterType.value = '';
    }
    if (jobsFilterState) {
      jobsFilterState.value = '';
    }
    if (jobsFilterCity) {
      jobsFilterCity.value = '';
    }
    if (jobsSortSelect) {
      jobsSortSelect.value = 'newest';
    }
    renderJobs({ refreshLocations: true });
  };

  const renderJobs = ({ refreshLocations = false } = {}) => {
    const meta = jobCategoryMeta[activeCategory] || jobCategoryMeta.pta;
    const categoryJobs = getCategoryJobs();

    if (refreshLocations) {
      refreshLocationFilters();
    }

    const jobs = getFilteredSortedJobs();

    jobsList.innerHTML = '';
    updateJobsResultCount(jobs.length, categoryJobs.length);

    if (categoryJobs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'jobs-empty';
      empty.textContent = meta.empty;
      jobsList.append(empty);
      return;
    }

    if (jobs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'jobs-empty';
      empty.textContent = 'No listings match your current filters.';
      jobsList.append(empty);
      return;
    }

    jobs.forEach((job) => {
      jobsList.append(renderJobCard(job));
    });
  };

  const setActiveJobCategory = (category) => {
    if (!jobCategoryMeta[category]) {
      return;
    }

    const scrollY = window.scrollY;
    activeCategory = category;

    jobTypeTabs.forEach((tab) => {
      const isActive = tab.dataset.category === category;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.classList.toggle('jobs-type-link-active', isActive);
    });

    const activeTab = jobTypeTabs.find((tab) => tab.dataset.category === category);
    if (activeTab) {
      jobsList.setAttribute('aria-labelledby', activeTab.id);
    }

    applyCategoryCopy(category);
    syncJobsTypeSelectLabel(category);
    renderJobs({ refreshLocations: true });

    // Keep page scroll stable when hero/listings height changes after a type switch.
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  const getCategoryForSave = () => {
    return getSelectedListingCategory();
  };

  const upsertJob = async (job) => {
    const normalizedJob = normalizeJob(job);
    const useRemote = teacherAuthState.configured
      && teacherAuthState.supabase
      && !teacherAuthState.isLocalDevAuth;

    if (useRemote) {
      const { error } = await persistRemoteJob(normalizedJob);
      if (error) {
        throw error;
      }

      await syncRemoteJobs();
      return getJobs().find((existingJob) => existingJob.id === normalizedJob.id) || normalizedJob;
    }

    const updatedJobs = editingJobId
      ? jobsCache.map((existingJob) => (existingJob.id === normalizedJob.id ? normalizedJob : existingJob))
      : [normalizedJob, ...jobsCache];

    jobsCache = updatedJobs;
    saveStoredJobs(updatedJobs);
    renderJobs({ refreshLocations: true });
    return normalizedJob;
  };

  const deleteJob = async (jobId) => {
    if (!jobId) {
      throw new Error('Missing job id.');
    }

    const useRemote = teacherAuthState.configured
      && teacherAuthState.supabase
      && !teacherAuthState.isLocalDevAuth;

    if (useRemote) {
      const { error } = await deleteRemoteJob(jobId);
      if (error) {
        throw error;
      }

      await syncRemoteJobs();
      return;
    }

    jobsCache = jobsCache.filter((job) => job.id !== jobId);
    saveStoredJobs(jobsCache);
    renderJobs({ refreshLocations: true });
  };

  const populateUrlForm = (job) => {
    document.getElementById('urlRoleTitle').value = job.role;
    document.getElementById('jobUrl').value = job.postingUrl;
    document.getElementById('urlOrganization').value = job.organization;
    urlStateSelect.value = job.state;
    urlLocationPicker?.refresh({ city: job.city, county: job.county });
  };

  const populateTemplateForm = (job) => {
    document.getElementById('role').value = job.role;
    document.getElementById('organization').value = job.organization;
    templateStateSelect.value = job.state;
    templateLocationPicker?.refresh({ city: job.city, county: job.county });
    document.getElementById('employmentType').value = job.type;
    document.getElementById('description').value = job.details;
    document.getElementById('contactPhone').value = formatUsPhone(job.phone);
    document.getElementById('payRate').value = formatPayInputValue(job.pay);
    benefitItems = [...job.benefits];
    editingBenefitIndex = null;
    if (benefitInput) {
      benefitInput.value = '';
      benefitInput.placeholder = 'Flexible hours';
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

    if (detailsPostedBy) {
      if (jobData.postedBy) {
        detailsPostedBy.hidden = false;
        detailsPostedBy.textContent = `Posted by ${jobData.postedBy}`;
      } else {
        detailsPostedBy.hidden = true;
        detailsPostedBy.textContent = '';
      }
    }

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
    if (!canManageJobs) {
      showFlash('Sign in is required to add listings.', 'err');
      return;
    }

    editingJobId = null;
    resetJobForms();
    setListingJobType(activeCategory);
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
    if (!canManageJobs) {
      showFlash('Sign in is required to edit listings.', 'err');
      return;
    }

    const job = findJobById(jobId);
    if (!job) {
      return;
    }

    editingJobId = job.id;
    closeDetailsModal();
    resetJobForms();
    setListingJobType(job.category || activeCategory);
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
    if (openBtn && !openBtn.hidden) {
      openBtn.focus();
    }
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

  const setTeacherAccessState = (authState) => {
    canManageJobs = Boolean(authState.configured && authState.session && authState.isAuthenticated);
    const canAddJobTypes = Boolean(canManageJobs && authState.isAdmin);

    if (openBtn) {
      openBtn.hidden = !canManageJobs;
      openBtn.disabled = !canManageJobs;
    }

    // Employers only ever see the site signed out, so this is their entry point.
    // Hidden for staff, who have Upload Job Listing in the same spot.
    if (requestListingLink) {
      requestListingLink.classList.toggle('hidden', canManageJobs);
    }

    if (postJobListingsBtn) {
      const showPostJob = Boolean(canManageJobs && authState.isAdmin);
      postJobListingsBtn.classList.toggle('hidden', !showPostJob);
      postJobListingsBtn.disabled = !showPostJob;
    }

    if (quickGuideWrap) {
      quickGuideWrap.hidden = !canManageJobs;
    }

    if (editJobDetailsBtn) {
      editJobDetailsBtn.hidden = !canManageJobs;
      editJobDetailsBtn.disabled = !canManageJobs;
    }

    if (deleteJobDetailsBtn) {
      deleteJobDetailsBtn.hidden = !canManageJobs;
      deleteJobDetailsBtn.disabled = !canManageJobs;
    }

    if (addJobTypeBtn) {
      addJobTypeBtn.classList.toggle('hidden', !canAddJobTypes);
      addJobTypeBtn.disabled = !canAddJobTypes;
    }

    if (!teacherAccessNotice) {
      return;
    }

    teacherAccessNotice.hidden = !canManageJobs;

    if (!authState.configured) {
      teacherAccessNotice.textContent = '';
      return;
    }

    if (canManageJobs) {
      teacherAccessNotice.textContent = teacherAuthState.isLocalDevAuth
        ? 'Local testing mode: posting and editing are enabled.'
        : 'You are signed in. Posting and editing are enabled.';
      return;
    }

    teacherAccessNotice.textContent = '';
  };

  const resolvePostedByForSave = (jobId) => {
    if (jobId && editingJobId) {
      const existing = findJobById(jobId);
      if (existing?.postedBy) {
        return existing.postedBy;
      }
    }
    return formatPosterName();
  };

  const setFiltersPanelOpen = (open) => {
    if (!jobsFiltersPanel || !jobsFiltersToggle) {
      return;
    }

    jobsFiltersPanel.hidden = !open;
    jobsFiltersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    jobsFiltersToggle.classList.toggle('is-active', open);

    if (jobsResultCountInline) {
      jobsResultCountInline.hidden = open;
    }
  };

  const openAddJobTypeModal = () => {
    if (!addJobTypeModal || !teacherAuthState.isAdmin || !canManageJobs) {
      return;
    }

    if (addJobTypeForm) {
      addJobTypeForm.reset();
    }
    if (addJobTypeMessage) {
      addJobTypeMessage.textContent = '';
      addJobTypeMessage.className = 'auth-message';
    }

    addJobTypeModal.classList.add('open');
    addJobTypeModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    newJobTypeNameInput?.focus();
  };

  const closeAddJobTypeModal = () => {
    if (!addJobTypeModal) {
      return;
    }

    addJobTypeModal.classList.remove('open');
    addJobTypeModal.setAttribute('aria-hidden', 'true');

    const otherModalOpen = Boolean(
      modal?.classList.contains('open') || detailsModal?.classList.contains('open')
    );
    if (!otherModalOpen) {
      document.body.classList.remove('modal-open');
    }

    if (addJobTypeForm) {
      addJobTypeForm.reset();
    }
    if (addJobTypeMessage) {
      addJobTypeMessage.textContent = '';
    }
  };

  const addCustomJobType = (label) => {
    const trimmed = String(label || '').trim();
    if (!trimmed) {
      return { error: 'Enter a job type name.' };
    }

    let slug = slugifyJobType(trimmed);
    if (!slug) {
      return { error: 'Use letters or numbers in the name.' };
    }

    const existingMatch = Object.entries(jobCategoryMeta).find(([, meta]) => (
      String(meta.label || '').toLowerCase() === trimmed.toLowerCase()
    ));
    if (existingMatch) {
      return { error: 'That job type already exists.', slug: existingMatch[0] };
    }

    if (jobCategoryMeta[slug]) {
      let suffix = 2;
      while (jobCategoryMeta[`${slug}-${suffix}`]) {
        suffix += 1;
      }
      slug = `${slug}-${suffix}`;
    }

    jobCategoryMeta[slug] = buildCategoryMeta(trimmed);
    saveCustomCategories();
    renderJobTypeTabs();
    populateJobTypeSelects(slug);
    setActiveJobCategory(slug);
    return { slug };
  };

  refreshJobCategoryMeta();
  initializeJobs();
  jobsCache.forEach((job) => {
    ensureCategoryMeta(job.category);
  });
  renderJobTypeTabs();
  populateJobTypeSelects(activeCategory);
  setActiveJobCategory(activeCategory);
  urlLocationPicker?.refresh();
  templateLocationPicker?.refresh();

  if (jobsTypeSelectTrigger) {
    jobsTypeSelectTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = jobsTypeSidebar?.classList.contains('types-open');
      setJobsTypeDropdownOpen(!isOpen);
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.jobs-type-sidebar')) {
        return;
      }
      setJobsTypeDropdownOpen(false);
    });
  }

  if (jobsSearchInput) {
    jobsSearchInput.addEventListener('input', () => {
      renderJobs();
    });
  }

  const jobsToolbar = document.getElementById('jobsToolbar');
  if (jobsToolbar) {
    jobsToolbar.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }

  if (jobsFiltersToggle) {
    jobsFiltersToggle.addEventListener('click', () => {
      const isOpen = jobsFiltersPanel ? !jobsFiltersPanel.hidden : false;
      setFiltersPanelOpen(!isOpen);
    });
  }

  if (addJobTypeBtn) {
    addJobTypeBtn.addEventListener('click', () => {
      openAddJobTypeModal();
    });
  }

  if (closeAddJobTypeBtn) {
    closeAddJobTypeBtn.addEventListener('click', closeAddJobTypeModal);
  }

  if (cancelAddJobTypeBtn) {
    cancelAddJobTypeBtn.addEventListener('click', closeAddJobTypeModal);
  }

  addJobTypeModal?.querySelector('[data-close-add-job-type]')?.addEventListener('click', closeAddJobTypeModal);

  if (addJobTypeForm) {
    addJobTypeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!teacherAuthState.isAdmin || !canManageJobs) {
        return;
      }

      const result = addCustomJobType(newJobTypeNameInput?.value || '');
      if (result.error) {
        if (addJobTypeMessage) {
          addJobTypeMessage.textContent = result.error;
          addJobTypeMessage.className = 'auth-message error';
        }
        return;
      }

      closeAddJobTypeModal();
      showFlash(`Added job type “${jobCategoryMeta[result.slug]?.label || 'New type'}”.`, 'ok');
    });
  }

  [jobsFilterType, jobsSortSelect].forEach((control) => {
    if (!control) {
      return;
    }
    control.addEventListener('change', () => {
      renderJobs();
    });
  });

  if (jobsFilterState) {
    jobsFilterState.addEventListener('change', () => {
      if (jobsFilterCity) {
        jobsFilterCity.value = '';
      }
      renderJobs({ refreshLocations: true });
    });
  }

  if (jobsFilterCity) {
    jobsFilterCity.addEventListener('change', () => {
      renderJobs();
    });
  }

  if (jobsClearFiltersBtn) {
    jobsClearFiltersBtn.addEventListener('click', () => {
      clearJobFilters();
    });
  }

  if (listingJobTypeSelect) {
    listingJobTypeSelect.addEventListener('change', () => {
      const selectedCategory = jobCategoryMeta[listingJobTypeSelect.value]
        ? listingJobTypeSelect.value
        : activeCategory;
      if (listingJobTypeTemplateSelect) {
        listingJobTypeTemplateSelect.value = selectedCategory;
      }
      syncListingJobTypeNote(selectedCategory);
      applyCategoryPlaceholders(selectedCategory);
    });
  }

  if (listingJobTypeTemplateSelect) {
    listingJobTypeTemplateSelect.addEventListener('change', () => {
      const selectedCategory = jobCategoryMeta[listingJobTypeTemplateSelect.value]
        ? listingJobTypeTemplateSelect.value
        : activeCategory;
      if (listingJobTypeSelect) {
        listingJobTypeSelect.value = selectedCategory;
      }
      syncListingJobTypeNote(selectedCategory);
      applyCategoryPlaceholders(selectedCategory);
    });
  }

  openBtn.addEventListener('click', openCreateModal);
  if (postJobListingsBtn) {
    postJobListingsBtn.addEventListener('click', openCreateModal);
  }
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  if (detailsCloseBtn && detailsOverlay) {
    detailsCloseBtn.addEventListener('click', closeDetailsModal);
    detailsOverlay.addEventListener('click', closeDetailsModal);
  }

  if (editJobDetailsBtn) {
    editJobDetailsBtn.addEventListener('click', () => {
      if (currentDetailsJobId && canManageJobs) {
        startEditingJob(currentDetailsJobId);
      }
    });
  }

  if (deleteJobDetailsBtn) {
    deleteJobDetailsBtn.addEventListener('click', async () => {
      if (!currentDetailsJobId || !canManageJobs) {
        return;
      }

      const job = findJobById(currentDetailsJobId);
      const label = job ? `"${job.role}" at ${job.organization}` : 'this listing';
      if (!globalThis.confirm(`Remove ${label}? This cannot be undone.`)) {
        return;
      }

      deleteJobDetailsBtn.disabled = true;

      try {
        await deleteJob(currentDetailsJobId);
        closeDetailsModal();
      } catch {
        globalThis.alert('Unable to remove this listing. Please try again.');
      } finally {
        if (deleteJobDetailsBtn) {
          deleteJobDetailsBtn.disabled = !canManageJobs;
        }
      }
    });
  }

  onTeacherAuthChange((authState) => {
    setTeacherAccessState(authState);
    if (authState.configured && !hasLoadedRemoteJobs) {
      syncRemoteJobs();
    }
  });

  cancelBtns.forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && addJobTypeModal?.classList.contains('open')) {
      closeAddJobTypeModal();
      return;
    }

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

  attachPhoneFormatting(contactPhoneInput);

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

  const addBenefitStaffBtn = document.getElementById('addBenefitStaffBtn');
  if (addBenefitStaffBtn) {
    addBenefitStaffBtn.addEventListener('click', () => {
      commitBenefitInput();
      benefitInput?.focus();
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
          benefitInput.placeholder = 'Flexible hours';
        }
      }

      renderBenefitsEditor();
    });
  }

  urlForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canManageJobs) {
      showFlash('Sign in is required to submit listings.', 'err');
      return;
    }

    const role = document.getElementById('urlRoleTitle').value.trim();
    const url = document.getElementById('jobUrl').value.trim();
    const organization = document.getElementById('urlOrganization').value.trim();
    const state = urlStateSelect.value;
    const city = urlCitySelect.value;
    const county = urlCountySelect?.value || '';
    const location = buildLocationLabel(city, county, state);

    const missingUrlFields = [
      [role, 'Job Title'],
      [url, 'Job Posting URL'],
      [organization, 'Organization'],
      [state, 'State'],
      [city || county, 'City or County'],
    ].filter(([value]) => !value).map(([, label]) => label);

    if (missingUrlFields.length > 0) {
      showFlash(`Please fill in: ${missingUrlFields.join(', ')}.`, 'err');
      return;
    }

    try {
      const savedJob = await upsertJob({
        id: editingJobId || generateJobId(),
        entryMode: 'url',
        role,
        organization,
        location,
        state,
        city,
        county,
        type: 'URL',
        category: getCategoryForSave(),
        details: url,
        sourceLabel: 'URL upload',
        postingUrl: url,
        phone: '',
        pay: '',
        payBenefits: '',
        postedBy: resolvePostedByForSave(editingJobId),
      });

      setActiveJobCategory(savedJob.category);
      closeModal();
      showFlash(editingJobId ? 'URL listing updated successfully.' : 'URL listing added successfully. You can publish another one.', 'ok');
      openDetailsModal(savedJob);
    } catch {
      showFlash('We could not save this listing. Check your internet connection and try again. If it keeps happening, sign out and sign back in.', 'err');
    }
  });

  templateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canManageJobs) {
      showFlash('Sign in is required to submit listings.', 'err');
      return;
    }

    commitBenefitInput();
    const role = document.getElementById('role').value.trim();
    const organization = document.getElementById('organization').value.trim();
    const state = templateStateSelect.value;
    const city = templateCitySelect.value;
    const county = templateCountySelect?.value || '';
    const location = buildLocationLabel(city, county, state);
    const type = document.getElementById('employmentType').value;
    const details = document.getElementById('description').value.trim();
    const phone = formatUsPhone(document.getElementById('contactPhone').value);
    const payValue = payRateInput.value === '' ? '' : Math.max(0, Number(payRateInput.value) || 0);

    const missing = [
      [role, 'Role Title'],
      [organization, 'Organization'],
      [state, 'State'],
      [city || county, 'City or County'],
      [type, 'Employment Type'],
      [details, 'Job Description'],
    ].filter(([value]) => !value).map(([, label]) => label);

    if (missing.length > 0) {
      showFlash(`Please fill in: ${missing.join(', ')}.`, 'err');
      return;
    }

    try {
      const savedJob = await upsertJob({
        id: editingJobId || generateJobId(),
        entryMode: 'template',
        role,
        organization,
        location,
        state,
        city,
        county,
        type,
        category: getCategoryForSave(),
        details,
        sourceLabel: 'template form',
        postingUrl: '',
        phone,
        pay: payValue,
        benefits: [...benefitItems],
        postedBy: resolvePostedByForSave(editingJobId),
      });

      setActiveJobCategory(savedJob.category);
      closeModal();
      showFlash(editingJobId ? 'Listing updated successfully.' : 'Template listing created. It now appears in current listings.', 'ok');
      openDetailsModal(savedJob);
    } catch {
      showFlash('We could not save this listing. Check your internet connection and try again. If it keeps happening, sign out and sign back in.', 'err');
    }
  });
}

// Public employer wizard at /request-listing.
//
// Deliberately one topic per screen. GOV.UK's "one thing per page" pattern is
// aimed at exactly this audience: a stranger, on a phone, filling this in once.
// The staff-facing form in initJobsModal stays a single page because staff use
// it often and paging would slow them down.
function initRequestListingWizard() {
  const form = document.getElementById('requestListingForm');
  const card = document.getElementById('wizardCard');
  const intro = document.getElementById('wizardIntro');
  const done = document.getElementById('wizardDone');
  if (!form || !card || !intro || !done) {
    return;
  }

  const startBtn = document.getElementById('wizardStartBtn');
  const backBtn = document.getElementById('wizardBackBtn');
  const nextBtn = document.getElementById('wizardNextBtn');
  const submitBtn = document.getElementById('wizardSubmitBtn');
  const progressLabel = document.getElementById('wizardProgressLabel');
  const progressBar = document.getElementById('wizardProgressBar');
  const progressFill = document.getElementById('wizardProgressFill');
  const errorSummary = document.getElementById('wizardErrorSummary');
  const errorList = document.getElementById('wizardErrorList');
  const reviewList = document.getElementById('wizardReview');
  const benefitInput = document.getElementById('benefitInput');
  const addBenefitBtn = document.getElementById('addBenefitBtn');
  const benefitList = document.getElementById('benefitList');
  const locationPicker = createLocationPicker({
    stateSelect: document.getElementById('state'),
    citySelect: document.getElementById('city'),
    countySelect: document.getElementById('county'),
    placeholder: 'Choose',
  });

  const steps = Array.from(form.querySelectorAll('.wizard-step'));
  const totalSteps = steps.length;
  const draftKey = 'jumpVaultListingRequestDraft';

  let currentStep = 1;
  let benefits = [];
  let isSubmitting = false;

  const fieldIds = [
    'contactName', 'contactEmail', 'contactPhone',
    'organization', 'role', 'details',
    'state', 'city', 'county', 'postingUrl',
    'pay', 'phone',
  ];

  const getField = (id) => document.getElementById(id);

  const getSelectedType = () => form.querySelector('input[name="type"]:checked')?.value || '';

  // --- forgiving input helpers -------------------------------------------
  // NN/g on older and less confident users: never reject an answer just because
  // of punctuation. Take whatever they type and tidy it ourselves.
  const normalizePay = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    // Accept "$22.50", "22.50/hr", "22,50" and similar.
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    const number = Number(cleaned);
    return Number.isFinite(number) && number >= 0 ? String(number) : '';
  };

  const normalizeUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  };

  // Money on the review page reads as money: $22.50, not $22.5.
  const formatPayForReview = (raw) => {
    const normalized = normalizePay(raw);
    if (normalized === '') return 'Not given';
    return `$${Number(normalized).toFixed(2)}`;
  };

  // --- draft persistence --------------------------------------------------
  const readForm = () => {
    const data = {};
    fieldIds.forEach((id) => {
      data[id] = getField(id)?.value || '';
    });
    data.type = getSelectedType();
    data.wantsSponsorship = Boolean(getField('wantsSponsorship')?.checked);
    data.benefits = [...benefits];
    return data;
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ step: currentStep, data: readForm() }));
    } catch {
      // Private mode or full storage — the form still works, it just will not resume.
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore.
    }
  };

  const restoreDraft = () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    } catch {
      return false;
    }
    if (!saved || typeof saved.data !== 'object' || saved.data === null) {
      return false;
    }

    fieldIds.forEach((id) => {
      const field = getField(id);
      if (field && typeof saved.data[id] === 'string') {
        field.value = saved.data[id];
      }
    });

    if (saved.data.type) {
      const radio = form.querySelector(`input[name="type"][value="${CSS.escape(saved.data.type)}"]`);
      if (radio) radio.checked = true;
    }
    const sponsor = getField('wantsSponsorship');
    if (sponsor) sponsor.checked = saved.data.wantsSponsorship === true;

    // State must be applied before the dependent lists can be rebuilt.
    locationPicker?.refresh({ city: saved.data.city || '', county: saved.data.county || '' });

    benefits = Array.isArray(saved.data.benefits) ? saved.data.benefits.slice(0, 25) : [];
    renderBenefits();

    currentStep = Number(saved.step) > 0 && Number(saved.step) <= totalSteps ? Number(saved.step) : 1;
    return true;
  };

  // --- benefits chips -----------------------------------------------------
  function renderBenefits() {
    if (!benefitList) return;
    benefitList.innerHTML = '';
    benefits.forEach((benefit, index) => {
      const item = document.createElement('li');
      item.className = 'wizard-chip';

      const text = document.createElement('span');
      text.textContent = benefit;
      item.append(text);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'wizard-chip-remove';
      remove.setAttribute('aria-label', `Remove ${benefit}`);
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        benefits.splice(index, 1);
        renderBenefits();
        saveDraft();
        benefitInput?.focus();
      });
      item.append(remove);

      benefitList.append(item);
    });
  }

  const addBenefit = () => {
    const value = (benefitInput?.value || '').trim();
    if (!value) {
      benefitInput?.focus();
      return;
    }
    if (benefits.length >= 25) return;
    if (!benefits.includes(value)) benefits.push(value);
    if (benefitInput) benefitInput.value = '';
    renderBenefits();
    saveDraft();
    benefitInput?.focus();
  };

  attachPhoneFormatting(getField('contactPhone'));
  attachPhoneFormatting(getField('phone'));

  addBenefitBtn?.addEventListener('click', addBenefit);
  // Enter adds the benefit rather than submitting the form — but the Add button
  // is the documented way, because "press Enter" is invisible to most people.
  benefitInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addBenefit();
    }
  });

  // --- validation ---------------------------------------------------------
  const setFieldError = (id, message) => {
    const errorNode = document.getElementById(`${id}Error`);
    const field = getField(id);
    if (errorNode) errorNode.textContent = message || '';
    if (field) {
      field.classList.toggle('has-error', Boolean(message));
      if (message) {
        field.setAttribute('aria-invalid', 'true');
      } else {
        field.removeAttribute('aria-invalid');
      }
    }
  };

  const clearErrors = () => {
    [...fieldIds, 'type', 'captcha'].forEach((id) => setFieldError(id, ''));
    errorSummary?.classList.add('hidden');
    if (errorList) errorList.innerHTML = '';
  };

  const showErrorSummary = (errors) => {
    if (!errorSummary || !errorList) return;
    errorList.innerHTML = '';

    errors.forEach(({ id, message }) => {
      setFieldError(id, message);

      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${id}`;
      link.textContent = message;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const target = id === 'type'
          ? form.querySelector('input[name="type"]')
          : getField(id);
        target?.focus();
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      item.append(link);
      errorList.append(item);
    });

    errorSummary.classList.remove('hidden');
    errorSummary.focus();
  };

  const validateStep = (step) => {
    const errors = [];
    const required = (id, message) => {
      if (!(getField(id)?.value || '').trim()) errors.push({ id, message });
    };

    if (step === 1) {
      required('contactName', 'Enter your name');
      const contactPhoneValue = (getField('contactPhone')?.value || '').trim();
      if (contactPhoneValue && phoneDigits(contactPhoneValue).length !== 10) {
        errors.push({ id: 'contactPhone', message: 'Enter all 10 digits of the phone number, or leave it blank' });
      }
      const email = (getField('contactEmail')?.value || '').trim();
      if (!email) {
        errors.push({ id: 'contactEmail', message: 'Enter your email address' });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ id: 'contactEmail', message: 'Enter an email address in the form name@example.com' });
      }
    }

    if (step === 2) {
      required('organization', 'Enter your business or organization name');
      required('role', 'Enter the job title');
      required('details', 'Describe the job');
    }

    if (step === 3) {
      required('state', 'Choose a state');
      // Either is enough — some employers only know the county, and some towns
      // are unincorporated and will not be in the city list.
      if ((getField('state')?.value || '').trim()
          && !(getField('city')?.value || '').trim()
          && !(getField('county')?.value || '').trim()) {
        errors.push({ id: 'city', message: 'Choose either a city or a county' });
      }
      if (!getSelectedType()) {
        errors.push({ id: 'type', message: 'Choose what type of work this is' });
      }
      const url = (getField('postingUrl')?.value || '').trim();
      if (url && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}/i.test(url)) {
        errors.push({ id: 'postingUrl', message: 'Enter a web address like https://example.com/jobs' });
      }
    }

    if (step === 4) {
      const phoneValue = (getField('phone')?.value || '').trim();
      if (phoneValue && phoneDigits(phoneValue).length !== 10) {
        errors.push({ id: 'phone', message: 'Enter all 10 digits of the phone number, or leave it blank' });
      }
      const payRaw = (getField('pay')?.value || '').trim();
      if (payRaw && normalizePay(payRaw) === '') {
        errors.push({ id: 'pay', message: 'Enter the pay as a number, for example 22.50' });
      }
    }

    if (step === 5 && usingRealCaptcha() && !getCaptchaToken()) {
      errors.push({ id: 'captcha', message: 'Tick the box to confirm you are not a robot' });
    }

    return errors;
  };

  // --- captcha ------------------------------------------------------------
  const captchaContainer = document.getElementById('requestCaptcha');
  const sitekey = (globalThis.APP_CONFIG?.hcaptchaSitekey || '').trim();
  const testSitekey = '10000000-ffff-ffff-ffff-000000000001';

  function usingRealCaptcha() {
    return Boolean(!isLocalDevHost() && sitekey && sitekey !== testSitekey);
  }

  function getCaptchaToken() {
    return form.querySelector('[name="h-captcha-response"]')?.value || '';
  }

  let captchaRendered = false;
  const renderCaptcha = () => {
    if (captchaRendered || !captchaContainer || !usingRealCaptcha()) return;
    captchaContainer.dataset.sitekey = sitekey;
    captchaContainer.dataset.theme = 'auto';
    captchaContainer.classList.add('h-captcha');
    if (globalThis.hcaptcha) {
      try {
        globalThis.hcaptcha.render(captchaContainer, { sitekey });
        captchaRendered = true;
      } catch {
        // Auto-render will pick it up from the h-captcha class instead.
      }
    }
  };

  // --- review step --------------------------------------------------------
  const reviewRows = () => {
    const value = (id) => (getField(id)?.value || '').trim();
    const orDash = (text) => text || 'Not given';

    return [
      { label: 'Your name', value: orDash(value('contactName')), step: 1, field: 'contactName' },
      { label: 'Your email', value: orDash(value('contactEmail')), step: 1, field: 'contactEmail' },
      { label: 'Your phone', value: orDash(formatUsPhone(value('contactPhone'))), step: 1, field: 'contactPhone' },
      { label: 'Organization', value: orDash(value('organization')), step: 2, field: 'organization' },
      { label: 'Job title', value: orDash(value('role')), step: 2, field: 'role' },
      { label: 'Description', value: orDash(value('details')), step: 2, field: 'details' },
      { label: 'Location', value: buildLocationLabel(value('city'), value('county'), value('state')), step: 3, field: 'city' },
      { label: 'Type of work', value: orDash(getSelectedType()), step: 3, field: 'type' },
      { label: 'Link to your posting', value: orDash(value('postingUrl')), step: 3, field: 'postingUrl' },
      { label: 'Hourly pay', value: formatPayForReview(value('pay')), step: 4, field: 'pay' },
      { label: 'Phone for students', value: orDash(formatUsPhone(value('phone'))), step: 4, field: 'phone' },
      { label: 'Benefits', value: benefits.length ? benefits.join(', ') : 'None listed', step: 4, field: 'benefitInput' },
      {
        label: 'Featured placement',
        value: getField('wantsSponsorship')?.checked
          ? 'Yes — send me the details'
          : 'No thanks',
        step: 4,
        field: 'wantsSponsorship',
      },
    ];
  };

  const renderReview = () => {
    if (!reviewList) return;
    reviewList.innerHTML = '';

    reviewRows().forEach((row) => {
      const wrap = document.createElement('div');
      wrap.className = 'wizard-review-row';

      const dt = document.createElement('dt');
      dt.textContent = row.label;

      const dd = document.createElement('dd');
      const text = document.createElement('span');
      text.className = 'wizard-review-value';
      text.textContent = row.value;
      dd.append(text);

      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'wizard-review-change';
      change.textContent = 'Change';
      change.setAttribute('aria-label', `Change ${row.label.toLowerCase()}`);
      change.addEventListener('click', () => {
        goToStep(row.step);
        const target = row.field === 'type'
          ? form.querySelector('input[name="type"]')
          : getField(row.field);
        target?.focus();
      });
      dd.append(change);

      wrap.append(dt, dd);
      reviewList.append(wrap);
    });
  };

  // --- step navigation ----------------------------------------------------
  function goToStep(step) {
    currentStep = Math.min(Math.max(step, 1), totalSteps);
    clearErrors();

    steps.forEach((node) => {
      node.classList.toggle('hidden', Number(node.dataset.step) !== currentStep);
    });

    const isLast = currentStep === totalSteps;
    nextBtn?.classList.toggle('hidden', isLast);
    submitBtn?.classList.toggle('hidden', !isLast);
    backBtn?.classList.toggle('hidden', currentStep === 1);

    if (progressLabel) progressLabel.textContent = `Step ${currentStep} of ${totalSteps}`;
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(currentStep));
    if (progressFill) progressFill.style.width = `${(currentStep / totalSteps) * 100}%`;

    if (isLast) {
      renderReview();
      renderCaptcha();
    }

    // Move focus to the step heading so screen readers announce the new step
    // and keyboard users do not land back at the top of the document.
    const heading = steps.find((node) => Number(node.dataset.step) === currentStep)
      ?.querySelector('.wizard-step-heading');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });

    saveDraft();
  }

  const showWizard = () => {
    intro.classList.add('hidden');
    card.classList.remove('hidden');
    goToStep(currentStep);
  };

  startBtn?.addEventListener('click', showWizard);

  nextBtn?.addEventListener('click', () => {
    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      showErrorSummary(errors);
      return;
    }
    // Tidy what they typed before moving on, so the review page shows the
    // cleaned-up version and there are no surprises at the end.
    const url = getField('postingUrl');
    if (url && url.value.trim()) url.value = normalizeUrl(url.value);

    goToStep(currentStep + 1);
  });

  backBtn?.addEventListener('click', () => goToStep(currentStep - 1));

  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  // Enter anywhere in the form advances the step instead of submitting early.
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) return;
    if (currentStep !== totalSteps) {
      event.preventDefault();
      nextBtn?.click();
    }
  });

  // --- submit -------------------------------------------------------------
  const setSubmitting = (value) => {
    isSubmitting = value;
    if (submitBtn) {
      submitBtn.disabled = value;
      submitBtn.textContent = value ? 'Sending...' : 'Send my job listing';
    }
    if (backBtn) backBtn.disabled = value;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validateStep(totalSteps);
    if (errors.length > 0) {
      showErrorSummary(errors);
      return;
    }

    const baseUrl = (globalThis.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = globalThis.APP_CONFIG?.supabaseAnonKey || '';
    if (!baseUrl) {
      showErrorSummary([{
        id: 'captcha',
        message: 'This form is not set up yet, so we cannot send your listing. Please try again later.',
      }]);
      return;
    }

    const value = (id) => (getField(id)?.value || '').trim();
    setSubmitting(true);

    try {
      const resp = await fetch(`${baseUrl}/functions/v1/submit-job-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          captchaToken: getCaptchaToken(),
          contactName: value('contactName'),
          contactEmail: value('contactEmail'),
          contactPhone: formatUsPhone(value('contactPhone')),
          organization: value('organization'),
          role: value('role'),
          details: value('details'),
          state: value('state'),
          city: value('city'),
          county: value('county'),
          type: getSelectedType(),
          postingUrl: value('postingUrl') ? normalizeUrl(value('postingUrl')) : '',
          phone: formatUsPhone(value('phone')),
          pay: normalizePay(value('pay')),
          benefits: [...benefits],
          wantsSponsorship: Boolean(getField('wantsSponsorship')?.checked),
        }),
      });

      const result = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setSubmitting(false);
        if (globalThis.hcaptcha && captchaRendered) {
          try { globalThis.hcaptcha.reset(); } catch { /* non-fatal */ }
        }

        const fieldErrors = result?.fieldErrors;
        if (fieldErrors && typeof fieldErrors === 'object') {
          const mapped = Object.entries(fieldErrors).map(([id, message]) => ({ id, message: String(message) }));
          showErrorSummary(mapped);
          return;
        }

        showErrorSummary([{
          id: 'captcha',
          message: result?.error || 'We could not send your listing. Please try again in a moment.',
        }]);
        return;
      }

      clearDraft();
      card.classList.add('hidden');
      done.classList.remove('hidden');

      const lead = document.getElementById('wizardDoneLead');
      if (lead && result?.duplicate) {
        lead.textContent = 'We already had this request on file, so we have not created a second one. '
          + 'A staff member is reviewing it and will be in touch.';
      }
      done.focus();
      done.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch {
      setSubmitting(false);
      showErrorSummary([{
        id: 'captcha',
        message: 'We could not reach the server. Check your internet connection and try again.',
      }]);
    }
  });

  const hadDraft = restoreDraft();
  if (hadDraft) {
    // Someone came back to an unfinished form — skip the intro and say so.
    showWizard();
    const note = document.getElementById('wizardSaveNote');
    if (note) note.textContent = 'We brought back the answers you already filled in.';
  }

}

// Staff review queue at /review-requests.
//
// Built for people who do not use the site every day: one request per card,
// everything readable without clicking, and exactly two actions per card.
// Nodes are built with the DOM rather than innerHTML because this page renders
// text typed by anonymous members of the public.
function initReviewRequestsPage() {
  const list = document.getElementById('requestsList');
  const empty = document.getElementById('requestsEmpty');
  if (!list || !empty) {
    return;
  }

  const message = document.getElementById('requestsMessage');
  const refreshBtn = document.getElementById('refreshRequestsBtn');
  const tabs = Array.from(document.querySelectorAll('.requests-tab'));
  const counts = {
    pending: document.getElementById('countPending'),
    approved: document.getElementById('countApproved'),
    rejected: document.getElementById('countRejected'),
  };

  const publishModal = document.getElementById('publishModal');
  const publishForm = document.getElementById('publishForm');
  const publishRole = document.getElementById('publishModalRole');
  const publishCategory = document.getElementById('publishCategory');
  const publishSponsored = document.getElementById('publishSponsored');
  const publishSponsorHint = document.getElementById('publishSponsorHint');
  const publishMessage = document.getElementById('publishMessage');

  const declineModal = document.getElementById('declineModal');
  const declineForm = document.getElementById('declineForm');
  const declineRole = document.getElementById('declineModalRole');
  const declineNote = document.getElementById('declineNote');
  const declineMessage = document.getElementById('declineMessage');

  let requests = [];
  let activeStatus = 'pending';
  let activeRequest = null;
  let isWorking = false;

  const setMessage = (text, isError = false) => {
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('error', Boolean(isError));
  };

  const formatWhen = (iso) => {
    if (!iso) return 'Unknown date';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const titleCase = (slug) => slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  // Category list is assembled from the same places the jobs page uses, so the
  // dropdown here matches the Job Type tabs staff already know.
  const loadCategories = async () => {
    const found = new Map([['pta', 'Physical Therapy Assistant']]);

    try {
      const custom = JSON.parse(localStorage.getItem('studentJobHubJobTypes') || '{}');
      Object.entries(custom).forEach(([slug, meta]) => {
        if (slug) found.set(slug, meta?.label || titleCase(slug));
      });
    } catch {
      // Fall through to whatever the database knows about.
    }

    try {
      const { data } = await teacherAuthState.supabase.from('jobs').select('category');
      (data || []).forEach((row) => {
        const slug = (row.category || '').trim();
        if (slug && !found.has(slug)) found.set(slug, titleCase(slug));
      });
    } catch {
      // Non-fatal — the built-in category is always available.
    }

    if (!publishCategory) return;
    publishCategory.innerHTML = '';
    found.forEach((label, slug) => {
      const option = document.createElement('option');
      option.value = slug;
      option.textContent = label;
      publishCategory.append(option);
    });
  };

  // --- rendering ----------------------------------------------------------
  const detailRow = (label, value, options = {}) => {
    if (!value) return null;
    const row = document.createElement('div');
    row.className = 'request-detail';

    const dt = document.createElement('span');
    dt.className = 'request-detail-label';
    dt.textContent = label;

    const dd = document.createElement('span');
    dd.className = 'request-detail-value';

    if (options.href) {
      const link = document.createElement('a');
      link.href = options.href;
      link.textContent = value;
      if (options.external) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      dd.append(link);
    } else {
      dd.textContent = value;
    }

    row.append(dt, dd);
    return row;
  };

  const buildCard = (request) => {
    const card = document.createElement('article');
    card.className = 'request-card';
    if (request.wants_sponsorship) card.classList.add('wants-sponsor');

    // Header
    const head = document.createElement('div');
    head.className = 'request-head';

    const titleWrap = document.createElement('div');
    const org = document.createElement('p');
    org.className = 'request-org';
    org.textContent = request.organization || 'Unknown organization';
    const role = document.createElement('h2');
    role.className = 'request-role';
    role.textContent = request.role || 'Untitled job';
    titleWrap.append(org, role);

    const when = document.createElement('p');
    when.className = 'request-when';
    when.textContent = `Sent ${formatWhen(request.created_at)}`;

    head.append(titleWrap, when);
    card.append(head);

    if (request.wants_sponsorship) {
      const flag = document.createElement('p');
      flag.className = 'request-sponsor-flag';
      flag.textContent = 'This employer asked about featuring the job at the top of the list.';
      card.append(flag);
    }

    // Description
    const description = document.createElement('p');
    description.className = 'request-description';
    description.textContent = request.details || 'No description given.';
    card.append(description);

    // Details grid
    const details = document.createElement('div');
    details.className = 'request-details';
    [
      detailRow('Location', request.location
        || buildLocationLabel(request.city, request.county, request.state)),
      detailRow('County', request.city && request.county ? request.county : ''),
      detailRow('Type of work', request.type),
      detailRow('Hourly pay', request.pay == null ? '' : `$${Number(request.pay).toFixed(2)}`),
      detailRow('Phone for students', request.phone, { href: `tel:${String(request.phone).replace(/\D/g, '')}` }),
      detailRow('Their posting', request.posting_url, { href: request.posting_url, external: true }),
      detailRow('Benefits', Array.isArray(request.benefits) && request.benefits.length
        ? request.benefits.join(', ')
        : ''),
    ].filter(Boolean).forEach((row) => details.append(row));
    card.append(details);

    // Who sent it
    const contact = document.createElement('div');
    contact.className = 'request-contact';
    const contactTitle = document.createElement('h3');
    contactTitle.textContent = 'Who sent this';
    contact.append(contactTitle);

    const contactGrid = document.createElement('div');
    contactGrid.className = 'request-details';
    [
      detailRow('Name', request.contact_name),
      detailRow('Email', request.contact_email, { href: `mailto:${request.contact_email}` }),
      detailRow('Phone', request.contact_phone, { href: `tel:${String(request.contact_phone).replace(/\D/g, '')}` }),
    ].filter(Boolean).forEach((row) => contactGrid.append(row));
    contact.append(contactGrid);
    card.append(contact);

    // Review trail for anything already handled
    if (request.status !== 'pending') {
      const trail = document.createElement('p');
      trail.className = 'request-trail';
      const verb = request.status === 'approved' ? 'Published' : 'Declined';
      trail.textContent = `${verb} on ${formatWhen(request.reviewed_at)}`
        + (request.review_note ? ` — ${request.review_note}` : '');
      card.append(trail);
    }

    // Actions
    if (request.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'request-actions';

      const publishBtn = document.createElement('button');
      publishBtn.type = 'button';
      publishBtn.className = 'btn btn-primary request-action-btn';
      publishBtn.textContent = 'Publish this job';
      publishBtn.addEventListener('click', () => openPublishModal(request));

      const declineBtn = document.createElement('button');
      declineBtn.type = 'button';
      declineBtn.className = 'btn btn-muted request-action-btn';
      declineBtn.textContent = 'Decline';
      declineBtn.addEventListener('click', () => openDeclineModal(request));

      actions.append(publishBtn, declineBtn);
      card.append(actions);
    }

    return card;
  };

  const emptyTextFor = (status) => ({
    pending: 'Nothing is waiting for you right now. When an employer sends a job in, it will appear here.',
    approved: 'No published requests yet.',
    rejected: 'No declined requests.',
  }[status] || 'Nothing here.');

  const render = () => {
    const visible = requests.filter((request) => request.status === activeStatus);

    Object.entries(counts).forEach(([status, node]) => {
      if (node) node.textContent = String(requests.filter((r) => r.status === status).length);
    });

    list.innerHTML = '';
    if (visible.length === 0) {
      empty.textContent = emptyTextFor(activeStatus);
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');
    visible.forEach((request) => list.append(buildCard(request)));
  };

  // --- data ---------------------------------------------------------------
  const loadRequests = async () => {
    if (!teacherAuthState.supabase || !teacherAuthState.session) {
      empty.textContent = 'Please sign in to see job requests.';
      return;
    }

    empty.textContent = 'Loading...';
    empty.classList.remove('hidden');

    try {
      const { data, error } = await teacherAuthState.supabase
        .from('job_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setMessage('We could not load the job requests. Please refresh the page.', true);
        empty.textContent = 'Could not load job requests.';
        return;
      }

      requests = Array.isArray(data) ? data : [];
      setMessage('');
      render();
    } catch {
      setMessage('We could not reach the server. Check your internet connection.', true);
      empty.textContent = 'Could not load job requests.';
    }
  };

  // --- modals -------------------------------------------------------------
  const setModalOpen = (modal, open) => {
    if (!modal) return;
    modal.classList.toggle('open', open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('modal-open', open);
  };

  function openPublishModal(request) {
    activeRequest = request;
    if (publishRole) {
      publishRole.textContent = `${request.role} — ${request.organization}`;
    }
    if (publishSponsored) publishSponsored.checked = false;
    if (publishSponsorHint) {
      publishSponsorHint.textContent = request.wants_sponsorship
        ? 'This employer asked about featuring. Only tick this once they have paid.'
        : 'Only tick this once the employer has paid for featured placement.';
    }
    if (publishMessage) publishMessage.textContent = '';
    setModalOpen(publishModal, true);
    publishCategory?.focus();
  }

  function openDeclineModal(request) {
    activeRequest = request;
    if (declineRole) {
      declineRole.textContent = `${request.role} — ${request.organization}`;
    }
    if (declineNote) declineNote.value = '';
    if (declineMessage) declineMessage.textContent = '';
    setModalOpen(declineModal, true);
    declineNote?.focus();
  }

  document.querySelectorAll('[data-close-publish]').forEach((node) => {
    node.addEventListener('click', () => setModalOpen(publishModal, false));
  });
  document.querySelectorAll('[data-close-decline]').forEach((node) => {
    node.addEventListener('click', () => setModalOpen(declineModal, false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setModalOpen(publishModal, false);
    setModalOpen(declineModal, false);
  });

  // --- actions ------------------------------------------------------------
  publishForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isWorking || !activeRequest) return;

    const confirmBtn = document.getElementById('confirmPublishBtn');
    isWorking = true;
    if (confirmBtn) confirmBtn.disabled = true;
    if (publishMessage) publishMessage.textContent = 'Publishing...';

    const request = activeRequest;
    const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const city = (request.city || '').trim();
    const county = (request.county || '').trim();
    const state = (request.state || '').trim();

    try {
      const { error: insertError } = await teacherAuthState.supabase.from('jobs').insert({
        id: jobId,
        entry_mode: request.posting_url ? 'url' : 'template',
        role: request.role,
        organization: request.organization,
        location: request.location || buildLocationLabel(city, county, state),
        state,
        city,
        county,
        type: request.type,
        category: publishCategory?.value || 'pta',
        details: request.details,
        source_label: 'employer request',
        posting_url: request.posting_url || '',
        phone: request.phone || '',
        pay: request.pay,
        benefits: Array.isArray(request.benefits) ? request.benefits : [],
        posted_by: request.organization || '',
        is_sponsored: Boolean(publishSponsored?.checked),
        created_by: teacherAuthState.session?.user?.id || null,
      });

      if (insertError) {
        if (publishMessage) publishMessage.textContent = 'We could not publish it. Please try again.';
        isWorking = false;
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }

      // Mark the request handled. If this second write fails the job is already
      // live, so say so plainly rather than implying nothing happened.
      const { error: updateError } = await teacherAuthState.supabase
        .from('job_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: teacherAuthState.session?.user?.id || null,
          published_job_id: jobId,
        })
        .eq('id', request.id);

      setModalOpen(publishModal, false);
      isWorking = false;
      if (confirmBtn) confirmBtn.disabled = false;

      if (updateError) {
        setMessage(
          `"${request.role}" is now on the jobs page, but we could not tick it off this list. `
          + 'Press Refresh — if it is still here, you can safely ignore it.',
          true,
        );
      } else {
        setMessage(`"${request.role}" is now on the jobs page.`);
      }

      await loadRequests();
    } catch {
      isWorking = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (publishMessage) publishMessage.textContent = 'We could not reach the server. Please try again.';
    }
  });

  declineForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isWorking || !activeRequest) return;

    const confirmBtn = document.getElementById('confirmDeclineBtn');
    isWorking = true;
    if (confirmBtn) confirmBtn.disabled = true;
    if (declineMessage) declineMessage.textContent = 'Declining...';

    const request = activeRequest;

    try {
      const { error } = await teacherAuthState.supabase
        .from('job_requests')
        .update({
          status: 'rejected',
          review_note: (declineNote?.value || '').trim().slice(0, 500),
          reviewed_at: new Date().toISOString(),
          reviewed_by: teacherAuthState.session?.user?.id || null,
        })
        .eq('id', request.id);

      isWorking = false;
      if (confirmBtn) confirmBtn.disabled = false;

      if (error) {
        if (declineMessage) declineMessage.textContent = 'We could not decline it. Please try again.';
        return;
      }

      setModalOpen(declineModal, false);
      setMessage(`"${request.role}" was declined.`);
      await loadRequests();
    } catch {
      isWorking = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (declineMessage) declineMessage.textContent = 'We could not reach the server. Please try again.';
    }
  });

  // --- tabs ---------------------------------------------------------------
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeStatus = tab.dataset.status || 'pending';
      tabs.forEach((other) => {
        const isActive = other === tab;
        other.classList.toggle('active', isActive);
        other.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      render();
    });
  });

  refreshBtn?.addEventListener('click', loadRequests);

  onTeacherAuthChange((authState) => {
    if (authState.loading) return;
    if (!authState.configured || !authState.session) {
      empty.textContent = 'Please sign in to see job requests.';
      empty.classList.remove('hidden');
      return;
    }
    loadCategories();
    loadRequests();
  });
}

// Badge on the settings menu so staff notice new requests without going looking.
// Count only; the page itself is the source of truth.
async function refreshPendingRequestCount() {
  const badge = document.getElementById('requestCountBadge');
  if (!badge || !teacherAuthState.supabase || !teacherAuthState.session) {
    return;
  }

  try {
    const { count, error } = await teacherAuthState.supabase
      .from('job_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error || !count) {
      badge.classList.add('hidden');
      badge.textContent = '';
      return;
    }

    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } catch {
    badge.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initSettingsMenu();
  initThemeToggle();
  initSchoolThemeMenu();
  initTeacherAuth();
  initLoginPage();
  initChangePasswordPage();
  initAdminUsersPage();
  initProfileModal();
  setCurrentYear();
  initActiveNav();
  initQuickGuideTooltip();
  initJobsModal();
  initRequestListingWizard();
  initReviewRequestsPage();
});
