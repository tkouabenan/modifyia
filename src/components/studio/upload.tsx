"use client";
import { useRef, useState } from "react";
import {
  CloudUpload,
  ImagePlus,
  X,
  Check,
  LoaderCircle,
  Film,
  Crop,
  FolderOpen,
  RotateCcw,
} from "lucide-react";
import type { Asset } from "@/lib/types";
import { cn, formatBytes, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import { useWorkspace } from "../workspace/provider";
export function UploadCard({
  kind,
  asset,
  onChange,
  onLibrary,
  onEdit,
}: {
  kind: "video" | "image";
  asset: Asset | null;
  onChange: (asset: Asset | null) => void;
  onLibrary?: () => void;
  onEdit?: () => void;
}) {
  const { refresh, t } = useWorkspace();
  const input = useRef<HTMLInputElement>(null),
    request = useRef<XMLHttpRequest | null>(null);
  const [drag, setDrag] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const upload = (file: File) => {
    if (busy) return;
    setError("");
    setBusy(true);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error(data.error || "Upload failed.");
        onChange(data.asset);
        void refresh();
        toast.success(data.message);
      } catch (e) {
        setError((e as Error).message);
        toast.error((e as Error).message);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("Connection lost. Your file was not saved. Please try again.");
    };
    xhr.onabort = () => {
      setBusy(false);
      setProgress(0);
    };
    xhr.send(form);
  };
  const thumbnail =
    asset?.kind === "video" && (asset.metadata as any).thumbnail_id
      ? `/api/assets/${(asset.metadata as any).thumbnail_id}`
      : asset?.url;
  return (
    <div className="input-section">
      <div className="input-section-heading">
        <h3>
          <span className="step-number">{kind === "video" ? "01" : "02"}</span>
          {kind === "video" ? t.source : t.character}
        </h3>
        {kind === "image" && onLibrary && (
          <button className="text-button" onClick={onLibrary}>
            Library <FolderOpen size={12} />
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept={
          kind === "video"
            ? ".mp4,.mov,.avi,.mkv,.webm,.mpeg,.mpg,.m4v,.wmv,.flv,.3gp,.ts,.ogv,video/*"
            : ".jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.bmp,.tiff,.tif,.gif,image/*"
        }
        aria-label={
          kind === "video" ? "Upload original video" : "Upload character image"
        }
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {busy ? (
        <div className="upload-busy">
          <LoaderCircle size={24} className="spin" />
          <strong>
            {progress < 100
              ? `Uploading ${progress}%`
              : "Preparing your media…"}
          </strong>
          <p>
            {progress < 100
              ? "Securely transferring your file"
              : "Inspecting, converting, and saving"}
          </p>
          <div className="upload-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <button
            className="text-button"
            onClick={() => request.current?.abort()}
          >
            Cancel upload
          </button>
        </div>
      ) : asset ? (
        <div className="uploaded-card">
          <div
            className={cn(
              "uploaded-media",
              kind === "image" && "uploaded-character",
            )}
          >
            <img
              src={thumbnail}
              alt={
                kind === "video"
                  ? "Your video thumbnail"
                  : "Your character reference"
              }
            />
            <span className="uploaded-check">
              <Check size={12} />
            </span>
            <button
              className="uploaded-remove icon-button"
              aria-label={`Remove ${kind} reference`}
              onClick={() => onChange(null)}
            >
              <X size={13} />
            </button>
            {kind === "image" && onEdit && (
              <button className="edit-character" onClick={onEdit}>
                <Crop size={12} /> Edit image
              </button>
            )}
          </div>
          <div className="uploaded-meta">
            <div>
              <strong title={asset.name}>{asset.name}</strong>
              <small>
                {asset.metadata.width} × {asset.metadata.height} <span>·</span>{" "}
                {kind === "video"
                  ? `${formatTime(asset.metadata.duration || 0)} · ${Math.round(asset.metadata.fps || 30)} fps`
                  : formatBytes(asset.size)}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={`Replace ${kind}`}
              onClick={() => input.current?.click()}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          className={cn(
            "dropzone",
            drag && "drag-active",
            error && "has-error",
            kind === "image" && "image-dropzone",
          )}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
          }}
        >
          <span className="upload-icon">
            {kind === "video" ? (
              <CloudUpload size={23} strokeWidth={1.5} />
            ) : (
              <ImagePlus size={22} strokeWidth={1.5} />
            )}
          </span>
          <strong>{kind === "video" ? t.uploadVideo : t.uploadImage}</strong>
          <span>{kind === "video" ? t.videoHelp : t.imageHelp}</span>
          <small>
            {kind === "video"
              ? "MP4, MOV, WEBM & more · up to 200 MB"
              : "JPG, PNG, WEBP & more · up to 20 MB"}
          </small>
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!asset && kind === "video" && (
        <p className="input-guidance">
          <Film size={12} /> A clear, single-subject clip works best.
        </p>
      )}
      {!asset && kind === "image" && (
        <p className="input-guidance">
          A clear face. A full body. A little personality.
        </p>
      )}
    </div>
  );
}
