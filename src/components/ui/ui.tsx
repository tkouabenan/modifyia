"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  X,
  LoaderCircle,
  MoreHorizontal,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes } from "react";
export function Button({
  children,
  className,
  variant = "secondary",
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      className={cn("btn", `btn-${variant}`, className)}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={cn("modal", className)}>
          <div className="modal-heading">
            <div>
              <Dialog.Title className="modal-title">{title}</Dialog.Title>
              <Dialog.Description className="modal-description">
                {description || "Make it yours with MODIFY AI."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  children,
  items,
  label = "More options",
}: {
  children?: ReactNode;
  label?: string;
  items: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="icon-button" aria-label={label}>
          {children || <MoreHorizontal size={19} />}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown" sideOffset={6} align="end">
          {items.map((item, i) => (
            <Dropdown.Item
              disabled={item.disabled}
              key={i}
              onSelect={item.onClick}
              className={cn("dropdown-item", item.danger && "danger-text")}
            >
              {item.icon}
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Select({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; description?: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (c: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("toggle-row", disabled && "is-disabled")}>
      <span>
        <span className="toggle-label">{label}</span>
        {description && <small>{description}</small>}
      </span>
      <button
        type="button"
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("toggle", checked && "checked")}
      >
        <span />
      </button>
    </label>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("status-badge", `status-${status}`)}>
      <i />
      {status === "uploading"
        ? "Preparing"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="check-item">
      <Check size={15} />
      <span>{children}</span>
    </li>
  );
}
