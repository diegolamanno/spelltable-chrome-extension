import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useGameData } from "../../src/shared/hooks/useGameData";
import type { PlayerData, NotionConfig } from "../../src/shared/storage";
import { notionConfigStorage, playerTimesStorage } from "../../src/shared/storage";
import { usePendingMatches } from "../../src/shared/hooks/usePendingMatches";
import type { MatchRecord } from "../../src/shared/convoke/match-records";
import { describeMatch, reviewDefaults, type SuggestedField } from "../../src/shared/convoke/review";
import type { SubmitResult } from "../../src/shared/submit";

type SubmitResponse = SubmitResult & { success: boolean };

const DEBUG_SINGLE_PLAYER =
  import.meta.env.MODE !== "prod" &&
  import.meta.env.VITE_DEBUG_SINGLE_PLAYER === "true";
const DEBUG_PLAYERS: PlayerData[] = [
  { name: "Metalbot",  commanders: ["Korvold, Fae-Cursed King"] },
  { name: "Paperbot",  commanders: ["Krenko, Mob Boss"] },
  { name: "Waterbot",  commanders: ["Yawgmoth, Thran Physician"] },
];

// ── Palette ────────────────────────────────────────────────────────────────────
const P = {
  peach: "#f0a870", mint: "#68d4a0", lemon: "#d8d870",
  periwinkle: "#8098d8", pink: "#e890c8", sky: "#78c8e8",
};
const PLAYER_COLORS = [P.peach, P.mint, P.lemon, P.periwinkle];
const WIN_COLORS    = [P.peach, P.mint, P.lemon, P.periwinkle, P.pink, P.sky, "#c890e8", "#e87890", "#a0b0c0"];
const WIN_CONDITIONS = ["Combat", "Cmdr Dmg", "Burn/Life", "Alt Win Con", "Infect", "Mill", "Combo", "Stolen", "Draw"];
const MANA_COLORS   = ["#F5E6A3", "#6EB5FF", "#C084FC", "#FF7B54", "#57D9A3"];

// ── Theme tokens ───────────────────────────────────────────────────────────────
type Tokens = ReturnType<typeof getTokens>;
function getTokens(dark: boolean) {
  return dark ? {
    bg: "#1a1710", surface: "#24201a", headerBg: "#201d16",
    colDivider: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.08)", ink: "#f0ede6",
    muted: "rgba(240,237,230,0.38)", label: "rgba(240,237,230,0.3)",
    rowSel: "#2a2618", shadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
    swatchBorder: "rgba(255,255,255,0.18)", menuBg: "#2a2618",
    menuBorder: "rgba(255,255,255,0.1)", disabledBg: "rgba(255,255,255,0.06)",
    disabledFg: "rgba(240,237,230,0.22)",
    statBg: "rgba(255,255,255,0.04)", toggleTrack: "rgba(255,255,255,0.1)",
    divider: "rgba(255,255,255,0.06)",
  } : {
    bg: "#f5f3ef", surface: "#fffefb", headerBg: "#fffefb",
    colDivider: "rgba(28,30,42,0.08)",
    border: "rgba(28,30,42,0.09)", ink: "#1c1e2a",
    muted: "rgba(28,30,42,0.38)", label: "rgba(28,30,42,0.36)",
    rowSel: "#fffefb", shadow: "0 12px 40px rgba(0,0,0,0.10), 0 0 0 1.5px rgba(28,30,42,0.07)",
    swatchBorder: "rgba(28,30,42,0.15)", menuBg: "#fffefb",
    menuBorder: "rgba(28,30,42,0.1)", disabledBg: "rgba(28,30,42,0.06)",
    disabledFg: "rgba(28,30,42,0.22)",
    statBg: "rgba(28,30,42,0.04)", toggleTrack: "rgba(28,30,42,0.1)",
    divider: "rgba(28,30,42,0.07)",
  };
}

// ── CubeIcon ───────────────────────────────────────────────────────────────────
function CubeIcon({ size = 40, dark }: { size?: number; dark: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="10" fill={dark ? "#2a2618" : "#e8e4d8"} />
      <polygon points="22,8 33,14.5 33,27.5 22,34 11,27.5 11,14.5" fill="none"
        stroke="#1c1e2a" strokeWidth="1.2" opacity={dark ? 0.12 : 0.2} />
      <polygon points="22,8 33,14.5 22,21 11,14.5"  fill={P.periwinkle} opacity="0.72" />
      <polygon points="11,14.5 22,21 22,34 11,27.5" fill={P.mint}       opacity="0.78" />
      <polygon points="33,14.5 22,21 22,34 33,27.5" fill={P.peach}      opacity="0.82" />
      <line x1="22" y1="8"    x2="22" y2="21"  stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
      <line x1="11" y1="14.5" x2="22" y2="21"  stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
      <line x1="33" y1="14.5" x2="22" y2="21"  stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
    </svg>
  );
}

// ── SectionLabel ───────────────────────────────────────────────────────────────
function SectionLabel({ children, note, t }: { children: React.ReactNode; note?: string; t: Tokens }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
      textTransform: "uppercase", color: t.label, marginBottom: 6 }}>
      {children}
      {note && (
        <span style={{ marginLeft: 5, fontWeight: 400, letterSpacing: 0,
          fontSize: 9.5, textTransform: "none", opacity: 0.75 }}>{note}</span>
      )}
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
function Divider({ t }: { t: Tokens }) {
  return <div style={{ height: 1, background: t.divider, margin: "6px 0" }} />;
}

// ── SettingsMenu ───────────────────────────────────────────────────────────────
function SettingsMenu({ open, onClose, themeOverride, onOverride, onSettings, t }: {
  open: boolean; onClose: () => void;
  themeOverride: string; onOverride: (v: string) => void;
  onSettings: () => void; t: Tokens;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  if (!open) return null;
  const opts = [
    { value: "system", label: "System default", icon: "⬤" },
    { value: "light",  label: "Always light",   icon: "☀" },
    { value: "dark",   label: "Always dark",    icon: "☾" },
  ];
  return (
    <div ref={ref} style={{ position: "absolute", top: 50, right: 14, zIndex: 200,
      background: t.menuBg, border: `1px solid ${t.menuBorder}`, borderRadius: 12,
      padding: "5px 0", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", minWidth: 178,
      animation: "menuIn 0.18s ease" }}>
      <div style={{ padding: "7px 13px 5px", fontSize: 10, fontWeight: 700,
        letterSpacing: "0.12em", textTransform: "uppercase", color: t.muted }}>Appearance</div>
      {opts.map(o => (
        <button type="button" key={o.value} onClick={() => { onOverride(o.value); onClose(); }} style={{
          width: "100%", padding: "8px 13px", display: "flex", alignItems: "center", gap: 9,
          background: themeOverride === o.value ? "rgba(128,152,216,0.12)" : "transparent",
          border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
        }}>
          <span style={{ fontSize: 12, width: 16, textAlign: "center",
            color: o.value === "light" ? P.lemon : o.value === "dark" ? P.periwinkle : t.ink }}>
            {o.icon}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: t.ink }}>{o.label}</span>
          {themeOverride === o.value && (
            <svg aria-hidden="true" style={{ marginLeft: "auto" }} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="6" fill={P.periwinkle} opacity="0.9" />
              <path d="M3.5 6.5l2 2 3.5-3.5" stroke="#fff" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      ))}
      <div style={{ height: 1, background: t.divider, margin: "5px 0" }} />
      <button type="button" onClick={() => { onSettings(); onClose(); }} style={{
        width: "100%", padding: "8px 13px", display: "flex", alignItems: "center", gap: 9,
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ width: 16, flexShrink: 0 }}>
          <circle cx="7" cy="7" r="5.5" stroke={t.muted} strokeWidth="1.3" />
          <circle cx="7" cy="7" r="1.8" stroke={t.muted} strokeWidth="1.3" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500, color: t.ink }}>Notion Settings</span>
      </button>
    </div>
  );
}

// ── PlayerRow ──────────────────────────────────────────────────────────────────
function PlayerRow({ player, index, isWinner, isFirst, onSelectWinner, onSetFirst, t, isDark, time, winnerDisabled }: {
  player: PlayerData; index: number; isWinner: boolean; isFirst: boolean;
  onSelectWinner: () => void; onSetFirst: () => void;
  t: Tokens; isDark: boolean; time?: string; winnerDisabled?: boolean;
}) {
  const col = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const deck = player.commanders.join(" / ") || "Unknown commander";
  return (
    // A row with two sibling buttons (pick winner, set first player); nesting the crown inside
    // the winner button made it unreachable by keyboard.
    <div style={{
      width: "100%",
      background: isWinner ? (isDark ? t.rowSel : t.surface) : (isDark ? "rgba(255,255,255,0.03)" : "rgba(28,30,42,0.03)"),
      border: `1.5px solid ${isWinner ? col : t.border}`,
      borderRadius: 10, paddingRight: 10,
      display: "flex", alignItems: "center", gap: 9,
      boxShadow: isWinner ? `0 2px 10px ${col}44` : "none",
      opacity: winnerDisabled ? 0.55 : 1,
      transition: "all 0.15s",
    }}>
    <button type="button" onClick={winnerDisabled ? undefined : onSelectWinner}
      aria-pressed={isWinner} disabled={winnerDisabled} style={{
      flex: 1, minWidth: 0, background: "transparent", border: "none", borderRadius: 10,
      padding: "5px 0 5px 12px", display: "flex", alignItems: "center", gap: 9,
      cursor: winnerDisabled ? "default" : "pointer", textAlign: "left",
      font: "inherit", color: "inherit",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0,
        border: `1.5px solid ${t.swatchBorder}`,
        boxShadow: isWinner ? `0 0 7px ${col}` : "none", transition: "all 0.2s" }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: t.ink, fontWeight: 600, fontSize: 13, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
          {isFirst && (
            <span style={{ padding: "1px 5px", borderRadius: 20, fontSize: 9, fontWeight: 700,
              background: `${P.lemon}${isDark ? "33" : "44"}`,
              border: `1px solid ${P.lemon}88`, color: isDark ? P.lemon : "#7a7a00",
              letterSpacing: "0.04em", animation: "badgePop 0.2s ease", flexShrink: 0 }}>
              1st
            </span>
          )}
        </span>
        <span style={{ display: "block", color: t.muted, fontSize: 10.5, fontStyle: "italic",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deck}
        </span>
      </span>

      {time && (
        <span style={{ fontSize: 11, fontWeight: 600, color: t.muted, flexShrink: 0,
          fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em",
          padding: "2px 6px", borderRadius: 6,
          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)",
          border: `1px solid ${t.border}` }}>
          {time}
        </span>
      )}

    </button>

      <button type="button" onClick={onSetFirst} title="Set as first player"
        aria-label={`Set ${player.name} as first player`} aria-pressed={isFirst}
        style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, padding: 0,
          background: isFirst ? `${P.lemon}${isDark ? "44" : "55"}` : "transparent",
          border: `1px solid ${isFirst ? `${P.lemon}88` : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s" }}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 7.5h8M1.5 7.5L2 4l2.5 2L5 2l.5 4L8 4l.5 3.5"
            stroke={isFirst ? P.lemon : t.muted}
            strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isWinner ? (
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="7.5" fill={col} />
          <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 20, animation: "checkIn 0.2s ease forwards" }} />
        </svg>
      ) : (
        <span style={{ width: 15, flexShrink: 0 }} />
      )}
    </div>
  );
}

// ── KillEvent ──────────────────────────────────────────────────────────────────
function KillEvent({ players, killer, victim, winner, onKiller, onVictim, t, isDark, disabled, disabledReason }: {
  players: PlayerData[]; killer: string | null; victim: string | null; winner: string | null;
  onKiller: (name: string | null) => void; onVictim: (name: string | null) => void;
  t: Tokens; isDark: boolean; disabled?: boolean; disabledReason?: string;
}) {
  const both = killer !== null && victim !== null;

  // Two compact pickers on one row instead of a chip per player (twice): the chips grew
  // with the table and pushed the popup past Chrome's 600 px limit (#25).
  function Picker({ label, icon, value, onChange, isDisabled }: {
    label: string; icon: React.ReactNode; value: string | null;
    onChange: (name: string | null) => void; isDisabled: (name: string) => boolean;
  }) {
    const idx = players.findIndex(p => p.name === value);
    const col = idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : null;
    return (
      <label style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
          color: t.muted, display: "flex", alignItems: "center", gap: 4 }}>
          {icon}{label}
        </span>
        <span style={{ position: "relative", display: "block" }}>
          {col && (
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              width: 7, height: 7, borderRadius: "50%", background: col, pointerEvents: "none" }} />
          )}
          <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{
            width: "100%", appearance: "none", padding: `5px 20px 5px ${col ? 20 : 8}px`, borderRadius: 7,
            fontSize: 11.5, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer",
            background: col ? `${col}${isDark ? "22" : "2a"}` : t.statBg,
            border: `1.5px solid ${col ?? t.border}`, color: value ? t.ink : t.muted,
            textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", outline: "none",
          }}>
            <option value="">—</option>
            {players.map(p => (
              <option key={p.name} value={p.name} disabled={isDisabled(p.name)}>{p.name}</option>
            ))}
          </select>
          <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ position: "absolute", right: 8,
            top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <path d="M1 2.5l3 3 3-3" stroke={t.muted} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </label>
    );
  }

  if (disabled) {
    return (
      <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, overflow: "hidden",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(28,30,42,0.02)",
        opacity: 0.45, pointerEvents: "none" }}>
        <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 7 }}>
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.5 }}>
            <path d="M2 12L10 4M10 4H7M10 4V7" stroke={t.muted} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 11.5, color: t.muted, fontStyle: "italic" }}>
            {disabledReason ?? "N/A — simultaneous KO"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 10, padding: "7px 10px 9px",
      border: `1.5px solid ${both ? `${P.pink}55` : t.border}`,
      background: both
        ? (isDark ? `${P.pink}0d` : `${P.pink}0a`)
        : (isDark ? "rgba(255,255,255,0.02)" : "rgba(28,30,42,0.02)"),
      display: "flex", alignItems: "flex-end", gap: 6, transition: "all 0.2s",
    }}>
      <Picker label="Killer" value={killer} onChange={onKiller}
        isDisabled={(name) => name === victim}
        icon={<svg aria-hidden="true" width="10" height="10" viewBox="0 0 14 14" fill="none">
          <path d="M2 12L10 4M10 4H7M10 4V7" stroke={t.muted} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>} />
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginBottom: 7, opacity: 0.8 }}>
        <path d="M2 12L10 4M10 4H7M10 4V7" stroke={P.pink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="3" cy="11" r="1.2" fill={P.pink} opacity="0.7" />
      </svg>
      <Picker label="Victim" value={victim} onChange={onVictim}
        isDisabled={(name) => name === killer || name === winner}
        icon={<span style={{ fontSize: 10 }}>💀</span>} />
    </div>
  );
}

// ── PillToggle ─────────────────────────────────────────────────────────────────
function PillToggle({ options, value, onChange, t, isDark, disabledValues }: {
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; t: Tokens; isDark: boolean;
  disabledValues?: string[];
}) {
  return (
    <div style={{ display: "flex", background: t.toggleTrack, borderRadius: 8, padding: 3 }}>
      {options.map(o => {
        const sel = value === o.value;
        const dis = disabledValues?.includes(o.value) ?? false;
        return (
          <button type="button" key={o.value} onClick={() => !dis && onChange(o.value)} style={{
            flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: sel ? (isDark ? "#2a2618" : t.surface) : "transparent",
            border: sel ? `1px solid ${t.border}` : "1px solid transparent",
            color: sel ? t.ink : t.muted,
            cursor: dis ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
            boxShadow: sel ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            opacity: dis ? 0.35 : 1,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────
function Stepper({ value, onChange, t }: { value: number; onChange: (v: number) => void; t: Tokens }) {
  return (
    <div style={{ display: "flex", alignItems: "center",
      background: t.statBg, border: `1px solid ${t.border}`, borderRadius: 8, overflow: "hidden" }}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} style={{
        width: 26, height: 32, background: "transparent", border: "none",
        cursor: value <= 0 ? "default" : "pointer",
        color: value <= 0 ? t.muted : t.ink,
        fontSize: 17, lineHeight: "1", opacity: value <= 0 ? 0.35 : 1, transition: "opacity 0.15s",
        fontFamily: "'DM Sans',sans-serif",
      }}>−</button>
      <span style={{ flex: 1, textAlign: "center", fontWeight: 700,
        fontSize: 14, color: t.ink, minWidth: 18 }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(20, value + 1))} style={{
        width: 26, height: 32, background: "transparent", border: "none",
        cursor: value >= 20 ? "default" : "pointer",
        color: value >= 20 ? t.muted : t.ink,
        fontSize: 17, lineHeight: "1", opacity: value >= 20 ? 0.35 : 1, transition: "opacity 0.15s",
        fontFamily: "'DM Sans',sans-serif",
      }}>+</button>
    </div>
  );
}

// ── ToggleSwitch ───────────────────────────────────────────────────────────────
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 36, height: 20, borderRadius: 10, padding: 2, flexShrink: 0,
      background: value ? P.mint : "rgba(128,128,128,0.2)",
      border: "none", cursor: "pointer", transition: "background 0.2s",
      display: "flex", alignItems: "center", justifyContent: value ? "flex-end" : "flex-start",
    }}>
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

// ── Shared summary types, builder, and grid ────────────────────────────────────
type SummaryData = {
  winner: string | null; wincon: string | null; firstPlayer: string | null;
  firstKiller: string | null; firstVictim: string | null;
  koType: string; boardWipes: number; rounds: number; solRing: boolean;
  /** Values that came from Convoke suggestions and weren't changed by the person submitting. */
  suggested?: SuggestedField[];
  /** e.g. "Convoke match · 9:44 PM · Zurgo, Felothar +2" */
  sourceLabel?: string;
};

function buildRows(data: SummaryData) {
  const tag = (field: SuggestedField, value: string | null) =>
    value && data.suggested?.includes(field) ? `${value} · suggested` : value;
  return [
    { label: "Winner",        value: tag("winner", data.winner) ?? "—",  accent: true },
    { label: "Win condition", value: data.wincon ?? "—" },
    { label: "First player",  value: data.firstPlayer ?? "—" },
    { label: "First killer",  value: data.firstKiller ?? "None" },
    { label: "First victim",  value: tag("firstVictim", data.firstVictim) ?? "None" },
    { label: "KO type",       value: tag("koType", data.koType) ?? data.koType },
    { label: "Board wipes",   value: String(data.boardWipes) },
    { label: "Rounds played", value: String(data.rounds) },
    { label: "Sol Ring T1",   value: data.solRing ? "Yes ✦" : "No" },
  ];
}

function SummaryGrid({ data, t }: { data: SummaryData; t: Tokens }) {
  const rows = buildRows(data);
  return (
    <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr",
      gap: 1, background: t.border, borderRadius: 11, overflow: "hidden",
      border: `1px solid ${t.border}` }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          display: "flex", flexDirection: "column", padding: "8px 12px",
          background: t.bg,
          borderBottom: i < rows.length - 2 ? `1px solid ${t.divider}` : "none",
        }}>
          <span style={{ fontSize: 10, color: t.muted, fontWeight: 600,
            letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>{r.label}</span>
          <span style={{ fontSize: 13, fontWeight: r.accent ? 800 : 700, color: t.ink }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── ManaSpark — canvas particle celebration ────────────────────────────────────
function ManaSpark({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.55;

    interface Particle {
      x: number; y: number; vx: number; vy: number; alpha: number;
      color: string; kind: "pip" | "spark" | "card"; size: number;
      spin: number; rot: number; life: number; gravity: number;
      trail: { x: number; y: number }[];
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 72; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 4.2;
      const color = MANA_COLORS[Math.floor(Math.random() * MANA_COLORS.length)];
      const rnd   = Math.random();
      const kind: Particle["kind"] = rnd < 0.55 ? "pip" : rnd < 0.82 ? "spark" : "card";
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5 - Math.random() * 2,
        alpha: 1, color, kind,
        size: kind === "card" ? 4 + Math.random() * 5 : 3 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 0.18,
        rot: Math.random() * Math.PI * 2,
        life: 0.82 + Math.random() * 0.18,
        gravity: 0.07 + Math.random() * 0.05,
        trail: [],
      });
    }

    let ringAlpha = 1.0, ringRadius = 8;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      if (ringAlpha > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,120,${ringAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ringRadius += 4;
        ringAlpha  -= 0.055;
      }

      let alive = false;
      for (const p of particles) {
        if (p.alpha <= 0) continue;
        alive = true;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 5) p.trail.shift();

        for (let j = 1; j < p.trail.length; j++) {
          const ta = (j / p.trail.length) * p.alpha * 0.3;
          ctx.save();
          ctx.globalAlpha = ta;
          ctx.beginPath();
          ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
          ctx.lineTo(p.trail[j].x, p.trail[j].y);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.3;
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);

        if (p.kind === "pip") {
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
          grad.addColorStop(0, "#fff");
          grad.addColorStop(0.35, p.color);
          grad.addColorStop(1, p.color + "00");
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        } else if (p.kind === "spark") {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (let n = 0; n < 8; n++) {
            const a = (n * Math.PI) / 4;
            const r = n % 2 === 0 ? p.size : p.size * 0.35;
            if (n === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        } else {
          const cw = p.size * 0.9, ch = p.size * 1.3;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 1.5);
          } else {
            ctx.rect(-cw / 2, -ch / 2, cw, ch);
          }
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        ctx.restore();

        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.985;
        p.rot += p.spin;
        p.alpha -= 0.013 * (1 / p.life);
      }

      if (alive || ringAlpha > 0) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active]);

  if (!active) return null;
  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 50, borderRadius: 18,
    }} />
  );
}

// ── ConfirmScreen ──────────────────────────────────────────────────────────────
function ConfirmScreen({ data, onConfirm, onBack, submitting, submitError, t }: {
  data: SummaryData; onConfirm: () => void; onBack: () => void;
  submitting: boolean; submitError: string | null; t: Tokens;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14,
      padding: "8px 0", animation: "fadeUp 0.22s ease" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: `${P.periwinkle}22`, border: `2px solid ${P.periwinkle}55`,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v5l3 2" stroke={P.periwinkle} strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="6.5" stroke={P.periwinkle} strokeWidth="1.4" />
          </svg>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: t.ink }}>Confirm submission</p>
          <p style={{ fontSize: 11.5, color: t.muted, marginTop: 1 }}>
            {data.suggested?.length
              ? "Values marked “suggested” came from Convoke. Check them before logging."
              : "Double-check before logging to the platform"}
          </p>
          {data.sourceLabel && (
            <p style={{ fontSize: 10.5, color: t.muted, marginTop: 2, opacity: 0.8 }}>{data.sourceLabel}</p>
          )}
        </div>
      </div>

      <SummaryGrid data={data} t={t} />

      {submitError && (
        <p style={{ color: "#e05050", fontSize: 11 }}>⚠ {submitError}</p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onBack} disabled={submitting} style={{
          flex: 1, padding: "10px 0", borderRadius: 10,
          background: t.statBg, border: `1px solid ${t.border}`,
          color: t.muted, fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600, fontSize: 13.5,
          cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.5 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s",
        }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 3L4 6.5 8 10" stroke={t.muted} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Edit
        </button>
        <button type="button" onClick={onConfirm} disabled={submitting} style={{
          flex: 2, padding: "10px 0", borderRadius: 10,
          background: submitting
            ? "rgba(60,160,100,0.6)"
            : `linear-gradient(135deg,${P.mint},#48b880)`,
          border: "none", color: "#0e2a1a",
          fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
          cursor: submitting ? "default" : "pointer",
          boxShadow: `0 4px 14px ${P.mint}44`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          transition: "all 0.2s",
        }}>
          {submitting ? (
            <>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 13 13" fill="none"
                style={{ animation: "spin 0.7s linear infinite" }}>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(14,42,26,0.3)" strokeWidth="1.8" />
                <path d="M6.5 1A5.5 5.5 0 0 1 12 6.5" stroke="#0e2a1a" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Logging…
            </>
          ) : "✓  Looks good, log it"}
        </button>
      </div>
    </div>
  );
}

// ── SuccessScreen ──────────────────────────────────────────────────────────────
function SuccessScreen({ data, onReset, t, alreadyLogged }: {
  data: SummaryData; onReset: () => void; t: Tokens;
  /** Someone already logged this match: nothing new was created. */
  alreadyLogged?: boolean;
}) {
  // Already logged looks different on purpose: blue, a "copy" icon that stacks into place
  // instead of a check that draws itself, and the summary dimmed because it wasn't saved.
  const accent = alreadyLogged ? P.sky : P.mint;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      gap: 12, padding: "8px 0", animation: "successIn 0.3s ease" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%",
        background: `${accent}22`, border: `2px ${alreadyLogged ? "dashed" : "solid"} ${accent}88`,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: alreadyLogged ? "dupNudge 0.5s 0.35s ease both" : undefined }}>
        {alreadyLogged ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* The copy already in Notion… */}
            <rect x="8" y="3" width="12" height="14" rx="2.5" stroke={accent} strokeWidth="2"
              opacity="0.55" />
            {/* …and this one, sliding onto it. */}
            <rect x="4" y="7" width="12" height="14" rx="2.5" stroke={accent} strokeWidth="2.2"
              fill={`${accent}33`} style={{ animation: "dupStack 0.4s 0.1s ease both" }} />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12l5 5 9-9" stroke={accent} strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 40, animation: "checkIn 0.4s 0.1s ease both" }} />
          </svg>
        )}
      </div>
      <p style={{ color: accent, fontWeight: 700, fontSize: 15 }}>
        {alreadyLogged ? "Already logged" : "Score Logged!"}
      </p>
      {alreadyLogged && (
        <p style={{ color: t.muted, fontSize: 11.5, marginTop: -6, textAlign: "center" }}>
          Someone in the pod logged this match first. Nothing new was added to Notion.
        </p>
      )}

      {alreadyLogged ? (
        <div style={{ width: "100%", opacity: 0.5 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            color: t.label, marginBottom: 6 }}>
            Your entry (not saved)
          </p>
          <SummaryGrid data={data} t={t} />
        </div>
      ) : (
        <SummaryGrid data={data} t={t} />
      )}

      <button type="button" onClick={onReset} style={{
        width: "100%", padding: "11px", borderRadius: 10,
        background: `linear-gradient(135deg,${P.periwinkle},#6070c8)`,
        border: "none", color: "#fff", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 700, fontSize: 14, cursor: "pointer",
        boxShadow: `0 4px 14px ${P.periwinkle}44`,
      }}>Log Another Game</button>
    </div>
  );
}

// ── SettingsScreen ─────────────────────────────────────────────────────────────
function SettingsField({ label, value, onChange, password, t, isDark }: {
  label: string; value: string; onChange: (v: string) => void;
  password?: boolean; t: Tokens; isDark: boolean;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: t.label }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={password && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={password ? "secret_..." : "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
          style={{
            width: "100%", padding: password ? "8px 48px 8px 10px" : "8px 10px",
            borderRadius: 8, border: `1.5px solid ${focused ? P.periwinkle : t.border}`,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(28,30,42,0.04)",
            color: t.ink, fontFamily: "'DM Sans',sans-serif", fontSize: 12,
            outline: "none", boxSizing: "border-box" as const, transition: "border-color 0.15s",
          }}
        />
        {password && (
          <button type="button" onClick={() => setShow(v => !v)} style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: t.muted, fontSize: 11, fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
          }}>
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ onBack, t, isDark }: { onBack: () => void; t: Tokens; isDark: boolean }) {
  const [config, setConfig] = useState<NotionConfig>({ apiKey: "", playersDbId: "", decksDbId: "", gamesDbId: "", gameSeatsDbId: "" });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notionConfigStorage.getValue().then(c => { setConfig(c); setLoaded(true); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await notionConfigStorage.setValue(config);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const set = (key: keyof NotionConfig) => (v: string) => setConfig(c => ({ ...c, [key]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14,
      padding: "8px 0", animation: "fadeUp 0.22s ease" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: `${P.periwinkle}22`, border: `2px solid ${P.periwinkle}55`,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke={P.periwinkle} strokeWidth="1.4" />
            <circle cx="8" cy="8" r="2" stroke={P.periwinkle} strokeWidth="1.4" />
            {[0,60,120,180,240,300].map((deg) => (
              <line key={deg}
                x1={8 + 4 * Math.cos(deg * Math.PI / 180)}
                y1={8 + 4 * Math.sin(deg * Math.PI / 180)}
                x2={8 + 6 * Math.cos(deg * Math.PI / 180)}
                y2={8 + 6 * Math.sin(deg * Math.PI / 180)}
                stroke={P.periwinkle} strokeWidth="1.3" strokeLinecap="round" />
            ))}
          </svg>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: t.ink }}>Notion Settings</p>
          <p style={{ fontSize: 11.5, color: t.muted, marginTop: 1 }}>
            Connect your Notion workspace
          </p>
        </div>
      </div>

      {!loaded ? (
        <div style={{ textAlign: "center", color: t.muted, fontSize: 12, padding: "20px 0" }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SettingsField label="API Key" value={config.apiKey} onChange={set("apiKey")}
            password t={t} isDark={isDark} />
          <SettingsField label="Players Database ID" value={config.playersDbId} onChange={set("playersDbId")}
            t={t} isDark={isDark} />
          <SettingsField label="Decks Database ID" value={config.decksDbId} onChange={set("decksDbId")}
            t={t} isDark={isDark} />
          <SettingsField label="Games Database ID" value={config.gamesDbId} onChange={set("gamesDbId")}
            t={t} isDark={isDark} />
          <SettingsField label="Game Seats Database ID" value={config.gameSeatsDbId} onChange={set("gameSeatsDbId")}
            t={t} isDark={isDark} />
          <p style={{ fontSize: 10.5, color: t.muted, lineHeight: 1.5 }}>
            Find your API key at notion.so/profile/integrations. Database IDs appear in the
            page URL after the workspace slug.
          </p>
        </div>
      )}

      {saved && (
        <p style={{ color: P.mint, fontSize: 11.5, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 5 }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5.5" fill={P.mint} opacity="0.2" />
            <path d="M3 6l2 2 4-4" stroke={P.mint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Saved
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onBack} style={{
          flex: 1, padding: "10px 0", borderRadius: 10,
          background: t.statBg, border: `1px solid ${t.border}`,
          color: t.muted, fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600, fontSize: 13.5, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s",
        }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 3L4 6.5 8 10" stroke={t.muted} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !loaded} style={{
          flex: 2, padding: "10px 0", borderRadius: 10,
          background: saving ? "rgba(128,152,216,0.5)" : `linear-gradient(135deg,${P.periwinkle},#6070c8)`,
          border: "none", color: "#fff",
          fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
          cursor: saving || !loaded ? "default" : "pointer",
          boxShadow: `0 4px 14px ${P.periwinkle}44`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          transition: "all 0.2s",
        }}>
          {saving ? (
            <>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 13 13" fill="none"
                style={{ animation: "spin 0.7s linear infinite" }}>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8" />
                <path d="M6.5 1A5.5 5.5 0 0 1 12 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Saving…
            </>
          ) : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── PendingBar — pick a pending Convoke match or the live table ───────────────
function PendingBar({ pending, selectedId, onSelect, t, isDark }: {
  pending: MatchRecord[]; selectedId: string | null; onSelect: (id: string) => void;
  t: Tokens; isDark: boolean;
}) {
  const chip = (id: string, label: string, title?: string) => {
    const sel = selectedId === id || (id === "live" && selectedId === null);
    return (
      <button type="button" key={id} title={title} onClick={() => onSelect(id)} style={{
        flexShrink: 0, padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
        fontFamily: "'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap",
        background: sel ? `${P.periwinkle}${isDark ? "26" : "2e"}` : (isDark ? "rgba(255,255,255,0.04)" : "rgba(28,30,42,0.04)"),
        border: `1.5px solid ${sel ? P.periwinkle : t.border}`,
        color: sel ? t.ink : t.muted, transition: "all 0.15s",
      }}>{label}</button>
    );
  };
  return (
    <div style={{ padding: "6px 16px", borderBottom: `1px solid ${t.colDivider}`,
      display: "flex", alignItems: "center", gap: 6, overflowX: "auto", scrollbarWidth: "thin", scrollbarColor: `${t.border} transparent` }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase",
        color: t.label, flexShrink: 0, marginRight: 2 }}>
        To log ({pending.length})
      </span>
      {pending.map((m) => chip(m.matchId, describeMatch(m), "Convoke match waiting to be logged"))}
      {chip("live", "Live table", "Players scraped from the open game tab")}
    </div>
  );
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function debugShuffled(arr: PlayerData[]): PlayerData[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const { players: detectedPlayers } = useGameData();
  const livePlayers = useMemo(
    () => DEBUG_SINGLE_PLAYER
      ? debugShuffled([...detectedPlayers, ...DEBUG_PLAYERS])
      : detectedPlayers,
    [detectedPlayers],
  );

  // Source of the form: a pending Convoke match (default: oldest) or the live scraped table.
  const pending = usePendingMatches();
  const [source, setSource] = useState<string | null>(null); // null = automatic, "live" = live table
  const selectedMatch = source === "live"
    ? undefined
    : (pending.find((m) => m.matchId === source) ?? pending[0]);
  const review = useMemo(() => (selectedMatch ? reviewDefaults(selectedMatch) : null), [selectedMatch]);
  const players = review?.players ?? livePlayers;
  const [resetNonce, setResetNonce] = useState(0);
  // Changes only when the form should start over: a different match, or new live players.
  const sourceKey = `${resetNonce}:${review ? `match:${review.matchId}` : `live:${JSON.stringify(livePlayers)}`}`;

  // Theme
  const [themeOverride, setThemeOverride] = useState(localStorage.getItem("ba_theme") || "system");
  const [sysDark, setSysDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const isDark = themeOverride === "system" ? sysDark : themeOverride === "dark";
  const handleOverride = (v: string) => { setThemeOverride(v); localStorage.setItem("ba_theme", v); };
  const t = getTokens(isDark);
  // Same colour as the card: Chrome's popup window is a plain rectangle, so a different body
  // colour shows as a square frame around the card's rounded corners (#25).
  useEffect(() => { document.body.style.background = t.bg; }, [t.bg]);

  // Game state
  const [winner, setWinner]           = useState<string | null>(null);
  const [wincon, setWincon]           = useState<string | null>(null);
  const [firstPlayer, setFirstPlayer] = useState<string | null>(null);
  const [firstKiller, setFirstKiller] = useState<string | null>(null);
  const [firstVictim, setFirstVictim] = useState<string | null>(null);
  const [koType, setKoType]           = useState("Staggered");
  const [boardWipes, setBoardWipes]   = useState(0);
  const [rounds, setRounds]           = useState(0);
  const [solRing, setSolRing]         = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [confirming, setConfirming]     = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [menuOpen, setMenuOpen]         = useState(false);
  const [formKey, setFormKey]           = useState(0);
  const [playerTimes, setPlayerTimes]   = useState<Record<string, string>>({});
  const [suggested, setSuggested]       = useState<SuggestedField[]>([]);
  const [loggedSummary, setLoggedSummary] = useState<SummaryData | null>(null);
  const [alreadyLogged, setAlreadyLogged] = useState(false);
  // Identifies a live-table submission across retries (Convoke matches use their matchId).
  const [liveSubmissionKey, setLiveSubmissionKey] = useState(() => crypto.randomUUID());
  const winnerTouched = useRef(false);
  const unsuggest = (f: SuggestedField) => setSuggested((s) => s.filter((x) => x !== f));

  // Start the form over when the source changes. Pending matches are pre-filled from Convoke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when sourceKey changes, not on every vote update
  useEffect(() => {
    winnerTouched.current = false;
    if (review) {
      setFirstPlayer(review.firstPlayer ?? review.players[0]?.name ?? null);
      setWinner(review.winner);
      setFirstVictim(review.firstVictim);
      setKoType(review.koType);
      setRounds(review.rounds);
      setSuggested(review.suggested);
    } else {
      setFirstPlayer(players.length > 0 ? players[0].name : null);
      setWinner(null);
      setFirstVictim(null);
      setKoType("Staggered");
      setRounds(0);
      setSuggested([]);
    }
    setWincon(null);
    setFirstKiller(null);
    setBoardWipes(0);
    setSolRing(false);
    setLiveSubmissionKey(crypto.randomUUID());
    setFormKey(k => k + 1);
  }, [sourceKey]);

  // Votes keep arriving after the end. Update the winner suggestion until the person picks one.
  const suggestedWinner = review?.winner ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to a new suggestion, not to wincon edits
  useEffect(() => {
    if (winnerTouched.current || !suggestedWinner || wincon === "Draw") return;
    setWinner(suggestedWinner);
    setSuggested((s) => (s.includes("winner") ? s : [...s, "winner"]));
  }, [suggestedWinner]);

  const chooseWinner = (name: string) => {
    winnerTouched.current = true;
    unsuggest("winner");
    setWinner((v) => (v === name ? null : name));
  };
  const chooseVictim = (name: string | null) => { unsuggest("firstVictim"); setFirstVictim(name); };

  useEffect(() => {
    const toDisplay = (raw: Record<string, number> | null) => {
      const out: Record<string, string> = {};
      for (const [name, secs] of Object.entries(raw ?? {})) out[name] = formatSeconds(secs);
      return out;
    };
    playerTimesStorage.getValue().then((raw) => setPlayerTimes(toDisplay(raw)));
    const unwatch = playerTimesStorage.watch((raw) => setPlayerTimes(toDisplay(raw)));
    return () => unwatch();
  }, []);

  // Draw clears winner and kill event
  const isDraw = wincon === "Draw";
  useEffect(() => {
    if (isDraw) { setWinner(null); setFirstKiller(null); setFirstVictim(null); }
  }, [isDraw]);

  // Two-way KO type ↔ kill event constraint
  const killEventActive = firstKiller !== null || firstVictim !== null;
  const handleKoTypeChange = (v: string) => {
    unsuggest("koType");
    setKoType(v);
    if (v === "Simultaneous") { setFirstKiller(null); setFirstVictim(null); }
  };
  useEffect(() => { if (killEventActive) setKoType("Staggered"); }, [killEventActive]);

  // Winner can't be the first victim
  useEffect(() => { if (winner !== null && firstVictim === winner) setFirstVictim(null); }, [winner]);

  const canSubmit = wincon !== null && (isDraw || winner !== null);

  const summaryData: SummaryData = {
    winner, wincon, firstPlayer, firstKiller, firstVictim, koType, boardWipes, rounds, solRing,
    suggested,
    sourceLabel: selectedMatch && review ? `Convoke match · ${describeMatch(selectedMatch)}` : undefined,
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_NOW" });
    } catch (err) {
      console.error("[Popup] Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Submit Score → show confirm screen (no API call yet)
  const handleReview = () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setConfirming(true);
  };

  // "Looks good, log it" → actual API call
  const handleConfirm = () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const data = {
      players, winner, wincon, firstPlayer, firstKiller, firstVictim, koType, boardWipes, rounds, solRing,
      // Pending Convoke match: its own date and turn times, and mark it logged afterwards.
      ...(review && { matchId: review.matchId, date: review.date, playerTimes: review.playerTimes }),
      // Same key on retry → the background resumes instead of creating a second Game.
      submissionKey: review?.matchId ?? liveSubmissionKey,
    };
    const snapshot = summaryData;
    chrome.runtime.sendMessage(
      { action: "SUBMIT_GAME", data },
      (response: SubmitResponse | undefined) => {
        setSubmitting(false);
        if (chrome.runtime.lastError) {
          setSubmitError(chrome.runtime.lastError.message ?? "Extension error");
          return;
        }
        switch (response?.status) {
          case "logged":
          case "already-logged":
            // Keep what was logged on screen: the match leaves the pending list, which resets the form.
            setLoggedSummary(snapshot);
            setAlreadyLogged(response.status === "already-logged");
            setConfirming(false);
            setSubmitted(true);
            break;
          case "partial":
            setSubmitError(
              `The game was saved, but seat${response.missingSeats.length === 1 ? "" : "s"} ` +
              `${response.missingSeats.join(", ")} failed (${response.error}). ` +
              "Tap “Log it” again to add only the missing seats.",
            );
            break;
          default:
            setSubmitError(response?.error ?? "Submission failed");
        }
      },
    );
  };

  const handleBack = () => { setConfirming(false); setSubmitError(null); };

  // "Log Another Game": back to the next pending match (or the live table) with a fresh form.
  const handleReset = () => {
    setSubmitted(false); setConfirming(false); setSubmitError(null); setLoggedSummary(null); setAlreadyLogged(false);
    setSource(null);
    setResetNonce(n => n + 1);
  };

  const fmtTime = (secs: number | undefined) => (secs ? formatSeconds(secs) : undefined);

  return (
    <div style={{ width: 560, background: t.bg, borderRadius: 18, overflow: "visible",
      boxShadow: t.shadow, fontFamily: "'DM Sans',sans-serif",
      transition: "background 0.25s, box-shadow 0.25s", position: "relative" }}>

      <ManaSpark active={submitted} />

      {/* ── Header ── */}
      <div style={{ padding: "10px 16px 10px", borderBottom: `1.5px solid ${t.border}`,
        background: t.headerBg, display: "flex", alignItems: "center", gap: 12,
        position: "relative", transition: "background 0.25s, border-color 0.25s" }}>

        <CubeIcon dark={isDark} />

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 19,
              color: t.ink, letterSpacing: "-0.03em" }}>b.A</span>
            <span style={{ color: t.muted, fontSize: 12.5, fontWeight: 500 }}>Match Logger</span>
          </div>
          <div style={{ marginTop: 3, display: "flex", gap: 4 }}>
            {[P.peach, P.mint, P.lemon, P.periwinkle].map(c => (
              <span key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c,
                border: `1px solid ${t.swatchBorder}` }} />
            ))}
          </div>
        </div>

        <div style={{ marginLeft: "auto", marginRight: 6,
          padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: isDark ? "rgba(104,212,160,0.1)" : "rgba(104,212,160,0.15)",
          border: `1px solid ${P.mint}44`, color: P.mint,
          display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: P.mint,
            boxShadow: `0 0 5px ${P.mint}` }} />
          Session active
        </div>

        {DEBUG_SINGLE_PLAYER && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            background: `${P.lemon}33`, border: `1px solid ${P.lemon}88`,
            color: isDark ? P.lemon : "#7a7a00", padding: "2px 7px", borderRadius: 20,
            flexShrink: 0, marginRight: 2 }}>
            DEBUG
          </span>
        )}

        <button type="button" onClick={handleRefresh} disabled={refreshing} title="Refresh player data" style={{
          width: 28, height: 28, borderRadius: 7,
          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)",
          border: `1px solid ${t.border}`,
          cursor: refreshing ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s", opacity: refreshing ? 0.5 : 1,
        }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }}>
            <path d="M1 6A5 5 0 1 1 2.5 9.5" stroke={t.muted} strokeWidth="1.4" strokeLinecap="round" />
            <polyline points="1,3.5 1,6 3.5,6" stroke={t.muted} strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button type="button" onClick={() => setMenuOpen(o => !o)} style={{
          width: 28, height: 28, borderRadius: 7,
          background: menuOpen ? "rgba(128,152,216,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)"),
          border: `1px solid ${menuOpen ? "rgba(128,152,216,0.4)" : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s",
        }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke={menuOpen ? P.periwinkle : t.muted} strokeWidth="1.4" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line key={deg}
                x1={7 + 3.8 * Math.cos((deg * Math.PI) / 180)}
                y1={7 + 3.8 * Math.sin((deg * Math.PI) / 180)}
                x2={7 + 5.4 * Math.cos((deg * Math.PI) / 180)}
                y2={7 + 5.4 * Math.sin((deg * Math.PI) / 180)}
                stroke={menuOpen ? P.periwinkle : t.muted} strokeWidth="1.2" strokeLinecap="round" />
            ))}
          </svg>
        </button>

        <SettingsMenu open={menuOpen} onClose={() => setMenuOpen(false)}
          themeOverride={themeOverride} onOverride={handleOverride}
          onSettings={() => { setConfirming(false); setSubmitted(false); setShowSettings(true); }}
          t={t} />
      </div>

      {!showSettings && !submitted && !confirming && pending.length > 0 && (
        <PendingBar pending={pending} selectedId={review?.matchId ?? null}
          onSelect={(id) => { setSubmitError(null); setSource(id); }} t={t} isDark={isDark} />
      )}

      {/* ── Body ── */}
      <div key={formKey} style={{ display: "flex", animation: "fadeUp 0.18s ease" }}>

        {showSettings ? (
          <div style={{ flex: 1, padding: "18px 20px 16px" }}>
            <SettingsScreen onBack={() => setShowSettings(false)} t={t} isDark={isDark} />
          </div>
        ) : submitted ? (
          <div style={{ flex: 1, padding: "18px 20px 16px" }}>
            <SuccessScreen data={loggedSummary ?? summaryData} onReset={handleReset} t={t}
              alreadyLogged={alreadyLogged} />
          </div>
        ) : confirming ? (
          <div style={{ flex: 1, padding: "18px 20px 16px" }}>
            <ConfirmScreen
              data={summaryData} onConfirm={handleConfirm} onBack={handleBack}
              submitting={submitting} submitError={submitError} t={t} />
          </div>
        ) : (
          <>
            {/* ── LEFT column ── */}
            <div style={{ width: 272, flexShrink: 0, padding: "11px 16px 13px",
              borderRight: `1px solid ${t.colDivider}` }}>

              <SectionLabel t={t} note={
                isDraw ? "· draw — no winner"
                : winner && suggested.includes("winner") && review
                  ? `· suggested, ${review.winnerVotes} vote${review.winnerVotes === 1 ? "" : "s"}`
                  : "· crown = first player"}>
                Select Winner
              </SectionLabel>

              {players.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                  height: 80, borderRadius: 10, border: `1.5px dashed ${t.border}`, marginBottom: 10 }}>
                  <p style={{ color: t.muted, fontSize: 11.5, textAlign: "center", lineHeight: 1.5 }}>
                    No players detected.<br />Open a SpellTable game and click ↺.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                  {players.map((p, i) => (
                    <PlayerRow key={p.name} player={p} index={i}
                      isWinner={winner === p.name} isFirst={firstPlayer === p.name}
                      onSelectWinner={() => chooseWinner(p.name)}
                      onSetFirst={() => setFirstPlayer(p.name)}
                      t={t} isDark={isDark}
                      time={review ? fmtTime(review.playerTimes[p.name]) : playerTimes[p.name.toLowerCase()]}
                      winnerDisabled={isDraw} />
                  ))}
                </div>
              )}

              <Divider t={t} />

              <SectionLabel t={t} note={
                firstVictim && suggested.includes("firstVictim") ? "· victim suggested" : undefined}>
                First Kill Event
              </SectionLabel>
              <KillEvent players={players}
                killer={firstKiller} victim={firstVictim} winner={winner}
                onKiller={setFirstKiller} onVictim={chooseVictim}
                t={t} isDark={isDark}
                disabled={isDraw || koType === "Simultaneous"}
                disabledReason={isDraw ? "N/A — draw game" : "N/A — simultaneous KO"} />
            </div>

            {/* ── RIGHT column ── */}
            <div style={{ flex: 1, padding: "11px 16px 13px", display: "flex", flexDirection: "column" }}>

              <SectionLabel t={t}>Win Condition</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginBottom: 10 }}>
                {WIN_CONDITIONS.map((w, i) => {
                  const sel = wincon === w;
                  const col = WIN_COLORS[i];
                  return (
                    <button type="button" key={w} onClick={() => setWincon(v => v === w ? null : w)} style={{
                      background: sel ? `${col}${isDark ? "22" : "2a"}` : (isDark ? "rgba(255,255,255,0.04)" : "rgba(28,30,42,0.04)"),
                      border: `1.5px solid ${sel ? col : t.border}`,
                      borderRadius: 8, padding: "8px 4px",
                      color: sel ? t.ink : t.muted,
                      fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 12,
                      cursor: "pointer", transition: "all 0.15s", lineHeight: "1.3",
                      boxShadow: sel ? `0 2px 7px ${col}44` : "none",
                    }}>{w}</button>
                  );
                })}
              </div>

              <Divider t={t} />

              <SectionLabel t={t} note={suggested.includes("koType") ? "· suggested" : undefined}>KO Type</SectionLabel>
              <div style={{ marginBottom: 10 }}>
                <PillToggle
                  options={[{ value: "Simultaneous", label: "Simultaneous" }, { value: "Staggered", label: "Staggered" }]}
                  value={koType} onChange={handleKoTypeChange} t={t} isDark={isDark}
                  disabledValues={killEventActive ? ["Simultaneous"] : undefined} />
              </div>

              <Divider t={t} />

              {/* One row for the three small inputs, to keep the popup under 600 px (#25). */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SectionLabel t={t}>Wipes</SectionLabel>
                  <Stepper value={boardWipes} onChange={setBoardWipes} t={t} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SectionLabel t={t}>Rounds</SectionLabel>
                  <Stepper value={rounds} onChange={setRounds} t={t} />
                </div>
                <div style={{ flexShrink: 0 }}>
                  <SectionLabel t={t}>T1 Sol</SectionLabel>
                  <div title={solRing ? "Sol Ring played turn 1" : "No turn-1 Sol Ring"} style={{
                    height: 34, padding: "0 8px", borderRadius: 8,
                    background: solRing ? `${P.mint}${isDark ? "18" : "22"}` : t.statBg,
                    border: `1.5px solid ${solRing ? `${P.mint}66` : t.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                    <ToggleSwitch value={solRing} onChange={setSolRing} />
                  </div>
                </div>
              </div>

              <div style={{ flex: 1 }} />

              <button type="button" onClick={handleReview} disabled={!canSubmit} style={{
                width: "100%", padding: "11px 0", borderRadius: 10,
                background: canSubmit ? `linear-gradient(135deg,${P.mint},#48b880)` : t.disabledBg,
                border: canSubmit ? "none" : `1px solid ${t.border}`,
                color: canSubmit ? "#0e2a1a" : t.disabledFg,
                fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
                cursor: canSubmit ? "pointer" : "default",
                boxShadow: canSubmit ? `0 4px 14px ${P.mint}44` : "none",
                transition: "all 0.2s",
              }}>
                {canSubmit ? "Submit Score"
                  : wincon === null && winner === null ? "Pick a winner & win condition"
                  : wincon === null ? "Pick a win condition"
                  : "Pick a winner"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
