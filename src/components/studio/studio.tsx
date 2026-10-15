"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  Copy,
  Crop,
  Download,
  Expand,
  Film,
  FolderOpen,
  ImagePlus,
  Info,
  Layers3,
  LoaderCircle,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  ScanFace,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { useWorkspace } from "../workspace/provider";
import {
  Button,
  Menu,
  Modal,
  Select,
  Toggle,
  EmptyState,
  StatusBadge,
} from "../ui/ui";
import { UploadCard } from "./upload";
import { VideoPlayer, VideoComparison } from "./player";
import { api, post, cn, formatTime } from "@/lib/utils";
import type { Aspect, Asset, Project } from "@/lib/types";
import { toast } from "sonner";
const presets = [
  {
    name: "Realistic replacement",
    icon: "◉",
    prompt:
      "Replace the original performer with my reference character. Preserve the source movement sequence, timing, camera motion, and background composition as closely as possible. Keep realistic proportions and a consistent character identity.",
  },
  {
    name: "Cinematic transformation",
    icon: "✦",
    prompt:
      "Recast the performer as my reference character in a cinematic style. Follow the source choreography, facial expression, timing, and camera movement. Keep the character consistent with natural lighting and coherent anatomy.",
  },
  {
    name: "Anime motion transfer",
    icon: "✧",
    prompt:
      "Animate my reference character in a refined anime style, following the exact sequence of body movements and performance timing from the source video. Maintain the character design and clear expressive poses.",
  },
  {
    name: "3D character animation",
    icon: "◇",
    prompt:
      "Bring my 3D reference character to life using the source performance. Preserve the choreography and camera movement while maintaining the character materials, design, and natural joint movement.",
  },
  {
    name: "Dance motion transfer",
    icon: "♫",
    prompt:
      "Transfer the complete dance performance to my reference character. Match the beat, footwork, gestures, body rotations, and timing of the source. Keep the identity consistent throughout.",
  },
  {
    name: "Fashion film",
    icon: "↗",
    prompt:
      "Transform this performance into a high-end fashion film using my reference character. Follow the original movement and camera timing, with special attention to consistent garment details and natural fabric motion.",
  },
  {
    name: "Social media",
    icon: "▤",
    prompt:
      "Recreate the source performance with my reference character for a compelling social video. Preserve the original energy, motion sequence, and timing. Keep character features clear and consistent.",
  },
];
export function Studio() {
  const { data, loading, refresh, openConfig, t } = useWorkspace(),
    search = useSearchParams();
  const [source, setSource] = useState<Asset | null>(null),
    [characters, setCharacters] = useState<Asset[]>([]),
    [name, setName] = useState("Untitled transformation"),
    [prompt, setPrompt] = useState(""),
    [aspect, setAspect] = useState<Aspect>("original"),
    [audio, setAudio] = useState<"preserve" | "mute">("preserve"),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [pid, setPid] = useState<string | null>(null);
  const [view, setView] = useState<"source" | "result" | "compare">("source"),
    [saving, setSaving] = useState(false),
    [generating, setGenerating] = useState(false),
    [consent, setConsent] = useState(false),
    [saved, setSaved] = useState(false),
    [how, setHow] = useState(false),
    [library, setLibrary] = useState(false),
    [edit, setEdit] = useState(false),
    [rename, setRename] = useState(false),
    [download, setDownload] = useState(false),
    [filename, setFilename] = useState(""),
    [fullPreview, setFullPreview] = useState(false),
    [cropRatio, setCropRatio] = useState("original"),
    [enhance, setEnhance] = useState(false),
    [editing, setEditing] = useState(false),
    [sampleLoading, setSampleLoading] = useState(false);
  const loaded = useRef(""),
    preview = useRef<HTMLDivElement>(null);
  const searchKey = search.toString();
  useEffect(() => {
    if (!data) return;
    const key = `${data.user.id}:${searchKey}`;
    if (loaded.current === key) return;
    loaded.current = key;
    const projectId = search.get("project"),
      characterId = search.get("character");
    const p = projectId ? data.projects.find((p) => p.id === projectId) : null;
    if (projectId && !p) {
      toast.error("This project is not available in your workspace.");
      return;
    }
    let draft: any = null;
    try {
      draft = JSON.parse(
        localStorage.getItem(`modify_studio_${data.user.id}`) || "null",
      );
    } catch {}
    const initial = p || (!characterId ? draft : null);
    if (initial) {
      setPid(p?.id || initial.id || null);
      setName(initial.name || "Untitled transformation");
      setPrompt(initial.prompt || "");
      setSource(data.assets.find((a) => a.id === initial.source_id) || null);
      setCharacters(
        (initial.character_ids || [])
          .map((cid: string) => data.assets.find((a) => a.id === cid))
          .filter(Boolean),
      );
      setStart(initial.trim_start || 0);
      setEnd(initial.trim_end || 0);
      setAspect(initial.aspect || "original");
      setAudio(initial.audio || "preserve");
      setView(p?.output_url ? "result" : "source");
    }
    if (characterId) {
      const char = data.assets.find((a) => a.id === characterId);
      if (char) setCharacters([char]);
    }
  }, [data, searchKey, search]);
  useEffect(() => {
    if (!data || !loaded.current) return;
    localStorage.setItem(
      `modify_studio_${data.user.id}`,
      JSON.stringify({
        id: pid,
        name,
        prompt,
        source_id: source?.id || null,
        character_ids: characters.map((a) => a.id),
        trim_start: start,
        trim_end: end,
        aspect,
        audio,
      }),
    );
    setSaved(false);
  }, [
    pid,
    name,
    prompt,
    source,
    characters,
    start,
    end,
    aspect,
    audio,
    data?.user.id,
  ]);
  const current = data?.projects.find((p) => p.id === pid),
    job = data?.jobs.find((j) => j.project_id === pid),
    active = job && ["queued", "uploading", "processing"].includes(job.status);
  const duration = Math.max(0, end - start),
    cost = Math.ceil(duration * (data?.config.creditsPerSecond || 5));
  const payload = () => ({
    name,
    prompt,
    source_id: source?.id || null,
    character_ids: characters.map((c) => c.id),
    trim_start: start,
    trim_end: end,
    aspect,
    audio,
  });
  const save = async () => {
    setSaving(true);
    try {
      const result = await api<{ id: string }>(
        `projects${pid ? `/${pid}` : ""}`,
        { method: pid ? "PATCH" : "POST", body: JSON.stringify(payload()) },
      );
      setPid(result.id);
      setSaved(true);
      await refresh();
      return result.id;
    } finally {
      setSaving(false);
    }
  };
  const onSave = async () => {
    try {
      await save();
      toast.success("Project saved. Pick it up any time in My Projects.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const generate = async () => {
    if (!source) {
      toast.error(
        "First, upload the video with the motion you want to recreate.",
      );
      return;
    }
    if (!characters.length) {
      toast.error("Add a character reference image to continue.");
      return;
    }
    if (duration < 4 || duration > 30.01) {
      toast.error("Choose a clip between 4 and 30 seconds.");
      return;
    }
    if (!consent) {
      toast.error(
        "Confirm your media and likeness permissions before generating.",
      );
      return;
    }
    if (!data?.config.provider || !data.config.workerOnline) {
      openConfig();
      return;
    }
    if (data.user.role === "guest") {
      toast("Save your creative space first.", {
        description: "Create an account to start a real generation.",
        action: {
          label: "Create account",
          onClick: () => window.location.assign("/signup"),
        },
      });
      return;
    }
    setGenerating(true);
    try {
      const projectId = await save();
      await post(`projects/${projectId}/generate`, { consent: true });
      await refresh();
      setView("result");
      toast.success(
        "You’re in the queue. We’ll notify you when your video is ready.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };
  const changeSource = (asset: Asset | null) => {
    setSource(asset);
    setStart(0);
    setEnd(asset ? Math.min(30, asset.metadata.duration || 0) : 0);
    setView("source");
  };
  const useCharacter = (asset: Asset) => {
    setCharacters((prev) =>
      prev.some((c) => c.id === asset.id)
        ? prev.filter((c) => c.id !== asset.id)
        : prev.length < 8
          ? [...prev, asset]
          : prev,
    );
  };
  const newProject = () => {
    setPid(null);
    setSource(null);
    setCharacters([]);
    setPrompt("");
    setName("Untitled transformation");
    setStart(0);
    setEnd(0);
    setAspect("original");
    setAudio("preserve");
    setView("source");
    setConsent(false);
    window.history.replaceState(null, "", "/");
    toast.success("A fresh canvas. Let’s make something great.");
  };
  const useConcept = async () => {
    setSampleLoading(true);
    try {
      const response = await fetch("/images/character-editorial.jpg");
      const blob = await response.blob();
      const form = new FormData();
      form.append("file", blob, "Studio muse.jpg");
      form.append("kind", "image");
      const result = await api<{ asset: Asset }>("uploads", {
        method: "POST",
        body: form,
      });
      setCharacters([result.asset]);
      await refresh();
      setLibrary(false);
      toast.success("Studio Muse is ready. Add your own motion reference.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSampleLoading(false);
    }
  };
  const editImage = async () => {
    if (!characters[0]) return;
    setEditing(true);
    try {
      const result = await post<{ asset: Asset }>(
        `images/${characters[0].id}/edit`,
        { ratio: cropRatio, enhance },
      );
      setCharacters((prev) => [result.asset, ...prev.slice(1)]);
      await refresh();
      setEdit(false);
      toast.success("Edited character saved as a new reference.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditing(false);
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="studio-page"
    >
      <div className="studio-announcement">
        <span>
          <Sparkles size={12} /> MEET YOUR NEXT CREATIVE SUPERPOWER
        </span>
        <Link href="/discover">
          A whole new way to move <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="page-heading studio-heading">
        <div>
          <h1>
            {t.studioTitle}
            <span className="headline-spark">✧</span>
          </h1>
          <p>{t.studioSubtitle}</p>
        </div>
        <div className="heading-actions">
          <button className="how-button" onClick={() => setHow(true)}>
            <CircleHelp size={15} />
            {t.how}
          </button>
          <Button
            onClick={onSave}
            loading={saving}
            disabled={loading || !!active}
          >
            <Bookmark size={15} />
            {saved ? "Saved" : t.save}
          </Button>
        </div>
      </div>
      <div className="studio-workspace">
        <div className="workspace-toolbar">
          <div className="workspace-title">
            <span className="workspace-title-icon">
              <WandSparkles size={17} />
            </span>
            <span>{t.studio}</span>
            <span className="beta-badge">BETA</span>
          </div>
          <div className="project-toolbar">
            <button onClick={() => setRename(true)} className="project-name">
              {name}
              <ChevronDown size={12} />
            </button>
            <span className="toolbar-divider" />
            <Menu
              label="Project options"
              items={[
                {
                  label: "New project",
                  icon: <Plus size={14} />,
                  onClick: newProject,
                },
                {
                  label: "Rename project",
                  icon: <Bookmark size={14} />,
                  onClick: () => setRename(true),
                },
                {
                  label: "Service configuration",
                  icon: <Settings2 size={14} />,
                  onClick: openConfig,
                },
              ]}
            />
          </div>
        </div>
        <div className="studio-grid">
          <section className="input-panel">
            <div className="panel-eyebrow">
              MAKE IT YOURS <span>2 simple inputs</span>
            </div>
            <UploadCard kind="video" asset={source} onChange={changeSource} />
            {source && (
              <div className="trim-control">
                <div>
                  <label htmlFor="trim-start">Trim your motion</label>
                  <span>{duration.toFixed(1)}s selected</span>
                </div>
                <div className="trim-fields">
                  <label>
                    <span>IN</span>
                    <input
                      id="trim-start"
                      aria-label="Trim start in seconds"
                      type="number"
                      min="0"
                      max={Math.max(0, end - 4)}
                      step="0.1"
                      value={start}
                      onChange={(e) =>
                        setStart(Math.max(0, Number(e.target.value)))
                      }
                    />
                    <small>s</small>
                  </label>
                  <span>→</span>
                  <label>
                    <span>OUT</span>
                    <input
                      aria-label="Trim end in seconds"
                      type="number"
                      min={start + 4}
                      max={source.metadata.duration}
                      step="0.1"
                      value={end}
                      onChange={(e) =>
                        setEnd(
                          Math.min(
                            source.metadata.duration || 30,
                            Number(e.target.value),
                          ),
                        )
                      }
                    />
                    <small>s</small>
                  </label>
                </div>
                <small
                  className={duration < 4 || duration > 30 ? "field-error" : ""}
                >
                  4–30 seconds · Your original stays untouched
                </small>
              </div>
            )}
            <div className="input-connector">
              <span />
              <ArrowDownToLine size={12} />
              <span />
            </div>
            <UploadCard
              kind="image"
              asset={characters[0] || null}
              onChange={(asset) =>
                setCharacters(
                  asset ? [asset, ...characters.slice(1)] : characters.slice(1),
                )
              }
              onLibrary={() => setLibrary(true)}
              onEdit={() => setEdit(true)}
            />
            {characters.length > 0 && (
              <div className="additional-references">
                {characters.slice(1).map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setCharacters((prev) => prev.filter((x) => x.id !== c.id))
                    }
                    title="Remove reference"
                  >
                    <img src={c.url} alt={c.name} />
                    <X size={9} />
                  </button>
                ))}
                {characters.length < 8 && (
                  <button
                    className="add-reference"
                    onClick={() => setLibrary(true)}
                  >
                    <Plus size={12} /> Add reference
                  </button>
                )}
                <small>{characters.length}/8</small>
              </div>
            )}
            <div className="prompt-section">
              <div className="prompt-label">
                <label htmlFor="transformation-prompt">
                  <Sparkles size={13} />
                  {t.prompt}
                </label>
                <span>{t.optional}</span>
              </div>
              <textarea
                id="transformation-prompt"
                value={prompt}
                maxLength={10000}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Keep the moves. Change the character. Add your own creative direction…"
                rows={3}
              />
              <div className="prompt-bottom">
                <Menu
                  label="Choose a prompt preset"
                  items={presets.map((p) => ({
                    label: p.name,
                    icon: <span>{p.icon}</span>,
                    onClick: () => {
                      setPrompt(p.prompt);
                      toast.success(`${p.name} preset applied.`);
                    },
                  }))}
                >
                  <span className="preset-button">
                    <WandSparkles size={12} /> Prompt presets{" "}
                    <ChevronDown size={10} />
                  </span>
                </Menu>
                <span>{prompt.length}/10,000</span>
              </div>
            </div>
            <div className="input-footer">
              <ShieldCheck size={13} /> Your media. Private by default.
            </div>
          </section>
          <section className="preview-panel">
            <div className="preview-panel-header">
              <div className="preview-tabs">
                <button
                  className={view === "source" ? "active" : ""}
                  onClick={() => setView("source")}
                >
                  {t.original}
                </button>
                <button
                  className={view === "result" ? "active" : ""}
                  onClick={() => setView("result")}
                >
                  {t.output}
                  {current?.output_url && <span className="result-dot" />}
                </button>
                <button
                  className={view === "compare" ? "active" : ""}
                  onClick={() => setView("compare")}
                  title="Compare a completed output with the source"
                >
                  <Layers3 size={13} />
                </button>
              </div>
              <button
                className="icon-button"
                aria-label="Expand preview"
                onClick={() => setFullPreview(true)}
              >
                <Maximize2 size={15} />
              </button>
            </div>
            <div
              className={cn(
                "main-preview",
                source && view === "source" && "has-video",
              )}
              ref={preview}
            >
              {view === "source" ? (
                source ? (
                  <VideoPlayer
                    src={source.url}
                    start={start}
                    end={end}
                    poster={
                      (source.metadata as any).thumbnail_id
                        ? `/api/assets/${(source.metadata as any).thumbnail_id}`
                        : undefined
                    }
                  />
                ) : (
                  <div className="inspiration-preview">
                    <img
                      src="/images/motion-editorial.jpg"
                      alt="Illustrative fashion dancer concept in a violet-lit concrete plaza"
                    />
                    <div className="inspiration-top">
                      <span className="live-pill">
                        <span /> A LITTLE INSPIRATION
                      </span>
                      <span className="preview-hd">HD</span>
                    </div>
                    <div className="inspiration-gradient" />
                    <div className="inspiration-content">
                      <span className="concept-tag">
                        YOUR NEXT MAIN CHARACTER
                      </span>
                      <h2>
                        The moves stay.
                        <br />
                        The story changes.
                      </h2>
                      <p>One performance. A world of possibilities.</p>
                      <button
                        onClick={() => setHow(true)}
                        className="preview-explore"
                      >
                        <span>
                          <Play size={11} fill="currentColor" />
                        </span>{" "}
                        See how it works <ArrowUpRight size={13} />
                      </button>
                    </div>
                    <div className="concept-disclaimer">
                      Illustrative concept · not a generated video
                    </div>
                    <span className="preview-corner top-left" />
                    <span className="preview-corner bottom-right" />
                  </div>
                )
              ) : current?.output_url ? (
                view === "compare" ? (
                  <VideoComparison
                    original={source?.url || current.source_url!}
                    result={current.output_url}
                    start={start}
                  />
                ) : (
                  <VideoPlayer src={current.output_url} />
                )
              ) : active ? (
                <div className="processing-state">
                  <span className="processing-orb">
                    <WandSparkles size={32} />
                  </span>
                  <StatusBadge status={job.status} />
                  <h3>Great things are in motion.</h3>
                  <p>{job.stage}</p>
                  <small>
                    No invented percentages. We’re tracking the real processing
                    state.
                  </small>
                  <Link href="/queue" className="btn btn-secondary">
                    View generation queue <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={<Film size={31} />}
                  title={
                    job?.status === "failed"
                      ? "Let’s try a different take."
                      : "Your next great video goes here."
                  }
                  description={
                    job?.error ||
                    "Upload your motion and character references, then generate. Your real 720p result will appear here."
                  }
                  action={
                    <Button onClick={() => setView("source")}>
                      Back to your source <ArrowRight size={14} />
                    </Button>
                  }
                />
              )}
            </div>
            <div className="preview-meta">
              <span>
                <Monitor size={13} />
                {source
                  ? `${source.metadata.width} × ${source.metadata.height}`
                  : "Your creative playground"}
              </span>
              <span>
                {source ? (
                  <>
                    <Clock3 size={12} />
                    {duration.toFixed(1)}s
                  </>
                ) : (
                  <>
                    <span className="tiny-purple-dot" /> Motion transfer
                  </>
                )}
              </span>
            </div>
            <div className="preview-tip">
              <div className="tip-icon">
                <Sparkles size={16} />
              </div>
              <div>
                <strong>A new identity. The same energy.</strong>
                <p>
                  Your character follows the source performance.
                  <br />
                  You bring the idea. Let the AI bring the motion.
                </p>
              </div>
            </div>
            {current?.output_url && (
              <div className="output-download">
                <span>
                  <Check size={14} /> AI-generated · 720p MP4
                </span>
                <Button
                  variant="primary"
                  onClick={() => {
                    setFilename(name);
                    setDownload(true);
                  }}
                >
                  <Download size={14} />
                  {t.download}
                </Button>
              </div>
            )}
            <div className="preview-bottom-note">
              <ShieldCheck size={12} /> Create responsibly. Share transparently.
            </div>
          </section>
          <section className="settings-panel">
            <div className="settings-title">
              <Settings2 size={15} />
              <h3>The finer details</h3>
              <Info size={13} className="muted" />
            </div>
            <label className="setting-label">
              AI model <span className="recommended-badge">RECOMMENDED</span>
            </label>
            <button className="model-selector" onClick={openConfig}>
              <span className="model-icon">
                <WandSparkles size={19} />
              </span>
              <span>
                <strong>Genjutsu Motion</strong>
                <small>
                  Higgsfield <span>·</span> v1.0
                </small>
              </span>
              <ChevronDown size={13} />
            </button>
            <button
              className={cn(
                "provider-status",
                data?.config.provider && data.config.workerOnline && "ready",
              )}
              onClick={openConfig}
            >
              <i />
              {data?.config.provider && data.config.workerOnline
                ? "AI engine connected"
                : "Connect your AI engine"}
              <ArrowUpRight size={11} />
            </button>
            <div className="setting-divider" />
            <div className="setting-label">Generation mode</div>
            <div className="mode-selected">
              <ScanFace size={15} /> Motion transfer <Check size={13} />
            </div>
            <div className="quality-heading">
              <label className="setting-label">Output quality</label>
              <span className="included-label">Included</span>
            </div>
            <div className="quality-selected">
              <span>
                <Monitor size={14} />
                720p <strong>HD</strong>
              </span>
              <span className="selected-radio">
                <span />
              </span>
            </div>
            <div className="setting-label aspect-label">
              Aspect ratio{" "}
              <span title="Other aspect ratios are fitted with padding during export. The image is never stretched.">
                <Info size={12} />
              </span>
            </div>
            <div className="aspect-options">
              {(
                [
                  { value: "original", label: "Original", icon: Expand },
                  { value: "16:9", label: "16:9", icon: RectangleHorizontal },
                  { value: "9:16", label: "9:16", icon: RectangleVertical },
                  { value: "1:1", label: "1:1", icon: Square },
                  { value: "4:5", label: "4:5", icon: Crop },
                ] as const
              ).map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAspect(a.value)}
                  className={cn(aspect === a.value && "selected")}
                  aria-pressed={aspect === a.value}
                >
                  <a.icon size={17} strokeWidth={1.5} />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
            <p className="aspect-note">
              {aspect === "original"
                ? "Keep your original framing."
                : "Fitted with padding. Never stretched."}
            </p>
            <div className="setting-divider" />
            <Toggle
              checked={audio === "preserve"}
              onChange={(c) => setAudio(c ? "preserve" : "mute")}
              label="Keep original audio"
              description="The soundtrack stays with the motion."
            />
            <div className="fidelity-note">
              <ShieldCheck size={14} />
              <span>
                Motion & identity fidelity<small>Managed by the AI model</small>
              </span>
              <span title="The provider controls pose, temporal consistency, and character identity. Separate enhancement controls are not available in this model.">
                <Info size={12} />
              </span>
            </div>
            <div className="generation-summary">
              <div>
                <span>Estimated credits</span>
                <strong>
                  <Zap size={13} fill="currentColor" />
                  {cost || "—"}
                  <small>credits</small>
                </strong>
              </div>
              <p>
                {source
                  ? `${duration.toFixed(1)}s clip · ${data?.config.creditsPerSecond || 5} credits / second`
                  : "Based on your selected clip length"}
              </p>
            </div>
            <label className="consent-checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I have permission to use this media and all likenesses.{" "}
                <Link href="/legal#responsible-use" target="_blank">
                  Our policy <ArrowUpRight size={9} />
                </Link>
              </span>
            </label>
            <Button
              className="generate-button"
              variant="primary"
              onClick={generate}
              loading={generating || !!active}
              disabled={loading || saving}
            >
              <Sparkles size={16} />
              {active ? "Creating your video…" : "Generate with MODIFY AI"}
            </Button>
            <div className="generation-footnote">
              <span className="tiny-purple-dot" /> MP4 export <span>·</span>{" "}
              720p HD <span>·</span> Private
            </div>
          </section>
        </div>
      </div>
      <section className="inspiration-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">
              THE ONLY LIMIT IS YOUR IMAGINATION
            </span>
            <h2>A new perspective on every performance.</h2>
          </div>
          <Link href="/discover#possibilities">
            Explore possibilities <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="inspiration-cards">
          <button
            className="inspiration-card card-dance"
            onClick={() => {
              setPrompt(presets[4].prompt);
              toast.success(
                "Dance preset applied. Add your own references to begin.",
              );
            }}
          >
            <img
              src="/images/motion-editorial.jpg"
              alt="Silver-jacket dancer concept"
            />
            <div>
              <span className="use-case-icon">
                <Clapperboard size={17} />
              </span>
              <span>
                <strong>Reimagine the dance floor.</strong>
                <small>Every beat. A brand-new character.</small>
              </span>
              <ArrowUpRight size={18} />
            </div>
            <span className="inspiration-card-tag">DANCE & PERFORMANCE</span>
          </button>
          <button
            className="inspiration-card card-character"
            onClick={() => setLibrary(true)}
          >
            <img
              src="/images/character-editorial.jpg"
              alt="Original silver-haired 3D character concept"
            />
            <div>
              <span className="use-case-icon">
                <ScanFace size={17} />
              </span>
              <span>
                <strong>Give your character a life.</strong>
                <small>From a single image to a moving story.</small>
              </span>
              <ArrowUpRight size={18} />
            </div>
            <span className="inspiration-card-tag">CHARACTER ANIMATION</span>
          </button>
          <button
            className="inspiration-card card-cinematic"
            onClick={() => {
              setPrompt(presets[1].prompt);
              toast.success(
                "Cinematic preset applied. Your next scene starts here.",
              );
            }}
          >
            <img
              src="/images/motion-concept.jpg"
              alt="Illustrative cinematic android dancer concept"
            />
            <div>
              <span className="use-case-icon">
                <Film size={17} />
              </span>
              <span>
                <strong>Cast a different kind of lead.</strong>
                <small>Your next scene is anything but ordinary.</small>
              </span>
              <ArrowUpRight size={18} />
            </div>
            <span className="inspiration-card-tag">CINEMATIC STORYTELLING</span>
          </button>
        </div>
      </section>
      <Modal
        open={how}
        onOpenChange={setHow}
        title="A little input. A whole new possibility."
        description="Your first transformation, in three simple steps."
        className="how-modal"
      >
        <div className="how-steps">
          {[
            {
              n: "01",
              icon: <Film />,
              title: "Start with the motion.",
              text: "Upload a source video. Trim your favorite 4–30 seconds. Choose a clear, single-subject performance.",
            },
            {
              n: "02",
              icon: <ScanFace />,
              title: "Meet your new character.",
              text: "Add 1–8 image references. Clear faces and full-body images give the model more to work with.",
            },
            {
              n: "03",
              icon: <Sparkles />,
              title: "Make something only you could.",
              text: "Confirm your rights, generate with the real AI model, then preview and download a private 720p MP4.",
            },
          ].map((s) => (
            <div key={s.n}>
              <span className="how-icon">
                {s.icon}
                <small>{s.n}</small>
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <div className="info-box">
          <Info size={17} />
          <p>
            Motion transfer needs a connected Higgsfield account and processing
            worker. Results depend on the source performance and model
            capabilities—not every gesture or facial detail can be reproduced
            exactly.
          </p>
        </div>
        <div className="modal-actions">
          <Button onClick={openConfig}>Check service setup</Button>
          <Button variant="primary" onClick={() => setHow(false)}>
            Let’s create <ArrowRight size={15} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={library}
        onOpenChange={setLibrary}
        title="Meet your next main character."
        description="Choose up to 8 reference images. Selected references are outlined in violet."
        className="library-modal"
      >
        <div className="character-picker-grid">
          {data?.characters.map((c) => {
            const asset = data.assets.find((a) => a.id === c.asset_id);
            return (
              <button
                key={c.id}
                disabled={!asset}
                className={cn(
                  "character-picker-card",
                  characters.some((x) => x.id === c.asset_id) && "selected",
                )}
                onClick={() => asset && useCharacter(asset)}
              >
                <img src={c.url} alt={c.name} />
                <span>{c.name}</span>
                {characters.some((x) => x.id === c.asset_id) && (
                  <i>
                    <Check size={13} />
                  </i>
                )}
              </button>
            );
          })}
          <div className="character-picker-card concept-character">
            <img
              src="/images/character-editorial.jpg"
              alt="Studio Muse original concept reference"
            />
            <span>
              Studio Muse <small>Sample reference</small>
            </span>
            <Button loading={sampleLoading} onClick={useConcept}>
              <Plus size={13} />
              Use this character
            </Button>
          </div>
        </div>
        <div className="modal-actions">
          <Link href="/characters" className="text-button">
            Manage library <ArrowUpRight size={13} />
          </Link>
          <Button variant="primary" onClick={() => setLibrary(false)}>
            Use {characters.length || "selected"} reference
            {characters.length !== 1 ? "s" : ""} <Check size={14} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="A reference, refined."
        description="Non-AI crop and enhancement. An edited copy will be saved to your library."
      >
        <div className="edit-image-preview">
          {characters[0] && (
            <img
              src={characters[0].url}
              alt="Character to edit"
              style={{
                aspectRatio:
                  cropRatio === "original"
                    ? undefined
                    : cropRatio.replace(":", "/"),
                objectFit: "cover",
              }}
            />
          )}
        </div>
        <label className="form-field">
          Centered crop
          <Select
            label="Crop aspect ratio"
            value={cropRatio}
            onChange={setCropRatio}
            options={["original", "1:1", "4:5", "3:4"].map((v) => ({
              value: v,
              label: v === "original" ? "Original framing" : v,
            }))}
          />
        </label>
        <Toggle
          checked={enhance}
          onChange={setEnhance}
          label="Basic image enhancement"
          description="Normalize contrast and gently sharpen details."
        />
        <div className="unavailable-note">
          <Info size={14} /> AI subject detection and background removal are not
          available with the current backend.
        </div>
        <div className="modal-actions">
          <Button onClick={() => setEdit(false)}>Cancel</Button>
          <Button variant="primary" loading={editing} onClick={editImage}>
            Save edited copy <Check size={14} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={rename}
        onOpenChange={setRename}
        title="Every great idea needs a name."
        description="Give your project a name you’ll remember."
      >
        <label className="form-field">
          Project name
          <input
            className="input"
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <Button
            variant="primary"
            onClick={() => setRename(false)}
            disabled={!name.trim()}
          >
            Done <Check size={14} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={download}
        onOpenChange={setDownload}
        title="Ready for the world."
        description="Your actual completed video. H.264 MP4, 720p HD, with AAC audio when applicable."
      >
        <label className="form-field">
          File name
          <div className="filename-input">
            <input
              className="input"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              maxLength={100}
            />
            <span>.mp4</span>
          </div>
        </label>
        <div className="info-box">
          <ShieldCheck size={18} />
          <p>
            This video is AI-generated. Disclose its synthetic nature when
            sharing. A disclosure is included in the MP4 metadata; this is not
            cryptographic C2PA provenance.
          </p>
        </div>
        <div className="modal-actions">
          <Button onClick={() => setDownload(false)}>Back to studio</Button>
          {current?.output_url && (
            <a
              className="btn btn-primary"
              href={`${current.output_url}?download=1&name=${encodeURIComponent(filename)}`}
              download
              onClick={() => setDownload(false)}
            >
              <Download size={16} />
              Download MP4
            </a>
          )}
        </div>
      </Modal>
      <Modal
        open={fullPreview}
        onOpenChange={setFullPreview}
        title="Your performance, front and center."
        description={
          current?.output_url && view !== "source"
            ? "AI-generated video · 720p MP4"
            : "Your source media or illustrative concept."
        }
        className="fullscreen-modal"
      >
        {view === "result" && current?.output_url ? (
          <VideoPlayer src={current.output_url} />
        ) : source ? (
          <VideoPlayer src={source.url} start={start} end={end} />
        ) : (
          <img
            className="fullscreen-concept"
            src="/images/motion-editorial.jpg"
            alt="Illustrative dancer concept, not a generated video"
          />
        )}
      </Modal>
    </motion.div>
  );
}
