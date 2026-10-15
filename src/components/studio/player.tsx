"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { formatTime } from "@/lib/utils";
export function VideoPlayer({
  src,
  poster,
  start = 0,
  end,
  onVideoError,
}: {
  src: string;
  poster?: string;
  start?: number;
  end?: number;
  onVideoError?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const limit = end || duration;
  const toggle = () => {
    if (!video.current) return;
    if (video.current.paused) {
      if (video.current.currentTime >= limit - 0.05)
        video.current.currentTime = start;
      void video.current.play().catch(() => {});
    } else video.current.pause();
  };
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.pause();
    if (element.readyState >= 1) element.currentTime = start;
  }, [src, start]);
  return (
    <div className="video-player" ref={container}>
      <video
        ref={video}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        muted={muted}
        onClick={toggle}
        onEmptied={() => {
          setPlaying(false);
          setTime(start);
          setDuration(0);
        }}
        onLoadedMetadata={(e) => {
          setTime(start);
          setDuration(e.currentTarget.duration);
          e.currentTarget.currentTime = start;
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (end && v.currentTime >= end) {
            v.pause();
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={onVideoError}
      />
      {!playing && (
        <button className="big-play" aria-label="Play video" onClick={toggle}>
          <Play size={25} fill="currentColor" strokeWidth={1.2} />
        </button>
      )}
      <div className="video-controls">
        <input
          className="video-seek"
          aria-label="Seek video"
          type="range"
          min={start}
          max={limit || 1}
          step="0.01"
          value={Math.max(start, Math.min(time, limit || 1))}
          onChange={(e) => {
            if (video.current) {
              video.current.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }
          }}
        />
        <div>
          <button
            className="icon-button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? (
              <Pause size={17} />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </button>
          <span className="video-time">
            {formatTime(Math.max(0, time - start))}
            <small> / {formatTime(Math.max(0, limit - start))}</small>
          </span>
          <span className="controls-spacer" />
          <button
            className="icon-button"
            aria-label="Replay"
            onClick={() => {
              if (video.current) {
                video.current.currentTime = start;
                void video.current.play();
              }
            }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Fullscreen"
            onClick={() =>
              void container.current?.requestFullscreen().catch(() => {})
            }
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function VideoComparison({
  original,
  result,
  start = 0,
}: {
  original: string;
  result: string;
  start?: number;
}) {
  const before = useRef<HTMLVideoElement>(null),
    after = useRef<HTMLVideoElement>(null);
  const [slider, setSlider] = useState(50),
    [playing, setPlaying] = useState(false),
    [side, setSide] = useState(false);
  const toggle = () => {
    if (playing) {
      before.current?.pause();
      after.current?.pause();
      setPlaying(false);
    } else {
      void before.current?.play();
      void after.current?.play();
      setPlaying(true);
    }
  };
  return (
    <div className="comparison-widget">
      <div
        className={side ? "comparison-media side-by-side" : "comparison-media"}
      >
        <video
          ref={before}
          src={original}
          playsInline
          muted
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = start;
          }}
          onTimeUpdate={(e) => {
            if (
              after.current &&
              Math.abs(
                e.currentTarget.currentTime - start - after.current.currentTime,
              ) > 0.2
            )
              e.currentTarget.currentTime = start + after.current.currentTime;
          }}
        />
        <div
          className="comparison-after"
          style={side ? undefined : { clipPath: `inset(0 0 0 ${slider}%)` }}
        >
          <video
            ref={after}
            src={result}
            playsInline
            muted
            onEnded={() => {
              setPlaying(false);
              before.current?.pause();
            }}
          />
        </div>
        <span className="compare-label before-label">Original</span>
        <span className="compare-label after-label">AI-generated</span>
        {!side && (
          <>
            <div className="comparison-handle" style={{ left: `${slider}%` }}>
              <span>↔</span>
            </div>
            <input
              className="comparison-range"
              type="range"
              min="0"
              max="100"
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              aria-label="Before and after comparison position"
            />
          </>
        )}
      </div>
      <div className="comparison-tools">
        <button className="btn btn-ghost" onClick={toggle}>
          {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
          {playing ? "Pause" : "Play both"}
        </button>
        <button className="text-button" onClick={() => setSide(!side)}>
          {side ? "Comparison slider" : "Side by side"}
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (before.current) before.current.currentTime = start;
            if (after.current) after.current.currentTime = 0;
          }}
        >
          Replay
        </button>
      </div>
    </div>
  );
}
