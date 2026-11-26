(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const genreNames = { alles: 'Alle genres', pop: 'Pop', rock: 'Rock', nederlands: 'Nederlandstalig', guilty: 'Guilty Pleasures', yachterock: 'Yachtrock', soul: 'Soul & R&B', funkdisco: 'Funk & Disco', country: 'Country & Folk', gitaarmuziek: 'Gitaarmuziek', bluesjazzswing: 'Blues, Jazz & Swing' };
  const legacyGenre = sessionStorage.getItem('muziekmix.session.genre');
  let selectedGenres = [];
  try {
    const stored = JSON.parse(sessionStorage.getItem('muziekmix.session.genres') || '[]');
    if (Array.isArray(stored)) selectedGenres = stored.filter(value => genreNames[value]);
  } catch (_) {}
  if (!selectedGenres.length && legacyGenre && genreNames[legacyGenre]) selectedGenres = [legacyGenre];
  if (selectedGenres.includes('alles')) selectedGenres = ['alles'];
  const sessionGenreLabel = () => {
    if (selectedGenres.includes('alles')) return genreNames.alles;
    if (selectedGenres.length === 1) return genreNames[selectedGenres[0]];
    if (selectedGenres.length === 2) return selectedGenres.map(value => genreNames[value]).join(' + ');
    return `${selectedGenres.length} genres`;
  };
  const sourceTracks = Array.isArray(window.TRACKS) ? window.TRACKS.filter(track => track?.title && track?.artist) : [];
  const key = track => `${track.title}\u0000${track.artist}`.toLocaleLowerCase('nl');
  const historyStorageKey = 'muziekmix.playedHistory.v1';
  const recentHistoryStorageKey = 'muziekmix.recentPlaybackHistory.v1';
  let memoryHistory = [];
  let memoryRecentHistory = [];
  const readHistory = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
      if (!Array.isArray(parsed)) return [...memoryHistory];
      const clean = [...new Set(parsed.filter(value => typeof value === 'string' && value))];
      memoryHistory = clean;
      return [...clean];
    } catch (_) {
      return [...memoryHistory];
    }
  };
  const writeHistory = history => {
    const clean = [...new Set(history.filter(value => typeof value === 'string' && value))];
    memoryHistory = clean;
    try { localStorage.setItem(historyStorageKey, JSON.stringify(clean)); } catch (_) {}
  };
  const readRecentHistory = () => {
    try {
      const raw = localStorage.getItem(recentHistoryStorageKey);
      if (!raw) {
        const seeded = readHistory().slice(-100);
        memoryRecentHistory = seeded;
        return [...seeded];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...memoryRecentHistory];
      const clean = parsed.filter(value => typeof value === 'string' && value).slice(-100);
      memoryRecentHistory = clean;
      return [...clean];
    } catch (_) {
      return memoryRecentHistory.length ? [...memoryRecentHistory] : readHistory().slice(-100);
    }
  };
  const writeRecentHistory = history => {
    const clean = history.filter(value => typeof value === 'string' && value).slice(-100);
    memoryRecentHistory = clean;
    try { localStorage.setItem(recentHistoryStorageKey, JSON.stringify(clean)); } catch (_) {}
  };
  const rememberPlayed = track => {
    const trackKey = key(track);

    // Lees de recente eventhistorie vóórdat de unieke historie wordt bijgewerkt.
    // Zo wordt bij migratie vanaf een oudere versie de huidige afspeelbeurt
    // niet zowel via de seed als via de nieuwe event-entry toegevoegd.
    const recent = readRecentHistory();

    // Unieke historie voor de vraag: is dit nummer ooit eerder afgespeeld?
    const history = readHistory().filter(value => value !== trackKey);
    history.push(trackKey);
    writeHistory(history);

    // Aparte eventhistorie voor exact de laatste 100 afspeelbeurten.
    recent.push(trackKey);
    writeRecentHistory(recent);
  };
  const normalise = value => String(value || '').toLocaleLowerCase('nl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const normaliseTitle = value => normalise(value)
    .replace(/\b\d{4}\s+remaster(?:ed)?\b/g, '')
    .replace(/\bremaster(?:ed)?(?:\s+\d{4})?\b/g, '')
    .replace(/\b(?:radio|single|album)\s+(?:edit|version|mix)\b/g, '')
    .replace(/\boriginal\s+(?:version|mix|recording)\b/g, '')
    .replace(/\s+/g, ' ').trim();
  const normaliseArtist = value => normalise(value).replace(/^the\s+/, '').replace(/\s+(feat|featuring|ft)\s+.*$/, '').trim();
  const overlap = (left, right) => { const wanted = new Set(left.split(' ').filter(Boolean)); const found = new Set(right.split(' ').filter(Boolean)); return wanted.size ? [...wanted].filter(word => found.has(word)).length / wanted.size : 0; };
  const tracksForGenres = selected => {
    const all = selected.includes('alles');
    const matching = all ? sourceTracks.filter(track => track.includeInAll !== false) : sourceTracks.filter(track => {
      const genres = Array.isArray(track.genres) ? track.genres : [track.genre].filter(Boolean);
      return genres.some(genre => selected.includes(genre));
    });
    return [...new Map(matching.map(track => [key(track), track])).values()];
  };
  const allGenreKeys = ['pop', 'rock', 'nederlands', 'guilty', 'yachterock', 'soul', 'funkdisco', 'country', 'gitaarmuziek', 'bluesjazzswing'];
  const similarGenres = {
    pop: ['guilty', 'soul', 'funkdisco', 'yachterock', 'gitaarmuziek', 'rock', 'nederlands', 'country', 'bluesjazzswing'],
    rock: ['gitaarmuziek', 'yachterock', 'bluesjazzswing', 'pop', 'country', 'guilty', 'soul', 'funkdisco', 'nederlands'],
    nederlands: ['guilty', 'pop', 'gitaarmuziek', 'rock', 'country', 'yachterock', 'soul', 'funkdisco', 'bluesjazzswing'],
    guilty: ['pop', 'funkdisco', 'nederlands', 'yachterock', 'rock', 'soul', 'gitaarmuziek', 'country', 'bluesjazzswing'],
    yachterock: ['gitaarmuziek', 'pop', 'rock', 'soul', 'funkdisco', 'bluesjazzswing', 'guilty', 'country', 'nederlands'],
    soul: ['funkdisco', 'bluesjazzswing', 'pop', 'guilty', 'yachterock', 'gitaarmuziek', 'rock', 'country', 'nederlands'],
    funkdisco: ['soul', 'pop', 'guilty', 'bluesjazzswing', 'yachterock', 'rock', 'gitaarmuziek', 'country', 'nederlands'],
    country: ['gitaarmuziek', 'rock', 'yachterock', 'bluesjazzswing', 'pop', 'guilty', 'soul', 'nederlands', 'funkdisco'],
    gitaarmuziek: ['rock', 'country', 'yachterock', 'pop', 'bluesjazzswing', 'guilty', 'soul', 'nederlands', 'funkdisco'],
    bluesjazzswing: ['soul', 'rock', 'gitaarmuziek', 'yachterock', 'country', 'funkdisco', 'pop', 'guilty', 'nederlands']
  };
  const genresOf = track => Array.isArray(track.genres) ? track.genres : [track.genre].filter(Boolean);
  const tracksForGenre = genre => sourceTracks.filter(track => genresOf(track).includes(genre));
  const mergeTracks = (...lists) => [...new Map(lists.flat().map(track => [key(track), track])).values()];
  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  let tracks = tracksForGenres(selectedGenres);
  const initialGenres = selectedGenres.includes('alles') ? [] : [...selectedGenres];
  const activeGenres = new Set(initialGenres);
  const historyAtSessionStart = new Set(readHistory());
  const startedWithNoFreshSelected = tracksForGenres(selectedGenres).every(track => historyAtSessionStart.has(key(track)));
  let repeatMode = false;
  let expandedAllMode = false;
  let repeatSource = '';
  let sessionRepeatUnlocked = false;
  let recent100RelaxedForUnused = false;
  let selectedHistoryChoice = startedWithNoFreshSelected ? 'stay' : '';
  let noticeTimer;
  let actionInProgress = false;
  let spotifyAccessLossHandled = false;
  const spotifyIssueStorageKey = 'muziekmix.spotify.connectionIssue';
  let player, browserDeviceId = '', pendingTrack, currentTrack, playerState, stateUpdatedAt = 0, used = new Set(), unavailable = new Set(), isPlaying = false, progressTimer;

  const setError = message => { $('#errorMessage').textContent = message || ''; $('#errorMessage').hidden = !message; };
  const setStatus = (title, detail, active = false) => { $('#statusText').textContent = title; $('#instruction').textContent = detail; $('#statusDot').classList.toggle('active', active); };
  const showSessionNotice = message => {
    const notice = $('#sessionNotice');
    if (!notice) return;
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 9000);
  };

  const selectedSessionUnused = () => tracksForGenres(selectedGenres).filter(track =>
    !used.has(key(track)) &&
    !unavailable.has(key(track))
  );

  const askSelectedGenreHistoryChoice = nextLabel => new Promise(resolve => {
    const dialog = $('#genreChoiceDialog');
    const text = $('#genreChoiceText');
    const stay = $('#stayInGenres');
    const switchButton = $('#switchGenre');
    const selectedLabel = sessionGenreLabel();

    text.textContent = `Alle nummers binnen ${selectedLabel} die je nog nooit eerder hebt gehoord, zijn gespeeld. Er zijn wel nog nummers uit ${selectedLabel} over die je deze sessie nog niet hebt gehoord.`;
    switchButton.textContent = nextLabel ? `Ga verder met ${nextLabel}` : 'Ga verder met nieuwe muziek';

    if (typeof dialog.showModal !== 'function') {
      resolve(window.confirm(`${text.textContent}\n\nOK = blijf bij je gekozen genres. Annuleren = ga verder met nieuwe muziek.`) ? 'stay' : 'switch');
      return;
    }

    const preventCancel = event => event.preventDefault();
    const finish = choice => {
      stay.removeEventListener('click', chooseStay);
      switchButton.removeEventListener('click', chooseSwitch);
      dialog.removeEventListener('cancel', preventCancel);
      if (dialog.open) dialog.close();
      resolve(choice);
    };
    const chooseStay = () => finish('stay');
    const chooseSwitch = () => finish('switch');

    stay.addEventListener('click', chooseStay);
    switchButton.addEventListener('click', chooseSwitch);
    dialog.addEventListener('cancel', preventCancel);
    dialog.showModal();
  });
  const buttonIcons = {
    play: '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>'
  };
  const setPauseButton = (icon, label) => { $('#pauseButton').innerHTML = `<span class="button-icon" aria-hidden="true">${buttonIcons[icon]}</span><span>${label}</span>`; };
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const updateCount = () => { $('#sessionCount').textContent = `${used.size} uniek`; };
  function updateProgress() { if (!playerState) return; const duration = Math.max(1, (playerState.duration || currentTrack?.duration_ms || 0) / 1000); const elapsed = (playerState.position || 0) / 1000 + (isPlaying ? (Date.now() - stateUpdatedAt) / 1000 : 0); const percentage = Math.min(100, elapsed / duration * 100); $('#progressBar').style.width = `${percentage}%`; $('.progress-track').setAttribute('aria-valuenow', String(Math.round(percentage))); }
  function startTimer() { clearInterval(progressTimer); updateProgress(); progressTimer = setInterval(updateProgress, 500); }
  function score(item, source) {
    const wantedTitle = normaliseTitle(source.title), foundTitle = normaliseTitle(item.name);
    const wantedArtist = normaliseArtist(source.artist);
    const artistNames = item.artists?.map(person => normaliseArtist(person.name)) || [];
    const combinedArtists = normaliseArtist(item.artists?.map(person => person.name).join(' ') || '');
    const titleMatch = wantedTitle === foundTitle ? 100 : (overlap(wantedTitle, foundTitle) >= 0.8 && overlap(foundTitle, wantedTitle) >= 0.6 ? 70 : 0);
    const artistMatch = artistNames.includes(wantedArtist) || combinedArtists === wantedArtist ? 50 : (overlap(wantedArtist, combinedArtists) >= 0.8 && overlap(combinedArtists, wantedArtist) >= 0.6 ? 35 : 0);
    const candidateVersionText = normalise(`${item.name} ${item.album?.name || ''}`);
    const unwantedVersion = /(live|karaoke|tribute|cover|instrumental|re recorded)/.test(candidateVersionText) && !/(live|karaoke|tribute|cover|instrumental|re recorded)/.test(wantedTitle);
    const extendedVersion = /(extended(?: version| mix)?|12 inch(?: version| mix)?|12in(?:ch)?(?: version| mix)?|long version|long mix|maxi(?: version| mix)?|club mix|full length version)/.test(candidateVersionText);
    const wantedYear = Number(source.year) || 0;
    const foundYear = Number(String(item.album?.release_date || '').match(/\d{4}/)?.[0]) || 0;
    const yearDifference = wantedYear && foundYear ? Math.abs(wantedYear - foundYear) : Infinity;
    const yearMatch = yearDifference === 0 ? 40 : yearDifference === 1 ? 30 : yearDifference === 2 ? 20 : yearDifference <= 5 ? 10 : 0;
    return titleMatch && artistMatch && !unwantedVersion && !extendedVersion ? titleMatch + artistMatch + yearMatch : -Infinity;
  }
  async function resolve(source) {
    if (source.spotifyUri?.startsWith('spotify:track:')) {
      try {
        const exact = await window.SpotifyApp.request(`/tracks/${encodeURIComponent(source.spotifyUri.slice(14))}`);
        if (exact?.uri && exact.is_playable !== false) return exact;
      } catch(error) { if(error.code !== 'TRACK_NOT_FOUND') throw error; }
    }
    const queries = [`track:${source.title} artist:${source.artist}`, `${source.title} ${source.artist}`];
    for (const query of queries) {
      const result = await window.SpotifyApp.request(`/search?q=${encodeURIComponent(query)}&type=track&limit=10`);
      const found = (result?.tracks?.items || []).filter(item=>item?.uri && item.is_playable !== false).map(item => ({ item, score: score(item, source) })).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score)[0]?.item;
      if (found) return found;
    }
    const error = new Error(`Geen betrouwbare Spotify-versie gevonden voor ${source.title} van ${source.artist}.`);
    error.code = 'TRACK_NOT_FOUND';
    throw error;
  }
  function renderTrack(spotifyTrack, sourceTrack, revealArtwork = false) {
    const genreElement = $('#trackGenres');
    const labels = allGenreKeys.filter(genre => genresOf(sourceTrack).includes(genre)).map(genre => genreNames[genre]);
    genreElement.textContent = labels.length ? `${labels.length === 1 ? 'Genre' : 'Genres'}: ${labels.join(' · ')}` : '';
    genreElement.hidden = true;

    $('#trackTitle').textContent = sourceTrack.title;
    const artistElement = $('#trackArtist');
    const creditedArtists = (spotifyTrack.artists || []).map(artist => artist?.name).filter(Boolean);
    const hasMultipleArtists = creditedArtists.length > 1;
    artistElement.textContent = hasMultipleArtists ? creditedArtists.join(', ') : sourceTrack.artist;
    artistElement.classList.toggle('multiple-artists', hasMultipleArtists);

    const year = String(sourceTrack.year || spotifyTrack.album?.release_date || '').match(/\d{4}/)?.[0] || '';
    $('#trackYear').textContent = year;
    $('#trackYear').hidden = !year;

    const albumArt = $('#albumArt');
    const image = spotifyTrack.album?.images?.[0]?.url || '';
    albumArt.dataset.available = String(Boolean(image));
    albumArt.hidden = !revealArtwork || !image;
    $('#albumFallback').hidden = revealArtwork && Boolean(image);
    if (image) {
      albumArt.src = image;
      albumArt.alt = `Albumhoes: ${spotifyTrack.album?.name || sourceTrack.title}`;
    } else {
      albumArt.removeAttribute('src');
      albumArt.alt = '';
    }
  }
  const freshFrom = (pool, historySet) => pool.filter(track =>
    !used.has(key(track)) &&
    !unavailable.has(key(track)) &&
    !historySet.has(key(track))
  );

  const preferOutsideRecent100 = candidates => {
    const recent100 = new Set(readRecentHistory());
    const nonRecent = candidates.filter(track => !recent100.has(key(track)));
    return shuffle(nonRecent.length ? nonRecent : candidates);
  };

  const closestGenreWithFreshTracks = historySet => {
    const candidates = allGenreKeys
      .filter(genre => !activeGenres.has(genre))
      .map(genre => {
        const freshCount = freshFrom(tracksForGenre(genre), historySet).length;
        if (!freshCount) return null;
        const bases = initialGenres.length ? initialGenres : [...activeGenres];
        const score = bases.length
          ? bases.reduce((total, base) => {
              const order = similarGenres[base] || [];
              const index = order.indexOf(genre);
              return total + (index === -1 ? 99 : index + 1);
            }, 0) / bases.length
          : 99;
        return { genre, score, freshCount };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || b.freshCount - a.freshCount || a.genre.localeCompare(b.genre));
    return candidates[0]?.genre || '';
  };

  const expandToFreshGenre = historySet => {
    if (selectedGenres.includes('alles')) {
      if (expandedAllMode) return false;
      const remaining = freshFrom(sourceTracks, historySet);
      if (!remaining.length) return false;
      tracks = mergeTracks(tracks, remaining);
      expandedAllMode = true;
      updateCount();
      showSessionNotice('Alle nog niet afgespeelde nummers uit Alles zijn gespeeld. We gaan verder met de overige nummers uit de muziekbibliotheek.');
      return true;
    }

    const nextGenre = closestGenreWithFreshTracks(historySet);
    if (!nextGenre) return false;
    const firstFallback = activeGenres.size === initialGenres.length;
    activeGenres.add(nextGenre);
    tracks = mergeTracks(tracks, tracksForGenre(nextGenre));
    updateCount();
    showSessionNotice(firstFallback
      ? `Alle nog niet afgespeelde nummers in de geselecteerde genres zijn gespeeld. We gaan verder met ${genreNames[nextGenre]}.`
      : `De nog niet afgespeelde nummers in de huidige mix zijn op. We gaan verder met ${genreNames[nextGenre]}.`);
    return true;
  };

  const enterRepeatMode = () => {
    if (!repeatMode) {
      repeatMode = true;
      tracks = tracksForGenres(selectedGenres);
      updateCount();
      showSessionNotice('Alle nummers in de volledige muziekbibliotheek zijn minstens één keer gespeeld. Binnen je gekozen genres worden nummers weer beschikbaar zolang ze deze sessie nog niet zijn gespeeld. Bij uitwijken naar andere genres blijven de laatste 100 afspeelbeurten geblokkeerd.');
    }
  };

  const repeatCandidatesFrom = (pool, recent100, allowUsed = false) => shuffle(pool.filter(track =>
    !unavailable.has(key(track)) &&
    !recent100.has(key(track)) &&
    (allowUsed || !used.has(key(track)))
  ));

  const repeatFallbackOrder = () => allGenreKeys
    .filter(genre => !initialGenres.includes(genre))
    .map(genre => {
      const bases = initialGenres.length ? initialGenres : allGenreKeys;
      const score = bases.reduce((total, base) => {
        const order = similarGenres[base] || [];
        const index = order.indexOf(genre);
        return total + (index === -1 ? 99 : index + 1);
      }, 0) / bases.length;
      return { genre, score };
    })
    .sort((a, b) => a.score - b.score || a.genre.localeCompare(b.genre))
    .map(item => item.genre);

  const pickResolved = async candidates => {
    for (const source of candidates) {
      try {
        const spotify = await resolve(source);
        pendingTrack = { source, spotify };
        return true;
      } catch (error) {
        if (error.code !== 'TRACK_NOT_FOUND') throw error;
        unavailable.add(key(source));
      }
    }
    return false;
  };

  async function prepareRepeatTrack() {
    while (true) {
      const history = readHistory();
      const historySet = new Set(history);
      const recent100 = new Set(readRecentHistory());
      const primaryPool = tracksForGenres(selectedGenres);

      // Binnen de gekozen genres hebben nummers die nog nooit in de globale
      // afspeelgeschiedenis staan altijd absolute voorrang. Pas daarna komen
      // eerder gespeelde nummers aan bod. Binnen de gekozen genres geldt de
      // laatste-100-regel niet; wel mag een nummer maar één keer per sessie.
      const primaryFresh = preferOutsideRecent100(primaryPool.filter(track =>
        !used.has(key(track)) &&
        !unavailable.has(key(track)) &&
        !historySet.has(key(track))
      ));
      const primaryUnused = repeatCandidatesFrom(primaryPool, new Set());
      const primaryNonRecent = primaryUnused.filter(track => !recent100.has(key(track)));
      const primaryCandidates = primaryFresh.length
        ? primaryFresh
        : (primaryNonRecent.length ? shuffle(primaryNonRecent) : primaryUnused);

      if (primaryCandidates.length) {
        if (repeatSource && repeatSource !== 'primary') {
          showSessionNotice('Er zijn weer nog niet in deze sessie afgespeelde nummers uit je oorspronkelijk gekozen genres beschikbaar. We gaan daar verder.');
        }
        repeatSource = 'primary';
        tracks = primaryPool;
        updateCount();
        if (await pickResolved(primaryCandidates)) return;
        continue;
      }

      if (selectedGenres.includes('alles')) {
        const otherCandidates = repeatCandidatesFrom(sourceTracks.filter(track => track.includeInAll === false), recent100);
        if (otherCandidates.length) {
          if (repeatSource !== 'other-library') {
            showSessionNotice('De nog beschikbare nummers uit Alles zijn in deze sessie gespeeld of tijdelijk geblokkeerd. We gaan verder met de overige muziekbibliotheek.');
          }
          repeatSource = 'other-library';
          tracks = mergeTracks(primaryPool, sourceTracks.filter(track => track.includeInAll === false));
          updateCount();
          if (await pickResolved(otherCandidates)) return;
          continue;
        }
      } else {
        for (const genre of repeatFallbackOrder()) {
          const candidates = repeatCandidatesFrom(tracksForGenre(genre), recent100);
          if (!candidates.length) continue;
          if (repeatSource !== genre) {
            showSessionNotice(`Binnen je gekozen genres is momenteel geen nieuw nummer voor deze sessie beschikbaar. We gaan verder met ${genreNames[genre]}.`);
          }
          repeatSource = genre;
          tracks = mergeTracks(primaryPool, tracksForGenre(genre));
          updateCount();
          if (await pickResolved(candidates)) return;
        }
      }

      const anywhereUnused = repeatCandidatesFrom(sourceTracks, recent100);
      if (anywhereUnused.length) {
        if (repeatSource !== 'other-library') {
          showSessionNotice('Binnen de gekozen en verwante genres is momenteel niets beschikbaar. We gaan verder met andere nummers uit de muziekbibliotheek.');
        }
        repeatSource = 'other-library';
        tracks = mergeTracks(sourceTracks);
        updateCount();
        if (await pickResolved(anywhereUnused)) return;
        continue;
      }

      // Een sessiedubbel is pas toegestaan als ieder beschikbaar nummer in
      // deze sessie minstens één keer is gebruikt. Door een handmatige
      // bibliotheek-reset kan een nog ongebruikt nummer nog in de recente 100
      // staan; in dat uitzonderlijke geval gaat sessie-uniciteit vóór recency.
      const unusedEvenIfRecent = shuffle(sourceTracks.filter(track =>
        !unavailable.has(key(track)) &&
        !used.has(key(track))
      ));
      if (unusedEvenIfRecent.length) {
        if (!recent100RelaxedForUnused) {
          recent100RelaxedForUnused = true;
          showSessionNotice('Om een dubbel nummer in deze sessie te voorkomen, kan nu een recent afgespeeld nummer terugkomen. Nog niet in deze sessie gespeelde nummers blijven voorrang houden.');
        }
        repeatSource = 'recent-unused';
        tracks = mergeTracks(sourceTracks);
        updateCount();
        if (await pickResolved(unusedEvenIfRecent)) return;
        continue;
      }

      // Pas als ieder beschikbaar nummer ook binnen de huidige sessie is
      // gebruikt, mag een nummer binnen dezelfde sessie opnieuw voorkomen.
      // Dan blijft de laatste-100-regel als harde grens gelden.
      const replayCandidates = repeatCandidatesFrom(sourceTracks, recent100, true);
      if (!replayCandidates.length) {
        throw new Error('Er zijn tijdelijk geen nummers beschikbaar buiten de laatste 100 afgespeelde nummers.');
      }
      if (!sessionRepeatUnlocked) {
        sessionRepeatUnlocked = true;
        showSessionNotice('Ook binnen deze sessie zijn alle beschikbare nummers gespeeld. Nummers kunnen opnieuw voorkomen, maar nooit binnen de laatste 100 afspeelbeurten.');
      }
      repeatSource = 'session-repeat';
      tracks = mergeTracks(sourceTracks);
      updateCount();
      if (await pickResolved(replayCandidates)) return;
    }
  }

  async function prepareTrack() {
    if (repeatMode) return prepareRepeatTrack();

    while (true) {
      const history = readHistory();
      const historySet = new Set(history);
      const fresh = freshFrom(tracks, historySet);

      if (fresh.length) {
        if (await pickResolved(preferOutsideRecent100(fresh))) return;
        continue;
      }

      // Alleen als de sessie met minstens één wereldwijd nieuw nummer in de
      // oorspronkelijk gekozen genres begon, kan het opraken daarvan later
      // een keuze opleveren. Begon de sessie al met 0 nieuwe nummers, dan
      // blijft de app bewust in de gekozen genres zonder keuzevenster.
      const stillInOriginalPool = activeGenres.size === initialGenres.length && !expandedAllMode;
      const selectedUnused = selectedSessionUnused();
      const selectedFresh = freshFrom(tracksForGenres(selectedGenres), historySet);
      const globallyFresh = freshFrom(sourceTracks, historySet);

      if (
        stillInOriginalPool &&
        !selectedFresh.length &&
        selectedUnused.length &&
        globallyFresh.length &&
        !selectedHistoryChoice
      ) {
        const nextGenre = selectedGenres.includes('alles') ? '' : closestGenreWithFreshTracks(historySet);
        const nextLabel = nextGenre ? genreNames[nextGenre] : 'nieuwe muziek';
        selectedHistoryChoice = await askSelectedGenreHistoryChoice(nextLabel);
      }

      if (selectedHistoryChoice === 'stay' && stillInOriginalPool) {
        const historicalSelected = selectedSessionUnused().filter(track => historySet.has(key(track)));
        const preferredHistorical = preferOutsideRecent100(historicalSelected);
        if (preferredHistorical.length) {
          tracks = tracksForGenres(selectedGenres);
          updateCount();
          if (await pickResolved(preferredHistorical)) return;
          continue;
        }
        // Alle nummers uit de gekozen genres zijn nu ook in deze sessie
        // gebruikt. Vanaf hier mag niet opnieuw binnen hetzelfde genre worden
        // herhaald zolang elders nog sessie-ongebruikte muziek bestaat.
        selectedHistoryChoice = 'switch';
        if (!selectedGenres.includes('alles')) {
          showSessionNotice('Alle nummers uit je gekozen genres zijn deze sessie gespeeld. We gaan verder met het meest verwante genre met beschikbare nummers.');
        }
      }

      if (expandToFreshGenre(historySet)) continue;

      const remainingGlobalFresh = freshFrom(sourceTracks, historySet);
      if (remainingGlobalFresh.length) {
        tracks = mergeTracks(tracks, remainingGlobalFresh);
        updateCount();
        showSessionNotice('De huidige genres hebben geen nog nooit afgespeelde nummers meer. We gaan verder met overige nieuwe nummers uit de muziekbibliotheek.');
        continue;
      }

      enterRepeatMode();
      return prepareRepeatTrack();
    }
  }
  const playerError = (message,code) => Object.assign(new Error(message),{code});
  const isSpotifyAccessError = error =>
    error?.code === 'SPOTIFY_ACCESS_INVALID' || error?.code === 'SPOTIFY_SESSION_EXPIRED';
  let playerGeneration = 0;
  let playerReady = false;
  let resumeAfterReconnect = false;
  let sessionLeaving = false;
  let sdkCheck = null;
  let lastPosition = 0;

  function syncPlayerControls() {
    const ready = playerReady && Boolean(browserDeviceId) && !sessionLeaving;
    $('#startPlayback').disabled = !ready || actionInProgress;
    $('#pauseButton').disabled = !ready || !currentTrack || actionInProgress;
    $('#nextButton').disabled = !ready || !currentTrack || actionInProgress;
    $('#retryPlayer').disabled = actionInProgress || sessionLeaving;
    $('#startPlayback').hidden = Boolean(currentTrack);
    if (ready && !currentTrack && !pendingTrack) $('#startPlayback').disabled = true;
  }
  function showRetry(message, title = 'Spotify-speler opnieuw verbinden') {
    if (sessionLeaving) return;
    setError(message);
    setStatus(title,'Probeer de speler opnieuw te verbinden. Je afspeelhistorie blijft behouden.');
    $('#retryPlayer').hidden = false;
    syncPlayerControls();
  }
  function disconnectPlayer() {
    playerGeneration++;
    playerReady = false;
    browserDeviceId = '';
    if (currentTrack) {
      if (playerState?.track_window?.current_track?.uri === currentTrack.uri) {
        const estimate = (Number(playerState.position)||0) + (isPlaying ? Math.max(0,Date.now()-stateUpdatedAt) : 0);
        lastPosition = Math.max(0,Math.min(estimate,Math.max(0,(Number(playerState.duration)||Number(currentTrack.duration_ms)||estimate+1000)-1000)));
      }
      resumeAfterReconnect = true;
      setPauseButton('play','Verder luisteren');
    }
    const previous = player;
    player = null;
    playerState = null;
    isPlaying = false;
    clearInterval(progressTimer);
    try { previous?.disconnect(); } catch (_) {}
    syncPlayerControls();
  }
  function clearSessionSelection() {
    sessionStorage.removeItem('muziekmix.session.genre');
    sessionStorage.removeItem('muziekmix.session.genres');
  }
  function handleSpotifyAccessLoss() {
    if (spotifyAccessLossHandled || sessionLeaving) return;
    spotifyAccessLossHandled = true;
    sessionLeaving = true;
    // SpotifyApp already invalidated only its authorization tokens.
    // Do not call clear(): it would remove the persistent recovery reason.
    clearSessionSelection();
    disconnectPlayer();
    window.location.replace('index.html');
  }
  async function verifySdkAccess() {
    if (sdkCheck) return sdkCheck;
    const job = (async()=>{
      try { await window.SpotifyApp.profile(); }
      catch(error) {
        if (isSpotifyAccessError(error)) handleSpotifyAccessLoss();
        // A temporary verification failure is not proof of revocation.
      }
    })();
    sdkCheck = job;
    try { await job; } finally { if (sdkCheck === job) sdkCheck = null; }
  }
  async function guarded(action) {
    if (actionInProgress || sessionLeaving) return;
    actionInProgress = true;
    syncPlayerControls();
    try {
      setError();
      await action();
    } catch (error) {
      if (isSpotifyAccessError(error)) { handleSpotifyAccessLoss(); return; }
      if (sessionLeaving) return;
      if (error.code === 'SPOTIFY_DEVICE_UNAVAILABLE' || error.code === 'SPOTIFY_PLAYER_AUTH_ERROR' || error.code === 'SPOTIFY_PREMIUM_REQUIRED') {
        disconnectPlayer();
        showRetry(error.message);
        if (error.code !== 'SPOTIFY_DEVICE_UNAVAILABLE') await verifySdkAccess();
        return;
      }
      setError(error.message || 'Er ging iets mis.');
      if (!playerReady || (!currentTrack && !pendingTrack)) {
        showRetry(error.message || 'De speler kon niet worden voorbereid.');
      } else {
        setStatus('Afspelen niet gelukt','Probeer dezelfde actie opnieuw. Je Spotify-aanmelding blijft bewaard.');
      }
    } finally {
      actionInProgress = false;
      syncPlayerControls();
    }
  }
  async function waitForSdk() {
    if (window.Spotify?.Player) return;
    await new Promise((resolve,reject)=>{
      let done=false;
      const script=document.createElement('script');
      const finish=error=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        clearInterval(poll);
        script.onerror=null;
        if(error){script.remove();reject(error);}else resolve();
      };
      const failure=()=>finish(playerError('De Spotify-browserplayer kon niet worden geladen. Controleer je internetverbinding en eventuele blokkades.','SPOTIFY_DEVICE_UNAVAILABLE'));
      const timer=setTimeout(failure,12000);
      const poll=setInterval(()=>{if(window.Spotify?.Player)finish();},100);
      window.onSpotifyWebPlaybackSDKReady=()=>{if(window.Spotify?.Player)finish();};
      script.src='https://sdk.scdn.co/spotify-player.js';
      script.async=true;
      script.onerror=failure;
      document.head.appendChild(script);
    });
  }
  async function initialisePlayer() {
    disconnectPlayer();
    await waitForSdk();
    if (sessionLeaving) return;
    const epoch = playerGeneration;
    await new Promise((resolve,reject)=>{
      let settled = false;
      const active = () => epoch === playerGeneration && !sessionLeaving;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(()=>finish(playerError('De Spotify-speler reageert niet. Probeer opnieuw te verbinden.','SPOTIFY_DEVICE_UNAVAILABLE')),18000);
      function fail(error) {
        if (!active()) return;
        if (!settled) { finish(error); return; }
        if (isSpotifyAccessError(error)) { handleSpotifyAccessLoss(); return; }
        disconnectPlayer();
        showRetry(error.message);
        if (error.code === 'SPOTIFY_PLAYER_AUTH_ERROR' || error.code === 'SPOTIFY_PREMIUM_REQUIRED') void verifySdkAccess();
      }
      try {
        const sdk = new window.Spotify.Player({
          name:'Muziekmix browserplayer',
          getOAuthToken: async callback => {
            try {
              const token = await window.SpotifyApp.token();
              if (active()) callback(token);
            } catch(error) { fail(error); }
          },
          volume:0.8
        });
        player = sdk;
        sdk.addListener('ready',({device_id}={})=>{
          if (!active() || !device_id) return;
          browserDeviceId = device_id;
          playerReady = true;
          $('#retryPlayer').hidden = true;
          syncPlayerControls();
          finish();
        });
        sdk.addListener('not_ready',()=>fail(playerError('De verbinding met het Spotify-afspeelapparaat is weggevallen.','SPOTIFY_DEVICE_UNAVAILABLE')));
        sdk.addListener('initialization_error',({message}={})=>fail(playerError('De browser kan de Spotify-speler niet starten'+(message ? ': '+message : '.'),'SPOTIFY_DEVICE_UNAVAILABLE')));
        sdk.addListener('authentication_error',({message}={})=>fail(playerError('Spotify-player kon niet authenticeren'+(message ? ': '+message : '.'),'SPOTIFY_PLAYER_AUTH_ERROR')));
        sdk.addListener('account_error',({message}={})=>fail(playerError('De Spotify-speler vereist een geldig Premium-account'+(message ? ': '+message : '.'),'SPOTIFY_PREMIUM_REQUIRED')));
        sdk.addListener('playback_error',({message}={})=>{ if(active()) setError('Spotify kon niet afspelen'+(message ? ': '+message : '.')); });
        sdk.addListener('autoplay_failed',()=>{ if(active()) setError('De browser blokkeerde afspelen. Tik opnieuw op de playknop.'); });
        sdk.addListener('player_state_changed',state=>{
          if (!active()) return;
          playerState = state;
          stateUpdatedAt = Date.now();
          if (currentTrack && state?.track_window?.current_track?.uri === currentTrack.uri) {
            lastPosition = Number(state.position)||0;
            isPlaying = !state.paused;
            setPauseButton(isPlaying ? 'pause' : 'play',isPlaying ? 'Pauzeer' : 'Verder luisteren');
            updateProgress();
          }
        });
        Promise.resolve(sdk.connect()).then(connected=>{ if(!connected) fail(playerError('Spotify kon het browserapparaat niet verbinden.','SPOTIFY_DEVICE_UNAVAILABLE')); }).catch(fail);
      } catch(error) { finish(error); }
    }).catch(error=>{ if(epoch===playerGeneration) disconnectPlayer(); throw error; });
  }
  function ensureReady() {
    if (!playerReady || !browserDeviceId || !player) throw playerError('Het Spotify-afspeelapparaat is niet beschikbaar.','SPOTIFY_DEVICE_UNAVAILABLE');
  }
  async function bounded(promise, message, milliseconds=10000) {
    let timer;
    try {
      return await Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{ timer=setTimeout(()=>reject(playerError(message,'SPOTIFY_DEVICE_UNAVAILABLE')),milliseconds); })]);
    } finally { clearTimeout(timer); }
  }
  async function waitForTrack(uri) {
    const epoch = playerGeneration, deadline = Date.now()+8000;
    let resumed = false;
    while (Date.now()<deadline) {
      ensureReady();
      if(epoch!==playerGeneration || sessionLeaving) throw playerError('De speler is ondertussen gewijzigd.','SPOTIFY_DEVICE_UNAVAILABLE');
      if (playerState?.track_window?.current_track?.uri === uri && !playerState.paused) return;
      const state = await bounded(player.getCurrentState(),'De speler reageert niet.',3000);
      if(epoch!==playerGeneration || sessionLeaving) throw playerError('De speler is ondertussen gewijzigd.','SPOTIFY_DEVICE_UNAVAILABLE');
      if (state?.track_window?.current_track?.uri === uri) {
        playerState=state;
        stateUpdatedAt=Date.now();
        if(!state.paused)return;
        if(!resumed){
          resumed=true;
          await bounded(player.resume(),'Spotify kon het nummer niet hervatten.');
        }
      }
      await wait(250);
    }
    throw playerError('Spotify heeft het nummer niet gestart. Probeer dezelfde afspeelactie opnieuw.','SPOTIFY_PLAYBACK_NOT_STARTED');
  }
  async function requestTrackPlayback(uri,position) {
    ensureReady();
    const device = browserDeviceId;
    const body = {uris:[uri],...(Number.isFinite(position) ? {position_ms:Math.max(0,Math.floor(position))} : {})};
    try {
      await window.SpotifyApp.request('/me/player/play?device_id='+encodeURIComponent(device),'PUT',body);
    } catch(error) {
      // Only a missing device warrants an explicit transfer. It is performed
      // after the user's activation, never during initial page load.
      if (error.code !== 'SPOTIFY_DEVICE_UNAVAILABLE' || !playerReady || browserDeviceId !== device) throw error;
      await window.SpotifyApp.request('/me/player','PUT',{device_ids:[device],play:false});
      await wait(350);
      ensureReady();
      if(browserDeviceId!==device) throw playerError('Het Spotify-apparaat is gewijzigd.','SPOTIFY_DEVICE_UNAVAILABLE');
      await window.SpotifyApp.request('/me/player/play?device_id='+encodeURIComponent(device),'PUT',body);
    }
  }
  async function activatePlayer() {
    ensureReady();
    // Call before awaiting track search or Web API, within the user's click.
    await bounded(player.activateElement(),'De browser kon afspelen niet activeren.');
  }
  async function startTrack(track,position) {
    ensureReady();
    const epoch = playerGeneration;
    await requestTrackPlayback(track.uri,position);
    ensureReady();
    if (epoch!==playerGeneration || sessionLeaving) throw playerError('De speler is ondertussen gewijzigd.','SPOTIFY_DEVICE_UNAVAILABLE');
    // Wait until the target is actually audible; only resume that track.
    await waitForTrack(track.uri);
    if (epoch!==playerGeneration || sessionLeaving) throw playerError('De speler is ondertussen gewijzigd.','SPOTIFY_DEVICE_UNAVAILABLE');
  }
  async function playPending() {
    await activatePlayer();
    if (!pendingTrack) await prepareTrack();
    await startTrack(pendingTrack.spotify);
    renderTrack(pendingTrack.spotify,pendingTrack.source,false);
    $('.player-card').classList.add('track-concealed');
    $('#revealButton').hidden = false;
    currentTrack = pendingTrack.spotify;
    used.add(key(pendingTrack.source));
    rememberPlayed(pendingTrack.source);
    pendingTrack = null;
    resumeAfterReconnect = false;
    lastPosition = Number(playerState?.position)||0;
    isPlaying = true;
    updateCount();
    startTimer();
    $('.player-card').classList.remove('awaiting-playback');
    setPauseButton('pause','Pauzeer');
    setStatus('Sessie actief',`${used.size} unieke nummers afgespeeld.`,true);
  }
  async function nextTrackFromButton() {
    const button = $('#nextButton');
    button.setAttribute('aria-busy','true');
    try {
      // pendingTrack survives failed playback; never choose another on retry.
      await playPending();
    } finally { button.removeAttribute('aria-busy'); }
  }
  async function togglePause() {
    ensureReady();
    if (resumeAfterReconnect) {
      await activatePlayer();
      await startTrack(currentTrack,lastPosition);
      resumeAfterReconnect = false;
      isPlaying = true;
      startTimer();
    } else if (isPlaying) {
      await bounded(player.pause(),'Pauzeren is niet gelukt.');
      updateProgress();
      isPlaying = false;
    } else {
      await activatePlayer();
      await bounded(player.resume(),'Hervatten is niet gelukt.');
      isPlaying = true;
      stateUpdatedAt = Date.now();
    }
    setPauseButton(isPlaying ? 'pause' : 'play',isPlaying ? 'Pauzeer' : 'Verder luisteren');
    setStatus(isPlaying ? 'Sessie actief' : 'Gepauzeerd',isPlaying ? `${used.size} unieke nummers afgespeeld.` : 'Druk op Verder luisteren om te hervatten.',isPlaying);
  }
  async function preparePlayer() {
    $('#retryPlayer').hidden = true;
    setStatus('Sessie voorbereiden…','Spotify wordt verbonden.');
    if (!currentTrack && !pendingTrack) await prepareTrack();
    await initialisePlayer();
    if (sessionLeaving) return;
    ensureReady();
    if (!currentTrack) {
      $('#trackTitle').textContent = 'Klaar om af te spelen';
      $('#trackArtist').textContent = 'Tik op de playknop';
      $('#trackYear').hidden = true;
      setStatus('Klaar om af te spelen','Tik op de playknop om het eerste nummer te starten.');
    } else {
      setStatus('Spotify opnieuw verbonden','Hervat het nummer of ga verder met het volgende nummer.');
    }
  }
  function leaveSession() {
    sessionLeaving=true;
    disconnectPlayer();
    clearSessionSelection();
    window.location.assign('index.html');
  }
  function requestSessionExit() { if (!used.size) { leaveSession(); return; } const dialog = $('#exitDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else if (window.confirm('Weet je zeker dat je deze sessie wilt verlaten?')) leaveSession(); }
  $('#revealButton').addEventListener('click', () => { if (!currentTrack) return; const hasArtwork = $('#albumArt').dataset.available === 'true'; $('#albumArt').hidden = !hasArtwork; $('#albumFallback').hidden = hasArtwork; $('.player-card').classList.remove('track-concealed'); $('#revealButton').hidden = true; $('#trackGenres').hidden = !$('#trackGenres').textContent; }); $('#retryPlayer').addEventListener('click',()=>guarded(preparePlayer)); $('#startPlayback').addEventListener('click', () => guarded(playPending)); $('#pauseButton').addEventListener('click', () => guarded(togglePause)); $('#nextButton').addEventListener('click', () => guarded(nextTrackFromButton)); $('.back-button').addEventListener('click', event => { event.preventDefault(); requestSessionExit(); }); $('#endSession').addEventListener('click', requestSessionExit); $('#cancelExit').addEventListener('click', () => $('#exitDialog').close()); $('#confirmExit').addEventListener('click', leaveSession);
  (async()=>{
    if (!selectedGenres.length || !window.SpotifyApp.hasSession() || !window.SpotifyApp.hasRequiredScopes()) { window.location.replace('index.html'); return; }
    $('#sessionTitle').innerHTML = `${sessionGenreLabel()}<span>.</span>`;
    updateCount();
    await guarded(preparePlayer);
  })();
})();
