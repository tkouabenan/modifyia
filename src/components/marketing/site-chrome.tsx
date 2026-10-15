"use client";
import Link from "next/link";
import { Brand } from "../brand";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="site-header">
      <Brand />
      {!compact && (
        <nav className="site-nav" aria-label="Product">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
      )}
      <div className="site-actions">
        <Link href="/login" className="btn btn-ghost">
          Sign in
        </Link>
        <Link href="/create" className="btn btn-primary">
          Start creating <ArrowUpRight size={15} />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <Brand />
          <p>
            Your Character. Any Motion. Infinite Possibilities. Transform
            performances with real AI motion transfer and private 720p MP4
            exports.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link href="/create">Motion studio</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/help">Help & support</Link>
          <Link href="/discover">Product tour</Link>
        </div>
        <div>
          <h4>Workspace</h4>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create account</Link>
          <Link href="/overview">Dashboard</Link>
          <Link href="/billing">Credits & billing</Link>
        </div>
        <div>
          <h4>Trust</h4>
          <Link href="/legal">Terms of use</Link>
          <Link href="/legal#privacy">Privacy</Link>
          <Link href="/legal#responsible-use">Responsible use</Link>
          <Link href="/help#setup">Service setup</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} MODIFY AI. All rights reserved.</span>
        <span>AI-generated media must be disclosed when shared.</span>
      </div>
    </footer>
  );
}
