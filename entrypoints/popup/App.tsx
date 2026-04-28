import { useEffect, useMemo, useRef, useState } from "react";
import { useGameData } from "../../src/shared/hooks/useGameData";
import type { PlayerData } from "../../src/shared/storage";

const DEBUG_SINGLE_PLAYER = import.meta.env.VITE_DEBUG_SINGLE_PLAYER === "true";
const DEBUG_PLAYERS: PlayerData[] = [
  { name: "Metalbot",  commanders: ["Korvold, Fae-Cursed King"] },
  { name: "Paperbot",  commanders: ["Krenko, Mob Boss"] },
  { name: "Waterbot",  commanders: ["Yawgmoth, Thran Physician"] },
];

// ── Palette ────────────────────────────────────────────────────────────────────
const P = {
  peach: "#f0a870",
  mint: "#68d4a0",
  lemon: "#d8d870",
  periwinkle: "#8098d8",
  pink: "#e890c8",
  sky: "#78c8e8",
};
const PLAYER_COLORS = [P.peach, P.mint, P.lemon, P.periwinkle];
const WIN_COLORS = [P.peach, P.mint, P.lemon, P.periwinkle, P.pink, P.sky, "#c890e8", "#e87890", "#a0b0c0"];
const WIN_CONDITIONS = ["Combat", "Cmdr Dmg", "Burn/Life", "Alt Win Con", "Infect", "Mill", "Combo", "Stolen", "Draw"];

// ── Theme tokens ──────────────────────────────────────────────────────────────
type Tokens = ReturnType<typeof getTokens>;
function getTokens(dark: boolean) {
  return dark
    ? {
        bg: "#1a1710", surface: "#24201a", headerBg: "#201d16",
        border: "rgba(255,255,255,0.08)", ink: "#f0ede6",
        muted: "rgba(240,237,230,0.38)", label: "rgba(240,237,230,0.32)",
        rowSel: "#2a2618", shadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
        swatchBorder: "rgba(255,255,255,0.18)", menuBg: "#2a2618",
        menuBorder: "rgba(255,255,255,0.1)", disabledBg: "rgba(255,255,255,0.06)",
        disabledFg: "rgba(240,237,230,0.22)", bodyBg: "#141210",
        statBg: "rgba(255,255,255,0.04)", toggleTrack: "rgba(255,255,255,0.1)",
        divider: "rgba(255,255,255,0.06)",
      }
    : {
        bg: "#f5f3ef", surface: "#fffefb", headerBg: "#fffefb",
        border: "rgba(28,30,42,0.09)", ink: "#1c1e2a",
        muted: "rgba(28,30,42,0.38)", label: "rgba(28,30,42,0.38)",
        rowSel: "#fffefb", shadow: "0 12px 40px rgba(0,0,0,0.10), 0 0 0 1.5px rgba(28,30,42,0.07)",
        swatchBorder: "rgba(28,30,42,0.15)", menuBg: "#fffefb",
        menuBorder: "rgba(28,30,42,0.1)", disabledBg: "rgba(28,30,42,0.06)",
        disabledFg: "rgba(28,30,42,0.25)", bodyBg: "#e8e4de",
        statBg: "rgba(28,30,42,0.04)", toggleTrack: "rgba(28,30,42,0.1)",
        divider: "rgba(28,30,42,0.07)",
      };
}

// ── CubeIcon ──────────────────────────────────────────────────────────────────
function CubeIcon({ size = 44, dark }: { size?: number; dark: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="10" fill={dark ? "#2a2618" : "#e8e4d8"} />
      <polygon points="22,8 33,14.5 33,27.5 22,34 11,27.5 11,14.5" fill="none"
        stroke="#1c1e2a" strokeWidth="1.2" opacity={dark ? 0.12 : 0.2} />
      <polygon points="22,8 33,14.5 22,21 11,14.5" fill={P.periwinkle} opacity="0.72" />
      <polygon points="11,14.5 22,21 22,34 11,27.5" fill={P.mint} opacity="0.78" />
      <polygon points="33,14.5 22,21 22,34 33,27.5" fill={P.peach} opacity="0.82" />
      <line x1="22" y1="8" x2="22" y2="21" stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
      <line x1="11" y1="14.5" x2="22" y2="21" stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
      <line x1="33" y1="14.5" x2="22" y2="21" stroke="#1c1e2a" strokeWidth="1" opacity={dark ? 0.1 : 0.16} />
    </svg>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
function SectionLabel({ children, t }: { children: React.ReactNode; t: Tokens }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
      textTransform: "uppercase", color: t.label, marginBottom: 9 }}>
      {children}
    </div>
  );
}

// ── SettingsMenu ──────────────────────────────────────────────────────────────
function SettingsMenu({ open, onClose, themeOverride, onOverride, t }: {
  open: boolean; onClose: () => void;
  themeOverride: string; onOverride: (v: string) => void; t: Tokens;
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
    <div ref={ref} style={{ position: "absolute", top: 52, right: 16, zIndex: 100,
      background: t.menuBg, border: `1px solid ${t.menuBorder}`, borderRadius: 12,
      padding: "6px 0", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", minWidth: 182,
      animation: "menuIn 0.18s ease" }}>
      <div style={{ padding: "8px 14px 6px", fontSize: 10.5, fontWeight: 700,
        letterSpacing: "0.12em", textTransform: "uppercase", color: t.muted }}>
        Appearance
      </div>
      {opts.map(o => (
        <button key={o.value} onClick={() => { onOverride(o.value); onClose(); }} style={{
          width: "100%", padding: "9px 14px", display: "flex", alignItems: "center", gap: 10,
          background: themeOverride === o.value ? "rgba(128,152,216,0.12)" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans',sans-serif",
        }}>
          <span style={{ fontSize: 13, width: 18, textAlign: "center",
            color: o.value === "light" ? P.lemon : o.value === "dark" ? P.periwinkle : t.ink }}>
            {o.icon}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: t.ink }}>{o.label}</span>
          {themeOverride === o.value && (
            <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6.5" fill={P.periwinkle} opacity="0.9" />
              <path d="M4 7l2.2 2.2 3.8-3.8" stroke="#fff" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ── PlayerRow ──────────────────────────────────────────────────────────────────
function PlayerRow({ player, index, isWinner, isFirst, onSelectWinner, onSetFirst, t, isDark }: {
  player: { name: string; commanders: string[] };
  index: number; isWinner: boolean; isFirst: boolean;
  onSelectWinner: (name: string) => void; onSetFirst: (name: string) => void;
  t: Tokens; isDark: boolean;
}) {
  const col = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const deck = player.commanders.join(" / ") || "Unknown commander";
  return (
    <button onClick={() => onSelectWinner(player.name)} style={{
      width: "100%",
      background: isWinner ? (isDark ? t.rowSel : t.surface) : (isDark ? "rgba(255,255,255,0.03)" : "rgba(28,30,42,0.03)"),
      border: `1.5px solid ${isWinner ? col : t.border}`,
      borderRadius: 11, padding: "11px 12px 11px 14px",
      display: "flex", alignItems: "center", gap: 10,
      cursor: "pointer", textAlign: "left",
      boxShadow: isWinner ? `0 2px 12px ${col}44` : "none",
      transition: "all 0.15s",
    }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: col, flexShrink: 0,
        border: `1.5px solid ${t.swatchBorder}`,
        boxShadow: isWinner ? `0 0 8px ${col}` : "none", transition: "all 0.2s" }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: t.ink, fontWeight: 600, fontSize: 14 }}>{player.name}</span>
          {isFirst && (
            <span style={{ padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: `${P.lemon}${isDark ? "33" : "44"}`,
              border: `1px solid ${P.lemon}88`, color: isDark ? P.lemon : "#7a7a00",
              letterSpacing: "0.04em", animation: "badgePop 0.2s ease", flexShrink: 0 }}>
              1st
            </span>
          )}
        </span>
        <span style={{ display: "block", color: t.muted, fontSize: 11.5, fontStyle: "italic",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deck}
        </span>
      </span>

      {/* Crown button */}
      <span onClick={(e) => { e.stopPropagation(); onSetFirst(player.name); }}
        role="button" title="Set as first player"
        style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: isFirst ? `${P.lemon}${isDark ? "44" : "55"}` : "transparent",
          border: `1px solid ${isFirst ? `${P.lemon}88` : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s" }}>
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M1 7.5h8M1.5 7.5L2 4l2.5 2L5 2l.5 4L8 4l.5 3.5"
            stroke={isFirst ? P.lemon : t.muted}
            strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>

      {/* Winner checkmark */}
      {isWinner ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="7.5" fill={col} />
          <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 20, animation: "checkIn 0.2s ease forwards" }} />
        </svg>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}
    </button>
  );
}

// ── PillSelector ───────────────────────────────────────────────────────────────
function PillSelector({ players, selected, onSelect, t, isDark }: {
  players: { name: string }[]; selected: string | null;
  onSelect: (name: string | null) => void; t: Tokens; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button onClick={() => onSelect(null)} style={{
        padding: "5px 10px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
        background: selected === null ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(28,30,42,0.1)") : t.statBg,
        border: `1.5px solid ${selected === null ? `${t.ink}44` : t.border}`,
        color: selected === null ? t.ink : t.muted,
        cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
      }}>None</button>
      {players.map((p, i) => {
        const sel = selected === p.name;
        const col = PLAYER_COLORS[i % PLAYER_COLORS.length];
        return (
          <button key={p.name} onClick={() => onSelect(sel ? null : p.name)} style={{
            padding: "5px 10px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
            background: sel ? `${col}${isDark ? "33" : "44"}` : t.statBg,
            border: `1.5px solid ${sel ? col : t.border}`,
            color: sel ? t.ink : t.muted,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
            boxShadow: sel ? `0 2px 8px ${col}44` : "none",
          }}>{p.name}</button>
        );
      })}
    </div>
  );
}

// ── PillToggle ─────────────────────────────────────────────────────────────────
function PillToggle({ options, value, onChange, t, isDark }: {
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; t: Tokens; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", background: t.toggleTrack, borderRadius: 9, padding: 3 }}>
      {options.map(o => {
        const sel = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            background: sel ? (isDark ? "#2a2618" : t.surface) : "transparent",
            border: sel ? `1px solid ${t.border}` : "1px solid transparent",
            color: sel ? t.ink : t.muted,
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.15s",
            boxShadow: sel ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
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
      background: t.statBg, border: `1px solid ${t.border}`, borderRadius: 9, overflow: "hidden" }}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{
        width: 32, height: 36, background: "transparent", border: "none",
        cursor: value <= 0 ? "default" : "pointer",
        color: value <= 0 ? t.muted : t.ink,
        fontSize: 18, opacity: value <= 0 ? 0.35 : 1, transition: "opacity 0.15s",
        fontFamily: "'DM Sans',sans-serif",
      }}>−</button>
      <span style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 15,
        color: t.ink, minWidth: 28 }}>{value}</span>
      <button onClick={() => onChange(Math.min(20, value + 1))} style={{
        width: 32, height: 36, background: "transparent", border: "none",
        cursor: value >= 20 ? "default" : "pointer",
        color: value >= 20 ? t.muted : t.ink,
        fontSize: 18, opacity: value >= 20 ? 0.35 : 1, transition: "opacity 0.15s",
        fontFamily: "'DM Sans',sans-serif",
      }}>+</button>
    </div>
  );
}

// ── ToggleSwitch ───────────────────────────────────────────────────────────────
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 38, height: 22, borderRadius: 11, padding: 2,
      background: value ? P.mint : "rgba(128,128,128,0.2)",
      border: "none", cursor: "pointer", transition: "background 0.2s",
      display: "flex", alignItems: "center", justifyContent: value ? "flex-end" : "flex-start",
    }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
function Divider({ t }: { t: Tokens }) {
  return <div style={{ height: 1, background: t.divider, margin: "16px 0" }} />;
}

// ── SuccessScreen ──────────────────────────────────────────────────────────────
function SuccessScreen({ data, onReset, t }: {
  data: {
    winner: string | null; wincon: string | null; firstPlayer: string | null;
    firstKill: string | null; koType: string; boardWipes: number; solRing: boolean;
  };
  onReset: () => void; t: Tokens;
}) {
  const rows = [
    { label: "Winner",       value: data.winner ?? "—" },
    { label: "Win con.",     value: data.wincon ?? "—" },
    { label: "First player", value: data.firstPlayer ?? "—" },
    { label: "First kill",   value: data.firstKill ?? "None" },
    { label: "KO type",      value: data.koType },
    { label: "Board wipes",  value: String(data.boardWipes) },
    { label: "Sol Ring T1",  value: data.solRing ? "Yes ✦" : "No" },
  ];
  return (
    <div style={{ padding: "20px 16px 16px", animation: "successIn 0.3s ease" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%",
          background: `${P.mint}22`, border: `2px solid ${P.mint}88`,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5 9-9" stroke={P.mint} strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 40, animation: "checkIn 0.4s 0.1s ease both" }} />
          </svg>
        </div>
        <p style={{ color: P.mint, fontWeight: 700, fontSize: 16 }}>Score Logged!</p>
      </div>
      <div style={{ background: t.statBg, border: `1px solid ${t.border}`,
        borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 14px",
            borderBottom: i < rows.length - 1 ? `1px solid ${t.divider}` : "none",
          }}>
            <span style={{ fontSize: 12.5, color: t.muted }}>{r.label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{r.value}</span>
          </div>
        ))}
      </div>
      <button onClick={onReset} style={{
        width: "100%", padding: "12px", borderRadius: 11,
        background: `linear-gradient(135deg,${P.periwinkle},#6070c8)`,
        border: "none", color: "#fff", fontFamily: "'DM Sans',sans-serif",
        fontWeight: 700, fontSize: 14, cursor: "pointer",
        boxShadow: `0 4px 16px ${P.periwinkle}44`,
      }}>Log Another Game</button>
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
  const [firstKill, setFirstKill]     = useState<string | null>(null);
  const [koType, setKoType]           = useState("Staggered");
  const [boardWipes, setBoardWipes]   = useState(0);
  const [solRing, setSolRing]         = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [formKey, setFormKey]         = useState(0);

  useEffect(() => {
    setFirstPlayer(players.length > 0 ? players[0].name : null);
    setWinner(null);
    setWincon(null);
    setFirstKill(null);
    setKoType("Staggered");
    setBoardWipes(0);
    setSolRing(false);
    setFormKey(k => k + 1);
  }, [players]);

  const canSubmit = winner !== null && wincon !== null;

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

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    chrome.runtime.sendMessage(
      { action: "SUBMIT_GAME", data: { players, winner, wincon, firstPlayer, firstKill, koType, boardWipes, solRing } },
      (response: { success: boolean; error?: string } | undefined) => {
        setSubmitting(false);
        if (chrome.runtime.lastError) {
          setSubmitError(chrome.runtime.lastError.message ?? "Extension error");
          return;
        }
        if (response?.success) {
          setSubmitted(true);
        } else {
          setSubmitError(response?.error ?? "Submission failed");
        }
      },
    );
  };

  const handleReset = () => {
    setSubmitted(false);
    setSubmitError(null);
    setWinner(null);
    setWincon(null);
    setFirstPlayer(players.length > 0 ? players[0].name : null);
    setFirstKill(null);
    setKoType("Staggered");
    setBoardWipes(0);
    setSolRing(false);
    setFormKey(k => k + 1);
  };

  return (
    <div style={{ width: 380, background: t.bg, borderRadius: 18, overflow: "visible",
      boxShadow: t.shadow, fontFamily: "'DM Sans',sans-serif",
      transition: "background 0.25s, box-shadow 0.25s", position: "relative" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 16px 14px", borderBottom: `1.5px solid ${t.border}`,
        background: t.headerBg, borderRadius: "18px 18px 0 0",
        display: "flex", alignItems: "center", gap: 12,
        transition: "background 0.25s, border-color 0.25s", position: "relative" }}>
        <CubeIcon dark={isDark} />
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 20,
              color: t.ink, letterSpacing: "-0.03em", transition: "color 0.25s" }}>b.A</span>
            <span style={{ color: t.muted, fontSize: 13, fontWeight: 500 }}>Match Logger</span>
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 5 }}>
            {[P.peach, P.mint, P.lemon, P.periwinkle].map(c => (
              <span key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c,
                border: `1px solid ${t.swatchBorder}`, transition: "border-color 0.25s" }} />
            ))}
          </div>
        </div>
        <button onClick={() => setMenuOpen(o => !o)} style={{
          marginLeft: "auto", width: 30, height: 30, borderRadius: 8,
          background: menuOpen ? "rgba(128,152,216,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(28,30,42,0.05)"),
          border: `1px solid ${menuOpen ? "rgba(128,152,216,0.4)" : t.border}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
        {DEBUG_SINGLE_PLAYER && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            background: `${P.lemon}33`, border: `1px solid ${P.lemon}88`,
            color: isDark ? P.lemon : "#7a7a00", padding: "2px 7px", borderRadius: 20,
            flexShrink: 0 }}>
            DEBUG
          </span>
        )}
        <SettingsMenu open={menuOpen} onClose={() => setMenuOpen(false)}
          themeOverride={themeOverride} onOverride={handleOverride} t={t} />
      </div>

      {/* ── Body ── */}
      <div key={formKey} style={{ padding: "15px 16px 14px", animation: "fadeUp 0.2s ease",
        background: t.bg, borderRadius: "0 0 18px 18px", transition: "background 0.25s" }}>

        {submitted ? (
          <SuccessScreen
            data={{ winner, wincon, firstPlayer, firstKill, koType, boardWipes, solRing }}
            onReset={handleReset} t={t} />
        ) : (
          <>
            {/* SELECT WINNER */}
            <div style={{ marginBottom: 14 }}>
              <SectionLabel t={t}>
                Select Winner
                <span style={{ marginLeft: 6, fontWeight: 400, letterSpacing: 0,
                  fontSize: 10, textTransform: "none", opacity: 0.65 }}>
                  · crown = first player
                </span>
              </SectionLabel>
              {players.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                  height: 72, borderRadius: 11, border: `1.5px dashed ${t.border}` }}>
                  <p style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>
                    No players detected.<br />Open a SpellTable game and click Refresh.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {players.map((p, i) => (
                    <PlayerRow key={p.name} player={p} index={i}
                      isWinner={winner === p.name} isFirst={firstPlayer === p.name}
                      onSelectWinner={(name) => setWinner(v => v === name ? null : name)}
                      onSetFirst={setFirstPlayer} t={t} isDark={isDark} />
                  ))}
                </div>
              )}
            </div>

            {players.length > 0 && (
              <>
                <Divider t={t} />

                {/* FIRST KILL */}
                <div style={{ marginBottom: 14 }}>
                  <SectionLabel t={t}>First Kill</SectionLabel>
                  <PillSelector players={players} selected={firstKill}
                    onSelect={setFirstKill} t={t} isDark={isDark} />
                </div>

                <Divider t={t} />

                {/* WIN CONDITION */}
                <div style={{ marginBottom: 14 }}>
                  <SectionLabel t={t}>Win Condition</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                    {WIN_CONDITIONS.map((w, i) => {
                      const sel = wincon === w;
                      const col = WIN_COLORS[i];
                      return (
                        <button key={w} onClick={() => setWincon(v => v === w ? null : w)} style={{
                          background: sel ? `${col}${isDark ? "22" : "2a"}` : (isDark ? "rgba(255,255,255,0.04)" : "rgba(28,30,42,0.04)"),
                          border: `1.5px solid ${sel ? col : t.border}`,
                          borderRadius: 9, padding: "9px 4px",
                          color: sel ? t.ink : t.muted,
                          fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 12.5,
                          cursor: "pointer", transition: "all 0.15s", lineHeight: 1.3,
                          boxShadow: sel ? `0 2px 8px ${col}44` : "none",
                        }}>{w}</button>
                      );
                    })}
                  </div>
                </div>

                <Divider t={t} />

                {/* MATCH STATS */}
                <div style={{ marginBottom: 14 }}>
                  <SectionLabel t={t}>Match Stats</SectionLabel>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: t.muted, fontWeight: 600,
                        marginBottom: 6, letterSpacing: "0.04em" }}>KO Type</div>
                      <PillToggle
                        options={[{ value: "Simultaneous", label: "Simul." }, { value: "Staggered", label: "Staggered" }]}
                        value={koType} onChange={setKoType} t={t} isDark={isDark} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: t.muted, fontWeight: 600,
                        marginBottom: 6, letterSpacing: "0.04em" }}>Board Wipes</div>
                      <Stepper value={boardWipes} onChange={setBoardWipes} t={t} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 10,
                    background: solRing ? `${P.mint}${isDark ? "18" : "22"}` : t.statBg,
                    border: `1.5px solid ${solRing ? `${P.mint}66` : t.border}`,
                    transition: "all 0.2s" }}>
                    <div>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>Sol Ring on T1</span>
                      <span style={{ display: "block", fontSize: 11.5, color: t.muted }}>
                        Winner played Sol Ring turn one
                      </span>
                    </div>
                    <ToggleSwitch value={solRing} onChange={setSolRing} />
                  </div>
                </div>

                {!canSubmit && (
                  <p style={{ color: t.muted, fontSize: 11.5, textAlign: "center", marginBottom: 10 }}>
                    {winner === null && wincon === null ? "Select a winner and win condition"
                      : winner === null ? "Select a winner to continue"
                      : "Select a win condition to continue"}
                  </p>
                )}
              </>
            )}

            {submitError && (
              <p style={{ color: "#e05050", fontSize: 11.5, textAlign: "center", marginBottom: 8 }}>
                ⚠ {submitError}
              </p>
            )}

            {/* ACTIONS */}
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={handleRefresh} disabled={refreshing} style={{
                flex: 1, padding: "12px 0", borderRadius: 11,
                background: refreshing ? "rgba(128,152,216,0.5)" : `linear-gradient(135deg,${P.periwinkle},#6070c8)`,
                border: "none", color: "#fff",
                fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
                cursor: refreshing ? "default" : "pointer",
                boxShadow: `0 4px 16px ${P.periwinkle}44`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: refreshing ? 0.75 : 1, transition: "opacity 0.15s",
              }}>
                {refreshing ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                      style={{ animation: "spin 0.7s linear infinite" }}>
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" />
                      <path d="M6.5 1A5.5 5.5 0 0 1 12 6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Reading…
                  </>
                ) : "Refresh"}
              </button>
              <button onClick={handleSubmit} disabled={!canSubmit || submitting} style={{
                flex: 1, padding: "12px 0", borderRadius: 11,
                background: canSubmit
                  ? (submitting ? "rgba(60,160,100,0.7)" : `linear-gradient(135deg,${P.mint},#48b880)`)
                  : t.disabledBg,
                border: canSubmit ? "none" : `1px solid ${t.border}`,
                color: canSubmit ? "#0e2a1a" : t.disabledFg,
                fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14,
                cursor: canSubmit && !submitting ? "pointer" : "default",
                boxShadow: canSubmit ? `0 4px 16px ${P.mint}44` : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "all 0.2s",
              }}>
                {submitting ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                      style={{ animation: "spin 0.7s linear infinite" }}>
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="rgba(14,42,26,0.3)" strokeWidth="1.8" />
                      <path d="M6.5 1A5.5 5.5 0 0 1 12 6.5" stroke="#0e2a1a" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Submitting…
                  </>
                ) : "Submit Score"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
