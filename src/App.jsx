import { useState, useCallback, useEffect } from "react";

// ─── Supabase Config ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://mxbzpunefucxknodoqrc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnpwdW5lZnVjeGtub2RvcXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDY1MjgsImV4cCI6MjA5NzAyMjUyOH0.JuaXxAaAAxfDBQom0DDJdlBNJlsRlkdgsKw87pcch7I";

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

// ─── Supabase REST helpers ────────────────────────────────────────────────────
const db = {
  async select(table) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc`, { headers });
    if (!r.ok) throw new Error(`select ${table}: ${await r.text()}`);
    return r.json();
  },
  async insert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers, body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`insert ${table}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  },
  async update(table, id, patch) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH", headers, body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`update ${table}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  },
  async delete(table, id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers,
    });
    if (!r.ok) throw new Error(`delete ${table}: ${await r.text()}`);
  },
  async rpc(fn, params = {}) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", headers, body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error(`rpc ${fn}: ${await r.text()}`);
    return r.json();
  },
};

// ─── Auto-create tables via SQL ───────────────────────────────────────────────
const SETUP_SQL = `
create table if not exists fitos_clients (
  id text primary key,
  name text not null,
  email text,
  phone text,
  dob text,
  tag text default 'General',
  status text default 'active',
  notes text,
  session_count integer default 0,
  program_id text,
  created_at timestamptz default now()
);
create table if not exists fitos_sessions (
  id text primary key,
  client_id text,
  name text,
  notes text,
  exercises jsonb default '[]',
  program_day text,
  started_at timestamptz default now(),
  created_at timestamptz default now()
);
create table if not exists fitos_classes (
  id text primary key,
  name text not null,
  date text,
  time text,
  duration integer default 45,
  capacity integer default 12,
  location text,
  notes text,
  status text default 'scheduled',
  bookings jsonb default '[]',
  format_id text,
  format_name text,
  created_at timestamptz default now()
);
create table if not exists fitos_programs (
  id text primary key,
  name text not null,
  description text,
  weeks integer default 4,
  days_per_week integer default 3,
  days jsonb default '[]',
  assigned_clients jsonb default '[]',
  created_at timestamptz default now()
);
create table if not exists fitos_formats (
  id text primary key,
  name text not null,
  type text default 'circuit',
  description text,
  total_duration integer default 45,
  work_sec integer default 40,
  rest_sec integer default 20,
  rounds integer default 3,
  stations jsonb default '[]',
  created_at timestamptz default now()
);
`;

async function setupTables() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST", headers, body: JSON.stringify({ sql: SETUP_SQL }),
    });
  } catch (_) {}
  // Fallback: try selecting each table; if it errors the table doesn't exist yet
  // Tables are created via Supabase dashboard SQL editor as a one-time step
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg:"#0B0D11", surface:"#13161D", s2:"#1A1E28", s3:"#222738",
  border:"#2A2F42", border2:"#353B52",
  green:"#22D98A", blue:"#4B8EF8", purple:"#9B72F5",
  amber:"#F5A524", red:"#F5445A", teal:"#22C4D9",
  text:"#EDF0FA", sub:"#8A92B2", muted:"#4E566E",
};
const TAG_COLORS = {
  Strength:C.blue,"Fat Loss":C.green,Mobility:C.purple,
  Endurance:C.amber,Rehab:C.red,Hypertrophy:C.blue,General:C.sub,
};
const EXERCISES = [
  "Back Squat","Front Squat","Deadlift","Romanian Deadlift","Sumo Deadlift",
  "Bench Press","Incline DB Press","Decline Press","Overhead Press","Push Press",
  "Pull-up","Chin-up","Barbell Row","Cable Row","Lat Pulldown",
  "Leg Press","Leg Curl","Leg Extension","Hip Thrust","Glute Bridge",
  "Goblet Squat","Split Squat","Lunge","Step-up","Box Jump",
  "Dumbbell Curl","Hammer Curl","Tricep Pushdown","Skull Crusher","Dip",
  "Lateral Raise","Face Pull","Band Pull-apart","Cable Fly","Pec Deck",
  "KB Swing","KB Clean","KB Snatch","Battle Ropes","Sled Push",
  "Plank","Dead Bug","Pallof Press","Ab Wheel","Hanging Leg Raise",
  "Burpee","Mountain Climber","Jump Squat","High Knees","Jumping Jack",
  "Bike Sprint","Row Sprint","Ski Erg","Assault Bike","Treadmill Sprint",
];

// ─── Utils ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,10);
const now = () => new Date().toISOString();
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—";
const fmtTime = d => d ? new Date(d).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}) : "—";
const clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));

// Map DB row (snake_case) → app object (camelCase)
const mapClient = r => r ? ({
  id:r.id, name:r.name, email:r.email||"", phone:r.phone||"", dob:r.dob||"",
  tag:r.tag||"General", status:r.status||"active", notes:r.notes||"",
  sessionCount:r.session_count||0, programId:r.program_id||null, createdAt:r.created_at,
}) : null;
const mapSession = r => r ? ({
  id:r.id, clientId:r.client_id, name:r.name||"", notes:r.notes||"",
  exercises:r.exercises||[], programDay:r.program_day||"", startedAt:r.started_at||r.created_at,
}) : null;
const mapClass = r => r ? ({
  id:r.id, name:r.name, date:r.date||"", time:r.time||"", duration:r.duration||45,
  capacity:r.capacity||12, location:r.location||"", notes:r.notes||"",
  status:r.status||"scheduled", bookings:r.bookings||[],
  formatId:r.format_id||null, formatName:r.format_name||null, createdAt:r.created_at,
}) : null;
const mapProgram = r => r ? ({
  id:r.id, name:r.name, description:r.description||"", weeks:r.weeks||4,
  daysPerWeek:r.days_per_week||3, days:r.days||[], assignedClients:r.assigned_clients||[],
  createdAt:r.created_at,
}) : null;
const mapFormat = r => r ? ({
  id:r.id, name:r.name, type:r.type||"circuit", description:r.description||"",
  totalDuration:r.total_duration||45, workSec:r.work_sec||40, restSec:r.rest_sec||20,
  rounds:r.rounds||3, stations:r.stations||[], createdAt:r.created_at,
}) : null;

function useToast(){
  const [ts,setTs]=useState([]);
  const toast=(msg,type="success")=>{ const id=uid(); setTs(p=>[...p,{id,msg,type}]); setTimeout(()=>setTs(p=>p.filter(t=>t.id!==id)),2800); };
  return [ts,toast];
}

// ─── Micro UI ─────────────────────────────────────────────────────────────────
const Avatar=({name="?",size=34,color=C.green})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:color+"22",border:`1.5px solid ${color}44`,display:"flex",alignItems:"center",justifyContent:"center",color,fontWeight:800,fontSize:size*0.38,flexShrink:0}}>{(name||"?").charAt(0).toUpperCase()}</div>
);
const Pill=({children,color=C.green})=>(
  <span style={{display:"inline-flex",alignItems:"center",fontSize:10,fontWeight:700,letterSpacing:"0.04em",padding:"2px 7px",borderRadius:20,background:color+"1A",color,border:`1px solid ${color}30`}}>{children}</span>
);
const Btn=({children,onClick,variant="primary",color=C.green,disabled,style:sx={}})=>{
  const s={primary:{background:disabled?C.muted:color,color:"#000",border:"none"},ghost:{background:color+"15",color,border:`1px solid ${color}30`},outline:{background:"transparent",color:C.sub,border:`1px solid ${C.border}`},danger:{background:C.red+"18",color:C.red,border:`1px solid ${C.red}40`}};
  return <button disabled={disabled} onClick={onClick} style={{...s[variant],borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontSize:12,padding:"8px 14px",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5,opacity:disabled?0.5:1,...sx}}>{children}</button>;
};
const Input=({label,value,onChange,placeholder,type="text",required,min,max})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{color:C.sub,fontSize:12,fontWeight:600}}>{label}{required&&<span style={{color:C.red}}> *</span>}</label>}
    <input type={type} value={value||""} min={min} max={max} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{background:C.s2,border:`1px solid ${C.border2}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%"}}/>
  </div>
);
const Select=({label,value,onChange,options,required})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{color:C.sub,fontSize:12,fontWeight:600}}>{label}{required&&<span style={{color:C.red}}> *</span>}</label>}
    <select value={value||""} onChange={e=>onChange(e.target.value)} style={{background:C.s2,border:`1px solid ${C.border2}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  </div>
);
const Card=({children,style:sx={}})=><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:18,...sx}}>{children}</div>;
const SL=({children,style:sx={}})=><div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.muted,marginBottom:10,...sx}}>{children}</div>;

const Toast=({toasts})=>(
  <div style={{position:"fixed",bottom:24,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:9999}}>
    {toasts.map(t=><div key={t.id} style={{background:t.type==="success"?C.green:t.type==="error"?C.red:C.blue,color:"#000",padding:"10px 16px",borderRadius:10,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>{t.msg}</div>)}
  </div>
);
function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:24,width:wide?660:440,maxWidth:"98vw",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{color:C.text,fontWeight:800,fontSize:17}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Confirm({msg,onConfirm,onCancel}){
  return <Modal title="Confirm" onClose={onCancel}><p style={{color:C.sub,marginBottom:20}}>{msg}</p><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn variant="outline" onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={onConfirm}>Delete</Btn></div></Modal>;
}
function ExPicker({onPick,onClose}){
  const [q,setQ]=useState("");
  const hits=EXERCISES.filter(e=>e.toLowerCase().includes(q.toLowerCase()));
  return(
    <div>
      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search or type custom name…"
        style={{width:"100%",background:C.s2,border:`1px solid ${C.border2}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:10}}/>
      <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
        {q&&!EXERCISES.includes(q)&&<div onClick={()=>{onPick(q);onClose();}} style={{padding:"8px 10px",borderRadius:7,cursor:"pointer",color:C.green,fontSize:13,display:"flex",gap:8,alignItems:"center"}}><Pill color={C.purple}>custom</Pill>{q}</div>}
        {hits.map(e=><div key={e} onClick={()=>{onPick(e);onClose();}} style={{padding:"8px 10px",borderRadius:7,cursor:"pointer",color:C.text,fontSize:13}} onMouseEnter={el=>el.currentTarget.style.background=C.s2} onMouseLeave={el=>el.currentTarget.style.background="transparent"}>{e}</div>)}
      </div>
    </div>
  );
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Spinner({msg="Loading…"}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:60,gap:16}}>
      <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:C.sub,fontSize:13}}>{msg}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Setup screen shown when tables don't exist yet ───────────────────────────
function SetupScreen({onSetupDone}){
  const [step,setStep]=useState("idle"); // idle | running | done | error
  const [err,setErr]=useState("");

  const SQL = `
-- Run this in Supabase → SQL Editor → New query

create table if not exists fitos_clients (
  id text primary key, name text not null, email text, phone text, dob text,
  tag text default 'General', status text default 'active', notes text,
  session_count integer default 0, program_id text,
  created_at timestamptz default now()
);
create table if not exists fitos_sessions (
  id text primary key, client_id text, name text, notes text,
  exercises jsonb default '[]', program_day text,
  started_at timestamptz default now(), created_at timestamptz default now()
);
create table if not exists fitos_classes (
  id text primary key, name text not null, date text, time text,
  duration integer default 45, capacity integer default 12,
  location text, notes text, status text default 'scheduled',
  bookings jsonb default '[]', format_id text, format_name text,
  created_at timestamptz default now()
);
create table if not exists fitos_programs (
  id text primary key, name text not null, description text,
  weeks integer default 4, days_per_week integer default 3,
  days jsonb default '[]', assigned_clients jsonb default '[]',
  created_at timestamptz default now()
);
create table if not exists fitos_formats (
  id text primary key, name text not null, type text default 'circuit',
  description text, total_duration integer default 45,
  work_sec integer default 40, rest_sec integer default 20,
  rounds integer default 3, stations jsonb default '[]',
  created_at timestamptz default now()
);

-- Allow public access (since we use the anon key)
alter table fitos_clients enable row level security;
alter table fitos_sessions enable row level security;
alter table fitos_classes enable row level security;
alter table fitos_programs enable row level security;
alter table fitos_formats enable row level security;

create policy if not exists "public_all" on fitos_clients for all using (true) with check (true);
create policy if not exists "public_all" on fitos_sessions for all using (true) with check (true);
create policy if not exists "public_all" on fitos_classes for all using (true) with check (true);
create policy if not exists "public_all" on fitos_programs for all using (true) with check (true);
create policy if not exists "public_all" on fitos_formats for all using (true) with check (true);
  `.trim();

  const verify = async () => {
    setStep("running");
    try {
      // Use a HEAD request — just checks the table exists, doesn't need RLS read permission
      const r = await fetch(`${SUPABASE_URL}/rest/v1/fitos_clients?limit=0`, {
        method: "GET",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (r.ok || r.status === 200 || r.status === 406) {
        // 406 = table exists but no rows match — still means table is there
        setStep("done");
        setTimeout(onSetupDone, 1200);
      } else {
        throw new Error(`status ${r.status}`);
      }
    } catch(e) {
      setStep("error");
      setErr(`Could not reach tables (${e.message}). Double-check you ran all the SQL in Supabase and that your anon key is correct.`);
    }
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:24}}>
      <div style={{maxWidth:680,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:48,height:48,borderRadius:12,background:C.green,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><span style={{fontSize:24,fontWeight:900,color:"#000"}}>F</span></div>
          <div style={{color:C.text,fontWeight:800,fontSize:24,marginBottom:8}}>One-time database setup</div>
          <div style={{color:C.sub,fontSize:14}}>You only need to do this once. It takes about 2 minutes.</div>
        </div>

        {/* Steps */}
        <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:24}}>
          {[
            {n:"1", title:"Open Supabase SQL Editor", desc:'Go to your Supabase dashboard → click "SQL Editor" in the left sidebar → click "New query"'},
            {n:"2", title:"Copy and paste this SQL", desc:"Select all the SQL below, copy it, and paste it into the SQL editor"},
            {n:"3", title:"Click Run", desc:'Press the green "Run" button (or Ctrl+Enter). You should see "Success. No rows returned."'},
            {n:"4", title:"Come back here and click Verify", desc:"Once the SQL has run, click the button below to confirm everything is set up"},
          ].map(s=>(
            <div key={s.n} style={{display:"flex",gap:14,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:C.green+"20",border:`2px solid ${C.green}`,display:"flex",alignItems:"center",justifyContent:"center",color:C.green,fontWeight:900,fontSize:13,flexShrink:0}}>{s.n}</div>
              <div><div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:3}}>{s.title}</div><div style={{color:C.sub,fontSize:13}}>{s.desc}</div></div>
            </div>
          ))}
        </div>

        {/* SQL box */}
        <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:20}}>
          <div style={{background:C.s3,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:C.sub,fontSize:12,fontWeight:700}}>SQL to run in Supabase</span>
            <button onClick={()=>{navigator.clipboard.writeText(SQL);}} style={{background:C.green+"18",border:`1px solid ${C.green}33`,borderRadius:6,padding:"4px 12px",color:C.green,fontSize:11,fontWeight:700,cursor:"pointer"}}>Copy SQL</button>
          </div>
          <pre style={{padding:16,margin:0,color:C.sub,fontSize:11,lineHeight:1.7,overflowX:"auto",fontFamily:"monospace",maxHeight:240,overflowY:"auto"}}>{SQL}</pre>
        </div>

        {step==="error"&&<div style={{background:C.red+"18",border:`1px solid ${C.red}44`,borderRadius:10,padding:"10px 16px",color:C.red,fontSize:13,marginBottom:16}}>{err}</div>}
        {step==="done"&&<div style={{background:C.green+"18",border:`1px solid ${C.green}44`,borderRadius:10,padding:"10px 16px",color:C.green,fontSize:13,fontWeight:700,marginBottom:16}}>✓ Tables found! Loading FitOS…</div>}

        <Btn disabled={step==="running"||step==="done"} onClick={verify} style={{width:"100%",justifyContent:"center",padding:"13px"}}>
          {step==="running"?"Checking…":step==="done"?"✓ Done!":"✓ I ran the SQL — verify setup"}
        </Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ClientForm({initial,onSave,onClose}){
  const EMPTY={name:"",email:"",phone:"",dob:"",tag:"General",status:"active",notes:""};
  const [f,setF]=useState(initial||EMPTY);
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Input label="Full name" value={f.name} onChange={set("name")} required/>
        <Input label="Email" value={f.email} onChange={set("email")} type="email"/>
        <Input label="Phone" value={f.phone} onChange={set("phone")}/>
        <Input label="Date of birth" value={f.dob} onChange={set("dob")} type="date"/>
        <Select label="Focus" value={f.tag} onChange={set("tag")} options={["General","Strength","Fat Loss","Hypertrophy","Endurance","Mobility","Rehab"]}/>
        <Select label="Status" value={f.status} onChange={set("status")} options={["active","inactive","prospect"]}/>
      </div>
      <Input label="Notes" value={f.notes} onChange={set("notes")} placeholder="Injuries, goals…"/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!f.name.trim()} onClick={()=>onSave(f)}>Save Client</Btn></div>
    </div>
  );
}

function ClientsScreen({clients,onAdd,onEdit,onDelete,programs,setView,setActiveClient}){
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [saving,setSaving]=useState(false);
  const SC={active:C.green,inactive:C.red,prospect:C.amber};
  const filtered=clients.filter(c=>(c.name||"").toLowerCase().includes(search.toLowerCase())||(c.email||"").toLowerCase().includes(search.toLowerCase()));

  const save=async(f)=>{ setSaving(true); if(modal==="add") await onAdd(f); else await onEdit(modal.client.id,f); setSaving(false); setModal(null); };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.muted}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…" style={{background:"none",border:"none",color:C.text,fontSize:14,flex:1,outline:"none",fontFamily:"inherit"}}/>
        </div>
        <Btn onClick={()=>setModal("add")}>+ New Client</Btn>
      </div>
      {filtered.length===0?(
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:32,marginBottom:10}}>👥</div>
          <div style={{color:C.sub,marginBottom:16}}>{search?"No matches.":"Add your first client."}</div>
          {!search&&<Btn onClick={()=>setModal("add")}>+ Add Client</Btn>}
        </Card>
      ):(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead style={{background:C.s2}}>
              <tr>{["Client","Focus","Status","Program","Sessions","Added",""].map(h=><th key={h} style={{textAlign:"left",color:C.muted,fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(c=>{
                const prog=programs.find(p=>p.id===c.programId);
                return(
                  <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.s2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    onClick={()=>{setActiveClient(c);setView("client");}}>
                    <td style={{padding:"12px 16px"}}><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar name={c.name} size={30} color={TAG_COLORS[c.tag]||C.sub}/><div><div style={{color:C.text,fontWeight:600,fontSize:14}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{c.email||"—"}</div></div></div></td>
                    <td style={{padding:"12px 16px"}}><Pill color={TAG_COLORS[c.tag]||C.sub}>{c.tag}</Pill></td>
                    <td style={{padding:"12px 16px"}}><Pill color={SC[c.status]||C.sub}>{c.status}</Pill></td>
                    <td style={{padding:"12px 16px"}}>{prog?<Pill color={C.purple}>{prog.name}</Pill>:<span style={{color:C.muted,fontSize:12}}>—</span>}</td>
                    <td style={{padding:"12px 16px",color:C.sub,fontSize:14}}>{c.sessionCount||0}</td>
                    <td style={{padding:"12px 16px",color:C.muted,fontSize:13}}>{fmtDate(c.createdAt)}</td>
                    <td style={{padding:"12px 16px"}}><div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
                      <Btn variant="ghost" color={C.blue} style={{padding:"5px 10px",fontSize:11}} onClick={()=>setModal({client:c})}>Edit</Btn>
                      <Btn variant="danger" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setConfirm(c.id)}>Delete</Btn>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {(modal==="add"||modal?.client)&&<Modal title={modal==="add"?"New Client":"Edit Client"} onClose={()=>setModal(null)} wide><ClientForm initial={modal?.client} onSave={save} onClose={()=>setModal(null)}/></Modal>}
      {confirm&&<Confirm msg="Delete this client?" onConfirm={async()=>{await onDelete(confirm);setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

function ClientProfile({client,sessions,programs,onEdit,setView,setActiveClient}){
  const [modal,setModal]=useState(null);
  const prog=programs.find(p=>p.id===client.programId);
  const clientSessions=sessions.filter(s=>s.clientId===client.id).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card style={{display:"flex",alignItems:"flex-start",gap:16}}>
        <Avatar name={client.name} size={56} color={TAG_COLORS[client.tag]||C.sub}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{color:C.text,fontWeight:800,fontSize:20}}>{client.name}</span>
            <Pill color={client.status==="active"?C.green:client.status==="inactive"?C.red:C.amber}>{client.status}</Pill>
            <Pill color={TAG_COLORS[client.tag]||C.sub}>{client.tag}</Pill>
            {prog&&<Pill color={C.purple}>📋 {prog.name}</Pill>}
          </div>
          <div style={{color:C.sub,fontSize:13}}>{client.email||"No email"} {client.phone&&`· ${client.phone}`}</div>
          {client.notes&&<div style={{color:C.muted,fontSize:12,marginTop:6,fontStyle:"italic"}}>"{client.notes}"</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" color={C.blue} onClick={()=>setModal("edit")}>Edit</Btn>
          <Btn onClick={()=>setView("sessions")}>+ Log Session</Btn>
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[{label:"Sessions",val:clientSessions.length,color:C.green},{label:"Last Session",val:clientSessions[0]?fmtDate(clientSessions[0].startedAt):"Never",color:C.blue},{label:"Client Since",val:fmtDate(client.createdAt),color:C.sub}].map(s=>(
          <Card key={s.label} style={{textAlign:"center",padding:16}}><div style={{color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{s.label}</div><div style={{color:s.color,fontWeight:800,fontSize:22}}>{s.val}</div></Card>
        ))}
      </div>
      {prog&&(
        <Card style={{borderColor:C.purple+"44"}}>
          <SL>Assigned Program — {prog.name}</SL>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
            {prog.days?.map(d=>(
              <div key={d.id} style={{background:C.s2,borderRadius:9,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.text,fontWeight:700,fontSize:13,marginBottom:2}}>{d.label}</div>
                {d.focus&&<div style={{marginBottom:6}}><Pill color={C.purple}>{d.focus}</Pill></div>}
                {d.exercises?.slice(0,3).map(e=><div key={e.id} style={{color:C.sub,fontSize:11,marginTop:2}}>· {e.name} {e.sets}×{e.reps}</div>)}
                {d.exercises?.length>3&&<div style={{color:C.muted,fontSize:10,marginTop:2}}>+{d.exercises.length-3} more</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <SL>Session History</SL>
        {clientSessions.length===0?<div style={{textAlign:"center",padding:"24px 0",color:C.muted}}>No sessions yet. <span onClick={()=>setView("sessions")} style={{color:C.green,cursor:"pointer"}}>Log the first one →</span></div>:(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {clientSessions.map(s=>(
              <div key={s.id} style={{background:C.s2,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{s.name||"Untitled"}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmtDate(s.startedAt)} · {s.exercises?.length||0} exercises · {s.exercises?.reduce((a,e)=>a+(e.sets?.length||0),0)||0} sets{s.programDay?` · ${s.programDay}`:""}</div></div>
                  <span style={{color:C.muted,fontSize:11}}>{fmtTime(s.startedAt)}</span>
                </div>
                {s.notes&&<div style={{color:C.sub,fontSize:12,marginTop:6,fontStyle:"italic"}}>{s.notes}</div>}
                {s.exercises?.some(e=>e.sets?.some(st=>st.pr))&&(
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                    {s.exercises.flatMap(e=>e.sets?.filter(st=>st.pr).map(st=><Pill key={st.id} color={C.amber}>🏆 {e.name}: {st.weight}kg×{st.reps}</Pill>))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {modal==="edit"&&<Modal title="Edit Client" onClose={()=>setModal(null)} wide><ClientForm initial={client} onSave={async f=>{await onEdit(client.id,f);setActiveClient(p=>({...p,...f}));setModal(null);}} onClose={()=>setModal(null)}/></Modal>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

function SessionLogger({clients,sessions,onSave,activeClient,programs}){
  const [clientId,setClientId]=useState(activeClient?.id||"");
  const [name,setName]=useState("");
  const [notes,setNotes]=useState("");
  const [exercises,setExercises]=useState([]);
  const [exPicker,setExPicker]=useState(false);
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [programDay,setProgramDay]=useState("");
  const [loadModal,setLoadModal]=useState(false);

  const client=clients.find(c=>c.id===clientId);
  const prog=programs.find(p=>p.id===client?.programId);

  const loadFromDay=day=>{
    setName(day.label+(day.focus?` — ${day.focus}`:""));
    setProgramDay(day.label);
    setExercises(day.exercises.map(e=>({id:uid(),name:e.name,sets:[],templateSets:e.sets,templateReps:e.reps,templateRest:e.rest,notes:e.notes})));
    setLoadModal(false);
  };

  const addSet=exId=>setExercises(p=>p.map(e=>e.id===exId?{...e,sets:[...e.sets,{id:uid(),reps:"",weight:"",done:false,pr:false}]}:e));
  const updateSet=(exId,sid,field,val)=>setExercises(p=>p.map(e=>e.id!==exId?e:{...e,sets:e.sets.map(s=>s.id!==sid?s:{...s,[field]:val})}));
  const removeSet=(exId,sid)=>setExercises(p=>p.map(e=>e.id!==exId?e:{...e,sets:e.sets.filter(s=>s.id!==sid)}));
  const removeEx=exId=>setExercises(p=>p.filter(e=>e.id!==exId));

  const checkPR=(exId,sid,weight,reps)=>{
    if(!clientId||!weight||!reps)return;
    const exName=exercises.find(e=>e.id===exId)?.name;
    const prev=sessions.filter(s=>s.clientId===clientId).flatMap(s=>s.exercises||[]).filter(e=>e.name===exName).flatMap(e=>e.sets||[]).filter(s=>s.done&&Number(s.reps)===Number(reps)).map(s=>Number(s.weight));
    updateSet(exId,sid,"pr",prev.length===0||Number(weight)>Math.max(...prev));
  };

  const save=async()=>{
    if(!clientId)return;
    setSaving(true);
    await onSave({id:uid(),clientId,name:name||`Session ${fmtDate(now())}`,notes,exercises,programDay,startedAt:now()});
    setSaving(false); setSaved(true);
  };

  const totalSets=exercises.reduce((a,e)=>a+(e.sets?.length||0),0);
  const doneSets=exercises.reduce((a,e)=>a+(e.sets?.filter(s=>s.done)?.length||0),0);
  const hasPR=exercises.some(e=>e.sets?.some(s=>s.pr&&s.done));

  if(saved)return(
    <Card style={{textAlign:"center",padding:48}}>
      <div style={{fontSize:40,marginBottom:12}}>💪</div>
      <div style={{color:C.green,fontWeight:800,fontSize:22,marginBottom:8}}>Session Saved!</div>
      {hasPR&&<div style={{color:C.amber,fontWeight:700,marginBottom:16}}>🏆 New PR detected!</div>}
      <div style={{color:C.sub,marginBottom:24}}>{totalSets} sets saved for {client?.name}</div>
      <Btn variant="ghost" onClick={()=>{setSaved(false);setExercises([]);setName("");setNotes("");setProgramDay("");}}>Log Another</Btn>
    </Card>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <Card>
        <SL>Session Details</SL>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <Select label="Client" value={clientId} onChange={v=>{setClientId(v);setExercises([]);setProgramDay("");}} required options={[{value:"",label:"— Select client —"},...clients.map(c=>({value:c.id,label:c.name}))]}/>
          <Input label="Session name" value={name} onChange={setName} placeholder="e.g. Lower Body Power"/>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
          <div style={{flex:1}}><Input label="Notes" value={notes} onChange={setNotes} placeholder="Coach notes…"/></div>
          {prog&&<Btn variant="ghost" color={C.purple} style={{padding:"9px 14px"}} onClick={()=>setLoadModal(true)}>📋 Load from Program</Btn>}
        </div>
        {programDay&&<div style={{marginTop:10}}><Pill color={C.purple}>📋 {programDay}</Pill></div>}
      </Card>

      {exercises.length>0&&(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:16}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.sub,fontSize:12}}>Sets completed</span><span style={{color:C.green,fontWeight:700,fontSize:13}}>{doneSets}/{totalSets}</span></div>
            <div style={{height:6,background:C.s3,borderRadius:3}}><div style={{height:"100%",width:`${totalSets?doneSets/totalSets*100:0}%`,background:C.green,borderRadius:3,transition:"width 0.3s"}}/></div>
          </div>
          {hasPR&&<Pill color={C.amber}>🏆 PR incoming!</Pill>}
        </div>
      )}

      {exercises.map(ex=>(
        <Card key={ex.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><span style={{color:C.text,fontWeight:700,fontSize:15}}>{ex.name}</span>{ex.templateSets&&<span style={{color:C.muted,fontSize:11,marginLeft:10}}>Target: {ex.templateSets}×{ex.templateReps}</span>}</div>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="ghost" color={C.green} style={{padding:"5px 10px",fontSize:11}} onClick={()=>addSet(ex.id)}>+ Set</Btn>
              <Btn variant="danger" style={{padding:"5px 10px",fontSize:11}} onClick={()=>removeEx(ex.id)}>Remove</Btn>
            </div>
          </div>
          {ex.notes&&<div style={{color:C.sub,fontSize:11,marginBottom:8,fontStyle:"italic"}}>💡 {ex.notes}</div>}
          {ex.sets.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"10px 0"}}>No sets — <span onClick={()=>addSet(ex.id)} style={{color:C.green,cursor:"pointer"}}>add first set</span></div>:(
            <>
              <div style={{display:"grid",gridTemplateColumns:"32px 1fr 1fr 36px 28px",gap:8,padding:"0 0 6px",borderBottom:`1px solid ${C.border}`}}>
                {["#","Weight (kg)","Reps","✓",""].map((h,i)=><div key={i} style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>)}
              </div>
              {ex.sets.map((s,si)=>(
                <div key={s.id} style={{display:"grid",gridTemplateColumns:"32px 1fr 1fr 36px 28px",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center",background:s.pr&&s.done?C.amber+"08":"transparent"}}>
                  <span style={{color:C.muted,fontSize:13,fontWeight:700}}>{si+1}</span>
                  <input type="number" value={s.weight} placeholder="0" onChange={e=>{updateSet(ex.id,s.id,"weight",e.target.value);if(s.done)checkPR(ex.id,s.id,e.target.value,s.reps);}} style={{background:C.s2,border:`1px solid ${C.border2}`,borderRadius:7,padding:"7px 10px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%"}}/>
                  <input type="number" value={s.reps} placeholder="0" onChange={e=>{updateSet(ex.id,s.id,"reps",e.target.value);if(s.done)checkPR(ex.id,s.id,s.weight,e.target.value);}} style={{background:C.s2,border:`1px solid ${C.border2}`,borderRadius:7,padding:"7px 10px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%"}}/>
                  <div onClick={()=>{const done=!s.done;updateSet(ex.id,s.id,"done",done);if(done)checkPR(ex.id,s.id,s.weight,s.reps);}} style={{width:32,height:32,borderRadius:7,border:`2px solid ${s.done?C.green:C.border}`,background:s.done?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:s.done?"#000":C.muted,fontSize:14,fontWeight:800}}>{s.done?"✓":""}</div>
                  <div onClick={()=>removeSet(ex.id,s.id)} style={{color:C.muted,cursor:"pointer",fontSize:16,textAlign:"center"}}>×</div>
                  {s.pr&&s.done&&<div style={{gridColumn:"1/-1"}}><Pill color={C.amber}>🏆 New PR!</Pill></div>}
                </div>
              ))}
            </>
          )}
        </Card>
      ))}

      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <Btn variant="ghost" color={C.green} onClick={()=>setExPicker(true)}>+ Add Exercise</Btn>
        <div style={{flex:1}}/>
        <Btn disabled={!clientId||exercises.length===0||saving} onClick={save} style={{padding:"10px 24px"}}>{saving?"Saving…":"Save Session"}</Btn>
      </div>

      {exPicker&&<Modal title="Add Exercise" onClose={()=>setExPicker(false)}><ExPicker onPick={n=>{setExercises(p=>[...p,{id:uid(),name:n,sets:[]}]);setExPicker(false);}} onClose={()=>setExPicker(false)}/></Modal>}
      {loadModal&&prog&&(
        <Modal title={`Load from: ${prog.name}`} onClose={()=>setLoadModal(false)} wide>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {prog.days?.map(d=>(
              <div key={d.id} style={{background:C.s2,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>loadFromDay(d)} onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{d.label}</div>{d.focus&&<Pill color={C.purple}>{d.focus}</Pill>}</div>
                  <div style={{color:C.muted,fontSize:12}}>{d.exercises?.length||0} exercises</div>
                </div>
                {d.exercises?.length>0&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>{d.exercises.map(e=><span key={e.id} style={{fontSize:11,color:C.sub,background:C.s3,padding:"2px 7px",borderRadius:5}}>{e.name} {e.sets}×{e.reps}</span>)}</div>}
              </div>
            ))}
            {!prog.days?.length&&<div style={{color:C.muted,textAlign:"center",padding:24}}>No days built yet.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

function ClassForm({initial,onSave,onClose}){
  const EMPTY={name:"",date:"",time:"",duration:45,capacity:12,location:"",notes:""};
  const [f,setF]=useState(initial||EMPTY);
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Input label="Class name" value={f.name} onChange={set("name")} required/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Input label="Date" value={f.date} onChange={set("date")} type="date" required/>
        <Input label="Time" value={f.time} onChange={set("time")} type="time" required/>
        <Input label="Duration (min)" value={f.duration} onChange={set("duration")} type="number"/>
        <Input label="Max capacity" value={f.capacity} onChange={set("capacity")} type="number"/>
      </div>
      <Input label="Location" value={f.location} onChange={set("location")}/>
      <Input label="Notes" value={f.notes} onChange={set("notes")}/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!f.name.trim()||!f.date||!f.time} onClick={()=>onSave(f)}>Save Class</Btn></div>
    </div>
  );
}

function ClassesScreen({clients,classes,onAdd,onEdit,onDelete,formats}){
  const [selected,setSelected]=useState(null);
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [fmtModal,setFmtModal]=useState(false);
  const sorted=[...classes].sort((a,b)=>new Date(a.date+" "+a.time)-new Date(b.date+" "+b.time));
  const sel=classes.find(c=>c.id===selected);
  const selFmt=sel?formats.find(f=>f.id===sel.formatId):null;
  const AT={attended:C.green,"no-show":C.red,late:C.amber};

  const toggleBooking=async(clientId)=>{
    if(!sel)return;
    const has=sel.bookings.some(b=>b.clientId===clientId);
    if(!has&&sel.bookings.length>=Number(sel.capacity))return;
    const bookings=has?sel.bookings.filter(b=>b.clientId!==clientId):[...sel.bookings,{clientId,bookedAt:now(),attendance:null}];
    await onEdit(sel.id,{bookings});
  };
  const markAttendance=async(clientId,status)=>{
    if(!sel)return;
    const bookings=sel.bookings.map(b=>b.clientId!==clientId?b:{...b,attendance:b.attendance===status?null:status});
    await onEdit(sel.id,{bookings});
  };

  return(
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16,minHeight:500}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Btn onClick={()=>setModal("add")}>+ New Class</Btn>
        {sorted.length===0&&<Card style={{textAlign:"center",padding:32}}><div style={{fontSize:28,marginBottom:8}}>📅</div><div style={{color:C.muted,fontSize:13}}>No classes yet.</div></Card>}
        {sorted.map(c=>(
          <div key={c.id} onClick={()=>setSelected(c.id)} style={{background:C.surface,border:`1px solid ${selected===c.id?C.green:C.border}`,borderRadius:12,padding:14,cursor:"pointer",borderLeft:`3px solid ${c.status==="completed"?C.muted:C.green}`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><div style={{color:C.text,fontWeight:700,fontSize:14}}>{c.name}</div><Pill color={c.status==="completed"?C.muted:C.green}>{c.status}</Pill></div>
            <div style={{color:C.sub,fontSize:12,marginTop:4}}>{c.date} · {c.time} · {c.duration}min</div>
            <div style={{color:C.muted,fontSize:11,marginTop:2}}>{c.bookings?.length||0}/{c.capacity} enrolled</div>
            {c.formatId&&<div style={{marginTop:5}}><Pill color={C.teal}>{c.formatName}</Pill></div>}
          </div>
        ))}
      </div>

      {!sel?<Card style={{display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:C.muted}}><div style={{fontSize:32,marginBottom:10}}>📅</div>Select a class</div></Card>:(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div><div style={{color:C.text,fontWeight:800,fontSize:18}}>{sel.name}</div><div style={{color:C.sub,fontSize:13,marginTop:2}}>{sel.date} · {sel.time} · {sel.duration}min{sel.location&&` · ${sel.location}`}</div></div>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="ghost" color={C.blue} style={{padding:"6px 12px",fontSize:11}} onClick={()=>setModal({cls:sel})}>Edit</Btn>
                {sel.status==="scheduled"&&<Btn variant="ghost" color={C.green} style={{padding:"6px 12px",fontSize:11}} onClick={()=>onEdit(sel.id,{status:"completed"})}>✓ Complete</Btn>}
                <Btn variant="danger" style={{padding:"6px 12px",fontSize:11}} onClick={()=>setConfirm(sel.id)}>Delete</Btn>
              </div>
            </div>
            <div style={{background:C.s2,borderRadius:10,padding:"12px 14px",border:`1px solid ${selFmt?C.teal+"44":C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><SL style={{marginBottom:4}}>Class Format</SL>{selFmt?<div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{selFmt.name}</div><div style={{color:C.muted,fontSize:11}}>{selFmt.stations?.length||0} stations</div></div>:<div style={{color:C.muted,fontSize:13}}>No format attached.</div>}</div>
                <div style={{display:"flex",gap:8}}>
                  {selFmt&&<Btn variant="danger" style={{padding:"5px 10px",fontSize:11}} onClick={()=>onEdit(sel.id,{format_id:null,format_name:null})}>Detach</Btn>}
                  {sel.status==="scheduled"&&<Btn variant="ghost" color={C.teal} style={{padding:"5px 10px",fontSize:11}} onClick={()=>setFmtModal(true)}>📋 Attach Format</Btn>}
                </div>
              </div>
            </div>
          </Card>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[{label:"Enrolled",val:`${sel.bookings?.length||0}/${sel.capacity}`,color:C.text},{label:"Attended",val:(sel.bookings||[]).filter(b=>b.attendance==="attended").length,color:C.green},{label:"No-shows",val:(sel.bookings||[]).filter(b=>b.attendance==="no-show").length,color:C.red}].map(s=>(
              <div key={s.label} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:9,padding:12,textAlign:"center"}}><div style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.label}</div><div style={{color:s.color,fontWeight:800,fontSize:22}}>{s.val}</div></div>
            ))}
          </div>

          <Card>
            <SL>Roster</SL>
            {(sel.bookings||[]).length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"10px 0"}}>No one enrolled.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
              {(sel.bookings||[]).map(b=>{
                const cl=clients.find(c=>c.id===b.clientId);
                if(!cl)return null;
                return(
                  <div key={b.clientId} style={{display:"flex",alignItems:"center",gap:10,background:C.s2,borderRadius:9,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                    <Avatar name={cl.name} size={28} color={TAG_COLORS[cl.tag]||C.sub}/>
                    <span style={{color:C.text,fontWeight:600,fontSize:13,flex:1}}>{cl.name}</span>
                    {sel.status==="scheduled"&&(
                      <div style={{display:"flex",gap:5}}>
                        {["attended","late","no-show"].map(s=>(
                          <button key={s} onClick={()=>markAttendance(b.clientId,s)} style={{padding:"3px 9px",borderRadius:6,border:`1px solid ${b.attendance===s?(AT[s]||C.green):C.border}`,background:b.attendance===s?(AT[s]||C.green)+"20":"transparent",color:b.attendance===s?(AT[s]||C.green):C.muted,fontSize:11,fontWeight:600,cursor:"pointer"}}>{s}</button>
                        ))}
                      </div>
                    )}
                    {b.attendance&&sel.status!=="scheduled"&&<Pill color={AT[b.attendance]||C.sub}>{b.attendance}</Pill>}
                    <button onClick={()=>toggleBooking(b.clientId)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>×</button>
                  </div>
                );
              })}
            </div>
            {sel.status==="scheduled"&&(
              <><SL>Add Client</SL>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {clients.filter(c=>!(sel.bookings||[]).some(b=>b.clientId===c.id)).map(c=>(
                  <button key={c.id} onClick={()=>toggleBooking(c.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:C.s2,border:`1px solid ${C.border}`,borderRadius:8,color:C.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                    <Avatar name={c.name} size={20} color={TAG_COLORS[c.tag]||C.sub}/>{c.name}
                  </button>
                ))}
              </div></>
            )}
          </Card>
        </div>
      )}

      {fmtModal&&sel&&(
        <Modal title="Attach Class Format" onClose={()=>setFmtModal(false)} wide>
          {formats.length===0?<div style={{color:C.muted,textAlign:"center",padding:24}}>No formats yet. Build one in Programs → Class Formats.</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {formats.map(f=>(
                <div key={f.id} style={{background:C.s2,borderRadius:10,padding:"12px 14px",border:`1px solid ${sel.formatId===f.id?C.teal+"55":C.border}`,cursor:"pointer"}} onClick={async()=>{await onEdit(sel.id,{format_id:f.id,format_name:f.name});setFmtModal(false);}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{f.name}</div><div style={{color:C.muted,fontSize:11}}>{f.stations?.length||0} stations · {f.totalDuration}min</div></div>
                    {sel.formatId===f.id&&<Pill color={C.teal}>Attached</Pill>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {(modal==="add"||modal?.cls)&&<Modal title={modal==="add"?"New Class":"Edit Class"} onClose={()=>setModal(null)} wide><ClassForm initial={modal?.cls} onSave={async f=>{if(modal==="add")await onAdd(f);else await onEdit(modal.cls.id,f);setModal(null);}} onClose={()=>setModal(null)}/></Modal>}
      {confirm&&<Confirm msg="Delete this class?" onConfirm={async()=>{await onDelete(confirm);if(selected===confirm)setSelected(null);setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMS HUB (inline — same as v3, but saving to Supabase)
// ═══════════════════════════════════════════════════════════════════════════════

const FORMAT_TYPES=[{value:"station",label:"Station Rotation"},{value:"circuit",label:"Circuit"},{value:"amrap",label:"AMRAP"},{value:"emom",label:"EMOM"},{value:"tabata",label:"Tabata"},{value:"custom",label:"Custom"}];

function ProgramBuilder({programs,onSave,onUpdate,onDelete,clients,onUpdateClient}){
  const [selected,setSelected]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [modal,setModal]=useState(null);
  const [exPicker,setExPicker]=useState(null);
  const prog=programs.find(p=>p.id===selected);

  const create=async()=>{
    const p={id:uid(),name:"New Program",description:"",weeks:4,daysPerWeek:3,days:[],assignedClients:[],createdAt:now()};
    await onSave(p); setSelected(p.id);
  };
  const upd=patch=>onUpdate(prog.id,{...prog,...patch});
  const addDay=()=>upd({days:[...(prog.days||[]),{id:uid(),label:`Day ${(prog.days?.length||0)+1}`,focus:"",exercises:[]}]});
  const updDay=(did,patch)=>upd({days:prog.days.map(d=>d.id===did?{...d,...patch}:d)});
  const rmDay=did=>upd({days:prog.days.filter(d=>d.id!==did)});
  const addEx=(did,name)=>updDay(did,{exercises:[...(prog.days.find(d=>d.id===did)?.exercises||[]),{id:uid(),name,sets:3,reps:"8-12",rest:90,notes:""}]});
  const updEx=(did,eid,patch)=>updDay(did,{exercises:prog.days.find(d=>d.id===did).exercises.map(e=>e.id===eid?{...e,...patch}:e)});
  const rmEx=(did,eid)=>updDay(did,{exercises:prog.days.find(d=>d.id===did).exercises.filter(e=>e.id!==eid)});
  const mvEx=(did,eid,dir)=>{
    const day=prog.days.find(d=>d.id===did);
    const arr=[...day.exercises]; const i=arr.findIndex(e=>e.id===eid); const ni=clamp(i+dir,0,arr.length-1);
    if(ni===i)return; [arr[i],arr[ni]]=[arr[ni],arr[i]]; updDay(did,{exercises:arr});
  };
  const toggleAssign=async(clientId)=>{
    const already=prog.assignedClients?.includes(clientId);
    const updated=already?prog.assignedClients.filter(id=>id!==clientId):[...(prog.assignedClients||[]),clientId];
    await upd({assignedClients:updated});
    await onUpdateClient(clientId,{program_id:already?null:prog.id});
  };

  return(
    <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16,minHeight:520}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Btn color={C.purple} onClick={create}>+ New Program</Btn>
        {programs.length===0&&<Card style={{textAlign:"center",padding:32}}><div style={{fontSize:28,marginBottom:8}}>📋</div><div style={{color:C.muted,fontSize:13}}>No programs yet.</div></Card>}
        {programs.map(p=>(
          <div key={p.id} onClick={()=>setSelected(p.id)} style={{background:C.surface,border:`1px solid ${selected===p.id?C.purple:C.border}`,borderRadius:12,padding:14,cursor:"pointer",borderLeft:`3px solid ${selected===p.id?C.purple:C.border}`}}>
            <div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.name}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:3}}>{p.weeks}wk · {p.daysPerWeek}d/wk · {p.days?.length||0} days</div>
            {p.assignedClients?.length>0&&<div style={{marginTop:5}}><Pill color={C.green}>{p.assignedClients.length} client{p.assignedClients.length>1?"s":""}</Pill></div>}
          </div>
        ))}
      </div>

      {!prog?<Card style={{display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:C.muted}}><div style={{fontSize:36,marginBottom:10}}>📋</div>Select or create a program</div></Card>:(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <SL>Program Settings</SL>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="ghost" color={C.green} style={{padding:"5px 10px",fontSize:11}} onClick={()=>setModal("assign")}>👥 Assign</Btn>
                <Btn variant="danger" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setConfirm(prog.id)}>Delete</Btn>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12}}>
              <Input label="Program name" value={prog.name} onChange={v=>upd({name:v})} required/>
              <Input label="Weeks" type="number" value={prog.weeks} onChange={v=>upd({weeks:v})} min="1"/>
              <Input label="Days/week" type="number" value={prog.daysPerWeek} onChange={v=>upd({daysPerWeek:v})} min="1"/>
            </div>
            <div style={{marginTop:10}}><Input label="Description" value={prog.description} onChange={v=>upd({description:v})} placeholder="Goals, periodisation…"/></div>
            {prog.assignedClients?.length>0&&<div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>{prog.assignedClients.map(id=>{const cl=clients.find(c=>c.id===id);return cl?<Pill key={id} color={C.green}>👤 {cl.name}</Pill>:null;})}</div>}
          </Card>

          {(prog.days||[]).map(day=>(
            <Card key={day.id} style={{borderColor:C.purple+"44"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                <input value={day.label} onChange={e=>updDay(day.id,{label:e.target.value})} style={{background:"none",border:"none",color:C.text,fontWeight:700,fontSize:15,outline:"none",fontFamily:"inherit",flex:1,padding:0}}/>
                <input value={day.focus} onChange={e=>updDay(day.id,{focus:e.target.value})} placeholder="Focus (Push, Lower…)" style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 10px",color:C.sub,fontSize:12,outline:"none",fontFamily:"inherit",width:160}}/>
                <button onClick={()=>rmDay(day.id)} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              {day.exercises?.length===0&&<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"10px 0"}}>No exercises yet.</div>}
              {day.exercises?.map((ex,ei)=>(
                <div key={ex.id} style={{background:C.s2,borderRadius:9,padding:"10px 12px",marginBottom:8,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <button onClick={()=>mvEx(day.id,ex.id,-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>▲</button>
                      <button onClick={()=>mvEx(day.id,ex.id,1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,lineHeight:1,padding:0}}>▼</button>
                    </div>
                    <span style={{color:C.text,fontWeight:600,fontSize:13,flex:1}}>{ex.name}</span>
                    <button onClick={()=>rmEx(day.id,ex.id)} style={{background:"none",border:"none",color:C.muted,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"60px 80px 80px 1fr",gap:8}}>
                    {[{l:"Sets",f:"sets",t:"number"},{l:"Reps",f:"reps",t:"text"},{l:"Rest(s)",f:"rest",t:"number"}].map(fi=>(
                      <div key={fi.f}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>{fi.l}</div><input type={fi.t} value={ex[fi.f]} onChange={e=>updEx(day.id,ex.id,{[fi.f]:e.target.value})} style={{width:"100%",background:C.s3,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",color:C.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/></div>
                    ))}
                    <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>Notes</div><input value={ex.notes} onChange={e=>updEx(day.id,ex.id,{notes:e.target.value})} placeholder="Cues…" style={{width:"100%",background:C.s3,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",color:C.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/></div>
                  </div>
                </div>
              ))}
              <Btn variant="ghost" color={C.purple} style={{padding:"5px 12px",fontSize:11,marginTop:4}} onClick={()=>setExPicker(day.id)}>+ Add Exercise</Btn>
            </Card>
          ))}

          <Btn variant="ghost" color={C.teal} onClick={addDay}>+ Add Training Day</Btn>

          {exPicker&&<Modal title="Add Exercise" onClose={()=>setExPicker(null)}><ExPicker onPick={name=>{addEx(exPicker,name);setExPicker(null);}} onClose={()=>setExPicker(null)}/></Modal>}
          {modal==="assign"&&(
            <Modal title={`Assign "${prog.name}"`} onClose={()=>setModal(null)} wide>
              <p style={{color:C.sub,fontSize:13,marginBottom:16}}>Assign this program to clients so they can load sessions from it.</p>
              {clients.length===0&&<div style={{color:C.muted,textAlign:"center",padding:24}}>No clients yet.</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {clients.map(cl=>{
                  const assigned=prog.assignedClients?.includes(cl.id);
                  return(
                    <div key={cl.id} style={{display:"flex",alignItems:"center",gap:12,background:C.s2,borderRadius:10,padding:"10px 14px",border:`1px solid ${assigned?C.green+"44":C.border}`}}>
                      <Avatar name={cl.name} size={30} color={TAG_COLORS[cl.tag]||C.sub}/>
                      <div style={{flex:1}}><div style={{color:C.text,fontWeight:600,fontSize:13}}>{cl.name}</div><div style={{color:C.muted,fontSize:11}}>{cl.tag} · {cl.status}</div></div>
                      <Btn variant={assigned?"danger":"ghost"} color={assigned?C.red:C.green} style={{padding:"5px 12px",fontSize:11}} onClick={()=>toggleAssign(cl.id)}>{assigned?"Unassign":"Assign"}</Btn>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}><Btn onClick={()=>setModal(null)}>Done</Btn></div>
            </Modal>
          )}
          {confirm&&<Confirm msg={`Delete "${prog.name}"?`} onConfirm={async()=>{await onDelete(confirm);setSelected(null);setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
        </div>
      )}
    </div>
  );
}

function ClassFormatBuilder({formats,onSave,onUpdate,onDelete,classes,onUpdateClass}){
  const [selected,setSelected]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [stPicker,setStPicker]=useState(false);
  const [loadModal,setLoadModal]=useState(false);
  const fmt=formats.find(f=>f.id===selected);

  const create=async()=>{
    const f={id:uid(),name:"New Class Format",type:"circuit",description:"",totalDuration:45,workSec:40,restSec:20,rounds:3,stations:[],createdAt:now()};
    await onSave(f); setSelected(f.id);
  };
  const upd=patch=>onUpdate(fmt.id,{...fmt,...patch});
  const addSt=name=>upd({stations:[...(fmt.stations||[]),{id:uid(),name,workSec:fmt.workSec,restSec:fmt.restSec,reps:"",notes:"",equipment:""}]});
  const updSt=(sid,patch)=>upd({stations:fmt.stations.map(s=>s.id===sid?{...s,...patch}:s)});
  const rmSt=sid=>upd({stations:fmt.stations.filter(s=>s.id!==sid)});
  const mvSt=(sid,dir)=>{
    const arr=[...fmt.stations]; const i=arr.findIndex(s=>s.id===sid); const ni=clamp(i+dir,0,arr.length-1);
    if(ni===i)return; [arr[i],arr[ni]]=[arr[ni],arr[i]]; upd({stations:arr});
  };
  const COLS=(i)=>[C.green,C.blue,C.purple,C.amber,C.red,C.teal][i%6];

  return(
    <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16,minHeight:520}}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Btn color={C.teal} onClick={create}>+ New Class Format</Btn>
        {formats.length===0&&<Card style={{textAlign:"center",padding:32}}><div style={{fontSize:28,marginBottom:8}}>🏋️</div><div style={{color:C.muted,fontSize:13}}>No formats yet.</div></Card>}
        {formats.map(f=>(
          <div key={f.id} onClick={()=>setSelected(f.id)} style={{background:C.surface,border:`1px solid ${selected===f.id?C.teal:C.border}`,borderRadius:12,padding:14,cursor:"pointer",borderLeft:`3px solid ${selected===f.id?C.teal:C.border}`}}>
            <div style={{color:C.text,fontWeight:700,fontSize:14}}>{f.name}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:3}}>{FORMAT_TYPES.find(t=>t.value===f.type)?.label} · {f.stations?.length||0} stations · {f.totalDuration}min</div>
          </div>
        ))}
      </div>

      {!fmt?<Card style={{display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:C.muted}}><div style={{fontSize:36,marginBottom:10}}>🏋️</div>Select or create a format</div></Card>:(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <SL>Format Settings</SL>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="ghost" color={C.teal} style={{padding:"5px 10px",fontSize:11}} onClick={()=>setLoadModal(true)}>📅 Load into Class</Btn>
                <Btn variant="danger" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setConfirm(fmt.id)}>Delete</Btn>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:12}}>
              <Input label="Format name" value={fmt.name} onChange={v=>upd({name:v})} required/>
              <Select label="Type" value={fmt.type} onChange={v=>upd({type:v})} options={FORMAT_TYPES}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
              <Input label="Work (sec)" type="number" value={fmt.workSec} onChange={v=>upd({workSec:v})}/>
              <Input label="Rest (sec)" type="number" value={fmt.restSec} onChange={v=>upd({restSec:v})}/>
              <Input label="Rounds" type="number" value={fmt.rounds} onChange={v=>upd({rounds:v})}/>
              <Input label="Total (min)" type="number" value={fmt.totalDuration} onChange={v=>upd({totalDuration:v})}/>
            </div>
            <Input label="Description / coach notes" value={fmt.description} onChange={v=>upd({description:v})} placeholder="Class flow, music cues…"/>
          </Card>

          {fmt.stations?.length>0&&(
            <div style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
              <SL>Station Overview · {fmt.stations.length} stations</SL>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {fmt.stations.map((st,i)=>(
                  <div key={st.id} style={{background:COLS(i)+"18",border:`1px solid ${COLS(i)}44`,borderRadius:9,padding:"8px 12px",minWidth:100,textAlign:"center"}}>
                    <div style={{color:COLS(i),fontSize:10,fontWeight:700,marginBottom:2}}>#{i+1}</div>
                    <div style={{color:C.text,fontSize:12,fontWeight:600}}>{st.name}</div>
                    <div style={{color:C.muted,fontSize:10}}>{st.workSec}s on · {st.restSec}s off</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <SL>Stations / Exercises</SL>
              <Btn variant="ghost" color={C.teal} style={{padding:"5px 12px",fontSize:11}} onClick={()=>setStPicker(true)}>+ Add Station</Btn>
            </div>
            {fmt.stations?.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>No stations yet.</div>}
            {fmt.stations?.map((st,i)=>(
              <div key={st.id} style={{background:C.s2,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${COLS(i)}33`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{width:26,height:26,borderRadius:7,background:COLS(i)+"22",border:`1px solid ${COLS(i)}44`,display:"flex",alignItems:"center",justifyContent:"center",color:COLS(i),fontWeight:800,fontSize:12,flexShrink:0}}>{i+1}</div>
                  <input value={st.name} onChange={e=>updSt(st.id,{name:e.target.value})} style={{flex:1,background:"none",border:"none",color:C.text,fontWeight:700,fontSize:14,outline:"none",fontFamily:"inherit",padding:0}}/>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>mvSt(st.id,-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13}}>▲</button>
                    <button onClick={()=>mvSt(st.id,1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13}}>▼</button>
                    <button onClick={()=>rmSt(st.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"80px 80px 80px 1fr 1fr",gap:8}}>
                  {[{l:"Work (s)",f:"workSec",t:"number"},{l:"Rest (s)",f:"restSec",t:"number"},{l:"Reps",f:"reps",t:"text"},{l:"Equipment",f:"equipment",t:"text"},{l:"Coach cue",f:"notes",t:"text"}].map(fi=>(
                    <div key={fi.f}><div style={{color:C.muted,fontSize:10,marginBottom:3}}>{fi.l}</div><input type={fi.t} value={st[fi.f]} onChange={e=>updSt(st.id,{[fi.f]:e.target.value})} style={{width:"100%",background:C.s3,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",color:fi.f==="workSec"?COLS(i):C.text,fontWeight:fi.f==="workSec"?700:400,fontSize:12,outline:"none",fontFamily:"inherit"}}/></div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          {stPicker&&<Modal title="Add Station" onClose={()=>setStPicker(false)}><ExPicker onPick={name=>{addSt(name);setStPicker(false);}} onClose={()=>setStPicker(false)}/></Modal>}
          {loadModal&&(
            <Modal title={`Load "${fmt.name}" into a Class`} onClose={()=>setLoadModal(false)} wide>
              {classes.filter(c=>c.status==="scheduled").length===0?<div style={{color:C.muted,textAlign:"center",padding:24}}>No upcoming classes.</div>:(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {classes.filter(c=>c.status==="scheduled").map(cl=>(
                    <div key={cl.id} style={{background:C.s2,borderRadius:10,padding:"12px 14px",border:`1px solid ${cl.formatId===fmt.id?C.teal+"44":C.border}`,cursor:"pointer"}} onClick={async()=>{await onUpdateClass(cl.id,{format_id:fmt.id,format_name:fmt.name});setLoadModal(false);}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{cl.name}</div><div style={{color:C.muted,fontSize:11}}>{cl.date} · {cl.time}</div></div>
                        {cl.formatId===fmt.id&&<Pill color={C.teal}>Loaded ✓</Pill>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}><Btn onClick={()=>setLoadModal(false)}>Done</Btn></div>
            </Modal>
          )}
          {confirm&&<Confirm msg={`Delete "${fmt.name}"?`} onConfirm={async()=>{await onDelete(confirm);setSelected(null);setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
        </div>
      )}
    </div>
  );
}

function ProgramsHub({programs,onSaveProgram,onUpdateProgram,onDeleteProgram,formats,onSaveFormat,onUpdateFormat,onDeleteFormat,clients,onUpdateClient,classes,onUpdateClass}){
  const [tab,setTab]=useState("programs");
  return(
    <div>
      <div style={{display:"flex",gap:2,marginBottom:20,borderBottom:`1px solid ${C.border}`}}>
        {[["programs","📋 Training Programs",C.purple],["formats","🏋️ Class Formats",C.teal]].map(([id,label,color])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"10px 18px",border:"none",background:"none",cursor:"pointer",color:tab===id?color:C.sub,fontWeight:tab===id?700:500,fontSize:14,borderBottom:`2px solid ${tab===id?color:"transparent"}`}}>{label}</button>
        ))}
      </div>
      {tab==="programs"&&<ProgramBuilder programs={programs} onSave={onSaveProgram} onUpdate={onUpdateProgram} onDelete={onDeleteProgram} clients={clients} onUpdateClient={onUpdateClient}/>}
      {tab==="formats"&&<ClassFormatBuilder formats={formats} onSave={onSaveFormat} onUpdate={onUpdateFormat} onDelete={onDeleteFormat} classes={classes} onUpdateClass={onUpdateClass}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function Dashboard({clients,sessions,classes,programs,formats,setView,setActiveClient}){
  const active=clients.filter(c=>c.status==="active");
  const upcoming=[...classes].filter(c=>c.status==="scheduled").sort((a,b)=>new Date(a.date+" "+a.time)-new Date(b.date+" "+b.time)).slice(0,4);
  const recent=[...sessions].sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)).slice(0,5);
  const totalPRs=sessions.reduce((a,s)=>a+(s.exercises||[]).reduce((b,e)=>b+(e.sets||[]).filter(st=>st.pr&&st.done).length,0),0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {[{label:"Active Clients",val:active.length,sub:`${clients.length} total`,color:C.green,icon:"👥"},{label:"Sessions Logged",val:sessions.length,sub:"all time",color:C.blue,icon:"⚡"},{label:"Programs Built",val:programs.length,sub:`${formats.length} class formats`,color:C.purple,icon:"📋"},{label:"PRs Logged",val:totalPRs,sub:"all time",color:C.amber,icon:"🏆"}].map(s=>(
          <Card key={s.label} style={{padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:C.sub}}>{s.label}</span><span style={{fontSize:16}}>{s.icon}</span></div>
            <div style={{fontSize:30,fontWeight:800,color:C.text,lineHeight:1}}>{s.val}</div>
            <div style={{fontSize:11,color:s.color,fontWeight:600,marginTop:4}}>{s.sub}</div>
          </Card>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><SL>Upcoming Classes</SL><span onClick={()=>setView("classes")} style={{color:C.green,fontSize:12,cursor:"pointer"}}>View all →</span></div>
          {upcoming.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"16px 0"}}>No classes. <span onClick={()=>setView("classes")} style={{color:C.green,cursor:"pointer"}}>Add one →</span></div>:upcoming.map((c,i)=>(
            <div key={c.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<upcoming.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{width:3,borderRadius:2,background:C.green,flexShrink:0,alignSelf:"stretch"}}/>
              <div style={{flex:1}}><div style={{color:C.text,fontWeight:600,fontSize:13}}>{c.name}</div><div style={{color:C.muted,fontSize:11}}>{c.date} · {c.time} · {c.bookings?.length||0}/{c.capacity}{c.formatId&&` · ${c.formatName}`}</div></div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><SL>Recent Sessions</SL><span onClick={()=>setView("sessions")} style={{color:C.green,fontSize:12,cursor:"pointer"}}>Log session →</span></div>
          {recent.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"16px 0"}}>No sessions. <span onClick={()=>setView("sessions")} style={{color:C.green,cursor:"pointer"}}>Log first →</span></div>:recent.map((s,i)=>{
            const cl=clients.find(c=>c.id===s.clientId);
            const hasPR=s.exercises?.some(e=>e.sets?.some(st=>st.pr&&st.done));
            return(<div key={s.id} style={{display:"flex",gap:10,padding:"10px 0",borderBottom:i<recent.length-1?`1px solid ${C.border}`:"none",alignItems:"center"}}>
              {cl&&<Avatar name={cl.name} size={28} color={TAG_COLORS[cl.tag]||C.sub}/>}
              <div style={{flex:1}}><div style={{color:C.text,fontSize:13,fontWeight:600}}>{cl?.name||"?"} — {s.name}</div><div style={{color:C.muted,fontSize:11}}>{fmtDate(s.startedAt)}{s.programDay&&` · ${s.programDay}`}</div></div>
              {hasPR&&<Pill color={C.amber}>🏆</Pill>}
            </div>);
          })}
        </Card>
      </div>
      {active.length>0&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><SL>Active Clients</SL><span onClick={()=>setView("clients")} style={{color:C.green,fontSize:12,cursor:"pointer"}}>All →</span></div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {active.slice(0,10).map(c=>(
              <div key={c.id} onClick={()=>{setActiveClient(c);setView("client");}} style={{background:C.s2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",textAlign:"center",cursor:"pointer",minWidth:90}}>
                <Avatar name={c.name} size={34} color={TAG_COLORS[c.tag]||C.sub}/>
                <div style={{color:C.text,fontWeight:600,fontSize:12,marginTop:8}}>{c.name.split(" ")[0]}</div>
                {c.programId&&<div style={{marginTop:3}}><Pill color={C.purple}>📋</Pill></div>}
                <div style={{color:C.muted,fontSize:10,marginTop:2}}>{c.sessionCount||0} sessions</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — loads all data from Supabase, passes CRUD handlers down
// ═══════════════════════════════════════════════════════════════════════════════

const NAV=[{id:"dashboard",label:"Dashboard",icon:"▦"},{id:"clients",label:"Clients",icon:"👥"},{id:"sessions",label:"Log Session",icon:"⚡"},{id:"classes",label:"Classes",icon:"📅"},{id:"programs",label:"Programs",icon:"📋"}];

function Sidebar({active,setActive,counts}){
  return(
    <aside style={{width:200,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:28,height:28,borderRadius:7,background:C.green,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:14,fontWeight:900,color:"#000"}}>F</span></div>
          <div><div style={{color:C.text,fontWeight:800,fontSize:14}}>FitOS</div><div style={{color:C.muted,fontSize:10}}>Cloud ☁️</div></div>
        </div>
      </div>
      <nav style={{padding:"10px 8px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
        {NAV.map(item=>{
          const isActive=active===item.id||(active==="client"&&item.id==="clients");
          const col=item.id==="programs"?C.purple:C.green;
          return(<button key={item.id} onClick={()=>setActive(item.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:8,border:"none",cursor:"pointer",textAlign:"left",background:isActive?col+"18":"transparent",color:isActive?col:C.sub,fontWeight:isActive?700:500,fontSize:13}}>
            <span style={{fontSize:14}}>{item.icon}</span>{item.label}
            {counts[item.id]>0&&<span style={{marginLeft:"auto",background:col+"22",color:col,fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10}}>{counts[item.id]}</span>}
          </button>);
        })}
      </nav>
      <div style={{padding:"12px 14px",borderTop:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <Avatar name="J" size={30} color={C.purple}/>
          <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>Jordan Reeves</div><div style={{color:C.muted,fontSize:10}}>Head Coach</div></div>
        </div>
      </div>
    </aside>
  );
}

export default function App(){
  const [appState,setAppState]=useState("ready"); // loading | setup | ready
  const [view,setView]=useState("dashboard");
  const [clients,setClients]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [classes,setClasses]=useState([]);
  const [programs,setPrograms]=useState([]);
  const [formats,setFormats]=useState([]);
  const [activeClient,setActiveClient]=useState(null);
  const [toasts,toast]=useToast();

  // Load data on mount — works on your Netlify domain (not on claude.ai due to CORS)
  useEffect(()=>{
    (async()=>{
      try {
        const [c,s,cl,p,f]=await Promise.all([
          db.select("fitos_clients"),
          db.select("fitos_sessions"),
          db.select("fitos_classes"),
          db.select("fitos_programs"),
          db.select("fitos_formats"),
        ]);
        setClients(c.map(mapClient));
        setSessions(s.map(mapSession));
        setClasses(cl.map(mapClass));
        setPrograms(p.map(mapProgram));
        setFormats(f.map(mapFormat));
      } catch(e) {
        console.warn("Could not load from Supabase:", e.message);
      }
    })();
  },[]);

  const reload=async()=>{
    const [c,s,cl,p,f]=await Promise.all([
      db.select("fitos_clients"),db.select("fitos_sessions"),db.select("fitos_classes"),
      db.select("fitos_programs"),db.select("fitos_formats"),
    ]);
    setClients(c.map(mapClient)); setSessions(s.map(mapSession)); setClasses(cl.map(mapClass));
    setPrograms(p.map(mapProgram)); setFormats(f.map(mapFormat));
  };

  // ── Client CRUD
  const addClient=async f=>{
    const row={id:uid(),name:f.name,email:f.email,phone:f.phone,dob:f.dob,tag:f.tag,status:f.status,notes:f.notes,session_count:0};
    const r=await db.insert("fitos_clients",row);
    setClients(p=>[mapClient(r),...p]); toast("Client added ✓");
  };
  const editClient=async(id,f)=>{
    const patch={name:f.name,email:f.email,phone:f.phone,dob:f.dob,tag:f.tag,status:f.status,notes:f.notes};
    await db.update("fitos_clients",id,patch);
    setClients(p=>p.map(c=>c.id===id?{...c,...f}:c)); toast("Client updated ✓");
  };
  const deleteClient=async id=>{
    await db.delete("fitos_clients",id);
    setClients(p=>p.filter(c=>c.id!==id)); toast("Client deleted","error");
  };
  const updateClientRaw=async(id,patch)=>{
    await db.update("fitos_clients",id,patch);
    setClients(p=>p.map(c=>c.id===id?{...c,programId:patch.program_id}:c));
  };

  // ── Session CRUD
  const addSession=async s=>{
    const row={id:s.id,client_id:s.clientId,name:s.name,notes:s.notes,exercises:s.exercises,program_day:s.programDay,started_at:s.startedAt};
    const r=await db.insert("fitos_sessions",row);
    setSessions(p=>[mapSession(r),...p]);
    // increment session count
    const cl=clients.find(c=>c.id===s.clientId);
    if(cl){ await db.update("fitos_clients",s.clientId,{session_count:(cl.sessionCount||0)+1}); setClients(p=>p.map(c=>c.id===s.clientId?{...c,sessionCount:(c.sessionCount||0)+1}:c)); }
    toast("Session saved! 💪");
  };

  // ── Class CRUD
  const addClass=async f=>{
    const row={id:uid(),name:f.name,date:f.date,time:f.time,duration:Number(f.duration),capacity:Number(f.capacity),location:f.location,notes:f.notes,status:"scheduled",bookings:[]};
    const r=await db.insert("fitos_classes",row);
    setClasses(p=>[mapClass(r),...p]); toast("Class scheduled ✓");
  };
  const editClass=async(id,patch)=>{
    // convert camelCase fields to snake_case for DB
    const dbPatch={};
    if(patch.name!==undefined)dbPatch.name=patch.name;
    if(patch.date!==undefined)dbPatch.date=patch.date;
    if(patch.time!==undefined)dbPatch.time=patch.time;
    if(patch.duration!==undefined)dbPatch.duration=Number(patch.duration);
    if(patch.capacity!==undefined)dbPatch.capacity=Number(patch.capacity);
    if(patch.location!==undefined)dbPatch.location=patch.location;
    if(patch.notes!==undefined)dbPatch.notes=patch.notes;
    if(patch.status!==undefined)dbPatch.status=patch.status;
    if(patch.bookings!==undefined)dbPatch.bookings=patch.bookings;
    if(patch.format_id!==undefined){dbPatch.format_id=patch.format_id;dbPatch.format_name=patch.format_name;}
    await db.update("fitos_classes",id,dbPatch);
    setClasses(p=>p.map(c=>c.id!==id?c:{...c,...patch,formatId:patch.format_id??c.formatId,formatName:patch.format_name??c.formatName}));
    toast("Class updated ✓");
  };
  const deleteClass=async id=>{
    await db.delete("fitos_classes",id);
    setClasses(p=>p.filter(c=>c.id!==id)); toast("Class deleted","error");
  };

  // ── Program CRUD
  const addProgram=async p=>{
    const row={id:p.id,name:p.name,description:p.description,weeks:Number(p.weeks),days_per_week:Number(p.daysPerWeek),days:p.days,assigned_clients:p.assignedClients};
    const r=await db.insert("fitos_programs",row);
    setPrograms(ps=>[mapProgram(r),...ps]); toast("Program created ✓");
  };
  const updateProgram=async(id,p)=>{
    const patch={name:p.name,description:p.description,weeks:Number(p.weeks),days_per_week:Number(p.daysPerWeek),days:p.days,assigned_clients:p.assignedClients};
    await db.update("fitos_programs",id,patch);
    setPrograms(ps=>ps.map(pr=>pr.id===id?{...pr,...p}:pr));
  };
  const deleteProgram=async id=>{
    await db.delete("fitos_programs",id);
    setPrograms(ps=>ps.filter(p=>p.id!==id)); toast("Program deleted","error");
  };

  // ── Format CRUD
  const addFormat=async f=>{
    const row={id:f.id,name:f.name,type:f.type,description:f.description,total_duration:Number(f.totalDuration),work_sec:Number(f.workSec),rest_sec:Number(f.restSec),rounds:Number(f.rounds),stations:f.stations};
    const r=await db.insert("fitos_formats",row);
    setFormats(fs=>[mapFormat(r),...fs]); toast("Format created ✓");
  };
  const updateFormat=async(id,f)=>{
    const patch={name:f.name,type:f.type,description:f.description,total_duration:Number(f.totalDuration),work_sec:Number(f.workSec),rest_sec:Number(f.restSec),rounds:Number(f.rounds),stations:f.stations};
    await db.update("fitos_formats",id,patch);
    setFormats(fs=>fs.map(fmt=>fmt.id===id?{...fmt,...f}:fmt));
  };
  const deleteFormat=async id=>{
    await db.delete("fitos_formats",id);
    setFormats(fs=>fs.filter(f=>f.id!==id)); toast("Format deleted","error");
  };

  const navigate=v=>{if(v==="clients")setActiveClient(null);setView(v);};
  const TITLES={dashboard:"Dashboard",clients:"Clients",client:"Client Profile",sessions:"Log Session",classes:"Group Classes",programs:"Programs & Formats"};
  const SUBS={dashboard:`${clients.filter(c=>c.status==="active").length} active clients`,clients:`${clients.length} clients`,client:activeClient?.name||"",sessions:"Track sets, reps & weight",classes:`${classes.filter(c=>c.status==="scheduled").length} upcoming`,programs:`${programs.length} programs · ${formats.length} class formats`};
  const counts={clients:clients.length,programs:programs.length+formats.length,dashboard:0,sessions:0,classes:classes.filter(c=>c.status==="scheduled").length};

  if(appState==="loading")return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif"}}><Spinner msg="Connecting to database…"/></div>);
  if(appState==="setup")return <SetupScreen onSetupDone={()=>{ setAppState("loading"); reload().then(()=>setAppState("ready")); }}/>;

  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,overflow:"hidden",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`input[type=number]::-webkit-inner-spin-button{opacity:0.3} *{box-sizing:border-box;} input,select,button{font-family:inherit;}`}</style>
      <Sidebar active={view} setActive={navigate} counts={counts}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{height:54,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 22px",background:C.bg,flexShrink:0}}>
          <div><div style={{color:C.text,fontWeight:700,fontSize:16}}>{TITLES[view]}</div><div style={{color:C.muted,fontSize:11}}>{SUBS[view]}</div></div>
          <div style={{display:"flex",gap:8}}>
            {view==="client"&&<Btn variant="outline" style={{padding:"6px 12px",fontSize:11}} onClick={()=>navigate("clients")}>← All Clients</Btn>}
            {view==="dashboard"&&<Btn style={{padding:"6px 14px"}} onClick={()=>setView("sessions")}>⚡ Log Session</Btn>}
          </div>
        </div>
        <main style={{flex:1,overflowY:"auto",padding:20}}>
          {view==="dashboard"&&<Dashboard clients={clients} sessions={sessions} classes={classes} programs={programs} formats={formats} setView={setView} setActiveClient={setActiveClient}/>}
          {view==="clients"&&<ClientsScreen clients={clients} onAdd={addClient} onEdit={editClient} onDelete={deleteClient} programs={programs} setView={setView} setActiveClient={setActiveClient}/>}
          {view==="client"&&activeClient&&<ClientProfile client={clients.find(c=>c.id===activeClient.id)||activeClient} sessions={sessions} programs={programs} onEdit={editClient} setView={setView} setActiveClient={setActiveClient}/>}
          {view==="sessions"&&<SessionLogger clients={clients} sessions={sessions} onSave={addSession} activeClient={activeClient} programs={programs}/>}
          {view==="classes"&&<ClassesScreen clients={clients} classes={classes} onAdd={addClass} onEdit={editClass} onDelete={deleteClass} formats={formats}/>}
          {view==="programs"&&<ProgramsHub programs={programs} onSaveProgram={addProgram} onUpdateProgram={updateProgram} onDeleteProgram={deleteProgram} formats={formats} onSaveFormat={addFormat} onUpdateFormat={updateFormat} onDeleteFormat={deleteFormat} clients={clients} onUpdateClient={updateClientRaw} classes={classes} onUpdateClass={editClass}/>}
        </main>
      </div>
      <Toast toasts={toasts}/>
    </div>
  );
}
