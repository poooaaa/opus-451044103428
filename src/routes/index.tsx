import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import SearchHeader from "@/components/SearchHeader";
import TrackCard, { type Track, parseDurationToMs, formatTime } from "@/components/TrackCard";
import TrackRowCard from "@/components/TrackRowCard";
import YouTubeCard, { type YouTubeVideo } from "@/components/YouTubeCard";
import LyricsSheet from "@/components/LyricsSheet";
import AILabsSheet from "@/components/AILabsSheet";
import SavedTracks from "@/components/SavedTracks";
import PopularArtists from "@/components/PopularArtists";
import FloatingMenu from "@/components/FloatingMenu";
import LoginSheet from "@/components/LoginSheet";
import { supabase } from "@/integrations/supabase/client";
import SpinnerLogo from "@/components/SpinnerLogo";
import MusicPlayer from "@/components/MusicPlayer";
const profileAvatarGif = "https://i.pinimg.com/originals/ea/d8/26/ead8269afcd3834e662993b95f6ca93a.gif";

const POPULAR_ARTISTS = [
  "virgoun", "yovie widianto", "nadhif basalamah", "tulus", "nadin amizah", "hindia",
  "raim laode", "mahalini", "bernadya", "idgitaf", "pamungkas"
];
const GOOGLE_RING_DURATION_MS = 5 * 60 * 60 * 1000;
const GOOGLE_RING_PLAY_THRESHOLD = 5;

const proxyFetch = async (url: string) => {
  const { data, error } = await supabase.functions.invoke("proxy", { body: { url } });
  if (error) throw new Error("Proxy request failed");
  return data;
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};


const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const Index = () => {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [loadingTrackUrl, setLoadingTrackUrl] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackRequestIdRef = useRef(0);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [menuState, setMenuState] = useState<{ track: Track; position: { x: number; y: number } } | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsTrack, setLyricsTrack] = useState<Track | null>(null);
  const [savedTracks, setSavedTracks] = useState<Track[]>([]);
  const [popularSongs, setPopularSongs] = useState<Track[]>([]);
  const [searchSections, setSearchSections] = useState<{ visualB: Track[]; untukAnda: Track[]; lainnya: Track[] }>({ visualB: [], untukAnda: [], lainnya: [] });

  // AI Labs state
  const [showAILabs, setShowAILabs] = useState(false);
  const [isLoadingAILabs, setIsLoadingAILabs] = useState(false);
  const [aiLabsSummary, setAiLabsSummary] = useState<string | null>(null);
  const [aiLabsArtistImage, setAiLabsArtistImage] = useState<string | null>(null);
  const [aiLabsArtistName, setAiLabsArtistName] = useState<string | null>(null);
  const [aiLabsArtistSongs, setAiLabsArtistSongs] = useState<any[]>([]);

  // Like/Dislike state (localStorage per device)
  const [likedTracks, setLikedTracks] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("liked_tracks"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [dislikedTracks, setDislikedTracks] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("disliked_tracks"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Theme - always dark
  const theme = "dark";

  // Google ring - earned by playing any 5 songs
  const [totalPlays, setTotalPlays] = useState<number>(() => {
    const stored = localStorage.getItem("totalPlaysForRing");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [googleRingExpiry, setGoogleRingExpiry] = useState<number>(() => {
    const stored = localStorage.getItem("googleRingExpiry");
    return stored ? parseInt(stored, 10) : 0;
  });

  // Auto-play queue for saved tracks
  const [autoPlayQueue, setAutoPlayQueue] = useState<Track[]>([]);
  const [autoPlayIndex, setAutoPlayIndex] = useState<number>(-1);
  const [youtubeStopSignal, setYoutubeStopSignal] = useState(0);

  const hasProfileGoogleRing = useMemo(() => {
    if (!user) return false;
    return googleRingExpiry > Date.now();
  }, [user, googleRingExpiry]);

  const closeAllMenus = useCallback(() => {
    setMenuState(null);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    localStorage.removeItem("fake_user");
    setShowLogin(true);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("saved_tracks");
      if (stored) setSavedTracks(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    const fetchPopular = async () => {
      try {
        // Try loading from cached database first
        const { data: cached } = await supabase
          .from("popular_songs")
          .select("*")
          .order("position", { ascending: true });

        if (cached && cached.length > 0) {
          const songs: Track[] = cached.map((item: any) => ({
            title: item.title,
            thumbnail: item.thumbnail,
            duration: "",
            duration_ms: item.duration_ms || 0,
            track_url: item.track_url,
            artist: item.artist || "",
            source: "applemusic" as const,
          }));
          setPopularSongs(songs);
          return;
        }

        // Fallback: fetch from API directly and trigger refresh
        const data = await proxyFetch("https://rss.applemarketingtools.com/api/v2/id/music/most-played/25/songs.json");
        if (data?.feed?.results) {
          const songsWithDuration = await Promise.all(
            data.feed.results.map(async (item: any) => {
              let durationMs = 0;
              try {
                const searchData = await fetch(
                  `https://itunes.apple.com/search?term=${encodeURIComponent(item.artistName + " " + item.name)}&entity=song&limit=1`
                ).then(r => r.json());
                if (searchData?.results?.[0]?.trackTimeMillis) durationMs = searchData.results[0].trackTimeMillis;
              } catch {}
              return {
                title: `${item.artistName} - ${item.name}`,
                thumbnail: item.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
                duration: "",
                duration_ms: durationMs,
                track_url: item.url || "",
                artist: item.artistName || "",
                source: "applemusic" as const,
              };
            })
          );
          setPopularSongs(songsWithDuration);
        }
        // Also trigger a background refresh to populate the DB
        supabase.functions.invoke("refresh-popular").catch(() => {});
      } catch (e) {
        console.error("Failed to fetch popular songs", e);
      }
    };
    fetchPopular();
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    // Empty search = return to home
    const rawQuery = (overrideQuery ?? query).trim();
    if (!rawQuery) {
      setSearched(false);
      setTracks([]);
      setYoutubeVideos([]);
      setShowLyrics(false);
      setShowAILabs(false);
      setError("");
      closeAllMenus();
      return;
    }
    if (overrideQuery !== undefined) setQuery(overrideQuery);

    setLoading(true);
    setError("");
    setSearched(true);
    setTracks([]);
    setSearchSections({ visualB: [], untukAnda: [], lainnya: [] });
    setYoutubeVideos([]);
    setShowLyrics(false);
    setShowAILabs(false);
    closeAllMenus();

    let searchTerm = rawQuery;
    try {
      const { data: smartData } = await supabase.functions.invoke("smart-search", {
        body: { query: searchTerm },
      });
      if (smartData?.result) {
        searchTerm = smartData.result;
        if (smartData.changed) setQuery(searchTerm);
      }
    } catch {}

    try {
      const [spotifyResult, appleMusicResult] = await Promise.allSettled([
        proxyFetch(`https://api.nexray.web.id/search/spotify?q=${encodeURIComponent(searchTerm)}`),
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=25`).then(r => r.json()),
      ]);

      const spotifyTracks: Track[] = [];
      const appleTracks: Track[] = [];

      if (spotifyResult.status === "fulfilled" && spotifyResult.value.result?.length > 0) {
        spotifyResult.value.result.forEach((item: any) => {
          spotifyTracks.push({
            title: item.title, thumbnail: item.thumbnail,
            duration: item.duration || "0:00", duration_ms: parseDurationToMs(item.duration || "0:00"),
            track_url: item.url || item.track_url, artist: item.artist || "", source: "spotify",
          });
        });
      }

      if (appleMusicResult.status === "fulfilled" && appleMusicResult.value.results?.length > 0) {
        appleMusicResult.value.results.forEach((item: any) => {
          appleTracks.push({
            title: `${item.artistName} - ${item.trackName}`,
            thumbnail: item.artworkUrl100?.replace("100x100", "600x600") || "",
            duration: "", duration_ms: item.trackTimeMillis || 0,
            track_url: item.trackViewUrl || "", artist: item.artistName || "", source: "applemusic",
          });
        });
      }

      // Separate best match per source for Visual B
      const bestSpotify = spotifyTracks[0] || null;
      const bestApple = appleTracks[0] || null;

      // "Untuk Anda" - top 2 from each source (skip first which is in Visual B)
      const untukAndaSpotify = user ? spotifyTracks.slice(1, 4) : spotifyTracks.slice(1, 2);
      const untukAndaApple = user ? appleTracks.slice(1, 4) : appleTracks.slice(1, 2);
      const untukAnda = shuffleArray([...untukAndaSpotify, ...untukAndaApple]);

      // "Lainnya" - remaining songs (shuffled!)
      const lainnyaStartSpotify = user ? 4 : 2;
      const lainnyaStartApple = user ? 4 : 2;
      const lainnyaSpotify = spotifyTracks.slice(lainnyaStartSpotify);
      const lainnyaApple = appleTracks.slice(lainnyaStartApple);
      let lainnya = shuffleArray([...lainnyaSpotify, ...lainnyaApple]);
      if (!user) lainnya = lainnya.slice(0, 4);

      // Visual B tracks (shuffled order)
      const visualBTracks: Track[] = shuffleArray([bestSpotify, bestApple].filter(Boolean) as Track[]);

      // Store sections in state so they don't re-shuffle on re-render
      setSearchSections({ visualB: visualBTracks, untukAnda, lainnya });

      // Build combined for legacy compatibility (playback etc)
      const combined = [...visualBTracks, ...untukAnda, ...lainnya];

      if (combined.length > 0) {
        setTracks(combined);
        // Search YouTube - use original search term + "official" for better matching
        const ytArtist = bestSpotify?.artist || bestApple?.artist || "";
      const ytTitle = bestSpotify 
          ? bestSpotify.title.replace(/^.+\s-\s/, "") 
          : bestApple 
            ? bestApple.title.replace(/^.+\s-\s/, "")
            : rawQuery;
        const ytQuery = `${ytArtist} ${ytTitle} official music`.trim();
        supabase.functions.invoke("youtube-proxy", {
          body: { action: "search", query: ytQuery },
        }).then(({ data }) => {
          const results = data?.results || data?.data || data?.result || [];
          // Score results by title similarity
          const searchLower = `${ytArtist} ${ytTitle}`.toLowerCase();
          const scored = results
            .filter((v: any) => {
              const dur = typeof v.duration === "number" ? v.duration : 0;
              return dur > 0 && dur <= 600;
            })
            .map((v: any) => {
              const vTitle = (v.title || "").toLowerCase();
              // Count how many search words appear in video title
              const words = searchLower.split(/\s+/).filter(w => w.length > 2);
              const matchCount = words.filter(w => vTitle.includes(w)).length;
              return { v, score: matchCount };
            })
            .sort((a: any, b: any) => b.score - a.score);
          
          if (scored.length > 0) {
            const v = scored[0].v;
            setYoutubeVideos([{
              id: v.videoId || v.id || "",
              title: v.title || "",
              thumbnail: v.thumbnail || v.image || "",
              duration: v.timestamp || "",
              channel: v.author?.name || v.channel || v.artist || "",
              url: v.url || (v.videoId ? `https://youtube.com/watch?v=${v.videoId}` : ""),
            }]);
          }
        }).catch(() => {});
      }
      else setError("Lagu tidak ditemukan");
    } catch {
      setError("Gagal terhubung, coba lagi");
    } finally {
      setLoading(false);
    }
  }, [query, user, closeAllMenus]);

  const fetchLyrics = useCallback(async (title: string, artist: string) => {
    try {
      const searchQ = `${title} ${artist}`.trim();
      const data = await proxyFetch(
        `https://www.sankavolereii.my.id/search/lirik?apikey=planaai&text=${encodeURIComponent(searchQ)}`
      );
      if (data.status && data.result) {
        const result = Array.isArray(data.result) ? data.result[0] : data.result;
        if (result?.lyrics) { setLyrics(result.lyrics.replace(/\\n/g, "\n")); return; }
      }
      setLyrics(null);
    } catch { setLyrics(null); }
  }, []);

  const cacheMP3InBackground = useCallback((downloadUrl: string, trackUrl: string) => {
    const cacheKey = hashString(trackUrl) + ".mp3";
    supabase.functions.invoke("cache-mp3", {
      body: { downloadUrl, cacheKey },
    }).catch(() => {});
  }, []);

  const getCachedUrl = useCallback((trackUrl: string): string => {
    const cacheKey = hashString(trackUrl) + ".mp3";
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/mp3-cache/${cacheKey}`;
  }, []);

  // Search Apple Music for a song title and return a playable Apple Music track
  const findAppleMusicFallback = useCallback(async (track: Track): Promise<string | null> => {
    try {
      const searchTerm = track.title.replace(/^.+\s-\s/, "") + " " + (track.artist || "");
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`);
      const data = await res.json();
      if (data?.results?.[0]?.trackViewUrl) {
        const appleUrl = data.results[0].trackViewUrl;
        const dlData = await proxyFetch(
          `https://www.neoapis.xyz/api/downloader/applemusic?url=${encodeURIComponent(appleUrl)}`
        );
        if (dlData?.data?.download_url) {
          return dlData.data.download_url;
        }
      }
    } catch (e) {
      console.error("Apple Music fallback error:", e);
    }
    return null;
  }, []);

  const handlePlayTrack = useCallback(async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrackUrl === track.track_url) {
      audio.pause();
      setPlayingTrackUrl(null);
      setRemainingTime(null);
      setCurrentTrack(null);
      setAutoPlayQueue([]);
      setAutoPlayIndex(-1);
      return;
    }

    // Pause any playing YouTube video (don't destroy it)
    document.querySelectorAll("video").forEach(v => { v.pause(); });
    // Signal YouTubeCard iframes to fully stop (iframes are not <video>)
    setYoutubeStopSignal((n) => n + 1);

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setPlayingTrackUrl(null);
    setLoadingTrackUrl(track.track_url);
    setRemainingTime(null);
    setCurrentTrack(track);

    playbackRequestIdRef.current += 1;
    const requestId = playbackRequestIdRef.current;

    const isStaleRequest = () => playbackRequestIdRef.current !== requestId;

    const startPlayback = async (sourceUrl: string, cacheSourceUrl?: string) => {
      if (isStaleRequest()) return false;

      audio.pause();
      audio.src = sourceUrl;
      await audio.play();

      if (isStaleRequest()) {
        audio.pause();
        return false;
      }

      setPlayingTrackUrl(track.track_url);
      setCurrentTrack(track);

      if (cacheSourceUrl) {
        cacheMP3InBackground(cacheSourceUrl, track.track_url);
      }

      return true;
    };

    try {
      const cachedUrl = getCachedUrl(track.track_url);
      let played = false;

      try {
        const headRes = await fetch(cachedUrl, { method: "HEAD" });
        if (!isStaleRequest() && headRes.ok) {
          played = await startPlayback(cachedUrl);
        }
      } catch {}

      if (!played && track.source === "spotify") {
        // Primary: harzrestapi.web.id (direct MP3 download, no JSON)
        try {
          const directUrl = `https://api.harzrestapi.web.id/api/spotify?url=${encodeURIComponent(track.track_url)}`;
          if (!isStaleRequest()) {
            played = await startPlayback(directUrl, directUrl);
          }
        } catch {}

        // Fallback: Search Apple Music with same title
        if (!played) {
          try {
            const appleUrl = await findAppleMusicFallback(track);
            if (!isStaleRequest() && appleUrl) {
              played = await startPlayback(appleUrl, appleUrl);
            }
          } catch {}
        }

        if (!played && !isStaleRequest()) alert("Gagal memutar lagu Spotify");
      } else if (!played) {
        // Apple Music: neoapis.xyz
        try {
          const data = await proxyFetch(
            `https://www.neoapis.xyz/api/downloader/applemusic?url=${encodeURIComponent(track.track_url)}`
          );
          if (!isStaleRequest() && data?.data?.download_url) {
            played = await startPlayback(data.data.download_url, data.data.download_url);
          }
        } catch {}

        if (!played && !isStaleRequest()) alert("Gagal memutar lagu");
      }

      if (isStaleRequest() || !played) return;

      // Google ring tracking - any song counts
      if (user) {
        const newCount = totalPlays + 1;
        setTotalPlays(newCount);
        localStorage.setItem("totalPlaysForRing", String(newCount));
        if (newCount >= GOOGLE_RING_PLAY_THRESHOLD) {
          const expiry = Date.now() + GOOGLE_RING_DURATION_MS;
          setGoogleRingExpiry(expiry);
          localStorage.setItem("googleRingExpiry", String(expiry));
          setTotalPlays(0);
          localStorage.setItem("totalPlaysForRing", "0");
        }
      }
    } catch {
      if (!isStaleRequest()) alert("Gagal memutar lagu");
    } finally {
      if (!isStaleRequest()) {
        setLoadingTrackUrl(null);
      }
    }
  }, [playingTrackUrl, user, totalPlays, getCachedUrl, cacheMP3InBackground, findAppleMusicFallback]);

  // Play saved track with auto-play queue — use current savedTracks order
  const handlePlaySavedTrack = useCallback((track: Track) => {
    const idx = savedTracks.findIndex(t => t.track_url === track.track_url);
    // Set queue to savedTracks in their current display order
    setAutoPlayQueue([...savedTracks]);
    setAutoPlayIndex(idx >= 0 ? idx : 0);
    handlePlayTrack(track);
  }, [savedTracks, handlePlayTrack]);

  const handleLongPress = useCallback((track: Track, position: { x: number; y: number }) => {
    closeAllMenus();
    setMenuState({ track, position });
  }, [closeAllMenus]);

  const getTrackKey = useCallback((t: Track) => {
    return `${(t.title || "").toLowerCase().trim()}::${(t.artist || "").toLowerCase().trim()}`;
  }, []);

  const handleSaveTrack = useCallback((track: Track) => {
    const key = getTrackKey(track);
    const alreadySaved = savedTracks.some(s => getTrackKey(s) === key);
    const updated = alreadySaved
      ? savedTracks.filter(s => getTrackKey(s) !== key)
      : [track, ...savedTracks];
    setSavedTracks(updated);
    localStorage.setItem("saved_tracks", JSON.stringify(updated));
    setMenuState(null);
  }, [savedTracks, getTrackKey]);

  const handleLyricsFromMenu = useCallback(async () => {
    if (!menuState || isLoadingLyrics) return;
    const track = menuState.track;
    if (showLyrics) { setMenuState(null); setShowLyrics(false); return; }
    setIsLoadingLyrics(true);
    setLyricsTrack(track);
    const trackTitle = track.title.replace(/^.+\s-\s/, "");
    await fetchLyrics(trackTitle, track.artist || "");
    setIsLoadingLyrics(false);
    setMenuState(null);
    setShowLyrics(true);
  }, [menuState, showLyrics, fetchLyrics, isLoadingLyrics]);

  const handleAILabsFromMenu = useCallback(async () => {
    if (!menuState || isLoadingAILabs || !user) return;
    const track = menuState.track;
    if (showAILabs) { setMenuState(null); setShowAILabs(false); return; }
    setIsLoadingAILabs(true);
    const trackTitle = track.title.replace(/^.+\s-\s/, "");
    const artist = track.artist || "";
    try {
      const { data, error } = await supabase.functions.invoke("ai-labs", {
        body: { title: trackTitle, artist },
      });
      if (error) throw error;
      setAiLabsSummary(data?.summary || null);
      setAiLabsArtistImage(data?.artistImage || null);
      setAiLabsArtistName(data?.artistName || null);
      setAiLabsArtistSongs(data?.artistSongs || []);
    } catch (e) {
      console.error("AI Labs error:", e);
      setAiLabsSummary("Gagal memuat informasi.");
      setAiLabsArtistImage(null);
      setAiLabsArtistName(null);
      setAiLabsArtistSongs([]);
    }
    setIsLoadingAILabs(false);
    setMenuState(null);
    setShowAILabs(true);
  }, [menuState, showAILabs, isLoadingAILabs, user]);

  // Audio events with auto-advance for saved tracks
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (currentTrack) {
        const durationMs = currentTrack.duration_ms > 0 ? currentTrack.duration_ms : parseDurationToMs(currentTrack.duration);
        const remainingMs = durationMs - audio.currentTime * 1000;
        setRemainingTime(formatTime(remainingMs));
      }
    };
    const onEnded = () => {
      // Auto-play next in saved tracks queue
      if (autoPlayQueue.length > 0 && autoPlayIndex >= 0 && autoPlayIndex < autoPlayQueue.length - 1) {
        const nextIndex = autoPlayIndex + 1;
        setAutoPlayIndex(nextIndex);
        const nextTrack = autoPlayQueue[nextIndex];
        setCurrentTrack(nextTrack);
        handlePlayTrack(nextTrack);
        return;
      }

      setPlayingTrackUrl(null);
      setRemainingTime(null);
      setCurrentTrack(null);
      setShowLyrics(false);
      setShowAILabs(false);
      setAutoPlayQueue([]);
      setAutoPlayIndex(-1);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => { audio.removeEventListener("timeupdate", onTimeUpdate); audio.removeEventListener("ended", onEnded); };
  }, [currentTrack, autoPlayQueue, autoPlayIndex, handlePlayTrack]);

  // Google ring expiry check
  useEffect(() => {
    if (!googleRingExpiry) return;
    const interval = setInterval(() => {
      if (Date.now() > googleRingExpiry) { setGoogleRingExpiry(0); localStorage.removeItem("googleRingExpiry"); }
    }, 60000);
    return () => clearInterval(interval);
  }, [googleRingExpiry]);

  const userAvatar = user?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const userName = user?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || null;

  const isTrackPlaying = useCallback((track: Track) => {
    if (!playingTrackUrl || !currentTrack) return false;
    if (playingTrackUrl === track.track_url) return true;
    const a = `${(track.title || "").toLowerCase().trim()}::${(track.artist || "").toLowerCase().trim()}`;
    const b = `${(currentTrack.title || "").toLowerCase().trim()}::${(currentTrack.artist || "").toLowerCase().trim()}`;
    return a === b;
  }, [playingTrackUrl, currentTrack]);

  const isTrackLoading = useCallback((track: Track) => {
    if (!loadingTrackUrl) return false;
    return loadingTrackUrl === track.track_url;
  }, [loadingTrackUrl]);

  const renderTrackCard = (track: Track, i: number, fromSaved?: boolean) => (
    <TrackCard
      key={track.track_url + i}
      track={track}
      isPlaying={isTrackPlaying(track)}
      isLoading={isTrackLoading(track)}
      remainingTime={isTrackPlaying(track) ? remainingTime : null}
      onPlay={() => fromSaved ? handlePlaySavedTrack(track) : handlePlayTrack(track)}
      onLongPress={(pos) => handleLongPress(track, pos)}
    />
  );

  return (
    <div className="min-h-screen overflow-x-hidden flex justify-center">
      <div className="w-full max-w-md px-4 pt-2 pb-4">
        <SearchHeader
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          userAvatar={userAvatar}
          userName={userName}
          onProfileClick={() => { if (!user) setShowLogin(true); }}
          onLongPressProfile={() => {
            if (user) {
              setUser(null);
              setShowLogin(true);
            }
          }}
          hasGoogleRing={hasProfileGoogleRing}
        />

        {!searched && (
          <>
            {savedTracks.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Lagu favorite</h2>
                <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
                  {savedTracks.map((track, i) => (
                    <div key={track.track_url} className="flex-shrink-0 w-[calc(50%-8px)]">
                      {renderTrackCard(track, i, true)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="text-lg font-bold text-foreground mb-4">Artis populer</h2>
              <PopularArtists />
            </div>

            {popularSongs.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Sedang Populer</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-10">
                  {(user ? popularSongs : popularSongs.slice(0, 7)).map((track, i) => renderTrackCard(track, i))}
                </div>
              </div>
            )}

            <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest mt-8 mb-4">OpusMusic By FloFa</p>
          </>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <SpinnerLogo size={56} />
          </div>
        )}

        {error && (
          <p className="text-center py-10 text-[10px] text-destructive opacity-70 tracking-widest uppercase">
            {error}
          </p>
        )}

        {searched && !loading && tracks.length > 0 && (
            <>
              {/* YouTube Video */}
              {youtubeVideos.length > 0 && user && (
                <div className="mb-4 pb-4 border-b border-border/20">
                   {youtubeVideos.map((video) => (
                     <YouTubeCard key={video.id} video={video} stopSignal={youtubeStopSignal} onPlayStart={() => {
                      const audio = audioRef.current;
                      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
                      // Cancel any in-flight track load so it doesn't pop the player back open
                      playbackRequestIdRef.current += 1;
                      setLoadingTrackUrl(null);
                      setPlayingTrackUrl(null);
                      setRemainingTime(null);
                      setCurrentTrack(null);
                      setAutoPlayQueue([]);
                      setAutoPlayIndex(-1);
                    }} />
                  ))}
                </div>
              )}

              {/* Visual B - 2 best matches under YouTube */}
              {searchSections.visualB.length > 0 && (
                <div className="mb-4">
                  {searchSections.visualB.map((track, i) => (
                    <TrackRowCard
                      key={track.track_url + "vb" + i}
                      track={track}
                      isPlaying={isTrackPlaying(track)}
                      isLoading={isTrackLoading(track)}
                      onPlay={() => handlePlayTrack(track)}
                      onLongPress={(pos) => handleLongPress(track, pos)}
                    />
                  ))}
                </div>
              )}

              {/* Untuk Anda */}
              {searchSections.untukAnda.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-4">Untuk Anda</h2>
                  <div 
                    className="flex gap-4 pb-2 overflow-x-auto" 
                    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                  >
                    {searchSections.untukAnda.map((track, i) => (
                      <div key={track.track_url + "ua" + i} className="flex-shrink-0 w-[calc(50%-8px)]">
                        {renderTrackCard(track, i)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lainnya */}
              {searchSections.lainnya.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-4">Lagu Lainnya</h2>
                  {searchSections.lainnya.map((track, i) => (
                    <TrackRowCard
                      key={track.track_url + "ln" + i}
                      track={track}
                      isPlaying={isTrackPlaying(track)}
                      isLoading={isTrackLoading(track)}
                      onPlay={() => handlePlayTrack(track)}
                      onLongPress={(pos) => handleLongPress(track, pos)}
                    />
                  ))}
                </div>
              )}
            </>
        )}

        <audio ref={audioRef} className="hidden" />

        {currentTrack && (
          <MusicPlayer
            track={currentTrack}
            isPlaying={!!playingTrackUrl && playingTrackUrl === currentTrack.track_url}
            onTogglePlay={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (playingTrackUrl === currentTrack.track_url) {
                audio.pause();
                setPlayingTrackUrl(null);
              } else {
                audio.play().then(() => {
                  setPlayingTrackUrl(currentTrack.track_url);
                }).catch(() => {});
              }
            }}
            onClose={() => {
              const audio = audioRef.current;
              if (audio) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
              }
              setPlayingTrackUrl(null);
              setCurrentTrack(null);
              setRemainingTime(null);
              setAutoPlayQueue([]);
              setAutoPlayIndex(-1);
            }}
          />
        )}

        {currentTrack && <div className="h-20" aria-hidden />}

        <LyricsSheet 
          lyrics={lyrics} 
          isVisible={showLyrics} 
          onClose={() => setShowLyrics(false)} 
          trackTitle={lyricsTrack?.title?.replace(/^.+\s-\s/, "") || ""}
          trackArtist={lyricsTrack?.artist || ""}
        />

        <AILabsSheet
          isVisible={showAILabs}
          onClose={() => setShowAILabs(false)}
          summary={aiLabsSummary}
          artistImage={aiLabsArtistImage}
          artistName={aiLabsArtistName}
          artistSongs={aiLabsArtistSongs}
          isLoading={isLoadingAILabs}
        />

        {menuState && (
          <FloatingMenu
            position={menuState.position}
            onClose={() => setMenuState(null)}
            onSave={() => handleSaveTrack(menuState.track)}
            onLike={() => {
              const url = menuState.track.track_url;
              const newLiked = new Set(likedTracks);
              const newDisliked = new Set(dislikedTracks);
              if (newLiked.has(url)) { newLiked.delete(url); } else { newLiked.add(url); newDisliked.delete(url); }
              setLikedTracks(newLiked);
              setDislikedTracks(newDisliked);
              localStorage.setItem("liked_tracks", JSON.stringify([...newLiked]));
              localStorage.setItem("disliked_tracks", JSON.stringify([...newDisliked]));
            }}
            onDislike={() => {
              const url = menuState.track.track_url;
              const newLiked = new Set(likedTracks);
              const newDisliked = new Set(dislikedTracks);
              if (newDisliked.has(url)) { newDisliked.delete(url); } else { newDisliked.add(url); newLiked.delete(url); }
              setLikedTracks(newLiked);
              setDislikedTracks(newDisliked);
              localStorage.setItem("liked_tracks", JSON.stringify([...newLiked]));
              localStorage.setItem("disliked_tracks", JSON.stringify([...newDisliked]));
            }}
            onLyrics={handleLyricsFromMenu}
            onAILabs={handleAILabsFromMenu}
            isSaved={savedTracks.some(s => getTrackKey(s) === getTrackKey(menuState.track))}
            isLiked={likedTracks.has(menuState.track.track_url)}
            isDisliked={dislikedTracks.has(menuState.track.track_url)}
            isLoadingLyrics={isLoadingLyrics}
            isLoadingAILabs={isLoadingAILabs}
            showAILabs={!!user}
          />
        )}

        {authChecked && (
          <LoginSheet
            isVisible={showLogin}
            onClose={() => setShowLogin(false)}
            onFakeLogin={() => {
              const randomId = Math.random().toString(36).substring(2, 10);
              const fakeUser = { id: randomId, name: `User_${randomId.slice(0, 4)}`, avatar_url: profileAvatarGif };
              setUser(fakeUser);
            }}
          />
        )}

      </div>
    </div>
  );
};

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Opus Music — Stream & Discover" },
      { name: "description", content: "Search and stream millions of songs from Spotify, Apple Music, and YouTube." },
      { property: "og:title", content: "Opus Music — Stream & Discover" },
      { property: "og:description", content: "Search and stream millions of songs from Spotify, Apple Music, and YouTube." },
    ],
  }),
  component: Index,
});

export default Index;
