(() => {
  'use strict';

  const defaultClientId = (window.APP_CONFIG?.spotifyClientId || '').trim();
  const placeholder = 'PASTE_YOUR_SPOTIFY_CLIENT_ID_HERE';
  const authVersion = String(window.APP_CONFIG?.spotifyAuthVersion || '1');
  const redirectUri = (window.APP_CONFIG?.spotifyRedirectUri || `${window.location.origin}${window.location.pathname}`).trim();

  const authVersionKey = 'muziekmix.spotify.authVersion';
  const customClientIdKey = 'muziekmix.spotify.customClientId';
  const clientModeKey = 'muziekmix.spotify.clientMode';
  const clientSourceKey = 'muziekmix.spotify.clientSource';
  const keys = {
    access: 'muziekmix.spotify.access',
    expiry: 'muziekmix.spotify.expiry',
    refresh: 'muziekmix.spotify.refresh',
    verifier: 'muziekmix.spotify.verifier',
    state: 'muziekmix.spotify.state',
    authClient: 'muziekmix.spotify.authClientId',
    sessionClient: 'muziekmix.spotify.sessionClientId'
  };

  let accessToken = localStorage.getItem(keys.access) || '';
  let tokenExpiry = Number(localStorage.getItem(keys.expiry) || 0);
  let refreshToken = localStorage.getItem(keys.refresh) || '';

  const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const random = length => base64url(crypto.getRandomValues(new Uint8Array(length)));
  const digest = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  const storedCustomClientId = () => (localStorage.getItem(customClientIdKey) || '').trim();
  const clientMode = () => localStorage.getItem(clientModeKey) === 'custom' && storedCustomClientId() ? 'custom' : 'default';
  const clientSource = () => {
    if (clientMode() !== 'custom') return 'default';
    return localStorage.getItem(clientSourceKey) === 'shared' ? 'shared' : 'own';
  };
  const currentClientId = () => clientMode() === 'custom' ? storedCustomClientId() : defaultClientId;

  function clearAuthState() {
    [keys.access, keys.expiry, keys.refresh, keys.verifier, keys.state, keys.authClient, keys.sessionClient]
      .forEach(key => localStorage.removeItem(key));
    accessToken = '';
    tokenExpiry = 0;
    refreshToken = '';
  }

  function clear() {
    clearAuthState();
  }

  function setCustomClientId(value, source = 'own') {
    const next = String(value || '').trim();
    if (!/^[A-Za-z0-9]{20,128}$/.test(next)) {
      throw new Error('Vul een geldige Spotify Client ID in.');
    }
    const normalizedSource = source === 'shared' ? 'shared' : 'own';
    const changed = clientMode() !== 'custom' || currentClientId() !== next;
    if (changed) clearAuthState();
    localStorage.setItem(customClientIdKey, next);
    localStorage.setItem(clientModeKey, 'custom');
    localStorage.setItem(clientSourceKey, normalizedSource);
    return next;
  }

  function useDefaultClientId() {
    const changed = clientMode() !== 'default';
    if (changed) clearAuthState();
    localStorage.setItem(clientModeKey, 'default');
    localStorage.setItem(clientSourceKey, 'default');
  }

  if (localStorage.getItem(authVersionKey) !== authVersion) {
    clearAuthState();
    // Markeer de migratie vóór OAuth start, anders kan de redirect de PKCE-state wissen.
    localStorage.setItem(authVersionKey, authVersion);
  }

  function save(data, clientId) {
    accessToken = data.access_token;
    tokenExpiry = Date.now() + Number(data.expires_in || 3600) * 1000;
    localStorage.setItem(keys.access, accessToken);
    localStorage.setItem(keys.expiry, String(tokenExpiry));
    localStorage.setItem(keys.sessionClient, clientId);
    localStorage.setItem(authVersionKey, authVersion);
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      localStorage.setItem(keys.refresh, refreshToken);
    }
  }

  async function tokenRequest(values) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || 'Spotify-aanmelding is mislukt.');
    return data;
  }

  async function token() {
    const clientId = currentClientId();
    if (!clientId || clientId === placeholder) throw new Error('Kies eerst een geldige Spotify Developer-app.');

    const storedSessionClient = localStorage.getItem(keys.sessionClient);
    if ((accessToken || refreshToken) && storedSessionClient && storedSessionClient !== clientId) {
      clearAuthState();
      throw new Error('De Spotify Developer-app is gewijzigd. Koppel je Spotify-account opnieuw.');
    }

    if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;
    if (!refreshToken) throw new Error('Koppel eerst je Spotify-account.');

    try {
      save(await tokenRequest({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }), clientId);
      return accessToken;
    } catch (_) {
      clearAuthState();
      throw new Error('Je Spotify-sessie is verlopen. Koppel je account opnieuw.');
    }
  }

  async function request(path, method = 'GET', body, retry = true) {
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry) {
      tokenExpiry = 0;
      return request(path, method, body, false);
    }
    if (!response.ok) {
      if (response.status === 404) throw new Error('Geen actief Spotify-apparaat gevonden. Open Spotify op je telefoon of speaker en speel daar kort iets af.');
      if (response.status === 403) throw new Error('Spotify weigert toegang. Controleer Spotify Premium en of jouw account toegang heeft tot de gekozen Developer-app.');
      if (response.status === 429) throw new Error(data.error?.reason === 'QUOTA_EXCEEDED'
        ? 'De Spotify Developer-app heeft tijdelijk zijn API-quota bereikt.'
        : 'Spotify ontvangt te veel verzoeken. Wacht even en probeer opnieuw.');
      throw new Error(data.error?.message || `Spotify-fout (${response.status}).`);
    }
    return data;
  }

  async function login() {
    const clientId = currentClientId();
    if (!clientId || clientId === placeholder) throw new Error('Kies eerst een geldige Spotify Developer-app.');

    const verifier = random(64);
    const state = random(24);
    const challenge = base64url(await digest(verifier));

    localStorage.setItem(authVersionKey, authVersion);
    localStorage.setItem(keys.verifier, verifier);
    localStorage.setItem(keys.state, state);
    localStorage.setItem(keys.authClient, clientId);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: 'streaming user-read-private user-modify-playback-state user-read-playback-state'
    });

    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  }

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return null;

    history.replaceState({}, document.title, redirectUri);

    if (error) {
      localStorage.removeItem(keys.verifier);
      localStorage.removeItem(keys.state);
      localStorage.removeItem(keys.authClient);
      throw new Error(error === 'access_denied' ? 'Spotify-koppeling is geannuleerd.' : `Spotify-koppeling mislukt: ${error}.`);
    }

    if (!params.get('state') || params.get('state') !== localStorage.getItem(keys.state)) {
      throw new Error('De Spotify-aanmelding kon niet veilig worden gecontroleerd. Probeer opnieuw.');
    }

    const verifier = localStorage.getItem(keys.verifier);
    const authClientId = (localStorage.getItem(keys.authClient) || currentClientId()).trim();
    if (!verifier) throw new Error('De inlogsessie is verlopen. Probeer Spotify opnieuw te koppelen.');
    if (!authClientId) throw new Error('De Spotify Client ID voor deze inlogsessie ontbreekt. Start de koppeling opnieuw.');

    save(await tokenRequest({
      client_id: authClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    }), authClientId);

    localStorage.removeItem(keys.verifier);
    localStorage.removeItem(keys.state);
    localStorage.removeItem(keys.authClient);
    return true;
  }

  window.SpotifyApp = {
    configured: () => Boolean(currentClientId() && currentClientId() !== placeholder),
    hasSession: () => Boolean(accessToken || refreshToken),
    clear,
    login,
    token,
    request,
    handleCallback,
    profile: () => request('/me'),
    redirectUri: () => redirectUri,
    clientMode,
    clientSource,
    currentClientId,
    setCustomClientId,
    useDefaultClientId
  };
})();