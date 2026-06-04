import { useState, useRef, useCallback, useEffect } from "react";
import SpinnerLogo from "@/components/SpinnerLogo";

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  url: string;
}

interface YouTubeCardProps {
  video: YouTubeVideo;
  onPlayStart?: () => void;
  stopSignal?: number;
}

const formatYTDuration = (dur: string): string => {
  if (!dur) return "--:--";
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) {
    return `${parts[0]}:${String(parts[1]).padStart(2, "0")}:${String(parts[2]).padStart(2, "0")}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${String(parts[1]).padStart(2, "0")}`;
  }
  return dur;
};

import { supabase } from "@/integrations/supabase/client";

const YouTubeCard = ({ video, onPlayStart, stopSignal }: YouTubeCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onPlayStartRef = useRef(onPlayStart);
  onPlayStartRef.current = onPlayStart;

  useEffect(() => {
    if (stopSignal === undefined) return;
    setIsPlaying(false);
    setIsLoading(false);
  }, [stopSignal]);

  // Force quality to 720p (falls back to best available if 720p missing)
  useEffect(() => {
    if (!isPlaying) return;
    const send = (func: string, args: any[] = []) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*"
        );
      } catch {}
    };
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data);
        if (data?.event === "onReady" || data?.event === "onStateChange") {
          send("setPlaybackQuality", ["hd720"]);
        }
      } catch {}
    };
    window.addEventListener("message", onMessage);
    const handshake = () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "listening" }),
          "*"
        );
      } catch {}
    };
    const t1 = setTimeout(handshake, 400);
    const t2 = setTimeout(() => send("setPlaybackQuality", ["hd720"]), 1500);
    const t3 = setTimeout(() => send("setPlaybackQuality", ["hd720"]), 4000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [isPlaying]);

  const getVideoId = (url: string): string | null => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts)\/([\w-]+)/);
      if (m) return m[2];
    } catch {}
    const m = url.match(/[?&]v=([\w-]+)/);
    return m ? m[1] : null;
  };

  const handleClick = useCallback(async () => {
    if (isPlaying) return;
    if (isLoading) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    onPlayStartRef.current?.();
    setIsPlaying(true);
    setIsLoading(false);
  }, [isPlaying, isLoading]);

  const videoId = getVideoId(video.url);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="w-full animate-fade-in-up">
      <div
        className={`relative w-full aspect-video overflow-hidden bg-secondary cursor-pointer select-none transition-all duration-300 ${isPlaying ? "rounded-3xl" : "rounded-lg"}`}
        onClick={handleClick}
      >
        {isPlaying && videoId ? (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&showinfo=0&vq=hd720&hd=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`}
            className="w-full h-full block border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={video.title}
          />
        ) : (
          <>
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover pointer-events-none"
              loading="lazy"
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                <SpinnerLogo size={36} />
              </div>
            )}
            <div className="absolute bottom-0 right-0 mb-2 mr-2 bg-background/90 backdrop-blur-md border border-border px-2 py-1 rounded-lg z-10">
              <span className="text-[9px] text-foreground leading-none block">
                {formatYTDuration(video.duration)}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="mt-2 text-[13.65px] font-semibold tracking-tight text-foreground/90 line-clamp-2">
        {(() => {
          const channel = (video.channel || "").trim().toLowerCase();
          const title = (video.title || "").trim();
          const titleLower = title.toLowerCase();
          if (channel && titleLower.startsWith(channel)) {
            return title;
          }
          return channel ? `${video.channel} - ${title}` : title;
        })()}
      </p>
    </div>
  );
};

export default YouTubeCard;
