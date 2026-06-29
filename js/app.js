/* ===== VYRONA APP.JS ===== */
/* Supabase is optional. App works 100% offline without it. */

let _sb = null; // Supabase client, null if not configured

/* ── SUPABASE HELPERS ── */
function getSbUrl(){ return localStorage.getItem('vy_sb_url') || ''; }
function getSbKey(){ return localStorage.getItem('vy_sb_key') || ''; }
function sbReady(){ return !!_sb; }

function initSb(){
  const url = getSbUrl(), key = getSbKey();
  if (!url || !key) { updateSyncUI('local'); return false; }
  if (typeof supabase === 'undefined' || !supabase.createClient) { updateSyncUI('local'); return false; }
  try { _sb = supabase.createClient(url, key); updateSyncUI('synced'); return true; }
  catch(e){ console.error('Supabase init:', e); updateSyncUI('error'); return false; }
}

async function sbLogin(email, pwd){
  if(!sbReady()) return {error:{message:'no_sb'}};
  try{ return await _sb.auth.signInWithPassword({email,password:pwd}); }
  catch(e){ return {error:{message:e.message}}; }
}
async function sbSignUp(email, pwd, name){
  if(!sbReady()) return {error:{message:'no_sb'}};
  try{ return await _sb.auth.signUp({email,password:pwd,options:{data:{full_name:name}}}); }
  catch(e){ return {error:{message:e.message}}; }
}
async function sbLogout(){ if(_sb) try{ await _sb.auth.signOut(); }catch(e){} }
async function sbSession(){ if(!_sb) return null; try{ const{data}=await _sb.auth.getSession(); return data?.session||null; }catch(e){ return null; } }

let _syncTimer=null, _rt=null;
function scheduleSync(){ if(!sbReady()||!state?.user?.sbId) return; clearTimeout(_syncTimer); _syncTimer=setTimeout(()=>pushCloud(true),3000); }
async function pushCloud(silent=true){
  if(!sbReady()||!state?.user?.sbId) return false;
  try{
    updateSyncUI('syncing');
    const payload={habits:state.habits,habitLogs:state.habitLogs,goals:state.goals,finance:state.finance,
      fitness:state.fitness,learning:state.learning,career:state.career,vitals:state.vitals,
      priorities:state.priorities,journal:state.journal,weeklyReviews:state.weeklyReviews,
      mitTasks:state.mitTasks,timeBlocks:state.timeBlocks,morningItems:state.morningItems,
      settings:state.settings,xp:state.xp,journalEntries:state.journalEntries,pomodoros:state.pomodoros};
    const{error}=await _sb.from('vyrona_data').upsert({user_id:state.user.sbId,user_email:state.user.email,data:payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error){ updateSyncUI('error'); return false; }
    updateSyncUI('synced'); if(!silent) showToast('☁️ Synced!'); return true;
  }catch(e){ updateSyncUI('error'); return false; }
}
async function pullCloud(uid){
  if(!sbReady()) return;
  try{
    updateSyncUI('syncing');
    const{data,error}=await _sb.from('vyrona_data').select('data,updated_at').eq('user_id',uid).single();
    if(error||!data){ await pushCloud(true); updateSyncUI('synced'); return; }
    const ct=new Date(data.updated_at).getTime(), lt=parseInt(localStorage.getItem('vy_last_save')||'0');
    if(ct>lt){
      const c=data.data;
      ['habits','habitLogs','goals','finance','fitness','learning','career','vitals','priorities',
       'journal','weeklyReviews','mitTasks','timeBlocks','morningItems','journalEntries','pomodoros']
        .forEach(k=>{ if(c[k]!==undefined) state[k]=c[k]; });
      if(c.settings) state.settings={...state.settings,...c.settings};
      if(c.xp!==undefined) state.xp=c.xp;
      saveLocal(); showToast('☁️ Data synced from cloud!');
    } else { await pushCloud(true); }
    updateSyncUI('synced');
  }catch(e){ updateSyncUI('error'); }
}
function subRealtime(uid){
  if(!sbReady()||!uid) return;
  if(_rt) _sb.removeChannel(_rt);
  _rt=_sb.channel('vyrona_'+uid).on('postgres_changes',{event:'UPDATE',schema:'public',table:'vyrona_data',filter:`user_id=eq.${uid}`},async()=>{ await pullCloud(uid); if(typeof showPage==='function') showPage(state.currentPage||'dashboard'); }).subscribe();
}
function updateSyncUI(status){
  const el=document.getElementById('sync-status'),box=document.getElementById('sb-status-box'),
    title=document.getElementById('sb-status-title'),sub=document.getElementById('sb-status-sub');
  const m={synced:{icon:'☁️',text:'Synced',color:'var(--green)',cls:'connected',t:'☁️ Connected to Supabase',s:'Data syncs across devices.'},
    syncing:{icon:'🔄',text:'Syncing…',color:'var(--yellow)',cls:'',t:'🔄 Syncing…',s:'Pushing to cloud.'},
    error:{icon:'⚠️',text:'Error',color:'var(--accent)',cls:'',t:'⚠️ Sync Error',s:'Check URL and key.'},
    local:{icon:'💾',text:'Local',color:'var(--text2)',cls:'',t:'💾 Local Only',s:'Add Supabase keys for cloud sync.'}}[status]||{icon:'💾',text:'Local',color:'var(--text2)',cls:'',t:'💾 Local Only',s:''};
  if(el) el.innerHTML=`<span style="color:${m.color}">${m.icon} ${m.text}</span>`;
  if(box) box.className='supabase-status-box '+m.cls;
  if(title) title.textContent=m.t; if(sub) sub.textContent=m.s;
}

/* ── AUTH (called from HTML onclick) ── */
function switchTab(tab){
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f=>f.classList.remove('active'));
  const btn=document.getElementById('tab-'+tab);
  if(btn) btn.classList.add('active');
  const form=document.getElementById(tab+'-form');
  if(form) form.classList.add('active');
  setMsg('');
}

async function doLogin(){
  const email=(document.getElementById('login-email')?.value||'').trim();
  const pwd=document.getElementById('login-password')?.value||'';
  if(!email||!pwd){ setMsg('❌ Fill in both fields'); return; }
  if(!email.includes('@')){ setMsg('❌ Enter a valid email'); return; }

  const btn=document.getElementById('login-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Logging in…'; }

  if(sbReady()){
    const{data,error}=await sbLogin(email,pwd);
    if(btn){ btn.disabled=false; btn.textContent='🚀 Login'; }
    if(error){
      setMsg(error.message==='Invalid login credentials'?'❌ Wrong email or password':'❌ '+error.message);
      return;
    }
    state.user={email,name:data.user.user_metadata?.full_name||email.split('@')[0],sbId:data.user.id};
    state.settings.name=state.settings.name||state.user.name;
    saveLocal(); setMsg('');
    await pullCloud(data.user.id);
    subRealtime(data.user.id);
    enterApp();
  } else {
    // Local-only: any email+password works
    if(btn){ btn.disabled=false; btn.textContent='🚀 Login'; }
    state.user={email,name:email.split('@')[0]};
    state.settings.name=state.settings.name||state.user.name;
    saveLocal(); setMsg('');
    enterApp();
    showToast('💾 Local mode — add Supabase keys in Settings for cloud sync');
  }
}

async function doSignup(){
  const name=(document.getElementById('signup-name')?.value||'').trim();
  const email=(document.getElementById('signup-email')?.value||'').trim();
  const pwd=document.getElementById('signup-password')?.value||'';
  if(!name||!email||!pwd){ setMsg('❌ Fill in all fields'); return; }
  if(!email.includes('@')){ setMsg('❌ Enter a valid email'); return; }
  if(pwd.length<6){ setMsg('❌ Password must be 6+ characters'); return; }
  setMsg('⏳ Creating account…');
  if(sbReady()){
    const{data,error}=await sbSignUp(email,pwd,name);
    if(error){ setMsg('❌ '+error.message); return; }
    if(data.user&&!data.session){ setMsg('✅ Check your email to confirm your account, then login!'); return; }
    state.user={email,name,sbId:data.user?.id};
    state.settings.name=name; saveLocal(); setMsg('');
    enterApp();
  } else {
    state.user={email,name};
    state.settings.name=name; saveLocal(); setMsg('');
    enterApp();
    showToast('✅ Account created — local mode!');
  }
}

function doDemo(){
  state.user={email:'demo@vyrona.app',name:'Sajay'};
  loadDemoData(); enterApp();
}

async function doLogout(){
  if(!confirm('Log out?')) return;
  if(sbReady()) await sbLogout();
  state.user=null; saveLocal();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  setMsg('');
}

function setMsg(m){ const el=document.getElementById('auth-msg'); if(el) el.textContent=m; }

let _enterAppDone=false;
function enterApp(){
  _enterAppDone=true;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const name=state.settings.name||state.user?.name||'Hero';
  const nav=document.getElementById('nav-name'); if(nav) nav.textContent=name;
  const av=document.getElementById('nav-avatar'); if(av) av.textContent=name[0].toUpperCase();
  applyTheme(state.settings.theme||'dark-oled');
  updateXPUI(); updateSyncUI(sbReady()?'synced':'local');
  renderDashboard(); updateTopbarDate();
  if(!window._tobarInt) window._tobarInt=setInterval(updateTopbarDate,60000);
}

/* ── SETTINGS SUPABASE ── */
async function connectSupabase(){
  const url=(document.getElementById('sb-url')?.value||'').trim();
  const key=(document.getElementById('sb-key')?.value||'').trim();
  if(!url||!key){ localStorage.removeItem('vy_sb_url'); localStorage.removeItem('vy_sb_key'); _sb=null; updateSyncUI('local'); showToast('Supabase disconnected'); return; }
  if(!url.startsWith('https://')){ showToast('❌ URL must start with https://'); return; }
  localStorage.setItem('vy_sb_url',url); localStorage.setItem('vy_sb_key',key);
  const ok=initSb();
  if(ok){ showToast('☁️ Connected! Log out and back in to sync your account.'); }
  else{ showToast('❌ Could not connect — check your keys'); }
}
async function manualSync(){
  if(!sbReady()||!state.user?.sbId){ showToast('Connect Supabase first and login'); return; }
  await pushCloud(false);
}
function copySQL(){
  const el=document.getElementById('sql-block'); if(!el) return;
  navigator.clipboard.writeText(el.textContent).then(()=>showToast('SQL copied!')).catch(()=>showToast('Select and copy manually'));
}

/* ── INIT ── */
function init(){
  loadState();
  initSb(); // sync, never blocks
  if(state.user){
    if(sbReady()&&state.user.sbId){
      sbSession().then(s=>{ if(s){ subRealtime(state.user.sbId); pullCloud(state.user.sbId); } else state.user.sbId=null; });
    }
    enterApp();
  } else {
    updateSyncUI(sbReady()?'synced':'local');
  }
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}


// ── STATE ─────────────────────────────────────────────
let state = {
  user: null,
  habits: [], habitLogs: {}, goals: [], finance: [],
  fitness: { workouts: [], measurements: {} },
  learning: [], career: [], vitals: {}, priorities: {},
  journal: {}, journalEntries: [], weeklyReviews: {},
  mitTasks: {}, timeBlocks: {}, morningItems: [],
  pomodoros: {}, // { "YYYY-MM-DD": count }
  settings: { theme: 'dark-oled', name: 'Hero', xpGoal: 500 },
  xp: 0, currentPage: 'dashboard',
  plannerDate: new Date(), currentFilter: 'all',
  goalFilter: 'all', financeFilter: 'all',
};

// ── LEVELS ────────────────────────────────────────────
const LEVELS = [
  {l:1,xp:0,title:'Rookie'},{l:2,xp:500,title:'Initiate'},{l:3,xp:1000,title:'Apprentice'},
  {l:4,xp:2000,title:'Warrior'},{l:5,xp:3500,title:'Champion'},{l:6,xp:5500,title:'Samurai'},
  {l:7,xp:8000,title:'Master'},{l:8,xp:11000,title:'Grandmaster'},{l:9,xp:15000,title:'Legend'},
  {l:10,xp:20000,title:'God Mode'},{l:11,xp:27000,title:'Transcendent'},{l:12,xp:35000,title:'Immortal'},
];
function getLevel(xp){
  let cur=LEVELS[0],nxt=LEVELS[1];
  for(let i=LEVELS.length-1;i>=0;i--){if(xp>=LEVELS[i].xp){cur=LEVELS[i];nxt=LEVELS[i+1]||null;break;}}
  return {cur,nxt};
}

// ── THEMES ────────────────────────────────────────────
const THEMES = [
  {id:'dark-oled',label:'⚫ Dark OLED',group:'dark'},
  {id:'purple-neon',label:'🟣 Purple Neon',group:'dark'},
  {id:'royal-blue',label:'🔵 Royal Blue',group:'dark'},
  {id:'midnight-city',label:'🌃 Midnight',group:'dark'},
  {id:'dracula',label:'🧛 Dracula',group:'dark'},
  {id:'red-samurai',label:'🔴 Samurai',group:'dark'},
  {id:'gold-elite',label:'💛 Gold Elite',group:'dark'},
  {id:'cyberpunk',label:'🤖 Cyberpunk',group:'dark'},
  {id:'matrix',label:'🟢 Matrix',group:'dark'},
  {id:'hacker',label:'👨‍💻 Hacker',group:'dark'},
  {id:'ocean',label:'🌊 Ocean',group:'dark'},
  {id:'forest',label:'🌲 Forest',group:'dark'},
  {id:'cafe-mocha',label:'☕ Café Mocha',group:'dark'},
  {id:'neon-80s',label:'🕹️ Neon 80s',group:'funny'},
  {id:'clean-white',label:'⚪ Clean White',group:'light'},
  {id:'minimal-green',label:'🌿 Mint',group:'light'},
  {id:'sakura',label:'🌸 Sakura',group:'light'},
  {id:'sky-blue',label:'☀️ Sky Blue',group:'light'},
  {id:'sunset',label:'🌅 Sunset',group:'light'},
  {id:'paper',label:'📄 Paper',group:'funny'},
  {id:'bubblegum',label:'🍭 Bubblegum',group:'funny'},
];

// ── QUOTES ────────────────────────────────────────────
const QUOTES = [
  "We are what we repeatedly do. Excellence, then, is not an act, but a habit. — Aristotle",
  "The secret of getting ahead is getting started. — Mark Twain",
  "Don't count the days, make the days count. — Muhammad Ali",
  "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
  "A year from now you may wish you had started today. — Karen Lamb",
  "Success is the sum of small efforts, repeated day in and day out. — Robert Collier",
  "It always seems impossible until it's done. — Nelson Mandela",
  "Your future is created by what you do today, not tomorrow.",
  "Small daily improvements over time lead to stunning results.",
  "The only bad workout is the one that didn't happen.",
  "Discipline is doing it even when you don't feel like it.",
  "You don't need motivation. You need discipline.",
  "Level up every single day. — Vyrona",
];

// ── BADGES ────────────────────────────────────────────
const ALL_BADGES = [
  {id:'first_habit',icon:'🌱',name:'Seed Planted',desc:'Add your first habit',xp:50,check:()=>state.habits.length>=1},
  {id:'habit5',icon:'✅',name:'Habit Builder',desc:'Create 5+ habits',xp:100,check:()=>state.habits.length>=5},
  {id:'streak3',icon:'🔥',name:'On Fire',desc:'3-day streak',xp:75,check:()=>getCurrentStreak()>=3},
  {id:'streak7',icon:'💥',name:'Week Warrior',desc:'7-day streak',xp:150,check:()=>getCurrentStreak()>=7},
  {id:'streak30',icon:'🏆',name:'30-Day Beast',desc:'30-day streak',xp:500,check:()=>getCurrentStreak()>=30},
  {id:'streak100',icon:'👑',name:'100 Days',desc:'100-day streak',xp:1000,check:()=>getCurrentStreak()>=100},
  {id:'xp500',icon:'⚡',name:'XP Hunter',desc:'Earn 500 XP',xp:50,check:()=>state.xp>=500},
  {id:'xp2000',icon:'🌟',name:'Power Grinder',desc:'Earn 2000 XP',xp:100,check:()=>state.xp>=2000},
  {id:'level5',icon:'🎮',name:'Mid Boss',desc:'Reach Level 5',xp:200,check:()=>getLevel(state.xp).cur.l>=5},
  {id:'level10',icon:'🐉',name:'Dragon Slayer',desc:'Reach Level 10',xp:500,check:()=>getLevel(state.xp).cur.l>=10},
  {id:'goal1',icon:'🎯',name:'Goal Setter',desc:'Add first goal',xp:50,check:()=>state.goals.length>=1},
  {id:'goal_done',icon:'🏅',name:'Goal Achiever',desc:'Complete a goal',xp:200,check:()=>state.goals.some(g=>g.status==='Done')},
  {id:'journal5',icon:'📓',name:'Journaler',desc:'Write 5 journal entries',xp:100,check:()=>state.journalEntries.length>=5},
  {id:'workout10',icon:'💪',name:'Gym Beast',desc:'Log 10 workouts',xp:150,check:()=>state.fitness.workouts.length>=10},
  {id:'save_money',icon:'💰',name:'Money Saver',desc:'Add 5 finance entries',xp:75,check:()=>state.finance.length>=5},
  {id:'learning3',icon:'📚',name:'Book Worm',desc:'Add 3+ courses',xp:100,check:()=>state.learning.length>=3},
  {id:'pomo5',icon:'🍅',name:'Focus Master',desc:'Complete 5 pomodoros',xp:100,check:()=>Object.values(state.pomodoros).reduce((a,b)=>a+b,0)>=5},
  {id:'quit_bad',icon:'🚭',name:'Quitter (Good!)',desc:'Add a bad habit to quit',xp:50,check:()=>state.habits.some(h=>h.type==='bad')},
  {id:'bad_clean',icon:'✨',name:'Clean Slate',desc:'Resist a bad habit 7 days',xp:200,check:()=>state.habits.filter(h=>h.type==='bad').some(h=>getHabitStats(h.id).streak>=7)},
  {id:'career5',icon:'💼',name:'Career Grinder',desc:'Log 5 career activities',xp:75,check:()=>state.career.length>=5},
  {id:'mood7',icon:'😊',name:'Mood Tracker',desc:'Log mood 7 days',xp:75,check:()=>Object.values(state.vitals).filter(v=>v.mood).length>=7},
  {id:'early_bird',icon:'🌅',name:'Early Bird',desc:'Have a Morning Routine habit',xp:50,check:()=>state.habits.some(h=>h.category==='Morning')},
];

// ── DATE UTILS ────────────────────────────────────────
const todayStr=()=>{const d=new Date();return fmtDate(d)};
function fmtDate(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function fmtShort(s){const d=new Date(s+'T00:00:00');return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
function fmtFull(s){const d=new Date(s+'T00:00:00');return d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ── STORAGE ───────────────────────────────────────────
function saveState(){saveLocal();scheduleSync();}
function saveLocal(){
  try{localStorage.setItem('vyrona_state',JSON.stringify(state));localStorage.setItem('vy_last_save',Date.now().toString());}catch(e){}
}
function loadState(){
  try{
    const r=localStorage.getItem('vyrona_state');
    if(r){const l=JSON.parse(r);state={...state,...l,plannerDate:new Date()};}
  }catch(e){}
}









// ── NAV ───────────────────────────────────────────────
function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const ni=document.querySelector(`[data-page="${page}"]`);
  if(ni)ni.classList.add('active');
  state.currentPage=page;
  const titles={dashboard:'Dashboard',habits:'Habit Tracker',daily:'Daily Planner',goals:'Goals — RPG Mode',
    journal:'Journal & Mood',finance:'Finance',fitness:'Fitness',learning:'Learning',
    career:'Career',weekly:'Weekly Review',achievements:'Achievements',settings:'Settings'};
  document.getElementById('topbar-title').textContent=titles[page]||page;
  const renders={dashboard:renderDashboard,habits:renderHabits,daily:renderDailyPlanner,goals:renderGoals,
    journal:renderJournal,finance:renderFinance,fitness:renderFitness,learning:renderLearning,
    career:renderCareer,weekly:renderWeekly,achievements:renderAchievements,settings:renderSettings};
  if(renders[page])renders[page]();
  if(window.innerWidth<=768)closeSidebar();
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('active');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('active');}
function updateTopbarDate(){
  const now=new Date();
  document.getElementById('topbar-date').textContent=now.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
  const hr=now.getHours();
  const name=(state.settings?.name||state.user?.name||'Hero').split(' ')[0];
  let g=hr<5?'🌙 Good Night':hr<12?'🌅 Good Morning':hr<17?'☀️ Good Afternoon':'🌙 Good Evening';
  const el=document.getElementById('greeting-text');
  if(el)el.textContent=`${g}, ${name}! Let's crush it 💪`;
  const qel=document.getElementById('quote-text');
  if(qel){const q=QUOTES[new Date().getDate()%QUOTES.length];qel.textContent=`"${q}"`;}
}
function applyTheme(t){document.body.setAttribute('data-theme',t||'dark-oled');}

// ── XP ────────────────────────────────────────────────
function addXP(amt,label){state.xp+=amt;saveState();updateXPUI();showXPPop(`+${amt} XP — ${label}`);}
function showXPPop(txt){const el=document.getElementById('xp-popup');el.textContent='⚡ '+txt;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),2500);}
function updateXPUI(){
  const{cur,nxt}=getLevel(state.xp);
  const pct=nxt?Math.round(((state.xp-cur.xp)/(nxt.xp-cur.xp))*100):100;
  const lbl=nxt?`${state.xp-cur.xp} / ${nxt.xp-cur.xp} XP`:`${state.xp} XP — MAX`;
  const bar=document.getElementById('nav-xp-bar');if(bar)bar.style.width=pct+'%';
  const lel=document.getElementById('nav-xp-label');if(lel)lel.textContent=lbl;
  const lvl=document.getElementById('nav-level');if(lvl)lvl.textContent=`⚡ Level ${cur.l} — ${cur.title}`;
  const txp=document.getElementById('topbar-xp');if(txp)txp.textContent=`⚡ ${state.xp} XP`;
  const kxp=document.getElementById('kpi-xp');if(kxp)kxp.textContent=state.xp;
  const klv=document.getElementById('kpi-level');if(klv)klv.textContent=cur.l;
}

// ── DASHBOARD ─────────────────────────────────────────
function renderDashboard(){
  updateTopbarDate();updateXPUI();
  renderTodayHabits();renderHeatmap();renderBadgesPreview();
  loadVitals();loadPriorities();
  const today=todayStr();
  const logs=state.habitLogs[today]||{};
  const goodHabits=state.habits.filter(h=>h.type!=='bad');
  const pct=goodHabits.length?Math.round((Object.keys(logs).length/goodHabits.length)*100):0;
  setKPI('kpi-today',pct+'%');setKPI('kpi-streak',getCurrentStreak());
  // Finance savings
  const income=state.finance.filter(f=>f.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense=state.finance.filter(f=>f.type==='expense').reduce((a,b)=>a+b.amount,0);
  setKPI('kpi-savings','₹'+(income-expense).toLocaleString('en-IN'));
  // Learning hours
  const lh=state.learning.reduce((a,b)=>a+b.doneHours,0);
  setKPI('kpi-learn',lh+'h');
  // Goals done
  setKPI('kpi-goals',state.goals.filter(g=>g.status==='Done').length);
  setKPI('kpi-workouts',state.fitness.workouts.length);
  // Vitals KPI
  const v=state.vitals[today]||{};
  setKPI('kpi-mood',v.mood||'—');setKPI('kpi-sleep',v.sleep?v.sleep+'h':'—');
  setKPI('kpi-steps',v.steps?v.steps.toLocaleString('en-IN'):'—');
  setKPI('kpi-water',v.water?v.water+'L':'—');
}
function setKPI(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function renderTodayHabits(){
  const c=document.getElementById('today-habits-list');if(!c)return;
  const today=todayStr();const logs=state.habitLogs[today]||{};
  if(!state.habits.length){c.innerHTML=`<p class="empty-msg">No habits yet. <a href="#" onclick="showPage('habits')">Add one →</a></p>`;return;}
  c.innerHTML=state.habits.map(h=>{
    const done=!!logs[h.id];
    const isBad=h.type==='bad';
    const doneCls=done?(isBad?'bad-done':'done'):'';
    const checkTxt=done?'✓':'';
    return`<div class="today-habit-item ${doneCls}" onclick="toggleHabitToday('${h.id}')">
      <div class="habit-check">${checkTxt}</div>
      <span>${h.icon||'✅'}</span>
      <span class="habit-name">${esc(h.name)}</span>
      ${isBad?`<span class="bad-tag">Quit</span>`:''}
      <span class="habit-xp ${isBad?'bad-xp':'good-xp'}">${isBad?'-'+h.penalty+'XP':'+'+h.xp+'XP'}</span>
    </div>`;
  }).join('');
}
function toggleHabitToday(id){
  const today=todayStr();
  if(!state.habitLogs[today])state.habitLogs[today]={};
  const h=state.habits.find(h=>h.id===id);if(!h)return;
  const isBad=h.type==='bad';
  if(state.habitLogs[today][id]){
    delete state.habitLogs[today][id];
    if(!isBad){state.xp=Math.max(0,state.xp-h.xp);}
    else{state.xp=Math.max(0,state.xp-h.penalty);}
    showToast('Unchecked ✗');
  } else {
    state.habitLogs[today][id]={time:new Date().toISOString()};
    if(!isBad){state.xp+=h.xp;showXPPop(`+${h.xp} XP — ${h.name} ✅`);}
    else{// Bad habit: lose XP for doing it
      state.xp=Math.max(0,state.xp-h.penalty);
      showToast(`😔 ${h.name} — relapsed. -${h.penalty} XP. Don't give up!`);
    }
  }
  saveState();updateXPUI();renderTodayHabits();renderHeatmap();
  if(state.currentPage==='habits')renderHabits();
  const today2=todayStr();const logs=state.habitLogs[today2]||{};
  const good=state.habits.filter(h=>h.type!=='bad');
  setKPI('kpi-today',good.length?Math.round((Object.keys(logs).length/good.length)*100)+'%':'0%');
  setKPI('kpi-streak',getCurrentStreak());
}

// ── STREAKS ───────────────────────────────────────────
function getCurrentStreak(){
  if(!state.habits.length)return 0;
  let streak=0;const d=new Date();
  while(streak<365){
    const key=fmtDate(d);
    const logs=state.habitLogs[key]||{};
    const cnt=Object.keys(logs).length;
    if(cnt===0&&key!==todayStr())break;
    if(cnt>0)streak++;
    d.setDate(d.getDate()-1);
  }
  return streak;
}
function getHabitStats(hid){
  const h=state.habits.find(h=>h.id===hid);if(!h)return{streak:0,longest:0,completions:0,rate:0};
  const created=new Date((h.createdAt||todayStr())+'T00:00:00');
  const totalDays=Math.max(1,Math.ceil((new Date()-created)/86400000)+1);
  const allKeys=Object.keys(state.habitLogs).sort();
  let completions=0;allKeys.forEach(k=>{if(state.habitLogs[k][hid])completions++;});
  let streak=0;const d2=new Date();
  while(streak<365){
    const k=fmtDate(d2);
    if(state.habitLogs[k]&&state.habitLogs[k][hid])streak++;
    else if(k!==todayStr())break;
    d2.setDate(d2.getDate()-1);
  }
  let longest=0,cur=0;
  allKeys.forEach(k=>{if(state.habitLogs[k][hid]){cur++;longest=Math.max(longest,cur);}else cur=0;});
  return{streak,longest,completions,rate:Math.round((completions/totalDays)*100)};
}

// ── HEATMAP ───────────────────────────────────────────
function renderHeatmap(){
  const c=document.getElementById('heatmap-container');if(!c)return;
  const today=new Date();const cells=[];
  for(let i=29;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);
    const k=fmtDate(d);const logs=state.habitLogs[k]||{};
    const cnt=Object.keys(logs).length;const tot=state.habits.length||1;
    const pct=cnt/tot;
    let lv=0;if(pct>0)lv=1;if(pct>=0.4)lv=2;if(pct>=0.7)lv=3;if(pct>=1)lv=4;
    cells.push(`<div class="heatmap-cell lv${lv}" title="${fmtShort(k)}: ${cnt}/${tot}"></div>`);
  }
  c.innerHTML=`<div class="heatmap-grid">${cells.join('')}</div>`;
}

// ── BADGES ────────────────────────────────────────────
function renderBadgesPreview(){
  const c=document.getElementById('badges-preview');if(!c)return;
  const top=ALL_BADGES.slice(0,8);
  c.innerHTML=top.map(b=>{const e=b.check();return`<div class="badge-item ${e?'earned':'locked'}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div></div>`;}).join('');
}
function renderAchievements(){
  const earned=ALL_BADGES.filter(b=>b.check()).length;
  setKPI('ach-earned',earned);setKPI('ach-locked',ALL_BADGES.length-earned);
  setKPI('ach-xp',ALL_BADGES.filter(b=>b.check()).reduce((a,b)=>a+b.xp,0));
  setKPI('ach-pct',Math.round((earned/ALL_BADGES.length)*100)+'%');
  const c=document.getElementById('all-achievements');if(!c)return;
  c.innerHTML=ALL_BADGES.map(b=>{const e=b.check();return`<div class="ach-card ${e?'earned':'locked'}">
    <div class="ach-icon">${b.icon}</div>
    <div class="ach-name">${b.name}</div>
    <div class="ach-desc">${b.desc}</div>
    <div class="ach-xp">+${b.xp} XP</div>
  </div>`;}).join('');
}

// ── VITALS ────────────────────────────────────────────
function loadVitals(){
  const today=todayStr();const v=state.vitals[today]||{};
  ['sleep','water','steps','weight'].forEach(f=>{const el=document.getElementById('vital-'+f);if(el&&v[f]!=null)el.value=v[f];});
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.toggle('active',b.dataset.mood===v.mood));
}
function saveVitals(){
  const today=todayStr();if(!state.vitals[today])state.vitals[today]={};
  ['sleep','water','steps','weight'].forEach(f=>{const el=document.getElementById('vital-'+f);if(el&&el.value)state.vitals[today][f]=parseFloat(el.value);});
  saveState();
}
function setMood(emoji,label){
  const today=todayStr();if(!state.vitals[today])state.vitals[today]={};
  state.vitals[today].mood=emoji;state.vitals[today].moodLabel=label;
  saveState();
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.toggle('active',b.dataset.mood===emoji));
  setKPI('kpi-mood',emoji);showToast('Mood: '+emoji+' '+label);
}

// ── PRIORITIES ────────────────────────────────────────
function loadPriorities(){
  const today=todayStr();const list=state.priorities[today]||[];renderPriList(list);
}
function renderPriList(list){
  const c=document.getElementById('priorities-list');if(!c)return;
  c.innerHTML=list.map((t,i)=>`<div class="priority-item">
    <div class="priority-num">${i+1}</div>
    <input class="priority-text" value="${esc(t)}" placeholder="Priority ${i+1}…" onchange="updPri(${i},this.value)"/>
    <button class="priority-del" onclick="delPri(${i})">✕</button>
  </div>`).join('');
}
function addPriority(){
  const today=todayStr();if(!state.priorities[today])state.priorities[today]=[];
  if(state.priorities[today].length>=3){showToast('Max 3!');return;}
  state.priorities[today].push('');saveState();loadPriorities();
}
function updPri(i,v){const t=todayStr();if(state.priorities[t])state.priorities[t][i]=v;saveState();}
function delPri(i){const t=todayStr();if(state.priorities[t]){state.priorities[t].splice(i,1);saveState();renderPriList(state.priorities[t]||[]);}}

// ── HABITS ────────────────────────────────────────────
const HABIT_ICONS=['✅','🏃','💪','📚','🧘','💧','🌅','🥗','💰','💼','🎯','🎸','✍️','🧹','😴','❤️','🚴','🏊','🍎','☕','📱','🚭','🍺','🎮','🍕','🛋️'];
const HABIT_CATS=['Morning','Fitness','Health','Learning','Career','Finance','Mental','Productivity','Social','Hobby'];

function openHabitModal(editId=null,forceType=null){
  const h=editId?state.habits.find(h=>h.id===editId):null;
  const isBad=forceType==='bad'||(h&&h.type==='bad');
  document.getElementById('modal-title').textContent=h?(isBad?'Edit Bad Habit':'Edit Good Habit'):(isBad?'🚫 Quit a Bad Habit':'✅ Add Good Habit');
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Habit Name *</label><input type="text" id="h-name" class="settings-input" placeholder="${isBad?'e.g. Smoking, Scrolling, Junk Food':'e.g. Morning Workout, Read 30 mins'}" value="${h?esc(h.name):''}"/></div>
    <div class="form-group"><label>Icon</label>
      <div class="icon-pick-grid">${HABIT_ICONS.map(ic=>`<button type="button" class="icon-pick ${h&&h.icon===ic?'active':''}" onclick="pickIcon(this,'${ic}')">${ic}</button>`).join('')}</div>
      <input type="hidden" id="h-icon" value="${h?h.icon:isBad?'🚫':'✅'}"/>
    </div>
    <div class="form-group"><label>Category</label>
      <select id="h-cat" class="settings-input">${HABIT_CATS.map(c=>`<option value="${c}" ${h&&h.category===c?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    ${!isBad?`
    <div class="form-group"><label>XP Reward</label><input type="number" id="h-xp" class="settings-input" value="${h?h.xp:50}" min="10" max="200" step="10"/></div>
    `:''}
    <div class="form-group"><label>${isBad?'XP Lost if you DO it (penalty)':'XP Penalty if you miss'}</label><input type="number" id="h-penalty" class="settings-input" value="${h?h.penalty:20}" min="0" max="100" step="5"/></div>
    <div class="form-group"><label>Difficulty</label>
      <select id="h-diff" class="settings-input">${['Easy','Medium','Hard','Extreme'].map(d=>`<option value="${d}" ${h&&h.difficulty===d?'selected':''}>${d}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Notes</label><input type="text" id="h-notes" class="settings-input" value="${h?esc(h.notes||'):''}"/></div>
    <input type="hidden" id="h-type" value="${isBad?'bad':'good'}"/>
    <button class="btn-primary" onclick="saveHabit('${editId||''}')">💾 ${h?'Update':'Save'} Habit</button>`;
  openModal();
}
function pickIcon(btn,icon){document.querySelectorAll('.icon-pick').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('h-icon').value=icon;}
function saveHabit(editId){
  const name=document.getElementById('h-name').value.trim();if(!name){showToast('Name required!');return;}
  const isBad=document.getElementById('h-type').value==='bad';
  const h={
    id:editId||'h_'+Date.now(),name,icon:document.getElementById('h-icon').value||'✅',
    category:document.getElementById('h-cat').value,
    xp:isBad?0:parseInt(document.getElementById('h-xp')?.value)||50,
    penalty:parseInt(document.getElementById('h-penalty').value)||20,
    difficulty:document.getElementById('h-diff').value,
    notes:document.getElementById('h-notes').value.trim(),
    type:isBad?'bad':'good',
    createdAt:editId?(state.habits.find(h=>h.id===editId)?.createdAt||todayStr()):todayStr(),
  };
  if(editId){const idx=state.habits.findIndex(h=>h.id===editId);if(idx>-1)state.habits[idx]=h;}
  else{state.habits.push(h);if(!isBad)addXP(10,'New Habit Added');}
  saveState();closeModal();renderHabits();renderTodayHabits();
  showToast(editId?'Habit updated!':'Habit added! 🎉');
}
function deleteHabit(id){
  if(!confirm('Delete habit?'))return;
  state.habits=state.habits.filter(h=>h.id!==id);saveState();renderHabits();renderTodayHabits();showToast('Deleted');
}
function filterHabits(f){
  state.currentFilter=f;
  document.querySelectorAll('#habit-filters .chip').forEach(c=>c.classList.toggle('active',c.dataset.filter===f));
  renderHabits();
}
function renderHabits(){
  const c=document.getElementById('habits-list');if(!c)return;
  let filtered=state.habits;
  if(state.currentFilter==='good')filtered=filtered.filter(h=>h.type!=='bad');
  else if(state.currentFilter==='bad')filtered=filtered.filter(h=>h.type==='bad');
  else if(state.currentFilter!=='all')filtered=filtered.filter(h=>h.category===state.currentFilter);
  if(!filtered.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">${state.currentFilter==='bad'?'🚭':'✅'}</div><h3>No habits here</h3><p>Add a habit to get started</p><button class="btn-primary" onclick="openHabitModal()">+ Add Habit</button></div>`;return;}
  const today=todayStr();
  c.innerHTML=filtered.map(h=>{
    const logs=state.habitLogs[today]||{};const done=!!logs[h.id];const isBad=h.type==='bad';
    const stats=getHabitStats(h.id);
    return`<div class="habit-card ${isBad?'bad-habit':'good-habit'}">
      <div class="habit-card-header">
        <div class="habit-card-icon">${h.icon}</div>
        <div class="habit-card-info">
          <div class="habit-card-name">${esc(h.name)} ${isBad?'<span class="bad-tag">🚫 Quit</span>':''}</div>
          <div class="habit-card-meta"><span>${h.category}</span><span>•</span><span>${h.difficulty}</span><span>•</span><span style="color:${isBad?'var(--accent)':'var(--xp)'}">${isBad?'-'+h.penalty+' XP if done':'+'+h.xp+' XP'}</span></div>
        </div>
        <div class="habit-card-actions">
          <button class="btn-icon" onclick="toggleHabitOnDate('${h.id}','${today}')" style="${done?(isBad?'border-color:var(--accent);color:var(--accent)':'border-color:var(--green);color:var(--green)'):''}">${done?(isBad?'😞 Done':'✅'):'○'}</button>
          <button class="btn-icon" onclick="openHabitModal('${h.id}')">✏️</button>
          <button class="btn-icon" onclick="deleteHabit('${h.id}')">🗑️</button>
        </div>
      </div>
      <div class="habit-stats">
        <div class="habit-stat"><div class="habit-stat-val">🔥${stats.streak}</div><div class="habit-stat-lbl">${isBad?'Clean Days':'Streak'}</div></div>
        <div class="habit-stat"><div class="habit-stat-val">${stats.longest}</div><div class="habit-stat-lbl">Best</div></div>
        <div class="habit-stat"><div class="habit-stat-val">${stats.completions}</div><div class="habit-stat-lbl">${isBad?'Relapses':'Done'}</div></div>
        <div class="habit-stat"><div class="habit-stat-val">${isBad?100-stats.rate:stats.rate}%</div><div class="habit-stat-lbl">${isBad?'Clean Rate':'Rate'}</div></div>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill ${isBad?'red':'green'}" style="width:${isBad?100-stats.rate:stats.rate}%"></div></div>
      <div class="progress-bar-label">${isBad?'Clean rate: '+(100-stats.rate)+'%':'Consistency: '+stats.rate+'%'}</div>
    </div>`;
  }).join('');
}
function toggleHabitOnDate(hid,dateKey){
  if(!state.habitLogs[dateKey])state.habitLogs[dateKey]={};
  const h=state.habits.find(h=>h.id===hid);if(!h)return;
  const isBad=h.type==='bad';
  if(state.habitLogs[dateKey][hid]){delete state.habitLogs[dateKey][hid];state.xp=Math.max(0,state.xp-(isBad?-h.penalty:h.xp));}
  else{state.habitLogs[dateKey][hid]={time:new Date().toISOString()};state.xp+=isBad?-h.penalty:h.xp;state.xp=Math.max(0,state.xp);}
  saveState();updateXPUI();renderHabits();if(state.currentPage==='dashboard')renderDashboard();
}

// ── DAILY PLANNER ─────────────────────────────────────
function renderDailyPlanner(){
  const k=fmtDate(state.plannerDate);
  document.getElementById('planner-date-label').textContent=fmtFull(k);
  loadMIT(k);loadTimeBlocks(k);loadJournalDay(k);loadMorning();renderPomoCount();
}
function changeDay(dir){state.plannerDate.setDate(state.plannerDate.getDate()+dir);renderDailyPlanner();}
// MIT
function addMIT(){const k=fmtDate(state.plannerDate);if(!state.mitTasks[k])state.mitTasks[k]=[];state.mitTasks[k].push({text:'',done:false});saveState();loadMIT(k);}
function loadMIT(k){
  const list=state.mitTasks[k]||[];const c=document.getElementById('mit-list');if(!c)return;
  c.innerHTML=list.map((t,i)=>`<div class="task-item">
    <input type="checkbox" ${t.done?'checked':''} onchange="toggleMIT('${k}',${i},this.checked)"/>
    <input type="text" value="${esc(t.text)}" placeholder="Task ${i+1}…" onchange="updMIT('${k}',${i},this.value)" style="${t.done?'text-decoration:line-through;opacity:.5':''}"/>
    <button class="priority-del" onclick="delMIT('${k}',${i})">✕</button>
  </div>`).join('');
}
function updMIT(k,i,v){if(state.mitTasks[k])state.mitTasks[k][i].text=v;saveState();}
function toggleMIT(k,i,v){if(state.mitTasks[k]){state.mitTasks[k][i].done=v;if(v)addXP(20,'Task Completed');saveState();loadMIT(k);}}
function delMIT(k,i){if(state.mitTasks[k]){state.mitTasks[k].splice(i,1);saveState();loadMIT(k);}}
// Time Blocks
function addTimeBlock(){const k=fmtDate(state.plannerDate);if(!state.timeBlocks[k])state.timeBlocks[k]=[];const h=6+state.timeBlocks[k].length*2;state.timeBlocks[k].push({time:`${String(Math.min(h,22)).padStart(2,'0')}:00`,text:''});saveState();loadTimeBlocks(k);}
function loadTimeBlocks(k){
  const list=state.timeBlocks[k]||[];const c=document.getElementById('time-blocks');if(!c)return;
  c.innerHTML=list.map((b,i)=>`<div class="time-block">
    <input type="time" class="time-block-time" value="${b.time}" onchange="updBlock('${k}',${i},'time',this.value)"/>
    <input type="text" class="time-block-input" value="${esc(b.text)}" placeholder="What are you doing?" onchange="updBlock('${k}',${i},'text',this.value)"/>
    <button class="priority-del" onclick="delBlock('${k}',${i})">✕</button>
  </div>`).join('');
}
function updBlock(k,i,f,v){if(state.timeBlocks[k])state.timeBlocks[k][i][f]=v;saveState();}
function delBlock(k,i){if(state.timeBlocks[k]){state.timeBlocks[k].splice(i,1);saveState();loadTimeBlocks(k);}}
// Morning Routine
const DEFAULT_MORNING=['Wake up early','10 min meditation','Exercise','Cold shower','Healthy breakfast'];
function loadMorning(){
  if(!state.morningItems.length)state.morningItems=DEFAULT_MORNING.map(t=>({text:t,done:false,date:''}));
  const today=todayStr();const c=document.getElementById('morning-routine');if(!c)return;
  c.innerHTML=state.morningItems.map((m,i)=>`<div class="check-item">
    <input type="checkbox" ${m.date===today&&m.done?'checked':''} onchange="toggleMorning(${i},this.checked)"/>
    <span>${esc(m.text)}</span>
    <button class="priority-del" onclick="delMorning(${i})">✕</button>
  </div>`).join('');
}
function toggleMorning(i,v){if(state.morningItems[i]){state.morningItems[i].done=v;state.morningItems[i].date=v?todayStr():'';if(v)addXP(5,'Morning Routine');saveState();}}
function addMorningItem(){state.morningItems.push({text:'New routine item',done:false,date:''});saveState();loadMorning();}
function delMorning(i){state.morningItems.splice(i,1);saveState();loadMorning();}
// Journal
function loadJournalDay(k){
  const j=state.journal[k]||{};
  const t=document.getElementById('daily-journal');if(t)t.value=j.text||'';
  const w=document.getElementById('reflect-wins');if(w)w.value=j.wins||'';
  const l=document.getElementById('reflect-lessons');if(l)l.value=j.lessons||'';
  const g=document.getElementById('reflect-gratitude');if(g)g.value=j.gratitude||'';
  const tm=document.getElementById('reflect-tomorrow');if(tm)tm.value=j.tomorrow||'';
}
function saveJournal(){
  const k=fmtDate(state.plannerDate);if(!state.journal[k])state.journal[k]={};
  const t=document.getElementById('daily-journal');if(t)state.journal[k].text=t.value;
  saveState();showToast('Journal saved! ✍️');addXP(10,'Journal Entry');
}
function saveReflection(){
  const k=fmtDate(state.plannerDate);if(!state.journal[k])state.journal[k]={};
  const w=document.getElementById('reflect-wins');if(w)state.journal[k].wins=w.value;
  const l=document.getElementById('reflect-lessons');if(l)state.journal[k].lessons=l.value;
  const g=document.getElementById('reflect-gratitude');if(g)state.journal[k].gratitude=g.value;
  const tm=document.getElementById('reflect-tomorrow');if(tm)state.journal[k].tomorrow=tm.value;
  saveState();showToast('Reflection saved! 🌙');addXP(15,'Evening Reflection');
}

// ── POMODORO ──────────────────────────────────────────
let _pomoTimer=null,_pomoSeconds=25*60,_pomoTotal=25*60,_pomoRunning=false,_pomoLabel='Focus';
function setPomoMode(mins,label){
  clearInterval(_pomoTimer);_pomoRunning=false;_pomoSeconds=mins*60;_pomoTotal=mins*60;_pomoLabel=label;
  document.querySelectorAll('.pomo-mode').forEach(b=>b.classList.toggle('active',b.textContent.startsWith(label[0])));
  updatePomoDisplay();
  const btn=document.getElementById('pomo-btn');if(btn)btn.textContent='▶ Start';
}
function togglePomo(){
  if(_pomoRunning){clearInterval(_pomoTimer);_pomoRunning=false;document.getElementById('pomo-btn').textContent='▶ Resume';}
  else{
    _pomoRunning=true;document.getElementById('pomo-btn').textContent='⏸ Pause';
    _pomoTimer=setInterval(()=>{
      _pomoSeconds--;updatePomoDisplay();
      if(_pomoSeconds<=0){
        clearInterval(_pomoTimer);_pomoRunning=false;
        document.getElementById('pomo-btn').textContent='▶ Start';
        const today=todayStr();state.pomodoros[today]=(state.pomodoros[today]||0)+1;
        saveState();renderPomoCount();addXP(30,'Pomodoro Completed 🍅');
        showToast('🍅 Pomodoro done! +30 XP');
        if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('Vyrona',{body:'Pomodoro complete! Time for a break 🍅'});
      }
    },1000);
  }
}
function resetPomo(){clearInterval(_pomoTimer);_pomoRunning=false;_pomoSeconds=_pomoTotal;updatePomoDisplay();const btn=document.getElementById('pomo-btn');if(btn)btn.textContent='▶ Start';}
function updatePomoDisplay(){
  const m=Math.floor(_pomoSeconds/60);const s=_pomoSeconds%60;
  const el=document.getElementById('pomo-time');if(el)el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const circle=document.getElementById('pomo-circle');if(circle){const pct=_pomoSeconds/_pomoTotal;circle.style.strokeDashoffset=327*(1-pct);}
}
function renderPomoCount(){const el=document.getElementById('pomo-count');if(el)el.textContent=state.pomodoros[todayStr()]||0;}

// ── GOALS ─────────────────────────────────────────────
const GOAL_CATS=['Career','Finance','Health','Learning','Travel','Family','Fitness','Personal','Business','Hobby'];
function openGoalModal(editId=null){
  const g=editId?state.goals.find(g=>g.id===editId):null;
  document.getElementById('modal-title').textContent=g?'Edit Quest':'New Quest 🎯';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Goal Title *</label><input type="text" id="g-title" class="settings-input" value="${g?esc(g.title):''}" placeholder="e.g. SAP Certification, Buy a Bike"/></div>
    <div class="form-group"><label>Why? (Vision)</label><input type="text" id="g-vision" class="settings-input" value="${g?esc(g.vision||''):''}" placeholder="Why does this matter?"/></div>
    <div class="form-group"><label>Category</label>
      <select id="g-cat" class="settings-input">${GOAL_CATS.map(c=>`<option value="${c}" ${g&&g.category===c?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Priority</label>
      <select id="g-pri" class="settings-input"><option value="High" ${!g||g.priority==='High'?'selected':''}>🔴 High</option><option value="Medium" ${g&&g.priority==='Medium'?'selected':''}>🟡 Medium</option><option value="Low" ${g&&g.priority==='Low'?'selected':''}>🟢 Low</option></select>
    </div>
    <div class="form-group"><label>Deadline</label><input type="date" id="g-deadline" class="settings-input" value="${g?g.deadline:''}"/></div>
    <div class="form-group"><label>Difficulty</label>
      <select id="g-diff" class="settings-input">${['⭐ Easy','⭐⭐ Medium','⭐⭐⭐ Hard','⭐⭐⭐⭐ Epic','⭐⭐⭐⭐⭐ Legendary'].map(d=>`<option value="${d}" ${g&&g.difficulty===d?'selected':''}>${d}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>XP Reward</label><input type="number" id="g-xp" class="settings-input" value="${g?g.xpReward:500}" min="100" step="100"/></div>
    <div class="form-group"><label>Progress (0–100)</label><input type="number" id="g-prog" class="settings-input" value="${g?g.progress:0}" min="0" max="100"/></div>
    <div class="form-group"><label>Status</label>
      <select id="g-status" class="settings-input"><option value="Active" ${!g||g.status==='Active'?'selected':''}>🔵 Active</option><option value="Done" ${g&&g.status==='Done'?'selected':''}>✅ Done</option><option value="Paused" ${g&&g.status==='Paused'?'selected':''}>⏸ Paused</option></select>
    </div>
    <div class="form-group"><label>Milestones (one per line)</label><textarea id="g-milestones" class="settings-input" style="min-height:70px" placeholder="Learn IAM&#10;Setup EC2&#10;Pass exam">${g&&g.milestones?g.milestones.map(m=>m.text).join('\n'):''}</textarea></div>
    <button class="btn-primary" onclick="saveGoal('${editId||''}')">💾 Save Quest</button>`;
  openModal();
}
function saveGoal(editId){
  const title=document.getElementById('g-title').value.trim();if(!title){showToast('Title required!');return;}
  const milestoneText=document.getElementById('g-milestones').value;
  const oldMilestones=editId?(state.goals.find(g=>g.id===editId)?.milestones||[]):[];
  const milestones=milestoneText.split('\n').filter(m=>m.trim()).map((text,i)=>({text:text.trim(),done:oldMilestones[i]?.done||false}));
  const g={
    id:editId||'g_'+Date.now(),title,vision:document.getElementById('g-vision').value.trim(),
    category:document.getElementById('g-cat').value,priority:document.getElementById('g-pri').value,
    deadline:document.getElementById('g-deadline').value,difficulty:document.getElementById('g-diff').value,
    xpReward:parseInt(document.getElementById('g-xp').value)||500,
    progress:parseInt(document.getElementById('g-prog').value)||0,
    status:document.getElementById('g-status').value,milestones,
    createdAt:editId?(state.goals.find(g=>g.id===editId)?.createdAt||todayStr()):todayStr(),
  };
  if(g.status==='Done'&&editId){const old=state.goals.find(g=>g.id===editId);if(old&&old.status!=='Done')addXP(g.xpReward,'Goal Completed! 🎯');}
  if(editId){const idx=state.goals.findIndex(g=>g.id===editId);if(idx>-1)state.goals[idx]=g;}
  else{state.goals.push(g);addXP(25,'New Goal Set');}
  saveState();closeModal();renderGoals();showToast(editId?'Quest updated!':'Quest added! 🎯');
}
function deleteGoal(id){if(!confirm('Delete goal?'))return;state.goals=state.goals.filter(g=>g.id!==id);saveState();renderGoals();}
function toggleMilestone(gid,mi){
  const g=state.goals.find(g=>g.id===gid);if(!g||!g.milestones)return;
  g.milestones[mi].done=!g.milestones[mi].done;
  const done=g.milestones.filter(m=>m.done).length;
  g.progress=Math.round((done/g.milestones.length)*100);
  if(g.milestones[mi].done)addXP(20,'Milestone Done');
  saveState();renderGoals();
}
function filterGoals(f){
  state.goalFilter=f;
  document.querySelectorAll('#page-goals .chip').forEach(c=>c.classList.toggle('active',c.dataset.filter===f));
  renderGoals();
}
function renderGoals(){
  const c=document.getElementById('goals-list');if(!c)return;
  let list=state.goals;
  if(state.goalFilter==='Active')list=list.filter(g=>g.status==='Active');
  else if(state.goalFilter==='Done')list=list.filter(g=>g.status==='Done');
  else if(state.goalFilter!=='all')list=list.filter(g=>g.category===state.goalFilter);
  if(!list.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><h3>No quests yet!</h3><p>Add your first life goal</p><button class="btn-primary" onclick="openGoalModal()">+ New Quest</button></div>`;return;}
  c.innerHTML=list.map(g=>{
    const daysLeft=g.deadline?Math.ceil((new Date(g.deadline)-new Date())/86400000):null;
    return`<div class="goal-card">
      <div class="goal-header">
        <div class="goal-title">${esc(g.title)}</div>
        <div class="goal-badges">
          <span class="goal-tag ${g.status==='Active'?'active':g.status==='Done'?'done':''}">${g.status}</span>
          <span class="goal-tag">${g.category}</span>
          <span class="goal-tag">${g.priority}</span>
        </div>
      </div>
      <div class="goal-meta">
        ${g.difficulty?`<span>${g.difficulty}</span>`:''}
        ${daysLeft!==null?`<span>📅 ${daysLeft>0?daysLeft+' days left':daysLeft===0?'Due today!':Math.abs(daysLeft)+' days overdue'}</span>`:''}
        <span class="goal-xp-reward">⚡ ${g.xpReward} XP reward</span>
      </div>
      ${g.vision?`<div style="font-size:12px;color:var(--text2);font-style:italic;margin-bottom:8px">"${esc(g.vision)}"</div>`:''}
      <div class="goal-progress-label"><span>Progress</span><span>${g.progress}%</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill ${g.status==='Done'?'green':''}" style="width:${g.progress}%"></div></div>
      ${g.milestones&&g.milestones.length?`<div class="milestones-list">${g.milestones.map((m,i)=>`<div class="milestone-item ${m.done?'done':''}"><input type="checkbox" class="milestone-check" ${m.done?'checked':''} onchange="toggleMilestone('${g.id}',${i})"/>${esc(m.text)}</div>`).join('')}</div>`:''}
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn-icon" onclick="openGoalModal('${g.id}')">✏️ Edit</button>
        <button class="btn-icon" onclick="deleteGoal('${g.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ── JOURNAL PAGE ──────────────────────────────────────
function openJournalModal(){
  document.getElementById('modal-title').textContent='📓 New Journal Entry';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Date</label><input type="date" id="je-date" class="settings-input" value="${todayStr()}"/></div>
    <div class="form-group"><label>Mood</label>
      <select id="je-mood" class="settings-input"><option>😄 Great</option><option>🙂 Good</option><option>😐 Okay</option><option>😔 Low</option><option>😤 Stressed</option><option>🤩 Epic</option></select>
    </div>
    <div class="form-group"><label>Today I learned…</label><textarea id="je-learned" class="settings-input" style="min-height:60px" placeholder="Key insight from today"></textarea></div>
    <div class="form-group"><label>Today's Win 🏆</label><textarea id="je-win" class="settings-input" style="min-height:50px" placeholder="What went well?"></textarea></div>
    <div class="form-group"><label>Gratitude 🙏</label><textarea id="je-gratitude" class="settings-input" style="min-height:50px" placeholder="3 things you're grateful for"></textarea></div>
    <div class="form-group"><label>Notes</label><textarea id="je-notes" class="settings-input" style="min-height:70px" placeholder="Anything on your mind…"></textarea></div>
    <button class="btn-primary" onclick="saveJournalEntry()">💾 Save Entry</button>`;
  openModal();
}
function saveJournalEntry(){
  const entry={id:'je_'+Date.now(),date:document.getElementById('je-date').value||todayStr(),mood:document.getElementById('je-mood').value,learned:document.getElementById('je-learned').value,win:document.getElementById('je-win').value,gratitude:document.getElementById('je-gratitude').value,notes:document.getElementById('je-notes').value};
  state.journalEntries.unshift(entry);saveState();closeModal();renderJournal();addXP(20,'Journal Entry');showToast('Entry saved! 📓');
}
function renderJournal(){
  renderMoodCalendar();renderMoodStats();
  const c=document.getElementById('journal-entries');if(!c)return;
  if(!state.journalEntries.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">📓</div><h3>No entries yet</h3><button class="btn-primary" onclick="openJournalModal()">+ First Entry</button></div>`;return;}
  c.innerHTML=state.journalEntries.map(e=>`<div class="journal-entry-card">
    <div class="journal-entry-date">${fmtFull(e.date)}</div>
    <div class="journal-entry-mood">${e.mood}</div>
    ${e.win?`<div style="font-size:13px;color:var(--green);margin-bottom:4px">🏆 ${esc(e.win)}</div>`:''}
    ${e.learned?`<div style="font-size:13px;color:var(--text);margin-bottom:4px">💡 ${esc(e.learned)}</div>`:''}
    ${e.notes?`<div class="journal-entry-text">${esc(e.notes)}</div>`:''}
    <button class="btn-sm danger" style="margin-top:8px" onclick="deleteJournalEntry('${e.id}')">🗑️</button>
  </div>`).join('');
}
function deleteJournalEntry(id){state.journalEntries=state.journalEntries.filter(e=>e.id!==id);saveState();renderJournal();}
function renderMoodCalendar(){
  const c=document.getElementById('mood-calendar');if(!c)return;
  const moodMap={};Object.entries(state.vitals).forEach(([k,v])=>{if(v.mood)moodMap[k]=v.mood;});
  state.journalEntries.forEach(e=>{if(e.mood)moodMap[e.date]=e.mood.split(' ')[0];});
  const today=new Date();const cells=[];
  const days=['S','M','T','W','T','F','S'];
  cells.push(...days.map(d=>`<div class="mood-cal-day">${d}</div>`));
  for(let i=27;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const k=fmtDate(d);cells.push(`<div class="mood-cal-cell" title="${k}">${moodMap[k]||''}</div>`);}
  c.innerHTML=cells.join('');
}
function renderMoodStats(){
  const c=document.getElementById('mood-stats');if(!c)return;
  const moods={};Object.values(state.vitals).forEach(v=>{if(v.mood){moods[v.mood]=(moods[v.mood]||0)+1;}});
  if(!Object.keys(moods).length){c.innerHTML=`<p class="empty-msg" style="padding:8px">No mood data yet</p>`;return;}
  c.innerHTML=Object.entries(moods).sort((a,b)=>b[1]-a[1]).map(([m,cnt])=>`<div class="mood-stat-row">${m} <div style="flex:1;height:6px;background:var(--bg3);border-radius:99px;margin:0 8px;overflow:hidden"><div style="height:100%;background:var(--accent);width:${Math.round(cnt/Object.values(moods).reduce((a,b)=>a+b,0)*100)}%"></div></div> ${cnt}x</div>`).join('');
}

// ── FINANCE ───────────────────────────────────────────
const FIN_CATS=['Salary','Freelance','Business','Café','Food','Transport','Fuel','Rent','Bills','EMI','Shopping','Health','Entertainment','Investment','Savings','Other'];
function openFinanceModal(){
  document.getElementById('modal-title').textContent='Add Finance Entry';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Type</label>
      <select id="f-type" class="settings-input"><option value="income">💚 Income</option><option value="expense">🔴 Expense</option></select>
    </div>
    <div class="form-group"><label>Description *</label><input type="text" id="f-desc" class="settings-input" placeholder="e.g. TCS Salary, Café Revenue"/></div>
    <div class="form-group"><label>Amount (₹) *</label><input type="number" id="f-amount" class="settings-input" placeholder="50000" min="0"/></div>
    <div class="form-group"><label>Category</label>
      <select id="f-cat" class="settings-input">${FIN_CATS.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Date</label><input type="date" id="f-date" class="settings-input" value="${todayStr()}"/></div>
    <button class="btn-primary" onclick="saveFinance()">💾 Save</button>`;
  openModal();
}
function saveFinance(){
  const desc=document.getElementById('f-desc').value.trim();const amt=parseFloat(document.getElementById('f-amount').value);
  if(!desc||!amt){showToast('Fill required fields!');return;}
  state.finance.push({id:'f_'+Date.now(),type:document.getElementById('f-type').value,desc,amount:amt,category:document.getElementById('f-cat').value,date:document.getElementById('f-date').value});
  saveState();closeModal();renderFinance();addXP(5,'Finance Logged');showToast('Entry added! 💰');
}
function filterFinance(f){
  state.financeFilter=f;
  document.querySelectorAll('#page-finance .chip').forEach(c=>c.classList.toggle('active',c.dataset.filter===f));
  renderFinance();
}
function renderFinance(){
  let list=state.finance;
  if(state.financeFilter==='income')list=list.filter(f=>f.type==='income');
  else if(state.financeFilter==='expense')list=list.filter(f=>f.type==='expense');
  const income=state.finance.filter(f=>f.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense=state.finance.filter(f=>f.type==='expense').reduce((a,b)=>a+b.amount,0);
  setKPI('fin-income','₹'+income.toLocaleString('en-IN'));
  setKPI('fin-expense','₹'+expense.toLocaleString('en-IN'));
  setKPI('fin-savings','₹'+(income-expense).toLocaleString('en-IN'));
  setKPI('fin-networth','₹'+(income-expense).toLocaleString('en-IN'));
  const c=document.getElementById('finance-list');if(!c)return;
  if(!list.length){c.innerHTML=`<p class="empty-msg">No entries yet.</p>`;return;}
  c.innerHTML=[...list].sort((a,b)=>b.date.localeCompare(a.date)).map(f=>`<div class="finance-item">
    <div class="finance-dot ${f.type}"></div>
    <div style="flex:1"><div class="finance-desc">${esc(f.desc)}</div><div class="finance-cat">${f.category} • ${fmtShort(f.date)}</div></div>
    <div class="finance-amount ${f.type}">₹${f.amount.toLocaleString('en-IN')}</div>
    <button class="btn-icon" onclick="delFinance('${f.id}')">🗑️</button>
  </div>`).join('');
}
function delFinance(id){state.finance=state.finance.filter(f=>f.id!==id);saveState();renderFinance();}

// ── FITNESS ───────────────────────────────────────────
const WORKOUT_TYPES=['Gym','Running','Cycling','Yoga','HIIT','Swimming','Walking','Calisthenics','Sports','Other'];
function openFitnessModal(){
  document.getElementById('modal-title').textContent='Log Workout 💪';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Type</label><select id="w-type" class="settings-input">${WORKOUT_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="form-group"><label>Duration (mins)</label><input type="number" id="w-dur" class="settings-input" placeholder="45"/></div>
    <div class="form-group"><label>Calories Burned</label><input type="number" id="w-cal" class="settings-input" placeholder="300"/></div>
    <div class="form-group"><label>Notes</label><input type="text" id="w-notes" class="settings-input" placeholder="How was it?"/></div>
    <div class="form-group"><label>Date</label><input type="date" id="w-date" class="settings-input" value="${todayStr()}"/></div>
    <button class="btn-primary" onclick="saveWorkout()">💾 Log It</button>`;
  openModal();
}
function saveWorkout(){
  const dur=parseInt(document.getElementById('w-dur').value);if(!dur){showToast('Enter duration!');return;}
  state.fitness.workouts.push({id:'w_'+Date.now(),type:document.getElementById('w-type').value,duration:dur,calories:parseInt(document.getElementById('w-cal').value)||0,notes:document.getElementById('w-notes').value,date:document.getElementById('w-date').value});
  saveState();closeModal();renderFitness();addXP(100,'Workout Done! 💪');showToast('Workout logged! 💪');
}
function calcBMI(){
  const h=parseFloat(document.getElementById('m-height')?.value);const w=parseFloat(document.getElementById('m-weight')?.value);
  if(h&&w){const bmi=(w/((h/100)**2)).toFixed(1);setKPI('fit-bmi',bmi);setKPI('fit-weight',w+' kg');}
}
function saveMeasurements(){
  const m={};['height','weight','fat','chest','waist','arms'].forEach(f=>{const el=document.getElementById('m-'+f);if(el&&el.value)m[f]=parseFloat(el.value);});
  state.fitness.measurements={...state.fitness.measurements,...m,date:todayStr()};saveState();showToast('Measurements saved!');
}
function saveNutrition(){
  const today=todayStr();if(!state.vitals[today])state.vitals[today]={};
  ['cal','protein','carbs','fats'].forEach(f=>{const el=document.getElementById('n-'+f);if(el&&el.value)state.vitals[today]['n_'+f]=parseFloat(el.value);});
  saveState();
}
function renderFitness(){
  setKPI('fit-total',state.fitness.workouts.length);
  let streak=0;const d=new Date();
  while(streak<365){const k=fmtDate(d);if(state.fitness.workouts.some(w=>w.date===k))streak++;else if(k!==todayStr())break;d.setDate(d.getDate()-1);}
  setKPI('fit-streak',streak);
  const m=state.fitness.measurements;
  if(m.weight)setKPI('fit-weight',m.weight+' kg');
  if(m.height&&m.weight){setKPI('fit-bmi',(m.weight/((m.height/100)**2)).toFixed(1));}
  ['height','weight','fat','chest','waist','arms'].forEach(f=>{const el=document.getElementById('m-'+f);if(el&&m[f])el.value=m[f];});
  const c=document.getElementById('workout-list');if(!c)return;
  if(!state.fitness.workouts.length){c.innerHTML=`<p class="empty-msg">No workouts yet. Start logging!</p>`;return;}
  c.innerHTML=[...state.fitness.workouts].sort((a,b)=>b.date.localeCompare(a.date)).map(w=>`<div class="finance-item">
    <div style="font-size:20px">💪</div>
    <div style="flex:1"><div class="finance-desc">${w.type} — ${w.duration} min</div><div class="finance-cat">${fmtShort(w.date)}${w.calories?' • '+w.calories+' cal':''}${w.notes?' • '+esc(w.notes):''}</div></div>
    <button class="btn-icon" onclick="delWorkout('${w.id}')">🗑️</button>
  </div>`).join('');
}
function delWorkout(id){state.fitness.workouts=state.fitness.workouts.filter(w=>w.id!==id);saveState();renderFitness();}

// ── LEARNING ──────────────────────────────────────────
const PLATFORMS=['Udemy','Coursera','YouTube','SAP Learning','LinkedIn Learning','Pluralsight','edX','Book','Self Study','Other'];
function openLearningModal(editId=null){
  const item=editId?state.learning.find(l=>l.id===editId):null;
  document.getElementById('modal-title').textContent=item?'Edit Course':'Add Course 📚';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Title *</label><input type="text" id="l-title" class="settings-input" value="${item?esc(item.title):''}" placeholder="e.g. SAP SD Masterclass"/></div>
    <div class="form-group"><label>Platform</label><select id="l-platform" class="settings-input">${PLATFORMS.map(p=>`<option value="${p}" ${item&&item.platform===p?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="form-group"><label>Total Hours</label><input type="number" id="l-hours" class="settings-input" value="${item?item.totalHours:''}" placeholder="20"/></div>
    <div class="form-group"><label>Hours Completed</label><input type="number" id="l-done" class="settings-input" value="${item?item.doneHours:0}"/></div>
    <div class="form-group"><label>Skills</label><input type="text" id="l-skills" class="settings-input" value="${item?esc(item.skills||''):''}" placeholder="e.g. SAP SD, Power BI"/></div>
    <div class="form-group"><label>Certificate</label><select id="l-cert" class="settings-input"><option value="No" ${!item||item.cert==='No'?'selected':''}>No</option><option value="Yes" ${item&&item.cert==='Yes'?'selected':''}>Yes ✅</option><option value="In Progress" ${item&&item.cert==='In Progress'?'selected':''}>In Progress</option></select></div>
    <button class="btn-primary" onclick="saveLearning('${editId||''}')">💾 Save</button>`;
  openModal();
}
function saveLearning(editId){
  const title=document.getElementById('l-title').value.trim();if(!title){showToast('Title required!');return;}
  const total=parseFloat(document.getElementById('l-hours').value)||0;const done=parseFloat(document.getElementById('l-done').value)||0;
  const item={id:editId||'l_'+Date.now(),title,platform:document.getElementById('l-platform').value,totalHours:total,doneHours:done,skills:document.getElementById('l-skills').value.trim(),cert:document.getElementById('l-cert').value,progress:total?Math.round((done/total)*100):0};
  if(editId){const idx=state.learning.findIndex(l=>l.id===editId);if(idx>-1)state.learning[idx]=item;}
  else{state.learning.push(item);addXP(20,'Course Added');}
  saveState();closeModal();renderLearning();showToast(editId?'Updated!':'Course added! 📚');
}
function delLearning(id){state.learning=state.learning.filter(l=>l.id!==id);saveState();renderLearning();}
function renderLearning(){
  const total=state.learning.length;const hours=state.learning.reduce((a,b)=>a+b.doneHours,0);
  const certs=state.learning.filter(l=>l.cert==='Yes').length;const done=state.learning.filter(l=>l.progress>=100).length;
  setKPI('learn-total',total);setKPI('learn-hours',hours+'h');setKPI('learn-certs',certs);setKPI('learn-done',done);
  const c=document.getElementById('learning-list');if(!c)return;
  if(!state.learning.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">📚</div><h3>Start learning!</h3><button class="btn-primary" onclick="openLearningModal()">+ Add Course</button></div>`;return;}
  c.innerHTML=state.learning.map(l=>`<div class="goal-card">
    <div class="goal-header">
      <div class="goal-title">📚 ${esc(l.title)}</div>
      <div class="goal-badges"><span class="goal-tag ${l.cert==='Yes'?'done':'active'}">${l.cert==='Yes'?'✅ Certified':l.platform}</span></div>
    </div>
    <div class="goal-meta"><span>${l.platform}</span><span>${l.doneHours}/${l.totalHours}h</span>${l.skills?`<span>Skills: ${esc(l.skills)}</span>`:''}</div>
    <div class="goal-progress-label"><span>Progress</span><span>${l.progress}%</span></div>
    <div class="progress-bar-track"><div class="progress-bar-fill ${l.progress>=100?'green':''}" style="width:${l.progress}%"></div></div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="btn-icon" onclick="openLearningModal('${l.id}')">✏️</button>
      <button class="btn-icon" onclick="delLearning('${l.id}')">🗑️</button>
    </div>
  </div>`).join('');
}

// ── CAREER ────────────────────────────────────────────
const CAREER_TYPES=['Job Application','Interview','Networking','Certification','Resume Update','LinkedIn Post','Mock Interview','Skill Learned','Offer Received','Other'];
function openCareerModal(){
  document.getElementById('modal-title').textContent='Log Career Activity 💼';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><label>Type</label><select id="c-type" class="settings-input">${CAREER_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="form-group"><label>Details *</label><input type="text" id="c-detail" class="settings-input" placeholder="e.g. Applied at Infosys for SAP SD"/></div>
    <div class="form-group"><label>Company / Platform</label><input type="text" id="c-company" class="settings-input" placeholder="Company name"/></div>
    <div class="form-group"><label>Status</label><select id="c-status" class="settings-input"><option>Pending</option><option>Done</option><option>Rejected</option><option>In Progress</option><option>Accepted</option></select></div>
    <div class="form-group"><label>Date</label><input type="date" id="c-date" class="settings-input" value="${todayStr()}"/></div>
    <button class="btn-primary" onclick="saveCareer()">💾 Save</button>`;
  openModal();
}
function saveCareer(){
  const detail=document.getElementById('c-detail').value.trim();if(!detail){showToast('Fill details!');return;}
  state.career.push({id:'ca_'+Date.now(),type:document.getElementById('c-type').value,detail,company:document.getElementById('c-company').value.trim(),status:document.getElementById('c-status').value,date:document.getElementById('c-date').value});
  saveState();closeModal();renderCareer();addXP(15,'Career Activity');showToast('Logged! 💼');
}
function delCareer(id){state.career=state.career.filter(c=>c.id!==id);saveState();renderCareer();}
function renderCareer(){
  setKPI('car-apps',state.career.filter(c=>c.type==='Job Application').length);
  setKPI('car-interviews',state.career.filter(c=>c.type==='Interview').length);
  setKPI('car-network',state.career.filter(c=>c.type==='Networking').length);
  setKPI('car-certs',state.career.filter(c=>c.type==='Certification'||c.type==='Skill Learned').length);
  const c=document.getElementById('career-list');if(!c)return;
  if(!state.career.length){c.innerHTML=`<p class="empty-msg">No activities yet.</p>`;return;}
  c.innerHTML=[...state.career].sort((a,b)=>b.date.localeCompare(a.date)).map(c2=>`<div class="finance-item">
    <div style="font-size:18px">💼</div>
    <div style="flex:1"><div class="finance-desc">${c2.type}: ${esc(c2.detail)}</div><div class="finance-cat">${c2.company||'—'} • ${fmtShort(c2.date)} • <span style="color:${c2.status==='Accepted'?'var(--green)':c2.status==='Rejected'?'var(--accent)':'var(--text2)'}">${c2.status}</span></div></div>
    <button class="btn-icon" onclick="delCareer('${c2.id}')">🗑️</button>
  </div>`).join('');
}

// ── WEEKLY REVIEW ─────────────────────────────────────
function renderWeekly(){
  const now=new Date();const ws=new Date(now);ws.setDate(now.getDate()-now.getDay());
  const we=new Date(ws);we.setDate(ws.getDate()+6);
  document.getElementById('weekly-label').textContent=`${fmtShort(fmtDate(ws))} – ${fmtShort(fmtDate(we))}`;
  let tot=0,done=0,weekXP=0,sleepTot=0,sleepDays=0,moods=[];
  for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);const k=fmtDate(d);const logs=state.habitLogs[k]||{};const cnt=Object.keys(logs).length;tot+=state.habits.length;done+=cnt;weekXP+=cnt*50;const v=state.vitals[k];if(v?.sleep){sleepTot+=v.sleep;sleepDays++;}if(v?.mood)moods.push(v.mood);}
  setKPI('wk-habits',tot?Math.round((done/tot)*100)+'%':'0%');setKPI('wk-xp',weekXP);
  setKPI('wk-sleep',sleepDays?(sleepTot/sleepDays).toFixed(1)+' hrs':'— hrs');setKPI('wk-mood',moods.length?moods[moods.length-1]:'—');
  const wk=fmtDate(ws);const saved=state.weeklyReviews[wk]||{};
  const ww=document.getElementById('wk-wins');if(ww)ww.value=saved.wins||'';
  const wi=document.getElementById('wk-improve');if(wi)wi.value=saved.improve||'';
  const grid=document.getElementById('weekly-habit-grid');if(!grid)return;
  const days=[];for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(d);}
  const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(state.habits.length){
    grid.innerHTML=`<div style="overflow-x:auto"><table class="whg-table">
      <thead><tr><th style="text-align:left">Habit</th>${days.map(d=>`<th>${dayLabels[d.getDay()]}<br><span style="font-size:10px">${d.getDate()}</span></th>`).join('')}</tr></thead>
      <tbody>${state.habits.map(h=>`<tr><td style="font-size:12px;color:var(--text)">${h.icon} ${esc(h.name)}</td>${days.map(d=>{const k=fmtDate(d);const done=!!(state.habitLogs[k]&&state.habitLogs[k][h.id]);return`<td><div class="whg-dot ${done?(h.type==='bad'?'bad-done':'done'):'miss'}"></div></td>`;}).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  } else grid.innerHTML=`<p class="empty-msg">Add habits to see the grid.</p>`;
}
function saveWeeklyReview(){
  const now=new Date();const ws=new Date(now);ws.setDate(now.getDate()-now.getDay());const k=fmtDate(ws);
  const ww=document.getElementById('wk-wins');const wi=document.getElementById('wk-improve');
  state.weeklyReviews[k]={wins:ww?.value||'',improve:wi?.value||'',date:todayStr()};
  saveState();addXP(50,'Weekly Review');showToast('Review saved! 📊');
}

// ── SETTINGS ──────────────────────────────────────────
function renderSettings(){
  const n=document.getElementById('settings-name');if(n)n.value=state.settings.name||'';
  const x=document.getElementById('settings-xp-goal');if(x)x.value=state.settings.xpGoal||500;
  const sbUrl=document.getElementById('sb-url');const sbKey=document.getElementById('sb-key');
  if(sbUrl)sbUrl.value=localStorage.getItem('vy_sb_url')||'';
  if(sbKey)sbKey.value=localStorage.getItem('vy_sb_key')||'';
  renderThemeGrid();updateSyncUI(sbReady()?'synced':'local');
}
function renderThemeGrid(){
  const c=document.getElementById('theme-grid');if(!c)return;
  const groups={dark:'🌙 Dark',light:'☀️ Light',funny:'🎭 Fun & Quirky'};
  let html='';
  Object.entries(groups).forEach(([gk,gl])=>{
    const g=THEMES.filter(t=>t.group===gk);
    html+=`<div style="grid-column:1/-1;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-top:8px;margin-bottom:2px">${gl}</div>`;
    html+=g.map(t=>`<button class="theme-btn ${state.settings.theme===t.id?'active':''}" onclick="setTheme('${t.id}')">${t.label}</button>`).join('');
  });
  c.innerHTML=html;
}
function setTheme(t){state.settings.theme=t;applyTheme(t);saveState();renderThemeGrid();showToast('Theme changed!');}
function saveSettings(){
  const n=document.getElementById('settings-name')?.value.trim();const x=parseInt(document.getElementById('settings-xp-goal')?.value);
  if(n){state.settings.name=n;const nv=document.getElementById('nav-name');if(nv)nv.textContent=n;const av=document.getElementById('nav-avatar');if(av)av.textContent=n[0].toUpperCase();}
  if(x)state.settings.xpGoal=x;saveState();showToast('Saved!');
}



function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='vyrona-backup-'+todayStr()+'.json';a.click();URL.revokeObjectURL(url);showToast('Exported!');
}
function importData(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();reader.onload=e=>{
    try{const d=JSON.parse(e.target.result);if(!d.habits&&!d.goals)throw new Error('Invalid');
    Object.assign(state,{...d,plannerDate:new Date(),user:state.user});saveState();showPage(state.currentPage||'dashboard');showToast('Imported! ✅');
    }catch(err){showToast('❌ Invalid backup file');}
  };reader.readAsText(file);
}
function clearData(){
  if(!confirm('DELETE all data?'))return;if(!confirm('Final confirmation — this cannot be undone!'))return;
  localStorage.removeItem('vyrona_state');location.reload();
}

// ── MODAL ─────────────────────────────────────────────
function openModal(){document.getElementById('modal-overlay').classList.remove('hidden');}
function closeModal(){document.getElementById('modal-overlay').classList.add('hidden');}
function closeModalOuter(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}

// ── TOAST ─────────────────────────────────────────────
let _toastTimer;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>t.classList.add('hidden'),2600);}

// ── DEMO DATA ─────────────────────────────────────────
function loadDemoData(){
  state.habits=[
    {id:'h1',name:'Morning Workout',icon:'💪',category:'Fitness',xp:100,penalty:30,difficulty:'Hard',notes:'',type:'good',createdAt:'2025-01-01'},
    {id:'h2',name:'Read 30 mins',icon:'📚',category:'Learning',xp:50,penalty:10,difficulty:'Easy',notes:'',type:'good',createdAt:'2025-01-01'},
    {id:'h3',name:'SAP Study',icon:'💼',category:'Career',xp:75,penalty:20,difficulty:'Medium',notes:'',type:'good',createdAt:'2025-01-01'},
    {id:'h4',name:'Meditation',icon:'🧘',category:'Mental',xp:40,penalty:10,difficulty:'Easy',notes:'',type:'good',createdAt:'2025-01-01'},
    {id:'h5',name:'Drink 3L Water',icon:'💧',category:'Health',xp:30,penalty:5,difficulty:'Easy',notes:'',type:'good',createdAt:'2025-01-01'},
    {id:'h6',name:'Quit Social Media Scrolling',icon:'📱',category:'Productivity',xp:0,penalty:25,difficulty:'Hard',notes:'Max 30min per day',type:'bad',createdAt:'2025-01-01'},
  ];
  const today=new Date();
  for(let i=0;i<25;i++){const d=new Date(today);d.setDate(today.getDate()-i);const k=fmtDate(d);state.habitLogs[k]={};const num=Math.floor(Math.random()*4)+2;state.habits.slice(0,num).forEach(h=>{state.habitLogs[k][h.id]={time:new Date().toISOString()};});}
  state.xp=1850;
  state.goals=[{id:'g1',title:'SAP SD Certification',vision:'Career growth & higher salary',deadline:'2025-12-31',category:'Career',priority:'High',progress:35,status:'Active',difficulty:'⭐⭐⭐⭐ Epic',xpReward:2000,milestones:[{text:'Complete SD config modules',done:true},{text:'Practice test system',done:false},{text:'Mock exam',done:false},{text:'Book exam',done:false}],createdAt:'2025-01-01'}];
  state.finance=[{id:'f1',type:'income',desc:'TCS Salary',amount:85000,category:'Salary',date:todayStr()},{id:'f2',type:'expense',desc:'Café Rent',amount:25000,category:'Rent',date:todayStr()},{id:'f3',type:'income',desc:'Sajay\'s Café Revenue',amount:45000,category:'Café',date:todayStr()},{id:'f4',type:'expense',desc:'Groceries',amount:4500,category:'Food',date:todayStr()}];
  state.vitals[todayStr()]={sleep:7,water:2.5,steps:8500,weight:72,mood:'🙂',moodLabel:'Good'};
  state.priorities[todayStr()]=['Complete SAP module 4','Review café inventory','6PM gym session'];
  state.learning=[{id:'l1',title:'SAP SD Configuration Masterclass',platform:'Udemy',totalHours:40,doneHours:14,skills:'SAP SD, OTC Process',cert:'No',progress:35}];
  saveLocal();
}



// Always run after DOM is fully ready

init();
