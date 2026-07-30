import React, { useState, useEffect, useCallback } from "react";
import { BookOpen, LogIn, UserPlus, Plus, X, Stamp, Users, ChevronLeft, FileText, Trash2, Loader2, AlertTriangle, Download, Mic, ShieldCheck, Check, Settings } from "lucide-react";

// ---------------------------------------------------------------------------
// 1) Create a free project at supabase.com
// 2) Run the SQL schema (see chat) in the Supabase SQL Editor
// 3) Paste your Project URL and anon public key below (Project Settings > API)
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://shwdijeknmivppyhdgpi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod2RpamVrbm1pdnBweWhkZ3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTM0NTUsImV4cCI6MjEwMDkyOTQ1NX0.rQmT5FGi9WrtI4tOsASEb7S-R8Q4W5SV4yfcvJuKK4c";

const CONFIGURED = !SUPABASE_URL.includes("YOUR-PROJECT");

const ROLES = ["Bishopric", "Stake Admin"];
const NEW_STAKE_VALUE = "__new_stake__";
const NEW_UNIT_VALUE = "__new_unit__";

const emptyRecord = () => ({
  meetingDate: "",
  presiding: "",
  conducting: "",
  acknowledgments: "",
  attendance: "",
  openingHymn: "",
  openingPrayer: "",
  announcements: "",
  ordinances: [{ type: "Baby Blessing", name: "", details: "" }],
  callings: [{ name: "", calling: "", action: "Sustained" }],
  sacramentHymn: "",
  speakersPart1: [{ name: "", topic: "" }],
  intermediateHymn: "",
  speakersPart2: [{ name: "", topic: "" }],
  closingHymn: "",
  closingPrayer: "",
  notes: "",
});

function recordNumber(id) {
  return `SM-${String(id).padStart(4, "0")}`;
}

// --- Minimal Supabase REST/Auth helper (fetch-based, no SDK needed) --------
async function sbAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Authentication error");
  return data;
}

async function sbRest(path, { method = "GET", token, body, extraHeaders } = {}) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Prefer: "return=representation",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Database error");
  }
  if (res.status === 204) return null;
  return res.json();
}

function toDbRow(d, userId, unitId) {
  return {
    unit_id: unitId,
    meeting_date: d.meetingDate,
    presiding: d.presiding,
    conducting: d.conducting,
    acknowledgments: d.acknowledgments,
    attendance: d.attendance ? Number(d.attendance) : null,
    opening_hymn: d.openingHymn,
    opening_prayer: d.openingPrayer,
    announcements: d.announcements,
    ordinances: d.ordinances.filter((o) => o.name),
    callings: d.callings.filter((c) => c.name),
    sacrament_hymn: d.sacramentHymn,
    speakers_part1: d.speakersPart1.filter((s) => s.name),
    intermediate_hymn: d.intermediateHymn,
    speakers_part2: d.speakersPart2.filter((s) => s.name),
    closing_hymn: d.closingHymn,
    closing_prayer: d.closingPrayer,
    notes: d.notes,
    created_by: userId,
  };
}

function fromDbRow(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    meetingDate: row.meeting_date,
    presiding: row.presiding,
    conducting: row.conducting,
    acknowledgments: row.acknowledgments,
    attendance: row.attendance,
    openingHymn: row.opening_hymn,
    openingPrayer: row.opening_prayer,
    announcements: row.announcements,
    ordinances: row.ordinances || [],
    callings: row.callings || [],
    sacramentHymn: row.sacrament_hymn,
    speakersPart1: row.speakers_part1 || [],
    intermediateHymn: row.intermediate_hymn,
    speakersPart2: row.speakers_part2 || [],
    closingHymn: row.closing_hymn,
    closingPrayer: row.closing_prayer,
    notes: row.notes,
    createdBy: row.created_by_name || "",
  };
}

export default function App() {
  const [session, setSession] = useState(null); // { token, userId, name, role, unitId, unitName, stakeName }
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authRole, setAuthRole] = useState(ROLES[0]);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Stake/unit selection for signup
  const [stakes, setStakes] = useState([]);
  const [units, setUnits] = useState([]);
  const [stakeChoice, setStakeChoice] = useState("");
  const [newStakeName, setNewStakeName] = useState("");
  const [unitChoice, setUnitChoice] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitAbbr, setNewUnitAbbr] = useState("");

  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [unitsById, setUnitsById] = useState({});
  const [speakerRows, setSpeakerRows] = useState([]);
  const [loadingSpeakers, setLoadingSpeakers] = useState(false);
  const [hymns, setHymns] = useState([]);
  const [view, setView] = useState("list");
  const [draft, setDraft] = useState(emptyRecord());
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load stakes for signup dropdown (public read, no auth needed)
  useEffect(() => {
    if (!CONFIGURED || authMode !== "signup" || session) return;
    sbRest("stakes?select=*&status=eq.approved&order=name").then(setStakes).catch(() => {});
  }, [authMode, session]);

  // Load units when a stake is picked
  useEffect(() => {
    if (!stakeChoice || stakeChoice === NEW_STAKE_VALUE) {
      setUnits([]);
      return;
    }
    sbRest(`units?stake_id=eq.${stakeChoice}&status=eq.approved&select=*&order=name`).then(setUnits).catch(() => {});
  }, [stakeChoice]);

  const loadRecords = useCallback(async (token) => {
    setLoadingRecords(true);
    try {
      const rows = await sbRest("minutes?select=*&order=meeting_date.desc", { token });
      setRecords(rows.map(fromDbRow));
      const unitIds = Array.from(new Set(rows.map((r) => r.unit_id).filter(Boolean)));
      if (unitIds.length) {
        const unitRows = await sbRest(`units?id=in.(${unitIds.join(",")})&select=id,name,abbreviation`, { token });
        const map = {};
        unitRows.forEach((u) => { map[u.id] = u; });
        setUnitsById(map);
      }
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const loadSpeakerHistory = useCallback(async (token) => {
    setLoadingSpeakers(true);
    try {
      const rows = await sbRest("speaker_history?select=*&order=meeting_date.desc", { token });
      setSpeakerRows(rows);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setLoadingSpeakers(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      loadRecords(session.token);
      loadSpeakerHistory(session.token);
      sbRest("hymns?select=number,title&order=number", { token: session.token }).then(setHymns).catch(() => {});
    }
  }, [session, loadRecords, loadSpeakerHistory]);

  async function checkIsAdmin(token, userId) {
    try {
      const rows = await sbRest(`platform_admins?id=eq.${userId}&select=id`, { token });
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await sbAuth("token?grant_type=password", { email: authEmail, password: authPassword });
      const profileRows = await sbRest(`profiles?id=eq.${data.user.id}&select=*`, { token: data.access_token });
      const p = profileRows[0];
      if (!p) throw new Error("Profile not found for this account.");

      let unitName = "All units";
      let stakeName = "";
      let pending = p.status !== "approved";
      if (p.unit_id) {
        const unitRows = await sbRest(`units?id=eq.${p.unit_id}&select=*,stakes(name)`, { token: data.access_token });
        const unit = unitRows[0] || {};
        unitName = unit.name || "";
        stakeName = unit.stakes?.name || "";
        pending = pending || unit.status !== "approved";
      } else if (p.stake_id) {
        const stakeRows = await sbRest(`stakes?id=eq.${p.stake_id}&select=*`, { token: data.access_token });
        stakeName = stakeRows[0]?.name || "";
        pending = pending || stakeRows[0]?.status !== "approved";
      }

      const isAdmin = await checkIsAdmin(data.access_token, data.user.id);

      setSession({
        token: data.access_token,
        userId: data.user.id,
        name: p.full_name || authEmail,
        role: p.role || "Bishopric",
        unitId: p.unit_id,
        unitName,
        stakeName,
        pending,
        isAdmin,
      });
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setAuthError("");

    const usingNewStake = stakeChoice === NEW_STAKE_VALUE;
    const usingNewUnit = unitChoice === NEW_UNIT_VALUE;
    const isStakeAdmin = authRole === "Stake Admin";
    if (usingNewStake && !newStakeName.trim()) return setAuthError("Enter a name for the new stake.");
    if (!usingNewStake && !stakeChoice) return setAuthError("Choose a stake.");
    if (!isStakeAdmin) {
      if (usingNewUnit && !newUnitName.trim()) return setAuthError("Enter a name for the new unit.");
      if (!usingNewUnit && !unitChoice) return setAuthError("Choose a unit.");
    }

    setAuthLoading(true);
    try {
      const data = await sbAuth("signup", { email: authEmail, password: authPassword });
      if (!data.access_token) {
        setAuthError("Account created. Check your email to confirm, then sign in.");
        setAuthMode("signin");
        return;
      }
      const token = data.access_token;

      let stakeId = stakeChoice;
      let stakePending = false;
      if (usingNewStake) {
        const [newStake] = await sbRest("stakes", {
          method: "POST",
          token,
          body: { name: newStakeName.trim(), status: "pending", requested_by: data.user.id },
        });
        stakeId = newStake.id;
        stakePending = true;
      }

      let unitId = null;
      let unitPending = false;
      if (!isStakeAdmin) {
        unitId = unitChoice;
        if (usingNewUnit) {
          const [newUnit] = await sbRest("units", {
            method: "POST",
            token,
            body: { stake_id: stakeId, name: newUnitName.trim(), abbreviation: newUnitAbbr.trim() || null, status: "pending", requested_by: data.user.id },
          });
          unitId = newUnit.id;
          unitPending = true;
        }
      }

      await sbRest("profiles", {
        method: "POST",
        token,
        body: { id: data.user.id, full_name: authName, role: authRole, unit_id: unitId, stake_id: isStakeAdmin ? stakeId : null, status: "pending" },
      });

      const isAdmin = await checkIsAdmin(token, data.user.id);

      setSession({
        token,
        userId: data.user.id,
        name: authName,
        role: authRole,
        unitId,
        unitName: isStakeAdmin ? "All units" : (usingNewUnit ? newUnitName.trim() : units.find((u) => String(u.id) === String(unitId))?.name || ""),
        stakeName: usingNewStake ? newStakeName.trim() : stakes.find((s) => String(s.id) === String(stakeId))?.name || "",
        pending: true,
        isAdmin,
      });
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function startNew() {
    setDraft(emptyRecord());
    setEditingId(null);
    setSaveError("");
    setView("form");
  }

  function startEdit(record) {
    setDraft({ ...emptyRecord(), ...record });
    setEditingId(record.id);
    setSaveError("");
    setView("form");
  }
  function updateField(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function updateListItem(listName, index, field, value) {
    setDraft((d) => {
      const list = [...d[listName]];
      list[index] = { ...list[index], [field]: value };
      return { ...d, [listName]: list };
    });
  }
  function addListItem(listName, blank) {
    setDraft((d) => ({ ...d, [listName]: [...d[listName], blank] }));
  }
  function removeListItem(listName, index) {
    setDraft((d) => {
      const list = d[listName].filter((_, i) => i !== index);
      return { ...d, [listName]: list.length ? list : d[listName] };
    });
  }

  async function saveRecord(e) {
    e.preventDefault();
    if (!draft.meetingDate) return;
    setSaving(true);
    setSaveError("");
    try {
      if (editingId) {
        await sbRest(`minutes?id=eq.${editingId}`, { method: "PATCH", token: session.token, body: toDbRow(draft, session.userId, session.unitId) });
      } else {
        await sbRest("minutes", { method: "POST", token: session.token, body: toDbRow(draft, session.userId, session.unitId) });
      }
      await loadRecords(session.token);
      await loadSpeakerHistory(session.token);
      setEditingId(null);
      setView(editingId ? "detail" : "list");
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(id) {
    try {
      await sbRest(`minutes?id=eq.${id}`, { method: "DELETE", token: session.token });
      setRecords((r) => r.filter((rec) => rec.id !== id));
      setView("list");
    } catch (e) {
      setSaveError(e.message);
    }
  }

  function openDetail(id) {
    setSelectedId(id);
    setView("detail");
  }

  const selected = records.find((r) => r.id === selectedId);
  const speakerNameOptions = Array.from(new Set(speakerRows.map((r) => r.speaker_name).filter(Boolean))).sort();

  if (!CONFIGURED) {
    return (
      <div className="min-h-screen bg-[#14213D] flex items-center justify-center p-6">
        <div className="max-w-md bg-[#FAF8F3] rounded-sm p-7 border-t-4 border-[#B0473C]">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-[#B0473C]" />
            <h1 className="font-serif text-lg text-[#14213D]">Supabase not configured</h1>
          </div>
          <p className="text-sm text-[#5C6470]">
            Set <code className="bg-[#EFEBE1] px-1">SUPABASE_URL</code> and{" "}
            <code className="bg-[#EFEBE1] px-1">SUPABASE_ANON_KEY</code> at the top of this file.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#14213D] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-full bg-[#B08D57] flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-[#14213D]" />
            </div>
            <h1 className="text-2xl font-serif text-[#FAF8F3] tracking-wide">Ward Record Book</h1>
            <p className="text-[#8B96A8] text-sm mt-1 font-mono">Sacrament Meeting Minutes</p>
          </div>

          <form
            onSubmit={authMode === "signin" ? handleSignIn : handleSignUp}
            className="bg-[#FAF8F3] rounded-sm p-7 shadow-2xl border-t-4 border-[#B08D57]"
          >
            <div className="flex mb-5 rounded-sm overflow-hidden border border-[#D8D3C7]">
              <button type="button" onClick={() => setAuthMode("signin")} className={`flex-1 py-2 text-sm font-medium ${authMode === "signin" ? "bg-[#14213D] text-[#FAF8F3]" : "bg-white text-[#5C6470]"}`}>
                Sign In
              </button>
              <button type="button" onClick={() => setAuthMode("signup")} className={`flex-1 py-2 text-sm font-medium ${authMode === "signup" ? "bg-[#14213D] text-[#FAF8F3]" : "bg-white text-[#5C6470]"}`}>
                Create Account
              </button>
            </div>

            {authMode === "signup" && (
              <>
                <Field label="Full Name">
                  <input value={authName} onChange={(e) => setAuthName(e.target.value)} className={inputClass} required />
                </Field>
                <Field label="Role">
                  <select value={authRole} onChange={(e) => setAuthRole(e.target.value)} className={inputClass}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>

                <Field label="Stake">
                  <select
                    value={stakeChoice}
                    onChange={(e) => { setStakeChoice(e.target.value); setUnitChoice(""); }}
                    className={inputClass}
                  >
                    <option value="">Select a stake…</option>
                    {stakes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value={NEW_STAKE_VALUE}>+ Create new stake</option>
                  </select>
                </Field>
                {stakeChoice === NEW_STAKE_VALUE && (
                  <Field label="New Stake Name">
                    <input value={newStakeName} onChange={(e) => setNewStakeName(e.target.value)} className={inputClass} />
                  </Field>
                )}

                {stakeChoice && authRole !== "Stake Admin" && (
                  <>
                    <Field label="Unit (Ward/Branch)">
                      <select value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)} className={inputClass}>
                        <option value="">Select a unit…</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        <option value={NEW_UNIT_VALUE}>+ Create new unit</option>
                      </select>
                    </Field>
                    {unitChoice === NEW_UNIT_VALUE && (
                      <>
                        <Field label="New Unit Name">
                          <input value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="Abbreviation (optional, shown in the minutes index)">
                          <input value={newUnitAbbr} onChange={(e) => setNewUnitAbbr(e.target.value)} className={inputClass} placeholder="e.g. Elm Park" maxLength={12} />
                        </Field>
                      </>
                    )}
                  </>
                )}
                {stakeChoice && authRole === "Stake Admin" && (
                  <p className="text-xs text-[#5C6470] mb-4 italic">
                    Stake Admin isn't tied to a specific unit — you'll see records across the whole stake.
                  </p>
                )}
              </>
            )}

            <Field label="Email">
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className={inputClass} required />
            </Field>
            <Field label="Password">
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className={inputClass} required minLength={6} />
            </Field>

            {authError && <p className="text-[#B0473C] text-xs mb-3">{authError}</p>}

            <button type="submit" disabled={authLoading} className="w-full bg-[#14213D] text-[#FAF8F3] rounded-sm py-2.5 font-medium flex items-center justify-center gap-2 hover:bg-[#1d2f52] transition-colors disabled:opacity-60 mt-1">
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : authMode === "signin" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (session.pending && !session.isAdmin) {
    return (
      <div className="min-h-screen bg-[#14213D] flex items-center justify-center p-6">
        <div className="max-w-md bg-[#FAF8F3] rounded-sm p-7 border-t-4 border-[#B08D57] text-center">
          <BookOpen className="w-8 h-8 text-[#B08D57] mx-auto mb-3" />
          <h1 className="font-serif text-lg text-[#14213D] mb-2">Awaiting approval</h1>
          <p className="text-sm text-[#5C6470] mb-1">
            Your stake or unit ({session.unitName || session.stakeName}) was just created and is waiting for approval from the record book administrator.
          </p>
          <p className="text-sm text-[#5C6470]">You'll be able to record minutes as soon as it's approved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFEBE1] flex flex-col md:flex-row font-sans">
      <aside className="md:w-72 bg-[#14213D] text-[#FAF8F3] flex flex-col shrink-0">
        <div className="p-6 border-b border-[#2A3B5C]">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-[#B08D57]" />
            <span className="font-serif text-lg tracking-wide">Record Book</span>
          </div>
          <p className="text-xs text-[#8B96A8] font-mono">{session.name} · {session.role}</p>
          <p className="text-xs text-[#5C6470] font-mono mt-0.5">{session.unitName} · {session.stakeName}</p>
        </div>

        <button onClick={startNew} className="mx-5 mt-5 mb-2 bg-[#B08D57] text-[#14213D] rounded-sm py-2.5 font-medium flex items-center justify-center gap-2 hover:bg-[#c29d68] transition-colors">
          <Plus className="w-4 h-4" /> New Minutes
        </button>
        <button
          onClick={() => setView("speakers")}
          className={`mx-5 mb-2 rounded-sm py-2 font-medium flex items-center justify-center gap-2 border transition-colors ${view === "speakers" ? "bg-[#2A3B5C] border-[#2A3B5C]" : "border-[#2A3B5C] hover:bg-[#1d2f52]"}`}
        >
          <Mic className="w-4 h-4" /> Speakers
        </button>
        {session.isAdmin && (
          <button
            onClick={() => setView("approvals")}
            className={`mx-5 mb-2 rounded-sm py-2 font-medium flex items-center justify-center gap-2 border transition-colors ${view === "approvals" ? "bg-[#2A3B5C] border-[#2A3B5C]" : "border-[#2A3B5C] hover:bg-[#1d2f52]"}`}
          >
            <ShieldCheck className="w-4 h-4" /> Approvals
          </button>
        )}
        {(session.isAdmin || session.role === "Stake Admin") && (
          <button
            onClick={() => setView("manage")}
            className={`mx-5 mb-4 rounded-sm py-2 font-medium flex items-center justify-center gap-2 border transition-colors ${view === "manage" ? "bg-[#2A3B5C] border-[#2A3B5C]" : "border-[#2A3B5C] hover:bg-[#1d2f52]"}`}
          >
            <Settings className="w-4 h-4" /> Manage
          </button>
        )}

        <div className="px-5 mt-2 mb-2 text-xs font-mono uppercase tracking-wider text-[#5C6470]">Index ({records.length})</div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          {loadingRecords && <Loader2 className="w-4 h-4 animate-spin text-[#5C6470] mx-auto mt-2" />}
          {!loadingRecords && records.length === 0 && <p className="text-[#5C6470] text-sm px-2 mt-2 italic">No records yet. Create the first entry.</p>}
          {records.map((r) => {
            const u = unitsById[r.unitId];
            const unitLabel = u ? (u.abbreviation || u.name) : null;
            return (
              <button key={r.id} onClick={() => openDetail(r.id)} className={`w-full text-left px-3 py-2.5 rounded-sm mb-1 transition-colors ${selectedId === r.id && view === "detail" ? "bg-[#2A3B5C]" : "hover:bg-[#1d2f52]"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#B08D57]">{recordNumber(r.id)}</span>
                  <FileText className="w-3.5 h-3.5 text-[#5C6470]" />
                </div>
                <div className="text-sm mt-0.5">{r.meetingDate || "Undated"}{unitLabel ? ` · ${unitLabel}` : ""}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 p-5 md:p-10 overflow-y-auto">
        {saveError && <div className="mb-5 bg-[#FBE9E7] border border-[#E3B0A8] text-[#8a3830] text-sm px-4 py-3 rounded-sm">{saveError}</div>}

        {view === "list" && (
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl text-[#14213D] mb-2">Welcome, {session.name.split(" ")[0]}</h2>
            <p className="text-[#5C6470] mb-8">Select a record from the index, or create a new set of minutes for this week's sacrament meeting.</p>
            <button onClick={startNew} className="bg-[#14213D] text-[#FAF8F3] rounded-sm px-5 py-3 font-medium flex items-center gap-2 hover:bg-[#1d2f52] transition-colors">
              <Plus className="w-4 h-4" /> Start New Minutes
            </button>
          </div>
        )}

        {view === "detail" && selected && <RecordDetail record={selected} unitLabel={unitsById[selected.unitId] ? (unitsById[selected.unitId].abbreviation || unitsById[selected.unitId].name) : null} role={session.role} onBack={() => setView("list")} onDelete={deleteRecord} onEdit={() => startEdit(selected)} />}

        {view === "speakers" && <SpeakersView rows={speakerRows} loading={loadingSpeakers} onBack={() => setView("list")} />}

        {view === "approvals" && <ApprovalsView token={session.token} onBack={() => setView("list")} />}

        {view === "manage" && <ManageView token={session.token} isAdmin={session.isAdmin} currentUserId={session.userId} onBack={() => setView("list")} />}

        {view === "form" && (
          <MinutesForm
            draft={draft}
            updateField={updateField}
            updateListItem={updateListItem}
            addListItem={addListItem}
            removeListItem={removeListItem}
            onCancel={() => setView(editingId ? "detail" : "list")}
            onSave={saveRecord}
            saving={saving}
            isEditing={!!editingId}
            speakerNames={speakerNameOptions}
            hymns={hymns}
          />
        )}
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full border border-[#D8D3C7] rounded-sm px-3 py-2 bg-white text-[#232323] focus:outline-none focus:ring-2 focus:ring-[#B08D57] focus:border-transparent text-sm";

function MinutesForm({ draft, updateField, updateListItem, addListItem, removeListItem, onCancel, onSave, saving, isEditing, speakerNames, hymns }) {
  return (
    <form onSubmit={onSave} className="max-w-3xl">
      <h2 className="font-serif text-2xl text-[#14213D] mb-6">{isEditing ? "Edit Sacrament Meeting Minutes" : "New Sacrament Meeting Minutes"}</h2>

      <datalist id="speaker-names-list">
        {speakerNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="hymn-options-list">
        {hymns.map((h) => <option key={h.number} value={`${h.number} - ${h.title}`} />)}
      </datalist>

      <Section title="General">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Meeting Date">
            <input type="date" value={draft.meetingDate} onChange={(e) => updateField("meetingDate", e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Attendance">
            <input type="number" value={draft.attendance} onChange={(e) => updateField("attendance", e.target.value)} className={inputClass} placeholder="e.g. 142" />
          </Field>
          <Field label="Presiding">
            <input value={draft.presiding} onChange={(e) => updateField("presiding", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Conducting">
            <input value={draft.conducting} onChange={(e) => updateField("conducting", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Acknowledgments (pianist, chorister, other leaders)">
          <input value={draft.acknowledgments} onChange={(e) => updateField("acknowledgments", e.target.value)} className={inputClass} placeholder="e.g. Pianist: Jane Doe · Chorister: John Smith" />
        </Field>
      </Section>

      <Section title="Opening">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Opening Hymn"><input value={draft.openingHymn} onChange={(e) => updateField("openingHymn", e.target.value)} list="hymn-options-list" className={inputClass} /></Field>
          <Field label="Opening Prayer"><input value={draft.openingPrayer} onChange={(e) => updateField("openingPrayer", e.target.value)} className={inputClass} /></Field>
        </div>
      </Section>

      <Section title="Announcements">
        <Field label="Announcements"><textarea value={draft.announcements} onChange={(e) => updateField("announcements", e.target.value)} className={inputClass} rows={3} /></Field>
      </Section>

      <RepeatingSection
        title="Ordinances"
        items={draft.ordinances}
        onAdd={() => addListItem("ordinances", { type: "Baby Blessing", name: "", details: "" })}
        onRemove={(i) => removeListItem("ordinances", i)}
        renderItem={(item, i) => (
          <div className="grid sm:grid-cols-3 gap-3 flex-1">
            <select value={item.type} onChange={(e) => updateListItem("ordinances", i, "type", e.target.value)} className={inputClass}>
              <option>Baby Blessing</option><option>Baptism Confirmation</option><option>Priesthood Ordination</option><option>Other</option>
            </select>
            <input value={item.name} onChange={(e) => updateListItem("ordinances", i, "name", e.target.value)} placeholder="Name" className={inputClass} />
            <input value={item.details} onChange={(e) => updateListItem("ordinances", i, "details", e.target.value)} placeholder="Details" className={inputClass} />
          </div>
        )}
      />

      <RepeatingSection
        title="Callings Sustained / Released"
        items={draft.callings}
        onAdd={() => addListItem("callings", { name: "", calling: "", action: "Sustained" })}
        onRemove={(i) => removeListItem("callings", i)}
        renderItem={(item, i) => (
          <div className="grid sm:grid-cols-3 gap-3 flex-1">
            <input value={item.name} onChange={(e) => updateListItem("callings", i, "name", e.target.value)} placeholder="Name" className={inputClass} />
            <input value={item.calling} onChange={(e) => updateListItem("callings", i, "calling", e.target.value)} placeholder="Calling" className={inputClass} />
            <select value={item.action} onChange={(e) => updateListItem("callings", i, "action", e.target.value)} className={inputClass}>
              <option>Sustained</option><option>Released</option>
            </select>
          </div>
        )}
      >
        <div className="bg-[#EFEBE1] border border-[#D8D3C7] rounded-sm p-4 mb-4 text-sm text-[#5C6470]">
          <p className="font-mono text-xs uppercase tracking-wider text-[#5C6470] mb-2">Suggested script</p>
          <p className="mb-1.5"><strong>Sustaining:</strong> "It is proposed that we sustain [name] as [calling]. All in favor, please manifest it. Those opposed, if any, may manifest it by the same sign."</p>
          <p><strong>Releasing:</strong> "It is proposed that we release [name] as [calling], with a vote of thanks for the service rendered. All in favor, please manifest it."</p>
        </div>
      </RepeatingSection>

      <Section title="Sacrament">
        <Field label="Sacrament Hymn"><input value={draft.sacramentHymn} onChange={(e) => updateField("sacramentHymn", e.target.value)} list="hymn-options-list" className={inputClass} /></Field>
      </Section>

      <RepeatingSection
        title="Speakers (before intermediate hymn)"
        items={draft.speakersPart1}
        onAdd={() => addListItem("speakersPart1", { name: "", topic: "" })}
        onRemove={(i) => removeListItem("speakersPart1", i)}
        renderItem={(item, i) => (
          <div className="grid sm:grid-cols-2 gap-3 flex-1">
            <input value={item.name} onChange={(e) => updateListItem("speakersPart1", i, "name", e.target.value)} placeholder="Speaker name" list="speaker-names-list" className={inputClass} />
            <input value={item.topic} onChange={(e) => updateListItem("speakersPart1", i, "topic", e.target.value)} placeholder="Topic" className={inputClass} />
          </div>
        )}
      />

      <Section title="Intermediate Hymn">
        <Field label="Intermediate Hymn"><input value={draft.intermediateHymn} onChange={(e) => updateField("intermediateHymn", e.target.value)} list="hymn-options-list" className={inputClass} /></Field>
      </Section>

      <RepeatingSection
        title="Speakers (after intermediate hymn)"
        items={draft.speakersPart2}
        onAdd={() => addListItem("speakersPart2", { name: "", topic: "" })}
        onRemove={(i) => removeListItem("speakersPart2", i)}
        renderItem={(item, i) => (
          <div className="grid sm:grid-cols-2 gap-3 flex-1">
            <input value={item.name} onChange={(e) => updateListItem("speakersPart2", i, "name", e.target.value)} placeholder="Speaker name" list="speaker-names-list" className={inputClass} />
            <input value={item.topic} onChange={(e) => updateListItem("speakersPart2", i, "topic", e.target.value)} placeholder="Topic" className={inputClass} />
          </div>
        )}
      />

      <Section title="Closing">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Closing Hymn"><input value={draft.closingHymn} onChange={(e) => updateField("closingHymn", e.target.value)} list="hymn-options-list" className={inputClass} /></Field>
          <Field label="Closing Prayer"><input value={draft.closingPrayer} onChange={(e) => updateField("closingPrayer", e.target.value)} className={inputClass} /></Field>
        </div>
      </Section>

      <Section title="Notes">
        <Field label="Notes"><textarea value={draft.notes} onChange={(e) => updateField("notes", e.target.value)} className={inputClass} rows={3} /></Field>
      </Section>

      <div className="flex gap-3 pb-10">
        <button type="submit" disabled={saving} className="bg-[#14213D] text-[#FAF8F3] rounded-sm px-6 py-3 font-medium hover:bg-[#1d2f52] transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Save Minutes"}
        </button>
        <button type="button" onClick={onCancel} className="bg-transparent text-[#5C6470] rounded-sm px-6 py-3 font-medium border border-[#D8D3C7] hover:bg-white transition-colors">Cancel</button>
      </div>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-sm border border-[#E3DECF] p-6 mb-5">
      <h3 className="font-serif text-lg text-[#14213D] mb-4 border-b border-[#E3DECF] pb-2">{title}</h3>
      {children}
    </section>
  );
}

function RepeatingSection({ title, items, onAdd, onRemove, renderItem, children }) {
  return (
    <section className="bg-white rounded-sm border border-[#E3DECF] p-6 mb-5">
      <div className="flex items-center justify-between border-b border-[#E3DECF] pb-2 mb-4">
        <h3 className="font-serif text-lg text-[#14213D]">{title}</h3>
        <button type="button" onClick={onAdd} className="text-[#B08D57] hover:text-[#8f7145] flex items-center gap-1 text-sm font-medium">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      {children}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 mb-3">
          {renderItem(item, i)}
          {items.length > 1 && (
            <button type="button" onClick={() => onRemove(i)} className="text-[#B0473C] hover:text-[#8a3830] p-2 shrink-0" aria-label="Remove">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function RecordDetail({ record, unitLabel, role, onBack, onDelete, onEdit }) {
  const canEdit = role !== "Stake Admin";
  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-[#5C6470] flex items-center gap-1 mb-6 hover:text-[#14213D] text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to index
      </button>

      <div className="bg-white rounded-sm border border-[#E3DECF] p-8 relative">
        <div className="absolute top-6 right-6 flex flex-col items-center opacity-80 rotate-6 select-none">
          <Stamp className="w-8 h-8 text-[#B08D57]" />
          <span className="font-mono text-[10px] text-[#B08D57] mt-0.5">{recordNumber(record.id)}</span>
        </div>

        <h2 className="font-serif text-2xl text-[#14213D] mb-1">Sacrament Meeting Minutes</h2>
        <p className="text-[#5C6470] mb-6 text-sm">{record.meetingDate}{unitLabel ? ` · ${unitLabel}` : ""}</p>

        <DetailRow label="Presiding" value={record.presiding} />
        <DetailRow label="Conducting" value={record.conducting} />
        <DetailRow label="Acknowledgments" value={record.acknowledgments} />
        <DetailRow label="Attendance" value={record.attendance} />

        <Divider />
        <DetailRow label="Opening Hymn" value={record.openingHymn} />
        <DetailRow label="Opening Prayer" value={record.openingPrayer} />

        {record.announcements && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2">Announcements</p><p className="text-sm text-[#232323]">{record.announcements}</p></>)}

        {record.ordinances.length > 0 && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2">Ordinances</p>
          {record.ordinances.map((o, i) => <p key={i} className="text-sm text-[#232323] mb-1">{o.type}: {o.name} — <span className="text-[#5C6470]">{o.details}</span></p>)}
        </>)}

        {record.callings.length > 0 && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2">Callings Sustained / Released</p>
          {record.callings.map((c, i) => <p key={i} className="text-sm text-[#232323] mb-1">{c.name} — {c.calling} ({c.action})</p>)}
          <div className="bg-[#EFEBE1] border border-[#D8D3C7] rounded-sm p-4 mt-3 text-sm text-[#5C6470]">
            <p className="font-mono text-xs uppercase tracking-wider text-[#5C6470] mb-2">Suggested script</p>
            <p className="mb-1.5"><strong>Sustaining:</strong> "It is proposed that we sustain [name] as [calling]. All in favor, please manifest it. Those opposed, if any, may manifest it by the same sign."</p>
            <p><strong>Releasing:</strong> "It is proposed that we release [name] as [calling], with a vote of thanks for the service rendered. All in favor, please manifest it."</p>
          </div>
        </>)}

        <Divider />
        <DetailRow label="Sacrament Hymn" value={record.sacramentHymn} />

        {record.speakersPart1.length > 0 && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Speakers</p>
          {record.speakersPart1.map((s, i) => <p key={i} className="text-sm text-[#232323] mb-1">{s.name} — <span className="text-[#5C6470]">{s.topic}</span></p>)}
        </>)}

        <Divider />
        <DetailRow label="Intermediate Hymn" value={record.intermediateHymn} />

        {record.speakersPart2.length > 0 && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Speakers (continued)</p>
          {record.speakersPart2.map((s, i) => <p key={i} className="text-sm text-[#232323] mb-1">{s.name} — <span className="text-[#5C6470]">{s.topic}</span></p>)}
        </>)}

        <Divider />
        <DetailRow label="Closing Hymn" value={record.closingHymn} />
        <DetailRow label="Closing Prayer" value={record.closingPrayer} />

        {record.notes && (<><Divider /><p className="text-xs font-mono uppercase tracking-wider text-[#5C6470] mb-2">Notes</p><p className="text-sm text-[#232323]">{record.notes}</p></>)}

        <Divider />
        <p className="text-xs text-[#5C6470]">Recorded by {record.createdBy}</p>
      </div>

      <div className="mt-4 flex gap-4">
        {canEdit && (
          <>
            <button onClick={onEdit} className="text-[#B08D57] hover:text-[#8f7145] flex items-center gap-1 text-sm font-medium">
              <FileText className="w-3.5 h-3.5" /> Edit record
            </button>
            <button onClick={() => onDelete(record.id)} className="text-[#B0473C] hover:text-[#8a3830] flex items-center gap-1 text-sm">
              <Trash2 className="w-3.5 h-3.5" /> Delete record
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteButton({ label, onConfirm }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#8a3830]">Delete?</span>
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setConfirming(false); }}
          className="text-xs bg-[#B0473C] text-white px-3 py-1.5 rounded-sm disabled:opacity-60"
        >
          Yes, delete
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs text-[#5C6470] px-2">Cancel</button>
      </div>
    );
  }
  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-[#B0473C] hover:text-[#8a3830] flex items-center gap-1">
      <Trash2 className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ManageView({ token, isAdmin, currentUserId, onBack }) {
  const [stakes, setStakes] = useState([]);
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const calls = [
        sbRest("profiles?select=*,units(name),stakes(name)&order=full_name", { token }),
      ];
      if (isAdmin) {
        calls.push(sbRest("stakes?select=*&order=name", { token }));
        calls.push(sbRest("units?select=*,stakes(name)&order=name", { token }));
      }
      const results = await Promise.all(calls);
      setProfiles(results[0]);
      if (isAdmin) {
        setStakes(results[1]);
        setUnits(results[2]);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteRow(table, id) {
    await sbRest(`${table}?id=eq.${id}`, { method: "DELETE", token });
    await load();
  }

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-[#5C6470] flex items-center gap-1 mb-6 hover:text-[#14213D] text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to index
      </button>

      <h2 className="font-serif text-2xl text-[#14213D] mb-2 flex items-center gap-2">
        <Settings className="w-5 h-5 text-[#B08D57]" /> Manage
      </h2>
      <p className="text-[#5C6470] text-sm mb-6">
        {isAdmin ? "Delete stakes, units, or user access." : "Remove user access within your stake."}
      </p>

      {loading && <Loader2 className="w-4 h-4 animate-spin text-[#5C6470]" />}

      {!loading && isAdmin && (
        <Section title="Stakes">
          {stakes.length === 0 && <p className="text-sm text-[#5C6470] italic">No stakes.</p>}
          {stakes.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">{s.name} {s.status !== "approved" && <span className="text-xs text-[#B08D57]">({s.status})</span>}</span>
              <ConfirmDeleteButton label="Delete stake" onConfirm={() => deleteRow("stakes", s.id)} />
            </div>
          ))}
        </Section>
      )}

      {!loading && isAdmin && (
        <Section title="Units">
          {units.length === 0 && <p className="text-sm text-[#5C6470] italic">No units.</p>}
          {units.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">
                {u.name} {u.abbreviation ? `(${u.abbreviation})` : ""} <span className="text-[#5C6470]">— {u.stakes?.name}</span>
                {u.status !== "approved" && <span className="text-xs text-[#B08D57]"> ({u.status})</span>}
              </span>
              <ConfirmDeleteButton label="Delete unit" onConfirm={() => deleteRow("units", u.id)} />
            </div>
          ))}
        </Section>
      )}

      {!loading && (
        <Section title="Users">
          {profiles.length === 0 && <p className="text-sm text-[#5C6470] italic">No users visible.</p>}
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">
                {p.full_name} <span className="text-[#5C6470]">— {p.role}{p.units?.name ? ` · ${p.units.name}` : ""}{p.stakes?.name ? ` · ${p.stakes.name}` : ""}</span>
              </span>
              {p.id !== currentUserId ? (
                <ConfirmDeleteButton label="Remove access" onConfirm={() => deleteRow("profiles", p.id)} />
              ) : (
                <span className="text-xs text-[#5C6470] italic">You</span>
              )}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function ApprovalsView({ token, onBack }) {
  const [pendingStakes, setPendingStakes] = useState([]);
  const [pendingUnits, setPendingUnits] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stakesRows, unitsRows, profileRows] = await Promise.all([
        sbRest("stakes?status=eq.pending&select=*&order=created_at", { token }),
        sbRest("units?status=eq.pending&select=*,stakes(name)&order=created_at", { token }),
        sbRest("profiles?status=eq.pending&select=*,units(name),stakes(name)&order=created_at", { token }),
      ]);
      setPendingStakes(stakesRows);
      setPendingUnits(unitsRows);
      setPendingProfiles(profileRows);
    } catch (e) {
      // ignore, show empty state
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(table, id, status) {
    setBusyId(`${table}-${id}`);
    try {
      await sbRest(`${table}?id=eq.${id}`, { method: "PATCH", token, body: { status } });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-[#5C6470] flex items-center gap-1 mb-6 hover:text-[#14213D] text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to index
      </button>

      <h2 className="font-serif text-2xl text-[#14213D] mb-2 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#B08D57]" /> Pending Approvals
      </h2>
      <p className="text-[#5C6470] text-sm mb-6">New stakes and units requested by users, waiting for your review.</p>

      {loading && <Loader2 className="w-4 h-4 animate-spin text-[#5C6470]" />}

      {!loading && pendingStakes.length === 0 && pendingUnits.length === 0 && pendingProfiles.length === 0 && (
        <p className="text-[#5C6470] text-sm italic">Nothing pending right now.</p>
      )}

      {pendingProfiles.length > 0 && (
        <Section title="New Users">
          {pendingProfiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">
                {p.full_name} <span className="text-[#5C6470]">— {p.role}{p.units?.name ? ` · ${p.units.name}` : ""}{p.stakes?.name ? ` · ${p.stakes.name}` : ""}</span>
              </span>
              <div className="flex gap-2">
                <button disabled={busyId === `profiles-${p.id}`} onClick={() => updateStatus("profiles", p.id, "approved")} className="text-xs bg-[#3F6B4F] text-white px-3 py-1.5 rounded-sm flex items-center gap-1 disabled:opacity-60">
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button disabled={busyId === `profiles-${p.id}`} onClick={() => updateStatus("profiles", p.id, "rejected")} className="text-xs bg-transparent border border-[#D8D3C7] text-[#5C6470] px-3 py-1.5 rounded-sm">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {pendingStakes.length > 0 && (
        <Section title="New Stakes">
          {pendingStakes.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">{s.name}</span>
              <div className="flex gap-2">
                <button disabled={busyId === `stakes-${s.id}`} onClick={() => updateStatus("stakes", s.id, "approved")} className="text-xs bg-[#3F6B4F] text-white px-3 py-1.5 rounded-sm flex items-center gap-1 disabled:opacity-60">
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button disabled={busyId === `stakes-${s.id}`} onClick={() => updateStatus("stakes", s.id, "rejected")} className="text-xs bg-transparent border border-[#D8D3C7] text-[#5C6470] px-3 py-1.5 rounded-sm">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {pendingUnits.length > 0 && (
        <Section title="New Units">
          {pendingUnits.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-[#E3DECF] last:border-0">
              <span className="text-sm text-[#232323]">{u.name} <span className="text-[#5C6470]">— {u.stakes?.name}</span></span>
              <div className="flex gap-2">
                <button disabled={busyId === `units-${u.id}`} onClick={() => updateStatus("units", u.id, "approved")} className="text-xs bg-[#3F6B4F] text-white px-3 py-1.5 rounded-sm flex items-center gap-1 disabled:opacity-60">
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button disabled={busyId === `units-${u.id}`} onClick={() => updateStatus("units", u.id, "rejected")} className="text-xs bg-transparent border border-[#D8D3C7] text-[#5C6470] px-3 py-1.5 rounded-sm">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function groupSpeakers(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.speaker_name) continue;
    const key = r.speaker_name.trim();
    if (!map.has(key)) map.set(key, { name: key, count: 0, lastDate: r.meeting_date, lastTopic: r.topic });
    const entry = map.get(key);
    entry.count += 1;
    if (r.meeting_date > entry.lastDate) {
      entry.lastDate = r.meeting_date;
      entry.lastTopic = r.topic;
    }
  }
  // Oldest "last spoken" first = most due to speak again
  return Array.from(map.values()).sort((a, b) => (a.lastDate > b.lastDate ? 1 : -1));
}

function exportSpeakersCsv(grouped) {
  const header = "Name,Times Spoken,Last Spoken,Last Topic";
  const rows = grouped.map(
    (g) => `"${g.name.replace(/"/g, '""')}",${g.count},${g.lastDate},"${(g.lastTopic || "").replace(/"/g, '""')}"`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "speaker-history.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SpeakersView({ rows, loading, onBack }) {
  const grouped = groupSpeakers(rows);
  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="text-[#5C6470] flex items-center gap-1 mb-6 hover:text-[#14213D] text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to index
      </button>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl text-[#14213D]">Speaker History</h2>
        {grouped.length > 0 && (
          <button
            onClick={() => exportSpeakersCsv(grouped)}
            className="text-[#B08D57] hover:text-[#8f7145] flex items-center gap-1 text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>
      <p className="text-[#5C6470] text-sm mb-6">
        Sorted by longest time since last spoke — a good starting point when scheduling the next speakers.
      </p>

      {loading && <Loader2 className="w-4 h-4 animate-spin text-[#5C6470]" />}

      {!loading && grouped.length === 0 && (
        <p className="text-[#5C6470] text-sm italic">No speakers recorded yet.</p>
      )}

      {!loading && grouped.length > 0 && (
        <div className="bg-white rounded-sm border border-[#E3DECF] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EFEBE1] text-left">
                <th className="px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[#5C6470]">Name</th>
                <th className="px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[#5C6470]">Times</th>
                <th className="px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[#5C6470]">Last Spoke</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, i) => (
                <tr key={g.name} className={i % 2 ? "bg-[#FAF8F3]" : ""}>
                  <td className="px-4 py-2.5 text-[#232323] border-t border-[#E3DECF]">{g.name}</td>
                  <td className="px-4 py-2.5 text-[#232323] border-t border-[#E3DECF]">{g.count}</td>
                  <td className="px-4 py-2.5 text-[#232323] border-t border-[#E3DECF]">{g.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[#E3DECF] my-5" />;
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <p className="text-sm mb-1.5">
      <span className="text-[#5C6470] font-mono text-xs uppercase tracking-wider mr-2">{label}</span>
      <span className="text-[#232323]">{value}</span>
    </p>
  );
}
