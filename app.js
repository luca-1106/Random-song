(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const tracks = Array.isArray(window.TRACKS) ? window.TRACKS.filter(track => track?.title && track?.artist) : [];
  const genreNames = { alles: 'Alle genres', pop: 'Pop', rock: 'Rock', nederlands: 'Nederlandstalig', guilty: 'Guilty Pleasures', yachterock: 'Yachtrock', soul: 'Soul & R&B', funkdisco: 'Funk & Disco', country: 'Country & Folk', gitaarmuziek: 'Gitaarmuziek', bluesjazzswing: 'Blues, Jazz & Swing' };
  const trackKey = track => `${track.title}\u0000${track.artist}`.toLocaleLowerCase('nl');
  const uniqueTracks = list => [...new Map(list.map(track => [trackKey(track), track])).values()];
  const libraryKeys = new Set(uniqueTracks(tracks).map(trackKey));
  let selectedGenres = ['alles'];
  const historyStorageKey = 'muziekmix.playedHistory.v1';
  const recentHistoryStorageKey = 'muziekmix.recentPlaybackHistory.v1';
  const readHistory = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.filter(value => typeof value === 'string' && value))] : [];
    } catch (_) {
      return [];
    }
  };
  const currentPlayedHistory = () => readHistory().filter(trackKeyValue => libraryKeys.has(trackKeyValue));
  const renderHistoryStatus = message => {
    const element = $('#historyStatus');
    const resetButton = $('#resetHistory');
    const playedCount = currentPlayedHistory().length;
    if (resetButton) resetButton.hidden = playedCount === 0;
    if (!element) return;
    element.textContent = message || (playedCount ? `${playedCount} nummers in je historie` : 'De volledige bibliotheek is beschikbaar');
  };

  const setError = message => { $('#errorMessage').textContent = message || ''; $('#errorMessage').hidden = !message; };
  const setStatus = (title, detail, active = false) => { $('#statusText').textContent = title; $('#instruction').textContent = detail; $('#statusDot').classList.toggle('active', active); };
  const selectedLabel = () => {
    if (selectedGenres.includes('alles')) return genreNames.alles;
    if (selectedGenres.length === 1) return genreNames[selectedGenres[0]];
    if (selectedGenres.length === 2) return selectedGenres.map(value => genreNames[value]).join(' + ');
    return `${selectedGenres.length} genres geselecteerd`;
  };
  const poolForGenres = genres => {
    const all = genres.includes('alles');
    const matching = all ? tracks.filter(track => track.includeInAll !== false) : tracks.filter(track => {
      const trackGenres = Array.isArray(track.genres) ? track.genres : [track.genre].filter(Boolean);
      return trackGenres.some(genre => genres.includes(genre));
    });
    return uniqueTracks(matching);
  };
  const pool = () => poolForGenres(selectedGenres);
  const availableCount = genres => {
    const played = new Set(readHistory());
    return poolForGenres(genres).filter(track => !played.has(trackKey(track))).length;
  };

  function renderGenres() {
    const available = availableCount(selectedGenres);
    $('#genreCount').textContent = `${available} beschikbaar`;
    $('#genreSelectionText').textContent = selectedLabel();
    document.querySelectorAll('#genreMenu input[type="checkbox"]').forEach(input => {
      input.checked = selectedGenres.includes(input.value);
      const option = input.closest('.genre-option');
      const count = option?.querySelector('.genre-available-count');
      if (count) count.textContent = String(availableCount([input.value]));
    });
  }

  function closeGenreMenu() {
    $('#genreMenu').hidden = true;
    $('#genreToggle').setAttribute('aria-expanded', 'false');
  }

  function renderConnection(profile) {
    const connected = Boolean(profile);
    const source = window.SpotifyApp.clientSource?.() || 'default';
    const sourceLabel = source === 'shared'
      ? 'Via een gedeelde Spotify Developer-koppeling.'
      : source === 'own'
        ? 'Via je eigen Spotify Developer-app.'
        : 'Via de ingebouwde Muziekmix-koppeling.';
    $('#connectionIcon').classList.toggle('connected', connected);
    $('#spotifyConnection').textContent = connected ? `Gekoppeld als ${profile.display_name || 'Spotify-gebruiker'}` : 'Spotify niet gekoppeld';
    $('#connectionDetail').textContent = connected ? sourceLabel : 'Kies een Developer-koppeling om Spotify te verbinden.';
    $('#connectSpotify').hidden = connected;
    $('#manageSpotify').hidden = !connected;
    $('#disconnectSpotify').hidden = !connected;
    $('#connectSpotify').disabled = false;
  }

  function openSpotifySetup() {
    const dialog = $('#spotifySetupDialog');
    if (!dialog) return;
    $('#spotifyRedirectUri').value = window.SpotifyApp.redirectUri?.() || '';
    const source = window.SpotifyApp.clientSource?.() || 'default';
    const currentClientId = window.SpotifyApp.currentClientId?.() || '';
    $('#spotifyClientIdInput').value = source === 'own' ? currentClientId : '';
    $('#sharedSpotifyClientIdInput').value = source === 'shared' ? currentClientId : '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeSpotifySetup() {
    const dialog = $('#spotifySetupDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  async function copySpotifyRedirect() {
    const input = $('#spotifyRedirectUri');
    const value = input?.value || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      input.focus();
      input.select();
      document.execCommand?.('copy');
      input.setSelectionRange(0, 0);
    }
    const button = $('#copySpotifyRedirect');
    const original = button.textContent;
    button.textContent = 'Gekopieerd';
    setTimeout(() => { button.textContent = original; }, 1400);
  }

  async function refreshConnection() {
    if (!window.SpotifyApp.hasSession()) return renderConnection(null);
    try { renderConnection(await window.SpotifyApp.profile()); }
    catch (_) { window.SpotifyApp.clear(); renderConnection(null); }
  }

  async function guarded(action) {
    try { setError(); await action(); }
    catch (error) { setError(error.message || 'Er ging iets mis.'); setStatus('Actie niet gelukt', 'Controleer de Spotify-koppeling en probeer opnieuw.'); }
  }

  $('#genreToggle').addEventListener('click', () => {
    const menu = $('#genreMenu');
    menu.hidden = !menu.hidden;
    $('#genreToggle').setAttribute('aria-expanded', String(!menu.hidden));
  });

  $('#genreMenu').addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;

    if (input.value === 'alles') {
      selectedGenres = input.checked ? ['alles'] : [];
    } else {
      selectedGenres = selectedGenres.filter(value => value !== 'alles');
      if (input.checked && !selectedGenres.includes(input.value)) selectedGenres.push(input.value);
      if (!input.checked) selectedGenres = selectedGenres.filter(value => value !== input.value);
    }

    if (!selectedGenres.length) selectedGenres = ['alles'];
    renderGenres();
    setStatus(`${selectedLabel()} geselecteerd`, 'Druk op Start sessie om door te gaan.');
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.genre-multi')) closeGenreMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeGenreMenu();
  });

  $('#resetHistory').addEventListener('click', () => {
    try {
      // Migratie voor oudere gebruikers: als de aparte recente historie nog
      // niet bestaat, bewaar dan eerst de laatste maximaal 100 bekende tracks.
      if (!localStorage.getItem(recentHistoryStorageKey)) {
        const fallbackRecent = readHistory().slice(-100);
        localStorage.setItem(recentHistoryStorageKey, JSON.stringify(fallbackRecent));
      }

      // Alleen de unieke "ooit afgespeeld"-historie wordt gewist.
      // De echte laatste 100 afspeelbeurten blijven behouden als recency-geheugen.
      localStorage.removeItem(historyStorageKey);
    } catch (_) {}
    renderGenres();
    renderHistoryStatus();
    setStatus('Bibliotheek vrijgegeven', 'Alle nummers kunnen opnieuw worden gekozen.');
  });

  $('#connectSpotify').addEventListener('click', openSpotifySetup);
  $('#manageSpotify').addEventListener('click', openSpotifySetup);
  $('#closeSpotifySetup').addEventListener('click', closeSpotifySetup);
  $('#spotifySetupDialog').addEventListener('cancel', event => {
    event.preventDefault();
    closeSpotifySetup();
  });
  $('#copySpotifyRedirect').addEventListener('click', () => guarded(copySpotifyRedirect));
  $('#useDefaultSpotifyApp').addEventListener('click', () => guarded(async () => {
    window.SpotifyApp.useDefaultClientId();
    closeSpotifySetup();
    await window.SpotifyApp.login();
  }));
  $('#connectCustomSpotifyApp').addEventListener('click', () => guarded(async () => {
    const clientId = $('#spotifyClientIdInput').value.trim();
    window.SpotifyApp.setCustomClientId(clientId, 'own');
    closeSpotifySetup();
    await window.SpotifyApp.login();
  }));

  $('#connectSharedSpotifyApp').addEventListener('click', () => guarded(async () => {
    const clientId = $('#sharedSpotifyClientIdInput').value.trim();
    window.SpotifyApp.setCustomClientId(clientId, 'shared');
    closeSpotifySetup();
    await window.SpotifyApp.login();
  }));

  $('#disconnectSpotify').addEventListener('click', () => {
    window.SpotifyApp.clear();
    renderConnection(null);
    setStatus('Spotify ontkoppeld', 'Koppel een account om een sessie te starten.');
  });

  $('#startSession').addEventListener('click', () => guarded(async () => {
    if (!window.SpotifyApp.hasSession()) {
      openSpotifySetup();
      return;
    }
    await window.SpotifyApp.token();
    sessionStorage.setItem('muziekmix.session.genres', JSON.stringify(selectedGenres));
    sessionStorage.removeItem('muziekmix.session.genre');
    window.location.assign('session.html?v=multi-genre-1');
  }));

  (async () => {
    renderGenres();
    renderHistoryStatus();
    $('#spotifyRedirectUri').value = window.SpotifyApp.redirectUri?.() || '';
    renderConnection(null);
    try { await window.SpotifyApp.handleCallback(); } catch (error) { setError(error.message); }
    await refreshConnection();
  })();
})();
