"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  Coins,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Search,
  Settings2,
  Shield,
  Sparkles,
  UsersRound,
  WandSparkles,
  X,
  CircleDot,
  Bolt,
} from "lucide-react";
import { Brand } from "../brand";
import { useWorkspace } from "./provider";
import { Menu, Modal } from "../ui/ui";
import { cn, post } from "@/lib/utils";
import { toast } from "sonner";
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh, t, openConfig } = useWorkspace(),
    path = usePathname();
  const [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [search, setSearch] = useState(false),
    [searchTerm, setSearchTerm] = useState("");
  const nav = [
    { label: t.overview, href: "/overview", icon: LayoutDashboard },
    { label: t.create, href: "/", icon: WandSparkles },
    { label: t.projects, href: "/projects", icon: FolderOpen },
    { label: t.history, href: "/history", icon: Clock3 },
    { label: t.characters, href: "/characters", icon: UsersRound },
    { label: t.queue, href: "/queue", icon: Clapperboard },
  ];
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const logout = async () => {
    try {
      await post("auth/logout");
      router.replace("/login");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="app-shell">
      <aside className={cn("sidebar", mobile && "mobile-open")}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <button
          className="workspace-picker"
          onClick={() =>
            data?.user.role === "guest"
              ? router.push("/signup")
              : router.push("/settings")
          }
        >
          <span className="workspace-avatar">
            {data?.user.role === "guest"
              ? "Y"
              : data?.user.name?.[0]?.toUpperCase() || "Y"}
          </span>
          <span className="workspace-picker-text">
            <strong>
              {data?.user.role === "guest"
                ? t.workspace
                : data?.user.name || t.workspace}
            </strong>
            <small>
              {data?.user.plan === "free"
                ? "Personal workspace"
                : `${data?.user.plan} workspace`}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-navigation">
          {nav.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              onClick={() => setMobile(false)}
              className={cn("nav-item", path === item.href && "active")}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.href === "/" && <span className="nav-new">NEW</span>}
              {item.href === "/queue" && !!data?.stats.active && (
                <span className="nav-count">{data.stats.active}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-section-label tools-label">EXPLORE</div>
        <Link
          href="/discover"
          className="nav-item"
          onClick={() => setMobile(false)}
        >
          <Sparkles size={18} strokeWidth={1.7} />
          <span>Discover MODIFY</span>
          <ArrowUpRight size={14} className="nav-arrow" />
        </Link>
        <Link
          href="/help#guide"
          className="nav-item"
          onClick={() => setMobile(false)}
        >
          <CircleHelp size={18} strokeWidth={1.7} />
          <span>Creator guide</span>
        </Link>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">
              <Bolt size={18} fill="currentColor" />
            </div>
            <h3>A little more possibility.</h3>
            <p>
              More credits. More creativity.
              <br />
              Find the plan that fits you.
            </p>
            <Link href="/billing" className="upgrade-button">
              Explore plans <ArrowUpRight size={15} />
            </Link>
            <span className="upgrade-orbit" />
          </div>
          <Link
            href="/billing"
            className={cn("nav-item", path === "/billing" && "active")}
          >
            <CreditCard size={18} strokeWidth={1.7} />
            <span>{t.billing}</span>
          </Link>
          <Link
            href="/settings"
            className={cn("nav-item", path === "/settings" && "active")}
          >
            <Settings2 size={18} strokeWidth={1.7} />
            <span>{t.settings}</span>
          </Link>
          <Link
            href="/help"
            className={cn("nav-item", path === "/help" && "active")}
          >
            <CircleHelp size={18} strokeWidth={1.7} />
            <span>{t.help}</span>
          </Link>
          {data?.user.role === "admin" && (
            <Link className="nav-item" href="/admin">
              <Shield size={18} />
              <span>Administration</span>
            </Link>
          )}
          <div className="sidebar-user">
            <span className="user-avatar">
              {data?.user.role === "guest"
                ? "Y"
                : data?.user.name?.[0]?.toUpperCase() || "Y"}
            </span>
            <div>
              <strong>
                {data?.user.role === "guest"
                  ? "Your creative space"
                  : data?.user.name || "Your creative space"}
              </strong>
              <small>
                {data?.user.role === "guest"
                  ? "Preview workspace"
                  : `${data?.user.plan} plan`}
              </small>
            </div>
            <Menu
              label="Account menu"
              items={
                data?.user.role === "guest"
                  ? [
                      {
                        label: "Create an account",
                        icon: <Plus size={15} />,
                        onClick: () => router.push("/signup"),
                      },
                      {
                        label: "Sign in",
                        icon: <ArrowUpRight size={15} />,
                        onClick: () => router.push("/login"),
                      },
                    ]
                  : [
                      {
                        label: "Account settings",
                        icon: <Settings2 size={15} />,
                        onClick: () => router.push("/settings"),
                      },
                      {
                        label: "Sign out",
                        icon: <LogOut size={15} />,
                        onClick: logout,
                      },
                    ]
              }
            />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="app-body">
        <header className="app-topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <MenuIcon size={21} />
            </button>
            <span className="topbar-workspace">Workspace</span>
            <ChevronRight size={13} />
            <span>
              {path === "/"
                ? t.studio
                : [
                    ...nav,
                    { href: "/billing", label: t.billing },
                    { href: "/settings", label: t.settings },
                    { href: "/help", label: t.help },
                  ].find((n) => n.href === path)?.label || "Administration"}
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-search"
              aria-label="Search your projects"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="topbar-divider" />
            <Link href="/billing" className="credit-pill">
              <Coins size={15} />
              <strong>
                {loading ? "—" : data?.user.credits.toLocaleString() || 0}
              </strong>
              <span>credits</span>
              <Plus size={13} />
            </Link>
            <button
              className="icon-button notification-button"
              aria-label="View notifications"
              onClick={() => {
                setNotifications(true);
                void post("notifications/read")
                  .then(refresh)
                  .catch((e) => toast.error((e as Error).message));
              }}
            >
              <Bell size={19} />
              {data?.notifications.some((n) => !n.read_at) && <i />}
            </button>
            <Menu
              label="Workspace options"
              items={[
                {
                  label: "Service configuration",
                  icon: <CircleDot size={15} />,
                  onClick: openConfig,
                },
                {
                  label: "Visit product page",
                  icon: <ArrowUpRight size={15} />,
                  onClick: () => router.push("/discover"),
                },
              ]}
            >
              <span className="topbar-avatar">
                {data?.user.role === "guest"
                  ? "Y"
                  : data?.user.name?.[0]?.toUpperCase() || "Y"}
              </span>
            </Menu>
          </div>
        </header>
        {error && (
          <div className="connection-error">
            {error}
            <button onClick={() => void refresh()}>Try again</button>
          </div>
        )}
        <main className="workspace-content">{children}</main>
        <footer className="app-footer">
          <span>
            <span className="footer-status-dot" /> All great things start with
            an idea.
          </span>
          <span>
            Made for your imagination <span className="footer-star">✧</span>{" "}
            MODIFY AI
          </span>
        </footer>
      </div>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title="Your notifications"
        description="Updates from your creative workspace."
      >
        {data?.notifications.length ? (
          <div className="notifications-list">
            {data.notifications.map((n) => (
              <div key={n.id}>
                <span>
                  <Check size={16} />
                </span>
                <p>
                  {n.message}
                  <small>{new Date(n.created_at).toLocaleString()}</small>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="notification-empty">
            <Bell size={30} />
            <h3>You’re all caught up.</h3>
            <p>We’ll let you know when your videos are ready.</p>
          </div>
        )}
      </Modal>
      <Modal
        open={search}
        onOpenChange={setSearch}
        title="Find your next favorite project"
        description="Search saved projects in this workspace."
      >
        <div className="search-input">
          <Search size={18} />
          <input
            className="input"
            autoFocus
            placeholder="Search projects…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="search-results">
          {data?.projects
            .filter((p) =>
              p.name.toLowerCase().includes(searchTerm.toLowerCase()),
            )
            .map((p) => (
              <Link
                key={p.id}
                href={`/?project=${p.id}`}
                onClick={() => {
                  setSearch(false);
                  if (path === "/") router.push(`/?project=${p.id}`);
                }}
              >
                <FolderOpen size={18} />
                {p.name}
                <ArrowUpRight size={15} />
              </Link>
            ))}
          {!data?.projects.length && (
            <p>Your saved projects will appear here.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
