"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  Fingerprint,
  Play,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
  MonitorPlay,
  Film,
  UsersRound,
  Zap,
  Check,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { MediaImage } from "../ui/media-image";
import { api } from "@/lib/utils";
import type { Plan } from "@/lib/types";

const features = [
  {
    icon: ScanFace,
    title: "Character identity lock",
    text: "Keep faces, outfits, and design language consistent across every frame the model can reconstruct.",
  },
  {
    icon: Fingerprint,
    title: "Faithful motion transfer",
    text: "Walks, dances, turns, gestures, and camera-relative movement stay timed to the source performance.",
  },
  {
    icon: MonitorPlay,
    title: "720p HD MP4 export",
    text: "Download H.264 video with AAC audio when present. Landscape, portrait, and square are fitted—never stretched.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    text: "Uploads live in user-scoped storage. Generation never claims success without a real provider result.",
  },
  {
    icon: Clapperboard,
    title: "Studio-grade workflow",
    text: "Trim 4–30s clips, reuse characters, track the queue, and reopen every completed project.",
  },
  {
    icon: WandSparkles,
    title: "Real AI backend",
    text: "Official Higgsfield Genjutsu Motion Transfer when credentials are configured—no simulated videos.",
  },
];

const uses = [
  {
    title: "Dance & performance",
    text: "Recast a routine with a new lead while keeping the original choreography.",
  },
  {
    title: "Character animation",
    text: "Bring 3D, anime, or illustrated characters into a live-action motion plate.",
  },
  {
    title: "Fashion & editorial",
    text: "Swap talent for lookbooks and social films without restaging the shoot.",
  },
  {
    title: "Story & cinematic",
    text: "Prototype scenes with a different protagonist before a full production.",
  },
];

const faqs = [
  {
    q: "Is generation actually AI, or a demo?",
    a: "MODIFY AI calls a real motion-transfer provider. If credentials or the worker are missing, the studio explains what to configure instead of inventing a result.",
  },
  {
    q: "What video lengths are supported?",
    a: "The first release accepts a 4–30 second trimmed clip. Longer sequences are architected for later, not claimed today.",
  },
  {
    q: "Which formats can I upload?",
    a: "Common video containers such as MP4, MOV, WEBM, MKV, and others are inspected server-side and normalized to H.264 MP4 when codecs are supported. Unsupported files fail with a clear message.",
  },
  {
    q: "Do I own the output?",
    a: "You are responsible for having rights to the source video and likeness. Outputs are stored privately in your workspace and downloadable as 720p MP4.",
  },
  {
    q: "Can I use someone else's face?",
    a: "Only with permission. You must confirm rights before generating. Non-consensual, deceptive, or intimate misuse is prohibited.",
  },
  {
    q: "What if Higgsfield is not connected?",
    a: "You can still upload, trim, save projects, and manage characters. Real generation requires HF_CREDENTIALS and a running worker.",
  },
];

function BeforeAfter() {
  const [pos, setPos] = useState(58);
  return (
    <div className="hero-frame">
      <div className="ba-wrap">
        <MediaImage
          src="/images/motion-editorial.jpg"
          alt="Illustrative source performance concept"
          priority
        />
        <div className="ba-layer" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <MediaImage
            src="/images/motion-concept.jpg"
            alt="Illustrative character replacement concept"
            priority
          />
        </div>
        <span className="compare-label before-label">Original motion</span>
        <span className="compare-label after-label">Your character</span>
        <div className="ba-handle" style={{ left: `${pos}%` }}>
          <b>↔</b>
        </div>
        <input
          className="ba-range"
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label="Before and after comparison"
          onChange={(e) => setPos(Number(e.target.value))}
        />
      </div>
      <p className="concept-disclaimer" style={{ position: "relative" }}>
        Illustrative concept artwork · not a generated video
      </p>
    </div>
  );
}

export function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    api<{ plans: Plan[] }>("plans", { method: "GET" })
      .then((d) => setPlans(d.plans))
      .catch(() => setPlans([]));
  }, []);
  return (
    <div className="marketing">
      <SiteHeader />
      <section className="hero">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="hero-kicker">
            <Sparkles size={14} /> YOUR CHARACTER. ANY MOTION.
          </div>
          <h1>
            Turn any motion into{" "}
            <span className="gradient-text">your character.</span>
          </h1>
          <p className="lead">
            Upload a video, choose your character, and let MODIFY AI recreate
            every movement with stunning AI-powered precision.
          </p>
          <div className="hero-ctas">
            <Link href="/create" className="btn btn-primary">
              Start creating <ArrowRight size={16} />
            </Link>
            <a href="#demo" className="btn btn-secondary">
              <Play size={15} fill="currentColor" /> Watch demo
            </a>
          </div>
          <p className="hero-note">
            720p HD MP4 · 4–30s clips · Private workspace
          </p>
        </motion.div>
        <div className="hero-visual">
          <span className="hero-orb" />
          <BeforeAfter />
        </div>
      </section>

      <section className="section" id="demo">
        <div className="center">
          <span className="section-kicker">INTERACTIVE TRANSFORMATION</span>
          <h2>See the idea before you generate.</h2>
          <p className="lead">
            Drag the slider to compare an original performance plate with a new
            character concept. Your real results appear in the studio after a
            successful generation.
          </p>
        </div>
        <div style={{ maxWidth: 860, margin: "32px auto 0" }}>
          <BeforeAfter />
        </div>
      </section>

      <section className="section alt" id="how">
        <div className="section-inner">
          <div className="center">
            <span className="section-kicker">HOW MODIFY AI WORKS</span>
            <h2>Three steps. A new lead.</h2>
            <p className="lead">
              A familiar performance. An entirely new possibility.
            </p>
          </div>
          <div className="steps">
            {[
              {
                n: "01",
                icon: Upload,
                title: "Upload your video",
                text: "Bring the original clip that contains the movements you want to reproduce. We inspect, convert, and let you trim 4–30 seconds.",
              },
              {
                n: "02",
                icon: ScanFace,
                title: "Upload your character",
                text: "Add a photo, illustration, 3D render, or anime still. Save it to your library and reuse it on future projects.",
              },
              {
                n: "03",
                icon: WandSparkles,
                title: "Generate your video",
                text: "The AI recreates the performance with your character. Preview, compare, and download a private 720p MP4.",
              },
            ].map((s) => (
              <div className="step-card" key={s.n}>
                <span className="n">{s.n}</span>
                <span className="icon-blob">
                  <s.icon size={18} />
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="center">
          <span className="section-kicker">MAIN AI FEATURES</span>
          <h2>Built for motion, not filters.</h2>
        </div>
        <div className="feature-grid">
          {features.map((f) => (
            <article className="feature-card" key={f.title}>
              <span className="icon-blob">
                <f.icon size={18} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="gallery">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">BEFORE / AFTER GALLERY</span>
            <h2>Concept frames from the studio.</h2>
          </div>
        </div>
        <div className="gallery-grid">
          {[
            [
              "/images/motion-editorial.jpg",
              "Editorial dance plate · illustrative",
            ],
            [
              "/images/character-editorial.jpg",
              "Character identity study · illustrative",
            ],
            [
              "/images/motion-concept.jpg",
              "Cinematic recast concept · illustrative",
            ],
          ].map(([src, cap]) => (
            <figure className="gallery-item" key={src}>
              <MediaImage src={src} alt={cap} />
              <figcaption>{cap}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section alt" id="possibilities">
        <div className="section-inner">
          <div className="center">
            <span className="section-kicker">CREATIVE USE CASES</span>
            <h2>A new perspective on every performance.</h2>
          </div>
          <div className="use-grid">
            {uses.map((u) => (
              <article className="use-card" key={u.title}>
                <span className="icon-blob">
                  <Film size={18} />
                </span>
                <h3>{u.title}</h3>
                <p>{u.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="center">
          <span className="section-kicker">PRODUCT BENEFITS</span>
          <h2>Simple enough for a first take.</h2>
        </div>
        <div className="benefit-grid">
          {[
            {
              icon: Zap,
              title: "One linear workflow",
              text: "Upload video → upload character → configure → generate → preview → download MP4.",
            },
            {
              icon: UsersRound,
              title: "Reusable characters",
              text: "Build a private library and drop saved identities into new projects in seconds.",
            },
            {
              icon: ShieldCheck,
              title: "Credits you can audit",
              text: "Reservations, refunds, and plan allowances stay consistent with the generation queue.",
            },
          ].map((b) => (
            <article className="benefit-card" key={b.title}>
              <span className="icon-blob">
                <b.icon size={18} />
              </span>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="section-inner center">
          <span className="section-kicker">PRICING PLANS</span>
          <h2>Start free. Scale when the work does.</h2>
          <p className="lead">
            Prices are configurable by administrators. Amounts below reflect the
            current catalog.
          </p>
          <div className="plan-grid">
            {(plans.length
              ? plans
              : [
                  {
                    id: "free",
                    name: "Free",
                    price: 0,
                    credits: 100,
                    features: [
                      "Trial credits",
                      "720p export",
                      "Motion studio",
                    ],
                    storageMb: 512,
                    history: "",
                    stripePriceConfigured: false,
                  },
                  {
                    id: "creator",
                    name: "Creator",
                    price: 2900,
                    credits: 500,
                    features: [
                      "Monthly credits",
                      "Character library",
                      "Priority queue",
                    ],
                    storageMb: 5120,
                    history: "",
                    stripePriceConfigured: false,
                  },
                  {
                    id: "pro",
                    name: "Pro",
                    price: 7900,
                    credits: 1600,
                    features: [
                      "Higher allowance",
                      "Expanded storage",
                      "Priority support",
                    ],
                    storageMb: 20480,
                    history: "",
                    stripePriceConfigured: false,
                  },
                ]
            ).map((plan) => (
              <article
                className={`plan-card ${plan.id === "creator" ? "featured" : ""}`}
                key={plan.id}
              >
                <span className="section-kicker">{plan.name}</span>
                <div className="price">
                  {plan.price === 0 ? "$0" : `$${(plan.price / 100).toFixed(0)}`}
                  <small style={{ fontSize: 14, color: "var(--text-dim)" }}>
                    {plan.price ? "/mo" : ""}
                  </small>
                </div>
                <p>{plan.credits.toLocaleString()} credits</p>
                <ul>
                  {plan.features.map((f) => (
                    <li className="check-item" key={f}>
                      <Check size={15} /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === "free" ? "/signup" : "/billing"}
                  className={`btn ${plan.id === "creator" ? "btn-primary" : "btn-secondary"}`}
                  style={{ width: "100%" }}
                >
                  {plan.id === "free" ? "Start free" : "Choose plan"}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="center">
          <span className="section-kicker">FREQUENTLY ASKED QUESTIONS</span>
          <h2>Clear answers before you upload.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((item, i) => (
            <button
              key={item.q}
              className="faq-item"
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              <strong>
                {item.q}
                <span>{open === i ? "–" : "+"}</span>
              </strong>
              {open === i && <p>{item.a}</p>}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="final-cta">
          <span className="section-kicker">READY WHEN YOU ARE</span>
          <h2>Make the next performance yours.</h2>
          <p className="lead">
            Open the studio, drop in a clip, and generate a real 720p result
            when your AI engine is connected.
          </p>
          <div className="hero-ctas" style={{ justifyContent: "center" }}>
            <Link href="/create" className="btn btn-primary">
              Start creating <ArrowUpRight size={16} />
            </Link>
            <Link href="/signup" className="btn btn-secondary">
              Create an account
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
