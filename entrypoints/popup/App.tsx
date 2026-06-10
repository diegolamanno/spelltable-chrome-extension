import { useEffect, useMemo, useRef, useState } from "react";
import { useGameData } from "../../src/shared/hooks/useGameData";
import type { PlayerData, NotionConfig } from "../../src/shared/storage";
import { notionConfigStorage } from "../../src/shared/storage";

const DEBUG_SINGLE_PLAYER = import.meta.env.VITE_DEBUG_SINGLE_PLAYER === "true";
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
    disabledFg: "rgba(240,237,230,0.22)", bodyBg: "#141210",
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
    disabledFg: "rgba(28,30,42,0.22)", bodyBg: "#e8e4de",
    statBg: "rgba(28,30,42,0.04)", toggleTrack: "rgba(28,30,42,0.1)",
    divider: "rgba(28,30,42,0.07)",
  };
}

// ── CubeIcon ───────────────────────────────────────────────────────────────────
function CubeIcon({ size = 40, dark }: { size?: number; dark: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
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
      textTransform: "uppercase", color: t.label, marginBottom: 7 }}>
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
  return <div style={{ height: 1, background: t.divider, margin: "8px 0" }} />;
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
        <button key={o.value} onClick={() => { onOverride(o.value); onClose(); }} style={{
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
            <svg style={{ marginLeft: "auto" }} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="6" fill={P.periwinkle} opacity="0.9" />
              <path d="M3.5 6.5l2 2 3.5-3.5" stroke="#fff" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      ))}
      <div style={{ height: 1, background: t.divider, margin: "5px 0" }} />
      <button onClick={() => { onSettings(); onClose(); }} style={{
        width: "100%", padding: "8px 13px", display: "flex", alignItems: "center", gap: 9,
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ width: 16, flexShrink: 0 }}>
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
    <button onClick={winnerDisabled ? undefined : onSelectWinner} style={{
      width: "100%",
      background: isWinner ? (isDark ? t.rowSel : t.surface) : (isDark ? "rgba(255,255,255,0.03)" : "rgba(28,30,42,0.03)"),
      border: `1.5px solid ${isWinner ? col : t.border}`,
      borderRadius: 10, padding: "9px 10px 9px 12px",
      display: "flex", alignItems: "center", gap: 9,
      cursor: winnerDisabled ? "default" : "pointer", textAlign: "left",
      boxShadow: isWinner ? `0 2px 10px ${col}44` : "none",
      opacity: winnerDisabled ? 0.55 : 1,
      transition: "all 0.15s",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0,
        border: `1.5px solid ${t.swatchBorder}`,
        boxShadow: isWinner ? `0 0 7px ${col}` : "none", transition: "all 0.2s" }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: t.ink, fontWeight: 600, fontSize: 13 }}>{player.name}</span>
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

      <span onClick={(e) => { e.stopPropagation(); onSetFirst(); }}
        role="button" title="Set as first player"
        style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: isFirst ? `${P.lemon}${isDark ? "44" : "55"}` : "transparent",
          border: `1px solid ${isFirst ? `${P.lemon}88` : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s" }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 7.5h8M1.5 7.5L2 4l2.5 2L5 2l.5 4L8 4l.5 3.5"
            stroke={isFirst ? P.lemon : t.muted}
            strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>

      {isWinner ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="7.5" fill={col} />
          <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 20, animation: "checkIn 0.2s ease forwards" }} />
        </svg>
      ) : (
        <span style={{ width: 15, flexShrink: 0 }} />
      )}
    </button>
  );
}

// ── KillEvent ──────────────────────────────────────────────────────────────────
function KillEvent({ players, killer, victim, winner, onKiller, onVictim, t, isDark, disabled, disabledReason }: {
  players: PlayerData[]; killer: string | null; victim: string | null; winner: string | null;
  onKiller: (name: string | null) => void; onVictim: (name: string | null) => void;
  t: Tokens; isDark: boolean; disabled?: boolean; disabledReason?: string;
}) {
  const both = killer !== null && victim !== null;
  const killerIdx = players.findIndex(p => p.name === killer);
  const victimIdx = players.findIndex(p => p.name === victim);

  function Chip({ player, index, selected, onSelect, disabled: chipDisabled }: {
    player: PlayerData; index: number; selected: boolean;
    onSelect: (name: string | null) => void; disabled: boolean;
  }) {
    const col = PLAYER_COLORS[index % PLAYER_COLORS.length];
    return (
      <button onClick={() => !chipDisabled && onSelect(selected ? null : player.name)} style={{
        padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
        background: selected ? `${col}${isDark ? "44" : "55"}` : t.statBg,
        border: `1.5px solid ${selected ? col : t.border}`,
        color: selected ? t.ink : t.muted,
        cursor: chipDisabled ? "default" : "pointer",
        fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
        opacity: chipDisabled ? 0.35 : 1,
        boxShadow: selected ? `0 2px 6px ${col}44` : "none",
      }}>{player.name}</button>
    );
  }

  if (disabled) {
    return (
      <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, overflow: "hidden",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(28,30,42,0.02)",
        opacity: 0.45, pointerEvents: "none" }}>
        <div style={{ padding: "11px 12px", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.5 }}>
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
      borderRadius: 10,
      border: `1.5px solid ${both ? `${P.pink}55` : t.border}`,
      background: both
        ? (isDark ? `${P.pink}0d` : `${P.pink}0a`)
        : (isDark ? "rgba(255,255,255,0.02)" : "rgba(28,30,42,0.02)"),
      overflow: "hidden", transition: "all 0.2s",
    }}>
      {both ? (
        <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: PLAYER_COLORS[killerIdx % PLAYER_COLORS.length],
            boxShadow: `0 0 6px ${PLAYER_COLORS[killerIdx % PLAYER_COLORS.length]}` }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{killer}</span>

          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
            <path d="M2 12L10 4M10 4H7M10 4V7" stroke={P.pink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="3" cy="11" r="1" fill={P.pink} opacity="0.6" />
          </svg>

          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: PLAYER_COLORS[victimIdx % PLAYER_COLORS.length], opacity: 0.5 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.muted,
            textDecoration: "line-through", textDecorationColor: `${P.pink}88` }}>
            {victim}
          </span>

          <button onClick={() => { onKiller(null); onVictim(null); }}
            style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 5,
              background: "transparent", border: `1px solid ${t.border}`,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: t.muted, fontSize: 12, lineHeight: "1", flexShrink: 0,
              fontFamily: "'DM Sans',sans-serif" }}>×</button>
        </div>
      ) : (
        <>
          <div style={{ padding: "9px 10px 7px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: t.muted, marginBottom: 6,
              display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 12L10 4M10 4H7M10 4V7" stroke={t.muted} strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Killer
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {players.map((p, i) => (
                <Chip key={p.name} player={p} index={i}
                  selected={killer === p.name} disabled={victim === p.name}
                  onSelect={onKiller} />
              ))}
            </div>
          </div>

          <div style={{ position: "relative", height: 18, margin: "0 10px" }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0,
              height: 1, background: t.divider }} />
            <div style={{ position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              width: 22, height: 22, borderRadius: 6,
              background: t.bg, border: `1px solid ${t.border}`,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 12L10 4M10 4H7M10 4V7" stroke={P.pink} strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="3" cy="11" r="1.2" fill={P.pink} opacity="0.7" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "7px 10px 9px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: t.muted, marginBottom: 6,
              display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 10 }}>💀</span>
              Victim
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {players.map((p, i) => (
                <Chip key={p.name} player={p} index={i}
                  selected={victim === p.name}
                  disabled={killer === p.name || p.name === winner}
                  onSelect={onVictim} />
              ))}
            </div>
          </div>
        </>
      )}
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
          <button key={o.value} onClick={() => !dis && onChange(o.value)} style={{
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
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{
        width: 30, height: 32, background: "transparent", border: "none",
        cursor: value <= 0 ? "default" : "pointer",
        color: value <= 0 ? t.muted : t.ink,
        fontSize: 17, lineHeight: "1", opacity: value <= 0 ? 0.35 : 1, transition: "opacity 0.15s",
        fontFamily: "'DM Sans',sans-serif",
      }}>−</button>
      <span style={{ flex: 1, textAlign: "center", fontWeight: 700,
        fontSize: 14, color: t.ink, minWidth: 26 }}>{value}</span>
      <button onClick={() => onChange(Math.min(20, value + 1))} style={{
        width: 30, height: 32, background: "transparent", border: "none",
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
    <button onClick={() => onChange(!value)} style={{
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
};

function buildRows(data: SummaryData) {
  return [
    { label: "Winner",        value: data.winner ?? "—",  accent: true },
    { label: "Win condition", value: data.wincon ?? "—" },
    { label: "First player",  value: data.firstPlayer ?? "—" },
    { label: "First killer",  value: data.firstKiller ?? "None" },
    { label: "First victim",  value: data.firstVictim ?? "None" },
    { label: "KO type",       value: data.koType },
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v5l3 2" stroke={P.periwinkle} strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="6.5" stroke={P.periwinkle} strokeWidth="1.4" />
          </svg>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: t.ink }}>Confirm submission</p>
          <p style={{ fontSize: 11.5, color: t.muted, marginTop: 1 }}>
            Double-check before logging to the platform
          </p>
        </div>
      </div>

      <SummaryGrid data={data} t={t} />

      {submitError && (
        <p style={{ color: "#e05050", fontSize: 11 }}>⚠ {submitError}</p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} disabled={submitting} style={{
          flex: 1, padding: "10px 0", borderRadius: 10,
          background: t.statBg, border: `1px solid ${t.border}`,
          color: t.muted, fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600, fontSize: 13.5,
          cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.5 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s",
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 3L4 6.5 8 10" stroke={t.muted} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Edit
        </button>
        <button onClick={onConfirm} disabled={submitting} style={{
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
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none"
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
function SuccessScreen({ data, onReset, t }: {
  data: SummaryData; onReset: () => void; t: Tokens;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      gap: 12, padding: "8px 0", animation: "successIn 0.3s ease" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%",
        background: `${P.mint}22`, border: `2px solid ${P.mint}88`,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 12l5 5 9-9" stroke={P.mint} strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 40, animation: "checkIn 0.4s 0.1s ease both" }} />
        </svg>
      </div>
      <p style={{ color: P.mint, fontWeight: 700, fontSize: 15 }}>Score Logged!</p>

      <SummaryGrid data={data} t={t} />

      <button onClick={onReset} style={{
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: t.label }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
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
          <button onClick={() => setShow(v => !v)} style={{
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
  const [config, setConfig] = useState<NotionConfig>({ apiKey: "", playersDbId: "", decksDbId: "", gamesDbId: "" });
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke={P.periwinkle} strokeWidth="1.4" />
            <circle cx="8" cy="8" r="2" stroke={P.periwinkle} strokeWidth="1.4" />
            {[0,60,120,180,240,300].map((deg, i) => (
              <line key={i}
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
          <p style={{ fontSize: 10.5, color: t.muted, lineHeight: 1.5 }}>
            Find your API key at notion.so/profile/integrations. Database IDs appear in the
            page URL after the workspace slug.
          </p>
        </div>
      )}

      {saved && (
        <p style={{ color: P.mint, fontSize: 11.5, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5.5" fill={P.mint} opacity="0.2" />
            <path d="M3 6l2 2 4-4" stroke={P.mint} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Saved
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: "10px 0", borderRadius: 10,
          background: t.statBg, border: `1px solid ${t.border}`,
          color: t.muted, fontFamily: "'DM Sans',sans-serif",
          fontWeight: 600, fontSize: 13.5, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          transition: "all 0.15s",
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M8 3L4 6.5 8 10" stroke={t.muted} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button onClick={handleSave} disabled={saving || !loaded} style={{
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
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none"
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

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const { players: detectedPlayers } = useGameData();
  const players = useMemo(
    () => (DEBUG_SINGLE_PLAYER ? [...detectedPlayers, ...DEBUG_PLAYERS] : detectedPlayers),
    [detectedPlayers],
  );

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
  useEffect(() => { document.body.style.background = t.bodyBg; }, [isDark]);

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

  useEffect(() => {
    setFirstPlayer(players.length > 0 ? players[0].name : null);
    setWinner(null);
    setWincon(null);
    setFirstKiller(null);
    setFirstVictim(null);
    setKoType("Staggered");
    setBoardWipes(0);
    setRounds(0);
    setSolRing(false);
    setPlayerTimes({});
    setFormKey(k => k + 1);
  }, [players]);

  // Draw clears winner and kill event
  const isDraw = wincon === "Draw";
  useEffect(() => {
    if (isDraw) { setWinner(null); setFirstKiller(null); setFirstVictim(null); }
  }, [isDraw]);

  // Two-way KO type ↔ kill event constraint
  const killEventActive = firstKiller !== null || firstVictim !== null;
  const handleKoTypeChange = (v: string) => {
    setKoType(v);
    if (v === "Simultaneous") { setFirstKiller(null); setFirstVictim(null); }
  };
  useEffect(() => { if (killEventActive) setKoType("Staggered"); }, [killEventActive]);

  // Winner can't be the first victim
  useEffect(() => { if (winner !== null && firstVictim === winner) setFirstVictim(null); }, [winner]);

  const canSubmit = wincon !== null && (isDraw || winner !== null);

  const summaryData: SummaryData = {
    winner, wincon, firstPlayer, firstKiller, firstVictim, koType, boardWipes, rounds, solRing,
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
    chrome.runtime.sendMessage(
      { action: "SUBMIT_GAME", data: { players, winner, wincon, firstPlayer, firstKiller, firstVictim, koType, boardWipes, rounds, solRing } },
      (response: { success: boolean; error?: string } | undefined) => {
        setSubmitting(false);
        if (chrome.runtime.lastError) {
          setSubmitError(chrome.runtime.lastError.message ?? "Extension error");
          return;
        }
        if (response?.success) { setConfirming(false); setSubmitted(true); }
        else { setSubmitError(response?.error ?? "Submission failed"); }
      },
    );
  };

  const handleBack = () => { setConfirming(false); setSubmitError(null); };

  const handleReset = () => {
    setSubmitted(false); setConfirming(false); setSubmitError(null);
    setWinner(null); setWincon(null);
    setFirstPlayer(players.length > 0 ? players[0].name : null);
    setFirstKiller(null); setFirstVictim(null);
    setKoType("Staggered"); setBoardWipes(0); setRounds(0); setSolRing(false);
    setFormKey(k => k + 1);
  };

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

        <button onClick={handleRefresh} disabled={refreshing} title="Refresh player data" style={{
          width: 28, height: 28, borderRadius: 7,
          background: isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)",
          border: `1px solid ${t.border}`,
          cursor: refreshing ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s", opacity: refreshing ? 0.5 : 1,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ animation: refreshing ? "spin 0.7s linear infinite" : "none" }}>
            <path d="M1 6A5 5 0 1 1 2.5 9.5" stroke={t.muted} strokeWidth="1.4" strokeLinecap="round" />
            <polyline points="1,3.5 1,6 3.5,6" stroke={t.muted} strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button onClick={() => setMenuOpen(o => !o)} style={{
          width: 28, height: 28, borderRadius: 7,
          background: menuOpen ? "rgba(128,152,216,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)"),
          border: `1px solid ${menuOpen ? "rgba(128,152,216,0.4)" : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s",
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke={menuOpen ? P.periwinkle : t.muted} strokeWidth="1.4" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
              <line key={i}
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

      {/* ── Body ── */}
      <div key={formKey} style={{ display: "flex", animation: "fadeUp 0.18s ease" }}>

        {showSettings ? (
          <div style={{ flex: 1, padding: "18px 20px 16px" }}>
            <SettingsScreen onBack={() => setShowSettings(false)} t={t} isDark={isDark} />
          </div>
        ) : submitted ? (
          <div style={{ flex: 1, padding: "18px 20px 16px" }}>
            <SuccessScreen data={summaryData} onReset={handleReset} t={t} />
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

              <SectionLabel t={t} note={isDraw ? "· draw — no winner" : "· crown = first player"}>
                Select Winner
              </SectionLabel>

              {players.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                  height: 80, borderRadius: 10, border: `1.5px dashed ${t.border}`, marginBottom: 13 }}>
                  <p style={{ color: t.muted, fontSize: 11.5, textAlign: "center", lineHeight: 1.5 }}>
                    No players detected.<br />Open a SpellTable game and click ↺.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 13 }}>
                  {players.map((p, i) => (
                    <PlayerRow key={p.name} player={p} index={i}
                      isWinner={winner === p.name} isFirst={firstPlayer === p.name}
                      onSelectWinner={() => setWinner(v => v === p.name ? null : p.name)}
                      onSetFirst={() => setFirstPlayer(p.name)}
                      t={t} isDark={isDark} time={playerTimes[p.name]}
                      winnerDisabled={isDraw} />
                  ))}
                </div>
              )}

              <Divider t={t} />

              <SectionLabel t={t}>First Kill Event</SectionLabel>
              <KillEvent players={players}
                killer={firstKiller} victim={firstVictim} winner={winner}
                onKiller={setFirstKiller} onVictim={setFirstVictim}
                t={t} isDark={isDark}
                disabled={isDraw || koType === "Simultaneous"}
                disabledReason={isDraw ? "N/A — draw game" : "N/A — simultaneous KO"} />
            </div>

            {/* ── RIGHT column ── */}
            <div style={{ flex: 1, padding: "11px 16px 13px", display: "flex", flexDirection: "column" }}>

              <SectionLabel t={t}>Win Condition</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginBottom: 13 }}>
                {WIN_CONDITIONS.map((w, i) => {
                  const sel = wincon === w;
                  const col = WIN_COLORS[i];
                  return (
                    <button key={w} onClick={() => setWincon(v => v === w ? null : w)} style={{
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

              <SectionLabel t={t}>KO Type</SectionLabel>
              <div style={{ marginBottom: 13 }}>
                <PillToggle
                  options={[{ value: "Simultaneous", label: "Simultaneous" }, { value: "Staggered", label: "Staggered" }]}
                  value={koType} onChange={handleKoTypeChange} t={t} isDark={isDark}
                  disabledValues={killEventActive ? ["Simultaneous"] : undefined} />
              </div>

              <Divider t={t} />

              <div style={{ display: "flex", gap: 10, marginBottom: 13, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel t={t}>Board Wipes</SectionLabel>
                  <Stepper value={boardWipes} onChange={setBoardWipes} t={t} />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel t={t}>Rounds</SectionLabel>
                  <Stepper value={rounds} onChange={setRounds} t={t} />
                </div>
              </div>

              <Divider t={t} />

              <SectionLabel t={t}>Sol Ring T1</SectionLabel>
              <div style={{ marginBottom: 13, padding: "7px 10px", borderRadius: 8,
                background: solRing ? `${P.mint}${isDark ? "18" : "22"}` : t.statBg,
                border: `1.5px solid ${solRing ? `${P.mint}66` : t.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.2s" }}>
                <span style={{ fontSize: 12, color: solRing ? t.ink : t.muted, fontWeight: 600 }}>
                  {solRing ? "Yes — played" : "No"}
                </span>
                <ToggleSwitch value={solRing} onChange={setSolRing} />
              </div>

              {!canSubmit && (
                <p style={{ fontSize: 11, color: t.muted, marginBottom: 8 }}>
                  {wincon === null && winner === null ? "Select a winner and win condition to submit"
                    : wincon === null ? "Select a win condition to continue"
                    : "Select a winner to continue"}
                </p>
              )}

              <div style={{ flex: 1 }} />

              <button onClick={handleReview} disabled={!canSubmit} style={{
                width: "100%", padding: "11px 0", borderRadius: 10,
                background: canSubmit ? `linear-gradient(135deg,${P.mint},#48b880)` : t.disabledBg,
                border: canSubmit ? "none" : `1px solid ${t.border}`,
                color: canSubmit ? "#0e2a1a" : t.disabledFg,
                fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
                cursor: canSubmit ? "pointer" : "default",
                boxShadow: canSubmit ? `0 4px 14px ${P.mint}44` : "none",
                transition: "all 0.2s",
              }}>
                Submit Score
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
