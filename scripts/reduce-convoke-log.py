"""Reduce a Convoke logger dump to the parts that matter for game logging.

Usage: python3 -I scripts/reduce-convoke-log.py <in.json> <out.json> [--anonymise]

Input is the output of `copy(JSON.stringify(window.__edhLog, null, 2))` from
entrypoints/convoke-logger.content.ts.

Keeps: start/end/vote-winner calls, first+last match state per match, winner-vote
related PATCH bodies, and a key summary of all other PATCH /state bodies.
Drops card scans, decklists, images, socials, friends and profile stats.

--anonymise replaces player names with "Player N" and Convoke user IDs with 9000+N,
so the result can be committed as a test fixture.
"""
import json
import re
import sys

PLAYER_KEEP = [
    "id", "name", "life", "poison", "isEliminated", "isConnected", "turnNumber",
    "totalTurnTimeMs", "commanderDamageTaken", "secondaryCommanderDamageTaken",
    "commanderTax", "playerStatus",
]
STATE_KEEP = [
    "currentPlayer", "playerOrder", "freedSeatPlayerIds", "format", "startedAt", "endedAt",
    "turnRound", "turnStartedAt", "recordedWinnerId", "recordedWinnerIds", "winnerVotes",
    "monarchPlayerId", "initiativePlayerId",
]
MATCH_KEEP = ["id", "gameId", "playerIds", "winnerIds", "status", "format", "startedAt",
              "endedAt", "stateVersion"]
GAME_KEEP = ["id", "currentMatchId", "participantIds", "status", "format", "seatLimit",
             "autoRandomizeSeatOrder"]


def commander(c):
    return None if not c else {k: c.get(k) for k in ("name", "oracle_id", "scryfall_id")}


def slim_player(p):
    out = {k: p.get(k) for k in PLAYER_KEEP if k in p}
    out["commander"] = commander(p.get("commander"))
    out["secondaryCommander"] = commander(p.get("secondaryCommander"))
    out["deckSelectionStatus"] = (p.get("deckSelection") or {}).get("status")
    return out


def slim_state(s):
    if not isinstance(s, dict):
        return s
    out = {k: s.get(k) for k in STATE_KEEP if k in s}
    out["players"] = [slim_player(p) for p in s.get("players", [])]
    out["eventTypes"] = sorted({e.get("type") for e in s.get("events", [])})
    return out


def slim_match(m):
    if not isinstance(m, dict):
        return m
    out = {k: m.get(k) for k in MATCH_KEEP if k in m}
    if "state" in m:
        out["state"] = slim_state(m["state"])
    if "gameLog" in m:
        out["gameLog"] = [{k: e.get(k) for k in ("at", "type", "by", "data")} for e in m["gameLog"]]
    return out


def slim_game(g):
    if not isinstance(g, dict):
        return g
    out = {k: g.get(k) for k in GAME_KEEP if k in g}
    gs = g.get("gameState")
    if isinstance(gs, dict):
        out["gameState"] = {k: v for k, v in gs.items() if not isinstance(v, (list, dict)) or k in STATE_KEEP}
    out["participants"] = [
        {"id": p.get("id"), "name": p.get("name"),
         "lastCommanderSelection": p.get("lastCommanderSelection")}
        for p in g.get("participantDetails", [])
    ]
    return out


def slim_body(b):
    if not isinstance(b, dict):
        return b
    out = {}
    for k, v in b.items():
        if k == "match":
            out[k] = slim_match(v)
        elif k == "game":
            out[k] = slim_game(v)
        elif k == "state":
            out[k] = slim_state(v)
        elif k == "players" and isinstance(v, list):
            out[k] = [slim_player(p) for p in v]
        else:
            out[k] = v if not isinstance(v, (list, dict)) else slim_state(v) if isinstance(v, dict) and "players" in v else v
    return out


def match_id(path):
    m = re.search(r"/api/match/([0-9a-f-]{36})", path)
    return m.group(1) if m else None


WINNER_PATCH_KEYS = ["recordedWinnerId", "winnerVotes", "endedAt", "gameStatus",
                     "leftBeforeEndUserIds", "voteEligibleUserIds", "voteModalDismissedByUserIds"]


def collect_people(log):
    """Map every Convoke user id -> name seen in match states, in first-seen order."""
    people = {}

    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get("id"), int) and isinstance(o.get("name"), str) and "life" in o:
                people.setdefault(o["id"], o["name"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(log)
    return people


def anonymise(obj, people):
    ids = {pid: 9001 + i for i, pid in enumerate(people)}
    names = {name: f"Player {i + 1}" for i, name in enumerate(people.values())}

    def fix_str(s):
        for real, fake in names.items():
            s = s.replace(real, fake)
        return s

    def walk(o):
        if isinstance(o, dict):
            return {(str(ids[int(k)]) if k.isdigit() and int(k) in ids else fix_str(k)):
                    ("https://example.invalid/deck" if isinstance(v, str) and k.lower().endswith("url")
                     else walk(v))
                    for k, v in o.items()}
        if isinstance(o, list):
            return [walk(v) for v in o]
        if isinstance(o, bool):
            return o
        if isinstance(o, int):
            return ids.get(o, o)
        if isinstance(o, str):
            return fix_str(o)
        return o

    return walk(obj)


def main(src, dst, anon=False):
    log = json.load(open(src))
    milestones, states, patches, winner_patches = [], {}, {}, []
    for e in log:
        path, method = e.get("path", ""), e.get("method")
        mid = match_id(path)
        base = {"at": e.get("at"), "method": method, "path": path, "status": e.get("status")}
        if re.search(r"/(start|end|vote-winner)$", path):
            milestones.append({**base, "requestBody": e.get("requestBody"),
                               "responseBody": slim_body(e.get("responseBody"))})
        elif mid and path.endswith("/state") and method == "GET":
            st = states.setdefault(mid, {"count": 0})
            st["count"] += 1
            snap = {**base, "responseBody": slim_body(e.get("responseBody"))}
            st.setdefault("first", snap)
            st["last"] = snap
        elif mid and path.endswith("/state") and method == "PATCH":
            body = e.get("requestBody")
            keys = sorted(body.keys()) if isinstance(body, dict) else [type(body).__name__]
            p = patches.setdefault(mid, {"count": 0, "bodyKeys": {}})
            p["count"] += 1
            for k in keys:
                p["bodyKeys"][k] = p["bodyKeys"].get(k, 0) + 1
            if isinstance(body, dict):
                picked = {k: body[k] for k in WINNER_PATCH_KEYS if k in body}
                if picked:
                    winner_patches.append({**base, "requestBody": picked})
    out = {"entries": len(log), "milestones": milestones, "statesPerMatch": states,
           "patchesPerMatch": patches, "winnerPatches": winner_patches}
    if anon:
        out = anonymise(out, collect_people(log))
    json.dump(out, open(dst, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], anon="--anonymise" in sys.argv[3:])
