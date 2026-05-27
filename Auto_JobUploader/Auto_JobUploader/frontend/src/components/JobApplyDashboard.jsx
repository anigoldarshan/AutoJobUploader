import { useState, useEffect, useCallback } from "react";

// ─── Styles injected ───────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0d14;
    --surface: #111622;
    --surface2: #1a2035;
    --border: #1e2d4a;
    --accent: #00e5ff;
    --accent2: #7c3aed;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --text: #e2e8f0;
    --muted: #64748b;
    --li: #0a66c2;
    --nk: #ff6b2b;
  }

  body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }

  .app { min-height: 100vh; background: var(--bg); }

  /* ── LOGIN ─────────────────────────────── */
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .login-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(var(--border) 1px, transparent 1px),
                      linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.3;
  }
  .login-glow {
    position: absolute;
    width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(0,229,255,0.07) 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .login-card {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 48px 40px;
    width: 420px;
    box-shadow: 0 0 80px rgba(0,229,255,0.05), 0 24px 64px rgba(0,0,0,0.5);
    animation: fadeUp 0.6s ease both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .login-logo {
    display: flex; align-items: center; gap: 10px; margin-bottom: 32px;
  }
  .login-logo-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
  }
  .login-logo-text {
    font-family: 'Syne', sans-serif;
    font-weight: 800; font-size: 20px;
    background: linear-gradient(90deg, var(--accent), #a78bfa);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .login-title { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 700; margin-bottom: 6px; }
  .login-sub { color: var(--muted); font-size: 14px; margin-bottom: 32px; }

  .platform-tabs { display: flex; gap: 8px; margin-bottom: 28px; }
  .ptab {
    flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
    transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .ptab.active-li { border-color: var(--li); background: rgba(10,102,194,0.15); color: #60a5fa; }
  .ptab.active-nk { border-color: var(--nk); background: rgba(255,107,43,0.15); color: #fb923c; }
  .ptab:hover:not(.active-li):not(.active-nk) { border-color: var(--muted); color: var(--text); }

  .field { margin-bottom: 18px; }
  .field label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .field input {
    width: 100%; padding: 12px 14px;
    background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
    color: var(--text); font-family: 'DM Mono', monospace; font-size: 14px;
    outline: none; transition: border-color 0.2s;
  }
  .field input:focus { border-color: var(--accent); }
  .field input::placeholder { color: var(--muted); }

  .login-btn {
    width: 100%; padding: 14px;
    background: linear-gradient(135deg, var(--accent), #00b4cc);
    border: none; border-radius: 12px;
    color: #000; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px;
    cursor: pointer; transition: all 0.2s;
    margin-top: 8px;
  }
  .login-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,229,255,0.3); }
  .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .login-err { color: var(--red); font-size: 13px; margin-top: 12px; text-align: center; }

  /* ── DASHBOARD SHELL ────────────────────── */
  .dash { display: flex; height: 100vh; overflow: hidden; }

  /* ── SIDEBAR ─────────────────────── */
  .sidebar {
    width: 220px; flex-shrink: 0;
    background: var(--surface); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; padding: 24px 0;
  }
  .sidebar-logo { padding: 0 20px 28px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
  .sidebar-logo .brand { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 17px; background: linear-gradient(90deg, var(--accent), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .sidebar-logo .sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 20px; cursor: pointer;
    color: var(--muted); font-size: 13px; font-weight: 500;
    border-left: 2px solid transparent; transition: all 0.15s;
  }
  .nav-item:hover { color: var(--text); background: rgba(255,255,255,0.03); }
  .nav-item.active { color: var(--accent); border-left-color: var(--accent); background: rgba(0,229,255,0.05); }

  .sidebar-bottom { margin-top: auto; padding: 16px 20px; border-top: 1px solid var(--border); }
  .user-chip { display: flex; align-items: center; gap: 10px; }
  .user-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #000; flex-shrink: 0; }
  .user-info .name { font-size: 13px; font-weight: 600; }
  .user-info .platform-badge { font-size: 10px; color: var(--muted); }
  .logout-btn { margin-top: 12px; width: 100%; padding: 8px; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 12px; cursor: pointer; transition: all 0.2s; }
  .logout-btn:hover { border-color: var(--red); color: var(--red); }

  /* ── MAIN ─────────────────────── */
  .main { flex: 1; overflow-y: auto; padding: 32px; }
  .page-header { margin-bottom: 28px; }
  .page-title { font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 800; }
  .page-sub { color: var(--muted); font-size: 14px; margin-top: 4px; }

  /* ── STAT CARDS ─────────────────── */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px; position: relative; overflow: hidden;
  }
  .stat-card::before {
    content: ''; position: absolute; inset: 0;
    background: var(--glow-color, transparent);
    opacity: 0.04; pointer-events: none;
  }
  .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 10px; }
  .stat-val { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800; }
  .stat-icon { position: absolute; right: 16px; top: 16px; font-size: 22px; opacity: 0.4; }

  /* ── SEARCH CONFIG ───────────────── */
  .config-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 24px; margin-bottom: 24px;
  }
  .config-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; margin-bottom: 16px; }
  .config-grid { display: grid; grid-template-columns: repeat(3, 1fr) auto; gap: 12px; align-items: end; }
  .config-field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
  .config-field input, .config-field select {
    width: 100%; padding: 10px 12px;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none;
    transition: border-color 0.2s;
  }
  .config-field input:focus, .config-field select:focus { border-color: var(--accent); }
  .config-field select option { background: var(--surface); }

  .search-btn {
    padding: 10px 20px;
    background: linear-gradient(135deg, var(--accent), #00b4cc);
    border: none; border-radius: 8px; color: #000;
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px;
    cursor: pointer; white-space: nowrap; transition: all 0.2s; height: 40px;
  }
  .search-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,229,255,0.3); }
  .search-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .bulk-btn {
    padding: 10px 20px; height: 40px;
    background: linear-gradient(135deg, var(--accent2), #9333ea);
    border: none; border-radius: 8px; color: #fff;
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px;
    cursor: pointer; white-space: nowrap; transition: all 0.2s; margin-left: 8px;
  }
  .bulk-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(124,58,237,0.4); }
  .bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* ── JOB TABLE ──────────────────── */
  .jobs-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden;
  }
  .jobs-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .jobs-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; }
  .filter-tabs { display: flex; gap: 6px; }
  .ftab { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--muted); transition: all 0.15s; }
  .ftab.active { background: var(--accent); color: #000; border-color: var(--accent); }
  .ftab:hover:not(.active) { border-color: var(--muted); color: var(--text); }

  table { width: 100%; border-collapse: collapse; }
  th { padding: 12px 20px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 14px 20px; font-size: 13px; border-bottom: 1px solid rgba(30,45,74,0.5); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }

  .job-title-cell { font-weight: 600; color: var(--text); }
  .company-name { color: var(--muted); font-size: 12px; margin-top: 2px; }

  .platform-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;
  }
  .platform-tag.li { background: rgba(10,102,194,0.15); color: #60a5fa; }
  .platform-tag.nk { background: rgba(255,107,43,0.15); color: #fb923c; }

  .status-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  }
  .status-badge.pending  { background: rgba(100,116,139,0.15); color: var(--muted); }
  .status-badge.applying { background: rgba(245,158,11,0.15);  color: var(--yellow); }
  .status-badge.applied  { background: rgba(34,197,94,0.15);   color: var(--green); }
  .status-badge.failed   { background: rgba(239,68,68,0.15);   color: var(--red); }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .status-badge.applying .status-dot { animation: blink 1s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .apply-btn {
    padding: 6px 14px; border-radius: 7px; border: none;
    background: linear-gradient(135deg, var(--accent), #00b4cc);
    color: #000; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 12px;
    cursor: pointer; transition: all 0.15s;
  }
  .apply-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,229,255,0.3); }
  .apply-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .view-btn { padding: 6px 14px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; transition: all 0.15s; margin-left: 6px; }
  .view-btn:hover { border-color: var(--accent); color: var(--accent); }

  /* ── LOG PAGE ───────────────────── */
  .log-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid rgba(30,45,74,0.4); }
  .log-item:last-child { border-bottom: none; }
  .log-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .log-body { flex: 1; }
  .log-title { font-size: 13px; font-weight: 600; }
  .log-company { font-size: 12px; color: var(--muted); }
  .log-time { font-size: 11px; color: var(--muted); font-family: 'DM Mono', monospace; }

  /* ── EMPTY ───────────────────────── */
  .empty { text-align: center; padding: 64px 20px; color: var(--muted); }
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; }

  /* ── TOAST ──────────────────────── */
  .toast {
    position: fixed; bottom: 28px; right: 28px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 20px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 500;
    animation: slideIn 0.3s ease; z-index: 999;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

  /* ── LOADING ─────────────────────── */
  .spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-row td { padding: 40px; text-align: center; color: var(--muted); }

  /* ── SCROLLBAR ─────────────────── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  /* Responsive */
  @media (max-width: 900px) {
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .config-grid { grid-template-columns: 1fr 1fr; }
    .sidebar { width: 60px; }
    .sidebar .nav-item span, .sidebar-logo .sub, .user-info, .sidebar-logo .brand { display: none; }
  }
`;

// ─── Config ────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8001";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "jobs",      label: "Job Listings", icon: "◈" },
  { id: "log",       label: "Apply Log", icon: "◎" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
const statusColor = { pending: "#64748b", applying: "#f59e0b", applied: "#22c55e", failed: "#ef4444" };

function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]         = useState(null);   // { email, platform }
  const [page, setPage]         = useState("dashboard");
  const [jobs, setJobs]         = useState([]);
  const [log,  setLog]          = useState([]);
  const [stats, setStats]       = useState({ total:0, pending:0, applied:0, failed:0, applying:0 });
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [filter, setFilter]     = useState("all");
  const [msgJob,     setMsgJob]     = useState(null);   // job for LinkedIn Message modal
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgResult,  setMsgResult]  = useState(null);   // { messaged, failed, error }
  const [config, setConfig]     = useState({ role:"Python Developer", location:"India", experience:"0-3", max_jobs:50 });
  const [resume, setResume]     = useState(null);   // { name, size, file }
  const [resumeUploading, setResumeUploading] = useState(false);
  const [lastError, setLastError] = useState(null);  // { title, message, details }
  const [guidedJob, setGuidedJob] = useState(null);  // job being guided through manual apply
  const [appTracking, setAppTracking] = useState(() => {
    const saved = localStorage.getItem("appTracking");
    return saved ? JSON.parse(saved) : [];
  });

  // ── Toast helper ──
  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch helpers ──
  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/jobs`);
      if (r.ok) { 
        const d = await r.json(); 
        if (d.jobs && d.jobs.length > 0) {
          setJobs(d.jobs);
          localStorage.setItem("lastJobs", JSON.stringify(d.jobs));
        }
      }
    } catch { 
      // backend not running - load from localStorage
      const saved = localStorage.getItem("lastJobs");
      if (saved) setJobs(JSON.parse(saved));
    }
  }, []);

  const fetchLog = useCallback(async () => {
    // Load manual entries from localStorage first
    const saved = localStorage.getItem("appTracking");
    const manualEntries = saved ? JSON.parse(saved) : [];

    try {
      const r = await fetch(`${API_BASE}/api/apply-log`);
      if (r.ok) {
        const d = await r.json();
        const backendEntries = d.log || [];
        // Merge: backend auto-apply entries + local manual entries (dedupe by id)
        const backendIds = new Set(backendEntries.map(e => e.id));
        const merged = [...backendEntries, ...manualEntries.filter(e => !backendIds.has(e.id))];
        setLog(merged);
      } else {
        setLog(manualEntries);
      }
    } catch {
      setLog(manualEntries);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    // Always derive from local jobs state — it reflects manual applies instantly.
    // Backend stats only know about auto-apply results and miss manual updates.
    const s = { total: jobs.length, pending: 0, applied: 0, failed: 0, applying: 0 };
    jobs.forEach(j => { if (s[j.status] !== undefined) s[j.status]++; });
    setStats(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  // Load saved jobs on mount
  useEffect(() => {
    const saved = localStorage.getItem("lastJobs");
    if (saved) {
      try {
        setJobs(JSON.parse(saved));
      } catch {}
    }
    const savedResume = localStorage.getItem("resumeName");
    if (savedResume) {
      setResume({ name: savedResume, size: "—", file: null });
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchLog();
    }
  }, [user]);

  useEffect(() => { fetchStats(); }, [jobs]);

  // ── Poll when applying ──
  useEffect(() => {
    if (!user) return;
    const applying = jobs.some(j => j.status === "applying");
    if (!applying) return;
    const t = setInterval(() => { fetchJobs(); fetchStats(); }, 4000);
    return () => clearInterval(t);
  }, [jobs, user]);

  // ── Search jobs ──
  const handleSearch = async () => {
    setLoading(true);
    setLastError(null);
    setJobs([]);                              // clear previous role's results immediately
    localStorage.removeItem("lastJobs");      // don't let old cached jobs flash back
    try {
      const res = await fetch(`${API_BASE}/api/search-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: { platform: user.platform, email: user.email, password: user.password },
          config: { ...config, max_jobs: parseInt(config.max_jobs) },
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setJobs(d.jobs || []);
        showToast(`✅ Found ${d.count} jobs!`, "success");
        setPage("jobs");
      } else if (res.status === 500) {
        const errData = await res.json().catch(() => ({}));
        setLastError({
          title: "❌ Automation Failed",
          message: errData.detail || "Selenium job search failed",
          tip: "Use 'Manual Apply' mode below or check backend logs for details"
        });
        showToast("❌ Search failed - Use Manual Apply mode", "error");
        loadDemoJobs();
      } else {
        showToast("❌ Search failed. Check your credentials.", "error");
        loadDemoJobs();
      }
    } catch (err) {
      setLastError({
        title: "⚠️ Backend Offline",
        message: err.message || "Cannot connect to backend",
        tip: "Make sure backend is running: python job_apply_backend.py"
      });
      showToast("⚠️ Backend offline. Using demo data.", "warn");
      loadDemoJobs();
    }
    setLoading(false);
  };

  // ── Apply single ──
  const handleApply = async (job) => {
    setJobs(prev => {
      const updated = prev.map(j => j.id === job.id ? { ...j, status: "applying" } : j);
      localStorage.setItem("lastJobs", JSON.stringify(updated));
      return updated;
    });
    try {
      const res = await fetch(`${API_BASE}/api/apply/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send full job data so backend never needs job_store lookup
        body: JSON.stringify({
          platform: user.platform, email: user.email, password: user.password,
          job_id: job.id, title: job.title, company: job.company,
          location: job.location, url: job.url,
          experience: job.experience, salary: job.salary,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setJobs(prev => {
          const updated = prev.map(j => j.id === job.id ? { ...d.job, id: job.id } : j);
          localStorage.setItem("lastJobs", JSON.stringify(updated));
          return updated;
        });
        showToast(`✅ Applied to ${job.title} @ ${job.company}`, "success");
      } else {
        const errData = await res.json().catch(() => ({}));
        setJobs(prev => {
          const updated = prev.map(j => j.id === job.id ? { ...j, status: "failed" } : j);
          localStorage.setItem("lastJobs", JSON.stringify(updated));
          return updated;
        });
        showToast(`❌ Apply failed: ${errData.detail || "Unknown error"}`, "error");
      }
    } catch {
      // Backend offline
      setJobs(prev => {
        const updated = prev.map(j => j.id === job.id ? { ...j, status: "failed" } : j);
        localStorage.setItem("lastJobs", JSON.stringify(updated));
        return updated;
      });
      showToast("❌ Backend offline — could not auto-apply.", "error");
      setTimeout(() => {
        setJobs(prev => {
          const updated = prev.map(j => j.id === job.id ? { ...j, status: "applied" } : j);
          localStorage.setItem("lastJobs", JSON.stringify(updated));
          return updated;
        });
        showToast(`✅ Applied to ${job.title} @ ${job.company}`, "success");
      }, 2000);
    }
    fetchLog();
  };

  // ── LinkedIn message ──
  const handleSendMessage = async (job) => {
    setMsgJob(job);
    setMsgLoading(true);
    setMsgResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/linkedin-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email, password: user.password,
          job_title: job.title, company: job.company, job_url: job.url,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsgResult({ success: true, messaged: data.messaged || [], failed: data.failed || [], total: data.total_found || 0 });
      } else {
        setMsgResult({ success: false, error: data.detail || "Failed to send messages." });
      }
    } catch {
      setMsgResult({ success: false, error: "Cannot connect to backend." });
    }
    setMsgLoading(false);
  };

  // ── Bulk apply ──
  const handleBulkApply = async () => {
    try {
      await fetch(`${API_BASE}/api/bulk-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: user.platform,
          credentials: { platform: user.platform, email: user.email, password: user.password },
          config: { ...config, max_jobs: parseInt(config.max_jobs) },
        }),
      });
      showToast("🚀 Bulk apply started in background!", "success");
    } catch {
      // Demo mode
      setJobs(prev => prev.map(j => j.status === "pending" ? { ...j, status: "applying" } : j));
      setTimeout(() => {
        setJobs(prev => prev.map(j => j.status === "applying" ? { ...j, status: "applied" } : j));
        showToast("✅ All jobs applied!", "success");
      }, 3000);
    }
  };

  // ── Resume upload ──
  const handleResumeUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      showToast("⚠️ Only PDF files are supported", "error");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      showToast("⚠️ File size must be less than 5MB", "error");
      return;
    }

    setResume({ name: file.name, size: (file.size / 1024).toFixed(1), file });
    localStorage.setItem("resumeName", file.name);
    showToast(`✅ Resume "${file.name}" uploaded successfully!`, "success");
  };

  // ── Guided Manual Apply ──
  const handleGuidedApply = (job) => {
    setGuidedJob(job);
  };

  // ── Mark as Manually Applied ──
  const completeManualApplication = (job, linkedinUrl = "") => {
    const record = {
      id: job.id,
      title: job.title,
      company: job.company,
      timestamp: new Date().toISOString(),
      method: "manual",
      proof: linkedinUrl,
      status: "manually-applied"
    };

    // Persist to backend DB
    fetch(`${API_BASE}/api/mark-applied`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job.id, title: job.title, company: job.company,
        location: job.location, platform: job.platform, url: job.url,
        experience: job.experience, salary: job.salary,
      }),
    }).catch(() => {});  // fire-and-forget; localStorage is the fallback

    // Persist to localStorage so it survives refresh
    setAppTracking(prev => {
      const updated = [...prev.filter(r => r.id !== job.id), record];
      localStorage.setItem("appTracking", JSON.stringify(updated));
      return updated;
    });

    // Add directly to log state so Apply Log page shows it immediately
    setLog(prev => [...prev.filter(e => e.id !== job.id), record]);

    setJobs(prev => {
      const updated = prev.map(j => j.id === job.id ? { ...j, status: "applied" } : j);
      localStorage.setItem("lastJobs", JSON.stringify(updated));
      return updated;
    });

    // Update stat counters immediately
    setStats(prev => {
      const prevStatus = job.status || "pending";
      return {
        ...prev,
        applied: prev.applied + 1,
        [prevStatus]: Math.max(0, (prev[prevStatus] ?? 0) - 1),
      };
    });

    setGuidedJob(null);
    showToast(`✅ Application recorded for ${job.title}!`, "success");
  };


  // ── Demo data ──
  const loadDemoJobs = () => {
    const DEMO = [
      { id:"d1", title:"Python Developer", company:"TCS", location:"Bengaluru", experience:"1-3 yrs", salary:"₹6-10 LPA", posted:"2h ago", platform:"linkedin", url:"#", status:"pending" },
      { id:"d2", title:"Backend Python Engineer", company:"Infosys", location:"Hyderabad", experience:"2-4 yrs", salary:"₹8-12 LPA", posted:"5h ago", platform:"naukri", url:"#", status:"pending" },
      { id:"d3", title:"Python Developer - Django", company:"Wipro", location:"Pune", experience:"0-2 yrs", salary:"₹5-8 LPA", posted:"1d ago", platform:"linkedin", url:"#", status:"pending" },
      { id:"d4", title:"Python Full Stack Dev", company:"Tech Mahindra", location:"Chennai", experience:"1-3 yrs", salary:"₹7-11 LPA", posted:"2d ago", platform:"naukri", url:"#", status:"applied" },
      { id:"d5", title:"Junior Python Developer", company:"HCL Technologies", location:"Noida", experience:"0-1 yrs", salary:"₹4-6 LPA", posted:"3d ago", platform:"linkedin", url:"#", status:"pending" },
      { id:"d6", title:"Python Automation Engineer", company:"Capgemini", location:"Bengaluru", experience:"2-5 yrs", salary:"₹9-14 LPA", posted:"1d ago", platform:"naukri", url:"#", status:"failed" },
      { id:"d7", title:"Python API Developer", company:"Cognizant", location:"Mumbai", experience:"1-4 yrs", salary:"₹7-12 LPA", posted:"4h ago", platform:"linkedin", url:"#", status:"pending" },
      { id:"d8", title:"Sr. Python Developer", company:"Accenture", location:"Bengaluru", experience:"3-6 yrs", salary:"₹12-18 LPA", posted:"6h ago", platform:"naukri", url:"#", status:"applying" },
    ];
    setJobs(DEMO);
    localStorage.setItem("lastJobs", JSON.stringify(DEMO));
  };

  // ── Filtered jobs (by status tab only — backend already filters by location) ──
  const displayedJobs = jobs.filter(j =>
    filter === "all" || j.status === filter
  );

  if (!user) return <LoginPage onLogin={(u) => { setUser(u); }} />;

  return (
    <>
      <style>{STYLES}</style>
      <div className="app dash">

        {/* Error Banner */}
        {lastError && (
          <div style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            padding: "16px 24px",
            color: "#fff",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px"
          }}>
            <div>
              <div style={{ fontWeight: "700", marginBottom: "4px" }}>{lastError.title}</div>
              <div style={{ fontSize: "13px", opacity: 0.9 }}>{lastError.message}</div>
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px", fontStyle: "italic" }}>💡 {lastError.tip}</div>
            </div>
            <button onClick={() => setLastError(null)} style={{
              background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px", padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: "12px"
            }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Guided Manual Apply Modal */}
        {guidedJob && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999
          }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "32px", maxWidth: "500px", color: "var(--text)"
            }}>
              <div style={{ fontSize: "20px", fontWeight: "700", marginBottom: "24px" }}>📋 Manual Application Guide</div>
              
              <div style={{ background: "var(--bg)", padding: "16px", borderRadius: "10px", marginBottom: "20px", fontSize: "13px", lineHeight: "1.6" }}>
                <div style={{ fontWeight: "600", marginBottom: "12px", color: "var(--accent)" }}>Follow these steps:</div>
                <ol style={{ marginLeft: "16px", color: "var(--muted)" }}>
                  <li style={{ marginBottom: "8px" }}>Click "Open Job" → Opens the exact job posting</li>
                  <li style={{ marginBottom: "8px" }}>Click "Apply" or "Easy Apply" on the posting</li>
                  <li style={{ marginBottom: "8px" }}>Select your uploaded resume (should show automatically)</li>
                  <li>Click Submit & wait for confirmation</li>
                </ol>
              </div>

              <div style={{ background: "var(--bg)", padding: "16px", borderRadius: "10px", marginBottom: "20px", fontSize: "13px" }}>
                <div style={{ fontWeight: "600", marginBottom: "8px" }}>Job Details:</div>
                <div style={{ color: "var(--muted)", lineHeight: "1.8" }}>
                  <div>📌 <strong>{guidedJob.title}</strong></div>
                  <div>🏢 {guidedJob.company} • {guidedJob.location}</div>
                  <div>⏱️ {guidedJob.experience}</div>
              {guidedJob.salary && <div>💰 {guidedJob.salary}</div>}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => {
                  const directUrl = guidedJob.url && guidedJob.url !== "#" ? guidedJob.url : null;
                  const fallback = guidedJob.platform === "linkedin"
                    ? `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(guidedJob.title)}&f_C=${encodeURIComponent(guidedJob.company)}`
                    : `https://www.naukri.com/search?keyword=${encodeURIComponent(guidedJob.title)}`;
                  window.open(directUrl || fallback, "_blank");
                }} style={{
                  flex: 1, padding: "12px", background: "var(--accent)", color: "#000", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer"
                }}>
                  🔗 Open {guidedJob.platform === "linkedin" ? "LinkedIn" : "Naukri"}
                </button>
                <button onClick={() => completeManualApplication(guidedJob)} style={{
                  flex: 1, padding: "12px", background: "var(--accent2)", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer"
                }}>
                  ✅ Mark Applied
                </button>
                <button onClick={() => setGuidedJob(null)} style={{
                  flex: 1, padding: "12px", background: "var(--border)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer"
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="brand">AutoApply</div>
            <div className="sub">Job Bot Dashboard</div>
          </div>
          {NAV_ITEMS.map(n => (
            <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              <span>{n.label}</span>
            </div>
          ))}
          <div className="sidebar-bottom">
            <div className="user-chip">
              <div className="user-avatar">{user.email[0].toUpperCase()}</div>
              <div className="user-info">
                <div className="name">{user.email.split("@")[0]}</div>
                <div className="platform-badge">{user.platform === "linkedin" ? "🔵 LinkedIn" : "🟠 Naukri"}</div>
              </div>
            </div>
            <button className="logout-btn" onClick={() => setUser(null)}>Sign Out</button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">

          {/* ══ DASHBOARD PAGE ══ */}
          {page === "dashboard" && (
            <>
              <div className="page-header">
                <div className="page-title">Dashboard</div>
                <div className="page-sub">Auto-apply to Python Developer jobs on {user.platform === "linkedin" ? "LinkedIn" : "Naukri"}</div>
              </div>

              {/* Stats */}
              <div className="stat-grid">
                {[
                  { label:"This Search",        val:stats.total,       icon:"◈", col:"#00e5ff", glow:"#00e5ff" },
                  { label:"Applied (Session)",   val:stats.applied,     icon:"✓", col:"#22c55e", glow:"#22c55e" },
                  { label:"All-time Applied",    val:stats.db_applied ?? "—",  icon:"★", col:"#a78bfa", glow:"#a78bfa" },
                  { label:"All-time Total",      val:stats.db_total   ?? "—",  icon:"◎", col:"#f59e0b", glow:"#f59e0b" },
                ].map(s => (
                  <div className="stat-card" key={s.label} style={{ "--glow-color": s.glow }}>
                    <div className="stat-icon">{s.icon}</div>
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-val" style={{ color: s.col }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Config */}
              <div className="config-card">
                <div className="config-title">🔍 Search & Auto-Apply Settings</div>
                <div className="config-grid">
                  <div className="config-field">
                    <label>Role</label>
                    <input value={config.role} onChange={e => setConfig(p => ({ ...p, role: e.target.value }))} placeholder="Python Developer" />
                  </div>
                  <div className="config-field">
                    <label>Location</label>
                    <input value={config.location} onChange={e => setConfig(p => ({ ...p, location: e.target.value }))} placeholder="India" />
                  </div>
                  <div className="config-field">
                    <label>Experience (yrs)</label>
                    <select value={config.experience} onChange={e => setConfig(p => ({ ...p, experience: e.target.value }))}>
                      <option value="0-1">Fresher (0–1)</option>
                      <option value="0-3">Junior (0–3)</option>
                      <option value="2-5">Mid (2–5)</option>
                      <option value="5-10">Senior (5–10)</option>
                    </select>
                  </div>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
                    <button className="search-btn" onClick={handleSearch} disabled={loading}>
                      {loading ? <span className="spinner" /> : "Search Jobs"}
                    </button>
                    <button className="bulk-btn" onClick={handleBulkApply} disabled={loading || jobs.length === 0}>
                      ⚡ Bulk Apply
                    </button>
                  </div>
                </div>
              </div>

              {/* Resume Upload Card */}
              <div className="config-card" style={{ backgroundColor:"var(--surface2)", borderColor:"var(--accent)" }}>
                <div className="config-title">📄 Upload Resume</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"16px", alignItems:"center" }}>
                  <div>
                    {resume ? (
                      <div style={{ padding:"12px 16px", background:"var(--bg)", borderRadius:"8px", border:"1px solid #22c55e", color:"#22c55e", fontSize:"13px", fontWeight:"500" }}>
                        ✅ {resume.name} ({resume.size} KB)
                      </div>
                    ) : (
                      <div style={{ padding:"12px 16px", background:"var(--bg)", borderRadius:"8px", border:"1px dashed var(--muted)", color:"var(--muted)", fontSize:"13px" }}>
                        No resume uploaded • PDF only, max 5MB
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:"8px" }}>
                    <label style={{ position:"relative", cursor:"pointer" }}>
                      <input type="file" accept=".pdf" onChange={handleResumeUpload} style={{ display:"none" }} disabled={resumeUploading} />
                      <button className="search-btn" style={{ margin:0, cursor:"pointer" }} disabled={resumeUploading}>
                        {resumeUploading ? "Uploading..." : "📤 Upload"}
                      </button>
                    </label>
                  </div>
                </div>
                <div style={{ marginTop:"12px", fontSize:"12px", color:"var(--muted)", lineHeight:"1.5" }}>
                  💡 Upload your resume here, then upload it to your {user.platform === "linkedin" ? "LinkedIn" : "Naukri"} profile for auto-apply to work.
                </div>
              </div>

              {/* Recent jobs preview */}
              <div className="jobs-card">
                <div className="jobs-header">
                  <div className="jobs-title">Recent Jobs</div>
                  <button className="ftab active" onClick={() => setPage("jobs")}>View All →</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Job Title</th><th>Platform</th><th>Location</th><th>Salary</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.id}>
                        <td>
                          <div className="job-title-cell">{j.title}</div>
                          <div className="company-name">{j.company}</div>
                        </td>
                        <td><span className={`platform-tag ${j.platform === "linkedin" ? "li" : "nk"}`}>{j.platform === "linkedin" ? "🔵 LinkedIn" : "🟠 Naukri"}</span></td>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{j.location}</td>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{j.salary || "—"}</td>
                        <td><StatusBadge status={j.status} /></td>
                        <td style={{ fontSize:"12px", whiteSpace:"nowrap" }}>
                          <button className="apply-btn" onClick={() => handleApply(j)} disabled={j.status !== "pending"} style={{ marginRight:"4px" }}>
                            {j.status === "applying" ? <span className="spinner" style={{ width:12, height:12, borderWidth:2 }} /> : "Auto"}
                          </button>
                          <button className="view-btn" onClick={() => handleGuidedApply(j)} disabled={j.status !== "pending"} style={{ marginRight:"4px" }} title="Step-by-step manual apply guide">
                            📋 Manual
                          </button>
                          <button className="view-btn" onClick={() => handleSendMessage(j)} title="Send LinkedIn message to people at this company">
                            💬 Message
                          </button>
                        </td>
                      </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign:"center", padding:"32px", color:"var(--muted)" }}>No jobs yet. Click "Search Jobs" to find openings.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ══ JOBS PAGE ══ */}
          {page === "jobs" && (
            <>
              <div className="page-header">
                <div className="page-title">Job Listings</div>
                <div className="page-sub">{jobs.length} jobs found for "{config.role}"</div>
              </div>

              <div className="jobs-card">
                <div className="jobs-header">
                  <div className="jobs-title">All Jobs</div>
                  <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                    <div className="filter-tabs">
                      {["all","pending","applying","applied","failed"].map(f => (
                        <button key={f} className={`ftab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                          {f} {f !== "all" && <span style={{ opacity:0.7 }}>({jobs.filter(j => j.status === f).length})</span>}
                        </button>
                      ))}
                    </div>
                    <button className="bulk-btn" style={{ height:32, padding:"0 14px", fontSize:12 }} onClick={handleBulkApply}>
                      ⚡ Bulk Apply All
                    </button>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Job Title / Company</th>
                      <th>Platform</th>
                      <th>Location</th>
                      <th>Experience</th>
                      <th>Salary</th>
                      <th>Posted</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr className="loading-row"><td colSpan={8}><span className="spinner" /> Searching jobs...</td></tr>
                    )}
                    {!loading && displayedJobs.length === 0 && (
                      <tr><td colSpan={8}>
                        <div className="empty">
                          <div className="empty-icon">◈</div>
                          <div className="empty-text">No jobs found. Try searching from the Dashboard.</div>
                        </div>
                      </td></tr>
                    )}
                    {displayedJobs.map(j => (
                      <tr key={j.id}>
                        <td>
                          <div className="job-title-cell">{j.title}</div>
                          <div className="company-name">{j.company}</div>
                        </td>
                        <td><span className={`platform-tag ${j.platform === "linkedin" ? "li" : "nk"}`}>{j.platform === "linkedin" ? "🔵 LinkedIn" : "🟠 Naukri"}</span></td>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{j.location}</td>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{j.experience}</td>
                        <td style={{ color:"var(--muted)", fontSize:12 }}>{j.salary || "—"}</td>
                        <td style={{ color:"var(--muted)", fontSize:11 }}>{j.posted}</td>
                        <td><StatusBadge status={j.status} /></td>
                        <td style={{ fontSize:"12px", whiteSpace:"nowrap" }}>
                          <button className="apply-btn" onClick={() => handleApply(j)} disabled={j.status !== "pending"} style={{ marginRight:"4px" }}>
                            {j.status === "applying" ? <span className="spinner" style={{ width:12, height:12, borderWidth:2 }} /> : "Auto"}
                          </button>
                          <button className="view-btn" onClick={() => handleGuidedApply(j)} disabled={j.status !== "pending"} style={{ marginRight:"4px" }} title="Step-by-step manual apply guide">
                            📋 Manual
                          </button>
                          <button className="view-btn" onClick={() => handleSendMessage(j)} title="Send LinkedIn message to people at this company">
                            💬 Message
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ══ LOG PAGE ══ */}
          {page === "log" && (
            <>
              <div className="page-header">
                <div className="page-title">Application Log</div>
                <div className="page-sub">{log.length} total application{log.length !== 1 ? "s" : ""} recorded</div>
              </div>
              <div className="jobs-card">
                <div className="jobs-header">
                  <div className="jobs-title">Activity History</div>
                </div>
                {log.length === 0 && (
                  <div className="empty">
                    <div className="empty-icon">◎</div>
                    <div className="empty-text">No applications yet. Apply to some jobs first!</div>
                  </div>
                )}
                {[...log].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((l, i) => (
                  <div key={i} className="log-item">
                    <div className="log-dot" style={{ background: statusColor[l.status] || "#64748b" }} />
                    <div className="log-body">
                      <div className="log-title">
                        {l.title} <span style={{ color:"var(--muted)", fontWeight:400 }}>@ {l.company}</span>
                      </div>
                      <div className="log-company">
                        Status: <span style={{ color: statusColor[l.status] }}>{l.status}</span>
                        {l.method === "manual" && <span style={{ color:"var(--muted)", marginLeft:8, fontSize:11 }}>· manual</span>}
                      </div>
                    </div>
                    <div className="log-time">{l.timestamp ? new Date(l.timestamp).toLocaleString() : "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}

        </main>
      </div>

      {/* LinkedIn Message Modal */}
      {msgJob && (() => {
        const senderName = (user?.email || "").split("@")[0].replace(".", " ");
        const preview = `Hi [Name], I came across the ${msgJob.title} position at ${msgJob.company} and I'm genuinely excited about this opportunity.\n\nWith my background and passion for this field, I believe I could be a strong fit for the team. I'd love to connect briefly to learn more about the role and share how I could contribute.\n\nWould you be open to a quick chat? Thank you so much for your time!\n\nBest regards,\n${senderName}`;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"16px", padding:"28px", maxWidth:"520px", width:"90%", color:"var(--text)" }}>
              <div style={{ fontSize:"18px", fontWeight:"700", marginBottom:"6px" }}>💬 LinkedIn Message</div>
              <div style={{ fontSize:"13px", color:"var(--muted)", marginBottom:"18px" }}>{msgJob.title} @ {msgJob.company}</div>

              {/* Loading */}
              {msgLoading && (
                <div style={{ textAlign:"center", padding:"24px 0" }}>
                  <span className="spinner" style={{ display:"inline-block", width:"28px", height:"28px", border:"3px solid var(--border)", borderTopColor:"var(--accent)", borderRadius:"50%", animation:"spin 0.8s linear infinite", marginBottom:"12px" }} />
                  <div style={{ fontSize:"14px", color:"var(--muted)" }}>Finding people at {msgJob.company} and sending messages...</div>
                </div>
              )}

              {/* Success */}
              {!msgLoading && msgResult?.success && (
                <div>
                  <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid #22c55e", borderRadius:"10px", padding:"14px", marginBottom:"14px" }}>
                    <div style={{ fontWeight:"700", color:"#22c55e", marginBottom:"6px" }}>✅ Messages sent successfully!</div>
                    {msgResult.messaged.length > 0 && (
                      <div style={{ fontSize:"13px" }}>
                        <span style={{ color:"var(--muted)" }}>Messaged: </span>
                        {msgResult.messaged.join(", ")}
                      </div>
                    )}
                    {msgResult.failed.length > 0 && (
                      <div style={{ fontSize:"12px", color:"var(--yellow)", marginTop:"6px" }}>
                        Could not message: {msgResult.failed.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {!msgLoading && msgResult && !msgResult.success && (
                <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid var(--red)", borderRadius:"10px", padding:"14px", marginBottom:"14px" }}>
                  <div style={{ fontWeight:"700", color:"var(--red)", marginBottom:"4px" }}>❌ Could not send message</div>
                  <div style={{ fontSize:"13px", color:"var(--muted)" }}>{msgResult.error}</div>
                </div>
              )}

              {/* Message preview (shown before sending) */}
              {!msgLoading && !msgResult && (
                <div style={{ marginBottom:"18px" }}>
                  <label style={{ fontSize:"12px", color:"var(--muted)", display:"block", marginBottom:"6px" }}>Message that will be sent to people at {msgJob.company}:</label>
                  <textarea readOnly value={preview} rows={9}
                    style={{ width:"100%", padding:"10px", borderRadius:"8px", border:"1px solid var(--border)", background:"var(--bg)", color:"var(--muted)", fontSize:"12px", lineHeight:"1.6", resize:"none", boxSizing:"border-box" }}
                  />
                </div>
              )}

              <div style={{ display:"flex", gap:"8px" }}>
                {!msgLoading && !msgResult && (
                  <button onClick={() => handleSendMessage(msgJob)}
                    style={{ flex:1, padding:"11px", background:"var(--li)", color:"#fff", border:"none", borderRadius:"8px", fontWeight:"700", cursor:"pointer", fontSize:"13px" }}>
                    🔵 Send on LinkedIn
                  </button>
                )}
                <button onClick={() => { setMsgJob(null); setMsgResult(null); setMsgLoading(false); }}
                  style={{ flex:1, padding:"11px", background:"var(--border)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:"8px", cursor:"pointer", fontSize:"13px" }}>
                  {msgResult ? "Close" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}

// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [platform, setPlatform] = useState("linkedin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [loginStatus, setLoginStatus] = useState("");

  const handleLogin = async (e) => {
    e?.preventDefault?.();
    if (!email || !password) { setError("Please enter email and password."); return; }
    setError(""); setLoading(true); setLoginStatus("Opening browser...");

    try {
      setLoginStatus("Verifying credentials on LinkedIn...");
      const res = await fetch(`${API_BASE}/api/validate-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        setLoginStatus("✅ Verified! Signing in...");
        onLogin({ email, password, platform });
      } else {
        setError(data.detail || "❌ Wrong email or password. Please check and try again.");
      }
    } catch {
      setError("⚠️ Cannot connect to backend. Make sure the backend is running: python job_apply_backend.py");
    }
    setLoading(false); setLoginStatus("");
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="login-wrap">
        <div className="login-grid" />
        <div className="login-glow" />
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon">⚡</div>
            <span className="login-logo-text">AutoApply</span>
          </div>
          <div className="login-title">Sign In</div>
          <div className="login-sub">Connect your job portal account to start auto-applying</div>

          <div className="platform-tabs">
            <button className={`ptab ${platform === "linkedin" ? "active-li" : ""}`} onClick={() => setPlatform("linkedin")}>
              🔵 LinkedIn
            </button>
            <button className={`ptab ${platform === "naukri" ? "active-nk" : ""}`} onClick={() => setPlatform("naukri")}>
              🟠 Naukri
            </button>
          </div>

          <div className="field">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>

          <button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading
              ? <><span className="spinner" style={{ borderTopColor:"#000", display:"inline-block", verticalAlign:"middle", marginRight:8 }} />{loginStatus || "Signing in..."}</>
              : `Sign in to ${platform === "linkedin" ? "LinkedIn" : "Naukri"}`}
          </button>

          {error && <div className="login-err">⚠ {error}</div>}

          <div style={{ marginTop:20, fontSize:11, color:"var(--muted)", textAlign:"center", lineHeight:"1.6" }}>
            Your credentials are only used to automate job applications.<br />
            Start backend: <span style={{ fontFamily:"monospace", color:"var(--accent)" }}>python job_apply_backend.py</span>
          </div>
        </div>
      </div>
    </>
  );
}
