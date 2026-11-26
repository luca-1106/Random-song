(() => {
  'use strict';
  const config = window.APP_CONFIG || {};
  const defaultClientId = String(config.spotifyClientId || '').trim();
  const placeholder = 'PASTE_YOUR_SPOTIFY_CLIENT_ID_HERE';
  const authVersion = String(config.spotifyAuthVersion || '1');
  const redirectUri = String(config.spotifyRedirectUri || location.origin + location.pathname).trim();
  const prefix = 'muziekmix.spotify.';
  const keys = Object.fromEntries(['access','expiry','refresh','verifier','state','scope','authVersion','customClientId','clientMode','clientSource','connectionIssue','revision'].map(k => [k, prefix + k]));
  keys.sessionClient = prefix + 'sessionClientId';
  keys.authClient = prefix + 'authClientId';
  const pendingKey = prefix + 'pendingAuthorization.v2';
  const requiredScopes = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
  const get = k => localStorage.getItem(k) || '';
  const put = (k,v) => localStorage.setItem(k,String(v));
  const remove = k => localStorage.removeItem(k);
  const coded = (message, code, details = {}) => Object.assign(new Error(message), {code}, details);
  const validClient = v => /^[A-Za-z0-9]{20,128}$/.test(v) && v !== placeholder;
  const storedCustom = () => get(keys.customClientId).trim();
  const clientMode = () => get(keys.clientMode) === 'custom' && storedCustom() ? 'custom' : 'default';
  const clientSource = () => clientMode() === 'default' ? 'default' : get(keys.clientSource) === 'shared' ? 'shared' : 'own';
  const currentClientId = () => clientMode() === 'custom' ? storedCustom() : defaultClientId;
  const hasSession = () => Boolean(get(keys.access) || get(keys.refresh));
  const connectionIssue = () => get(keys.connectionIssue);
  const hasRequiredScopes = () => requiredScopes.split(' ').every(scope => get(keys.scope).split(/\s+/).includes(scope));
  let generation = 0;
  let refreshJob = null;

  function clearTokens() {
    generation++;
    put(keys.revision, String(Date.now()) + '-' + Math.random().toString(36).slice(2));
    refreshJob = null;
    [keys.access,keys.expiry,keys.refresh,keys.scope,keys.sessionClient].forEach(remove);
  }
  function clearPending() {
    sessionStorage.removeItem(pendingKey);
    [keys.verifier,keys.state,keys.authClient].forEach(remove);
  }
  function clear() {
    clearTokens();
    clearPending();
    remove(keys.connectionIssue);
  }
  function invalidate(code, message) {
    clearTokens();
    put(keys.connectionIssue, code === 'SPOTIFY_ACCESS_INVALID' ? 'access' : 'expired');
    return coded(message, code);
  }
  if (get(keys.authVersion) !== authVersion) {
    if (hasSession()) invalidate('SPOTIFY_SESSION_EXPIRED','Log opnieuw in bij Spotify.');
    clearPending();
    put(keys.authVersion, authVersion);
  }
  function commitSource(source, id) {
    if (source !== 'default') put(keys.customClientId,id);
    put(keys.clientMode,source === 'default' ? 'default' : 'custom');
    put(keys.clientSource,source);
  }
  function save(data, clientId, newLogin = false) {
    if (!data?.access_token) throw coded('Spotify gaf geen geldig toegangstoken terug.','SPOTIFY_TEMPORARY');
    put(keys.access,data.access_token);
    put(keys.expiry,Date.now() + Number(data.expires_in || 3600)*1000);
    put(keys.sessionClient,clientId);
    if (data.refresh_token) put(keys.refresh,data.refresh_token);
    else if (newLogin) remove(keys.refresh);
    if (typeof data.scope === 'string') put(keys.scope,data.scope);
    else if (newLogin) put(keys.scope,requiredScopes);
  }
  const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  const random = length => base64url(crypto.getRandomValues(new Uint8Array(length)));
  async function fetchTimed(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(url,{...options,signal:controller.signal}); }
    catch (_) { throw coded('Spotify is tijdelijk niet bereikbaar. Probeer opnieuw.','SPOTIFY_TEMPORARY'); }
    finally { clearTimeout(timer); }
  }
  async function tokenRequest(values) {
    const response = await fetchTimed('https://accounts.spotify.com/api/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw coded(data.error_description || 'Spotify-aanmelding mislukt.', 'SPOTIFY_TOKEN_ERROR',{status:response.status,reason:data.error});
    return data;
  }
  async function token(force = false) {
    const clientId = currentClientId();
    if (!validClient(clientId)) throw coded('Kies een geldige Developer-koppeling.','SPOTIFY_CONFIGURATION');
    const stored = get(keys.sessionClient);
    if (hasSession() && stored && stored !== clientId) throw invalidate('SPOTIFY_SESSION_EXPIRED','De Developer-koppeling is gewijzigd. Log opnieuw in.');
    if (!force && get(keys.access) && Date.now() < Number(get(keys.expiry))-60000) return get(keys.access);
    if (!get(keys.refresh)) throw invalidate('SPOTIFY_SESSION_EXPIRED','Log opnieuw in bij Spotify.');
    const refresh = get(keys.refresh);
    const revision = get(keys.revision);
    if (refreshJob?.clientId === clientId && refreshJob.refresh === refresh && refreshJob.revision === revision) return refreshJob.promise;
    const epoch = generation;
    const stillCurrent = () => epoch === generation && revision === get(keys.revision) && clientId === currentClientId() && refresh === get(keys.refresh);
    const job = {clientId,refresh,revision};
    job.promise = (async()=>{
      try {
        const data = await tokenRequest({client_id:clientId,grant_type:'refresh_token',refresh_token:refresh});
        if (!stillCurrent()) throw coded('De Spotify-aanmelding is ondertussen gewijzigd.','SPOTIFY_TEMPORARY');
        save(data,clientId);
        return get(keys.access);
      } catch(error) {
        if (!stillCurrent()) throw error;
        if (error.status === 400 && error.reason === 'invalid_grant') throw invalidate('SPOTIFY_SESSION_EXPIRED','Je Spotify-aanmelding is verlopen of ingetrokken. Log opnieuw in.');
        if (['invalid_client','unauthorized_client'].includes(error.reason) && [400,401,403].includes(error.status)) throw invalidate('SPOTIFY_ACCESS_INVALID','Spotify accepteert deze Developer-koppeling niet. Controleer de instellingen.');
        throw coded('Spotify kon je aanmelding tijdelijk niet vernieuwen. Probeer opnieuw.','SPOTIFY_TEMPORARY',{status:error.status});
      } finally { if (refreshJob === job) refreshJob = null; }
    })();
    refreshJob = job;
    return job.promise;
  }
  async function api(path, method, body, bearer) {
    const response = await fetchTimed('https://api.spotify.com/v1'+path,{
      method,headers:{Authorization:'Bearer '+bearer,...(body ? {'Content-Type':'application/json'} : {})},...(body ? {body:JSON.stringify(body)} : {})
    });
    const data = response.status === 204 ? null : await response.json().catch(()=>null);
    return {response,data};
  }
  async function request(path, method='GET', body) {
    const clientId = currentClientId(), epoch = generation, revision = get(keys.revision);
    const checkCurrent = () => {
      if (epoch !== generation || revision !== get(keys.revision) || clientId !== currentClientId()) throw coded('De Spotify-koppeling is gewijzigd.','SPOTIFY_TEMPORARY');
    };
    let bearer = await token();
    checkCurrent();
    let result = await api(path,method,body,bearer);
    checkCurrent();
    if (result.response.status === 401) {
      bearer = get(keys.access) !== bearer && get(keys.access) ? await token() : await token(true);
      checkCurrent();
      result = await api(path,method,body,bearer);
      checkCurrent();
    }
    const {response,data} = result;
    if (response.ok) return data;
    const status = response.status, reason = String(data?.error?.reason || '').toUpperCase();
    const message = data?.error?.message || 'Spotify weigerde deze actie.';
    const detail = {status,reason,path:path.split('?')[0]};
    if (status === 401) throw invalidate('SPOTIFY_SESSION_EXPIRED','Spotify accepteert de vernieuwde aanmelding niet. Log opnieuw in.');
    if (status === 403) {
      if (path === '/me' && method === 'GET') throw invalidate('SPOTIFY_ACCESS_INVALID','Spotify weigert toegang tot deze koppeling. Controleer het account en Users Management.');
      // Een endpoint-specifieke 403 bewijst niet dat de koppeling is ingetrokken.
      // Controleer het profiel; alleen een bevestigde auth-fout mag tokens wissen.
      await request('/me');
      checkCurrent();
      if (path.startsWith('/me/player') && ['NO_ACTIVE_DEVICE','DEVICE_NOT_FOUND'].includes(reason)) throw coded('Het Spotify-afspeelapparaat is niet beschikbaar.','SPOTIFY_DEVICE_UNAVAILABLE',detail);
      if (path.startsWith('/me/player')) throw coded('Spotify weigert de afspeelactie: '+message,'SPOTIFY_PLAYBACK_FORBIDDEN',detail);
      throw coded('Spotify weigert deze functie: '+message,'SPOTIFY_FORBIDDEN',detail);
    }
    if (status === 404 && path.startsWith('/me/player')) throw coded('Het Spotify-afspeelapparaat is niet beschikbaar. Verbind de speler opnieuw.','SPOTIFY_DEVICE_UNAVAILABLE',detail);
    if (status === 404 && path.startsWith('/tracks/')) throw coded('Dit nummer is niet beschikbaar.','TRACK_NOT_FOUND',detail);
    if (status === 429) throw coded('Spotify ontvangt te veel verzoeken. Probeer later opnieuw.','SPOTIFY_RATE_LIMIT',{...detail,retryAfter:response.headers.get('Retry-After')});
    if (status >= 500) throw coded('Spotify heeft tijdelijk een serverprobleem. Probeer opnieuw.','SPOTIFY_TEMPORARY',detail);
    throw coded(message,'SPOTIFY_REQUEST_FAILED',detail);
  }
  async function login(options = {}) {
    const source = options.source || clientSource();
    if (!['default','own','shared'].includes(source)) throw coded('Ongeldige koppeling.','SPOTIFY_CONFIGURATION');
    const clientId = source === 'default' ? defaultClientId : String(options.clientId ?? currentClientId()).trim();
    if (!validClient(clientId)) throw coded('Vul een geldige Spotify Client ID in.','SPOTIFY_CONFIGURATION');
    const verifier = random(64), state = random(24);
    const challenge = base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    sessionStorage.setItem(pendingKey,JSON.stringify({clientId,source,verifier,state,created:Date.now(),revision:get(keys.revision)}));
    const params = new URLSearchParams({
      client_id:clientId,response_type:'code',redirect_uri:redirectUri,code_challenge_method:'S256',code_challenge:challenge,state,scope:requiredScopes,show_dialog:'true'
    });
    window.location.assign('https://accounts.spotify.com/authorize?'+params);
  }
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') && !params.has('error')) return null;
    history.replaceState({},document.title,redirectUri);
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch (_) {}
    // Legacy OAuth in progress is deliberately not accepted after this upgrade.
    if (!pending || params.get('state') !== pending.state || Date.now()-pending.created > 30*60*1000) throw coded('De Spotify-aanmelding kon niet veilig worden gecontroleerd. Probeer opnieuw.','SPOTIFY_CALLBACK');
    clearPending();
    if (params.has('error')) throw coded('Spotify-aanmelding geannuleerd of geweigerd.','SPOTIFY_CALLBACK');
    if (pending.revision !== get(keys.revision)) throw coded('Je aanmelding is ondertussen gewijzigd. Start de koppeling opnieuw.','SPOTIFY_CALLBACK');
    const data = await tokenRequest({client_id:pending.clientId,grant_type:'authorization_code',code:params.get('code'),redirect_uri:redirectUri,code_verifier:pending.verifier});
    if (!data?.access_token || !data?.refresh_token) throw coded('Spotify gaf geen volledige nieuwe aanmelding terug.','SPOTIFY_CALLBACK');
    // Verifieer de NIEUWE koppeling vóór de bestaande aanmelding te vervangen.
    const {response,data:profile} = await api('/me','GET',null,data.access_token);
    if (!response.ok || !profile?.id) throw coded(response.status === 403 ? 'Dit Spotify-account heeft geen toegang tot de gekozen Developer-koppeling. Controleer Users Management.' : 'De nieuwe Spotify-aanmelding kon niet worden gecontroleerd. Probeer opnieuw.','SPOTIFY_CALLBACK');
    if (pending.revision !== get(keys.revision)) throw coded('Je aanmelding is ondertussen gewijzigd. Start de koppeling opnieuw.','SPOTIFY_CALLBACK');
    if (typeof data.scope === 'string' && !requiredScopes.split(' ').every(scope => data.scope.split(/\s+/).includes(scope))) throw coded('Spotify heeft niet alle benodigde afspeelrechten gegeven. Bevestig de toestemmingen opnieuw.','SPOTIFY_CALLBACK');
    clearTokens();
    commitSource(pending.source,pending.clientId);
    save(data,pending.clientId,true);
    remove(keys.connectionIssue);
    return profile;
  }
  window.SpotifyApp = {
    configured:()=>validClient(currentClientId()),hasSession,hasRequiredScopes,connectionIssue,clear,login,
    reauthorize:()=>login(),token,request,handleCallback,profile:()=>request('/me'),
    redirectUri:()=>redirectUri,clientMode,clientSource,currentClientId
  };
})();
