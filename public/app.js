/* ============================================================
   CivicPulse — app.js  (API-connected version)
   All data is fetched from the Express/MySQL backend.
   ============================================================ */

/* ---------- Tailwind Config (must be before Tailwind CDN) ---------- */
tailwind = { config: {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { syne:['Syne','sans-serif'], dm:['DM Sans','sans-serif'] },
      colors: { midnight:'#0A0F1E', navy:'#0F172A', cyan:{ DEFAULT:'#06B6D4', glow:'rgba(6,182,212,0.4)' }, neon:'#3B82F6' },
      animation: {
        'pulse-slow':'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':'shimmer 2s linear infinite',
        'slide-up':'slideUp 0.6s ease both',
        'glow-pulse':'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer:   { '0%':{ backgroundPosition:'-200% center' },'100%':{ backgroundPosition:'200% center' } },
        slideUp:   { from:{ opacity:0,transform:'translateY(32px)' },to:{ opacity:1,transform:'translateY(0)' } },
        glowPulse: { '0%,100%':{ boxShadow:'0 0 8px rgba(6,182,212,0.4)' },'50%':{ boxShadow:'0 0 24px rgba(6,182,212,0.9)' } },
      },
      backgroundImage: { 'gradient-radial':'radial-gradient(var(--tw-gradient-stops))' },
      backdropBlur: { xs:'2px' },
      boxShadow: { 'cyan':'0 0 20px rgba(6,182,212,0.3)','float':'0 20px 60px rgba(0,0,0,0.5)' }
    }
  }
}};

/* ============================================================
   API LAYER
   All HTTP calls go through here. Change API_BASE to match
   your backend URL/port.
   ============================================================ */
const API_BASE = 'http://localhost:5000/api';

const api = {
  async request(method, path, body = null, isFormData = false) {
    const token   = localStorage.getItem('cp_token');
    const headers = {};
    if (token)                    headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData && body)      headers['Content-Type']  = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res  = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      // If token expired, auto-logout the user
      if (res.status === 401 && data.message?.toLowerCase().includes('expired')) {
        localStorage.removeItem('cp_token');
        localStorage.removeItem('cp_user');
        localStorage.removeItem('cp_token_exp');
        // Trigger re-login prompt by dispatching a custom event
        window.dispatchEvent(new CustomEvent('token-expired'));
      }

      // If validation errors exist, attach them to the error object
      const err = new Error(data.message || `HTTP ${res.status}`);
      if (data.errors) err._fieldErrors = data.errors;
      throw err;
    }

    return data;
  },

  get:    (path)       => api.request('GET',    path),
  post:   (path, body) => api.request('POST',   path, body),
  put:    (path, body) => api.request('PUT',    path, body),
  patch:  (path, body) => api.request('PATCH',  path, body),
  del:    (path)       => api.request('DELETE', path),
  upload: (path, fd)   => api.request('POST',   path, fd, true),

  auth: {
    login:    (email, password) => api.post('/auth/login',    { email, password }),
    register: (data)            => api.post('/auth/register', data),
    me:       ()                => api.get('/auth/me'),
  },
  complaints: {
    getAll:      (p = {}) => api.get('/complaints?'        + new URLSearchParams(p)),
    getMy:       (p = {}) => api.get('/complaints/my?'     + new URLSearchParams(p)),
    getAssigned: (p = {}) => api.get('/complaints/assigned?' + new URLSearchParams(p)),
    getOne:      (id)     => api.get(`/complaints/${id}`),
    track:       (id)     => api.get(`/complaints/track/${id}`),
    create:      (fd)     => api.upload('/complaints', fd),
    updateStatus:(id, b)  => api.put(`/complaints/${id}/status`, b),
    assign:      (id, b)  => api.put(`/complaints/${id}/assign`, b),
    feedback:    (id, b)  => api.post(`/complaints/${id}/feedback`, b),
    remove:      (id)     => api.del(`/complaints/${id}`),
  },
  analytics: {
    overview:    () => api.get('/analytics/overview'),
    monthly:     () => api.get('/analytics/monthly-trend'),
    byCategory:  () => api.get('/analytics/by-category'),
    heatmap:     () => api.get('/analytics/heatmap'),
    leaderboard: () => api.get('/analytics/leaderboard'),
    violations:  () => api.get('/analytics/sla-violations'),
    predictive:  () => api.get('/analytics/predictive'),
  },
  departments: { getAll: () => api.get('/departments') },
  zones:       { getAll: () => api.get('/zones') },
  notifications: {
    getAll:   ()   => api.get('/notifications'),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAll:  ()   => api.patch('/notifications/read-all'),
  },
};

/* ============================================================
   ALPINE.JS APP COMPONENT
   ============================================================ */
function app() {
  return {

    /* ── Page / Nav ── */
    page:          'landing',
    mobileMenu:    false,
    showNotifs:    false,
    activeSidebar: 'Dashboard',

    /* ── Auth ── */
    token:        localStorage.getItem('cp_token') || null,
    user:         JSON.parse(localStorage.getItem('cp_user') || 'null'),
    showLogin:    false,
    showRegister: false,
    loginForm:    { email:'', password:'' },
    registerForm: { name:'', email:'', password:'', phone:'' },
    authError:       '',
    authFieldErrors: null,   // object of { field: 'error message' }
    authLoading:     false,
    showPassword:    false,
    passwordStrength: 0,     // 0–4
    tokenExpiresAt:  localStorage.getItem('cp_token_exp') || null,

    /* ── Toasts ── */
    toasts: [],

    /* ── Loading ── */
    loading: { dashboard:false, complaints:false, submit:false, tracker:false, heatmap:false, analytics:false, departments:false, sla:false, officers:false },

    /* ── Landing stats ── */
    stats: [
      { label:'Issues Resolved',   display:'—' },
      { label:'Active Complaints', display:'—' },
      { label:'Avg Resolution',    display:'—' },
      { label:'SLA Compliance',    display:'—' },
    ],

    /* ── Static feature / UI data ── */
    features: [
      { icon:'📍',title:'GPS-Pinned Reporting',    desc:'Submit complaints with coordinates and photo. Auto-assigns to the correct department.',           iconBg:'bg-cyan-500/15 text-cyan-400',    hoverGlow:'bg-gradient-to-br from-cyan-500/5 to-transparent' },
      { icon:'⏱', title:'SLA Countdown Engine',    desc:'Every complaint has a live countdown. Auto-escalates when SLA thresholds are breached.',          iconBg:'bg-blue-500/15 text-blue-400',    hoverGlow:'bg-gradient-to-br from-blue-500/5 to-transparent' },
      { icon:'🔥',title:'Area Risk Heatmaps',       desc:'Interactive geo-density maps reveal complaint hotspots scored Low / Medium / High risk.',         iconBg:'bg-violet-500/15 text-violet-400',hoverGlow:'bg-gradient-to-br from-violet-500/5 to-transparent' },
      { icon:'🏆',title:'Department Leaderboard',   desc:'Gamified rankings by resolution speed, SLA compliance, and citizen feedback score.',              iconBg:'bg-emerald-500/15 text-emerald-400',hoverGlow:'bg-gradient-to-br from-emerald-500/5 to-transparent' },
      { icon:'🔮',title:'Predictive AI Insights',   desc:'Trend analysis flags emerging patterns before they spike. Proactive, not reactive.',               iconBg:'bg-amber-500/15 text-amber-400',  hoverGlow:'bg-gradient-to-br from-amber-500/5 to-transparent' },
      { icon:'📊',title:'Live Analytics Dashboard', desc:'Animated KPI cards, monthly trend charts, and resolution analytics updating in real time.',       iconBg:'bg-red-500/15 text-red-400',      hoverGlow:'bg-gradient-to-br from-red-500/5 to-transparent' },
    ],
    statusCards: [
      { icon:'🔴', name:'Open',        color:'text-orange-400', desc:'Complaint filed. Awaiting assignment.',                     glow:'bg-orange-500' },
      { icon:'🔵', name:'In Progress', color:'text-blue-400',   desc:'Officer assigned. Active work underway with SLA countdown.', glow:'bg-blue-500'   },
      { icon:'✅', name:'Resolved',    color:'text-emerald-400',desc:'Issue fixed. Citizen notified for feedback.',               glow:'bg-emerald-500' },
      { icon:'⬛', name:'Closed',      color:'text-slate-400',  desc:'Feedback received. Archived in system logs.',               glow:'bg-slate-500'  },
    ],
    categories: [
      { val:'roads',       icon:'🛣', label:'Roads'       },
      { val:'water',       icon:'💧',label:'Water'       },
      { val:'sanitation',  icon:'🗑', label:'Sanitation'  },
      { val:'electricity', icon:'⚡',label:'Electricity' },
      { val:'parks',       icon:'🌳',label:'Parks'       },
      { val:'other',       icon:'📋',label:'Other'       },
    ],
    mapDots: [
      { id:1,top:'25%',left:'30%',color:'red',  bg:'#EF4444' },
      { id:2,top:'40%',left:'60%',color:'amber',bg:'#F59E0B' },
      { id:3,top:'65%',left:'45%',color:'amber',bg:'#F59E0B' },
      { id:4,top:'20%',left:'70%',color:'green',bg:'#10B981' },
      { id:5,top:'55%',left:'20%',color:'red',  bg:'#EF4444' },
      { id:6,top:'70%',left:'75%',color:'green',bg:'#10B981' },
    ],
    sidebarItems:  [
      { icon:'⚡',label:'Dashboard'  },{ icon:'📋',label:'Complaints' },
      { icon:'🗺', label:'Heatmap'   },{ icon:'📈',label:'Analytics'  },
    ],
    sidebarManage: [
      { icon:'🏢',label:'Departments' },{ icon:'⚙️',label:'SLA Rules'   },
      { icon:'🏆',label:'Leaderboard' },{ icon:'👤',label:'Officers'    },
    ],

    /* ── Dashboard API data ── */
    kpis:           [],
    chartCategories:[],
    departments:    [],
    aiInsights:     [],

    /* ── Complaints table ── */
    complaints:     [],
    totalComplaints:0,
    searchQuery:    '',
    filterStatus:   '',
    filterPriority: '',
    filterCategory: '',
    currentPage:    1,

    /* ── Per-panel loaded data ── */
    heatmapData:    [],
    slaViolations:  [],
    slaRules:       [],
    officersList:   [],
    editingSlaId:   null,
    editingSlaHours: 0,
    showAddOfficer: false,

    /* ── Per-panel loading flags ── */
    pageLimit:      15,

    /* ── Submit form ── */
    form: { category:'', title:'', description:'', priority:'medium', zone_id:'', address:'' },
    zones:          [],
    slaTime:        '48h',
    isSubmitting:   false,
    submitSuccess:  false,
    complaintId:    '',
    complaintNo:    '',
    uploadedFile:   null,
    uploadedFileName: null,
    isDragOver:     false,
    mapClicked:     false,
    clickX: 0, clickY: 0,

    /* ── Tracker ── */
    trackId:          '',
    trackedComplaint: null,
    trackerTimeline:  [],
    feedbackRating:   0,
    feedbackText:     '',
    feedbackSubmitted:false,

    /* ── Notifications ── */
    notifications: [],
    unreadCount:   0,

    /* ==========================================================
       COMPUTED
       ========================================================== */
    get isLoggedIn() { return !!this.token; },
    get isAdmin()    { return this.user?.role === 'admin'; },
    get isOfficer()  { return this.user?.role === 'officer'; },
    get isCitizen()  { return this.user?.role === 'citizen'; },

    get filteredComplaints() {
      // client-side fallback filter (API already filters server-side)
      return this.complaints;
    },

    /* ==========================================================
       TOASTS
       ========================================================== */
    toast(msg, type = 'success') {
      const t = { id: Date.now(), msg, type };
      this.toasts.push(t);
      setTimeout(() => { this.toasts = this.toasts.filter(x => x.id !== t.id); }, 3500);
    },

    /* ==========================================================
       AUTH
       ========================================================== */
    async doLogin() {
      this.authError = ''; this.authFieldErrors = null; this.authLoading = true;
      try {
        const data = await api.auth.login(this.loginForm.email, this.loginForm.password);
        this._saveAuth(data);
        this.showLogin = false;
        this.loginForm = { email:'', password:'' };
        this.toast(`Welcome back, ${data.user.name}! 👋`);
        this.loadNotifications();
        if (data.user.role === 'citizen') this.page = 'submit';
        else { this.page = 'dashboard'; }
      } catch (err) {
        this.authError = err.message;
      } finally { this.authLoading = false; }
    },

    async doRegister() {
      this.authError = ''; this.authFieldErrors = null; this.authLoading = true;
      try {
        const data = await api.auth.register(this.registerForm);
        this._saveAuth(data);
        this.showRegister    = false;
        this.showPassword    = false;
        this.passwordStrength = 0;
        this.registerForm    = { name:'', email:'', password:'', phone:'' };
        this.toast('Account created! Welcome to CivicPulse 🎉');
        this.page = 'submit';
      } catch (err) {
        // API returns { success:false, message:'...', errors:{ name, email, password, phone } }
        // We parse the raw response to get field-level errors
        if (err._fieldErrors) {
          this.authFieldErrors = err._fieldErrors;
        } else {
          this.authError = err.message;
        }
      } finally { this.authLoading = false; }
    },

    doLogout() {
      this.token          = null;
      this.user           = null;
      this.tokenExpiresAt = null;
      localStorage.removeItem('cp_token');
      localStorage.removeItem('cp_user');
      localStorage.removeItem('cp_token_exp');
      this.notifications = []; this.unreadCount = 0;
      this.page = 'landing';
      this.toast('Logged out.', 'info');
    },

    _saveAuth(data) {
      this.token         = data.token;
      this.user          = data.user;
      this.tokenExpiresAt = data.expires_at || null;
      localStorage.setItem('cp_token',     data.token);
      localStorage.setItem('cp_user',      JSON.stringify(data.user));
      if (data.expires_at) localStorage.setItem('cp_token_exp', data.expires_at);
    },

    /* ==========================================================
       NOTIFICATIONS
       ========================================================== */
    async loadNotifications() {
      if (!this.isLoggedIn) return;
      try {
        const data = await api.notifications.getAll();
        this.notifications = data.notifications || [];
        this.unreadCount   = data.unread || 0;
      } catch (_) {}
    },

    async markNotifRead(id) {
      try {
        await api.notifications.markRead(id);
        const n = this.notifications.find(x => x.id === id);
        if (n && !n.is_read) { n.is_read = 1; this.unreadCount = Math.max(0, this.unreadCount - 1); }
      } catch (_) {}
    },

    async markAllRead() {
      try {
        await api.notifications.markAll();
        this.notifications.forEach(n => n.is_read = 1);
        this.unreadCount = 0;
        this.toast('All notifications marked read.');
      } catch (_) {}
    },

    /* ==========================================================
       LANDING — public stats
       ========================================================== */
    async loadLandingStats() {
      try {
        const [ov, lb] = await Promise.all([
          api.analytics.overview(),
          api.analytics.leaderboard(),
        ]);
        const o = ov.overview;
        this.stats = [
          { label:'Issues Resolved',   display: Number(o.resolved || 0).toLocaleString() },
          { label:'Active Complaints', display: Number(o.active   || 0).toLocaleString() },
          { label:'Avg Resolution',    display: (o.avg_resolution_hours || 0) + 'h' },
{
 
  label: 'SLA Compliance',
  display: 'N/A'

}
        ];
        this.departments = lb.leaderboard || [];
      } catch (_) { /* leave dashes if backend unreachable */ }
    },

    /* ==========================================================
       DASHBOARD
       ========================================================== */
    async loadDashboard() {
      this.loading.dashboard = true;
      try {
        const [ov, monthly, byCat, lb, predictive] = await Promise.all([
          api.analytics.overview(),
          api.analytics.monthly(),
          api.analytics.byCategory(),
          api.analytics.leaderboard(),
          api.analytics.predictive(),
        ]);
        const o = ov.overview;

        this.kpis = [
          { label:'Total Complaints', value:Number(o.total  ||0).toLocaleString(), delta:'+Today',  up:true,  bar:72, barColor:'bg-cyan-500' },
          { label:'Active Issues',    value:Number(o.active ||0).toLocaleString(), delta:'Live',     up:true,  bar:Math.min(100,Math.round((o.active/Math.max(o.total,1))*100)), barColor:'bg-blue-500' },
          { label:'Avg Resolution',   value:(o.avg_resolution_hours||0)+'h',       delta:'Target',   up:true,  bar:80, barColor:'bg-emerald-500' },
          { label:'SLA Breaches',     value:Number(o.sla_breaches||0).toLocaleString(), delta:'Alert', up:false, bar:Math.min(100,(o.sla_breaches||0)*5), barColor:'bg-red-500', color:'text-red-400' },
        ];

        this.departments = lb.leaderboard || [];

        this.chartCategories = (byCat.categories||[]).map((c,i) => ({
          label: c.category.charAt(0).toUpperCase() + c.category.slice(1),
          color: ['#06B6D4','#3B82F6','#8B5CF6','#F59E0B','#64748B','#10B981'][i]||'#64748B',
          pct:   c.total,
        }));

        this.aiInsights = (predictive.insights||[]).slice(0,1);

        await this.loadComplaints();
        this.$nextTick(() => this.initCharts(monthly.trend||[], byCat.categories||[]));

      } catch (err) {
        this.toast('Dashboard load failed: ' + err.message, 'error');
      } finally {
        this.loading.dashboard = false;
      }
    },

    /* ==========================================================
       COMPLAINTS TABLE
       ========================================================== */
    async loadComplaints() {
      this.loading.complaints = true;
      try {
        const params = { page: this.currentPage, limit: this.pageLimit };
        if (this.filterStatus)   params.status   = this.filterStatus;
        if (this.filterPriority) params.priority  = this.filterPriority;
        if (this.filterCategory) params.category  = this.filterCategory;
        if (this.searchQuery)    params.search    = this.searchQuery;

        let data;
        if (this.isCitizen)       data = await api.complaints.getMy(params);
        else if (this.isOfficer)  data = await api.complaints.getAssigned(params);
        else                      data = await api.complaints.getAll(params);

        this.complaints      = data.complaints || [];
        this.totalComplaints = data.total || 0;
      } catch (err) {
        this.toast('Could not load complaints: ' + err.message, 'error');
      } finally {
        this.loading.complaints = false;
      }
    },

    async deleteComplaint(id) {
      if (!confirm('Delete this complaint permanently?')) return;
      try {
        await api.complaints.remove(id);
        this.complaints = this.complaints.filter(c => c.id !== id);
        this.toast('Complaint deleted.');
      } catch (err) { this.toast(err.message, 'error'); }
    },

    async updateComplaintStatus(id, status, note = '') {
      try {
        await api.complaints.updateStatus(id, { status, resolution_note: note });
        const c = this.complaints.find(x => x.id === id);
        if (c) c.status = status;
        this.toast(`Status updated to "${status}".`);
      } catch (err) { this.toast(err.message, 'error'); }
    },

    /* ==========================================================
       SUBMIT PAGE
       ========================================================== */
    async loadZones() {
      try {
        const data = await api.zones.getAll();
        this.zones = data.zones || [];
        if (this.zones.length && !this.form.zone_id) {
          this.form.zone_id = this.zones[0].id;
        }
      } catch (_) {}
    },

    updateSLA() {
      const map = {
        high:  { roads:'24h',water:'12h',sanitation:'24h',electricity:'12h',parks:'48h',other:'48h' },
        medium:{ roads:'48h',water:'24h',sanitation:'48h',electricity:'24h',parks:'72h',other:'72h' },
        low:   { roads:'72h',water:'48h',sanitation:'72h',electricity:'48h',parks:'96h',other:'96h' },
      };
      const cat = this.form.category || 'other';
      const pri = this.form.priority  || 'medium';
      this.slaTime = (map[pri] && map[pri][cat]) || '48h';
    },

    handleMapClick(e) {
      const r = e.currentTarget.getBoundingClientRect();
      this.clickX = e.clientX - r.left;
      this.clickY = e.clientY - r.top;
      this.mapClicked = true;
    },
    handleDrop(e) {
      this.isDragOver = false;
      const f = e.dataTransfer.files[0];
      if (f) { this.uploadedFile = f; this.uploadedFileName = f.name; }
    },
    handleFileSelect(e) {
      const f = e.target.files[0];
      if (f) { this.uploadedFile = f; this.uploadedFileName = f.name; }
    },

    async submitComplaint() {
      if (!this.isLoggedIn) { this.showLogin = true; return; }
      if (!this.form.category || !this.form.title) {
        this.toast('Pick a category and enter a title first.', 'error'); return;
      }
      this.isSubmitting = true;
      try {
        const fd = new FormData();
        Object.entries(this.form).forEach(([k, v]) => { if (v) fd.append(k, v); });
        if (this.uploadedFile) fd.append('image', this.uploadedFile);

        const data = await api.complaints.create(fd);
        this.submitSuccess = true;
        this.complaintId   = data.complaint_id;
        this.complaintNo   = data.complaint_no;
        this.toast(`${data.complaint_no} submitted successfully! ✅`);
      } catch (err) {
        this.toast(err.message, 'error');
      } finally {
        this.isSubmitting = false;
      }
    },

    resetForm() {
      this.form             = { category:'', title:'', description:'', priority:'medium', zone_id: this.zones[0]?.id||'', address:'' };
      this.submitSuccess    = false;
      this.uploadedFile     = null;
      this.uploadedFileName = null;
      this.mapClicked       = false;
      this.slaTime          = '48h';
    },

    /* ==========================================================
       TRACKER
       ========================================================== */
    async lookupComplaint() {
      const q = this.trackId.trim();
      if (!q) return;
      this.loading.tracker  = true;
      this.trackedComplaint = null;
      this.trackerTimeline  = [];
      this.feedbackSubmitted = false;
      this.feedbackRating    = 0;
      try {
        // Public endpoint — works without login
        const data = await api.complaints.track(q);
        this.trackedComplaint = data.complaint;
        this.trackerTimeline  = data.timeline || [];
      } catch (err) {
        this.toast('Not found. Try e.g. CP-2847', 'error');
      } finally {
        this.loading.tracker = false;
      }
    },

    async openComplaint(c) {
      this.page = 'tracker';
      this.trackedComplaint = c;
      this.trackerTimeline  = [];
      this.feedbackSubmitted = false;
      this.feedbackRating    = 0;
      try {
        const data = await api.complaints.getOne(c.id);
        this.trackedComplaint = data.complaint;
        this.trackerTimeline  = data.timeline || [];
      } catch (_) {}
    },

    async submitFeedback() {
      if (!this.feedbackRating) { this.toast('Please select a star rating.', 'error'); return; }
      try {
        await api.complaints.feedback(this.trackedComplaint.id, {
          rating: this.feedbackRating,
          feedback_text: this.feedbackText,
        });
        this.feedbackSubmitted = true;
        this.toast('Feedback submitted! Thank you ⭐');
      } catch (err) { this.toast(err.message, 'error'); }
    },

    /* ==========================================================
       SLA HELPERS
       ========================================================== */
    slaRemaining(deadline) {
      if (!deadline) return '—';
      const diff = new Date(deadline) - new Date();
      if (diff <= 0) return 'Breached';
      const h = Math.floor(diff / 36e5);
      const d = Math.floor(h / 24);
      return d > 0 ? `${d}d ${h % 24}h left` : `${h}h left`;
    },
    slaClass(deadline, status) {
      if (!deadline || ['resolved','closed'].includes(status)) return 'text-emerald-400';
      const diff = new Date(deadline) - new Date();
      if (diff <= 0)        return 'text-red-400';
      if (diff < 6 * 36e5)  return 'text-amber-400';
      return 'text-emerald-400';
    },
    slaBadgeClass(c) {
      if (['resolved','closed'].includes(c.status)) return 'sla-ok';
      if (!c.sla_deadline) return 'sla-ok';
      const diff = new Date(c.sla_deadline) - new Date();
      if (diff <= 0)       return 'sla-breach';
      if (diff < 6 * 36e5) return 'sla-warn';
      return 'sla-ok';
    },
    slaBadgeLabel(c) {
      if (['resolved','closed'].includes(c.status)) return 'Done';
      if (!c.sla_deadline) return '—';
      return this.slaRemaining(c.sla_deadline);
    },

    /* ==========================================================
       MISC HELPERS
       ========================================================== */
    statusLabel(s) {
      return s === 'progress' ? 'In Progress' : (s||'').charAt(0).toUpperCase() + (s||'').slice(1);
    },
    mapCellColor(i) {
      return ['#0F172A','#1E293B','#0F172A','#1E293B','#0A0F1E','#1E293B'][i % 6];
    },
    formatDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    },

    /* ==========================================================
       CHARTS
       ========================================================== */
    initCharts(trendData, categoryData) {
      const barCanvas = document.getElementById('barChart');
      if (barCanvas) {
        if (barCanvas._chart) barCanvas._chart.destroy();
        barCanvas._chart = new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels:   trendData.map(r => r.month),
            datasets: [{
              data: trendData.map(r => r.total),
              backgroundColor: ctx => {
                const g = ctx.chart.ctx.createLinearGradient(0,0,0,200);
                g.addColorStop(0,'rgba(6,182,212,0.85)');
                g.addColorStop(1,'rgba(59,130,246,0.3)');
                return g;
              },
              borderRadius:8, borderSkipped:false,
            }]
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1E293B', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, titleColor:'#94A3B8', bodyColor:'#E2E8F0', padding:12, cornerRadius:8 } },
            scales: {
              x:{ grid:{display:false}, ticks:{color:'#64748B',font:{size:11}} },
              y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#64748B',font:{size:11}} }
            }
          }
        });
      }

      const donutCanvas = document.getElementById('donutChart');
      if (donutCanvas) {
        if (donutCanvas._chart) donutCanvas._chart.destroy();
        donutCanvas._chart = new Chart(donutCanvas, {
          type:'doughnut',
          data:{
            labels:   categoryData.map(c => c.category),
            datasets:[{ data:categoryData.map(c=>c.total), backgroundColor:['#06B6D4','#3B82F6','#8B5CF6','#F59E0B','#64748B','#10B981'], borderWidth:0, hoverOffset:4 }]
          },
          options:{ responsive:true, maintainAspectRatio:false, cutout:'72%', plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1E293B', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, titleColor:'#94A3B8', bodyColor:'#E2E8F0', padding:10, cornerRadius:8 } } }
        });
      }
    },

    /* ==========================================================
       INIT
       ========================================================== */
    async init() {
      // Load public stats for landing page
      this.loadLandingStats();

      // Page change triggers
      this.$watch('page', async val => {
        if (val === 'dashboard') await this.loadDashboard();
        if (val === 'submit')    await this.loadZones();
        if (val === 'tracker' && !this.trackedComplaint && this.isLoggedIn)
          await this.loadComplaints();
      });

      // Table filter watchers
      this.$watch('searchQuery',  () => { this.currentPage = 1; if (this.page === 'dashboard') this.loadComplaints(); });
      this.$watch('filterStatus', () => { this.currentPage = 1; if (this.page === 'dashboard') this.loadComplaints(); });

      // Load notifications if already logged in
      if (this.isLoggedIn) {
        this.loadNotifications();
        setInterval(() => this.loadNotifications(), 30000);
      }

      // Auto-logout when token expires (caught by API layer)
      window.addEventListener('token-expired', () => {
        this.token          = null;
        this.user           = null;
        this.tokenExpiresAt = null;
        this.notifications  = [];
        this.unreadCount    = 0;
        this.page           = 'landing';
        this.showLogin      = true;
        this.authError      = 'Your session has expired. Please sign in again.';
      });

      // Proactive expiry check every 60 seconds
      setInterval(() => {
        if (this.tokenExpiresAt && new Date(this.tokenExpiresAt) <= new Date()) {
          window.dispatchEvent(new CustomEvent('token-expired'));
        }
      }, 60000);
    },

    /* ==========================================================
       REGISTER FORM HELPERS
       ========================================================== */

    // Clear a single field error when user starts correcting it
    clearFieldError(field) {
      if (this.authFieldErrors && this.authFieldErrors[field]) {
        this.authFieldErrors = { ...this.authFieldErrors, [field]: null };
        // If no more errors, null out the whole object
        if (Object.values(this.authFieldErrors).every(v => !v)) {
          this.authFieldErrors = null;
        }
      }
    },

    // Real-time password strength meter (0=none, 1=weak, 2=fair, 3=good, 4=strong)
    checkPasswordStrength(pw) {
      if (!pw) { this.passwordStrength = 0; return; }
      let score = 0;
      if (pw.length >= 8)              score++;
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
      if (/[0-9]/.test(pw))            score++;
      if (/[^A-Za-z0-9]/.test(pw))     score++;
      this.passwordStrength = score;
    },

    /* ==========================================================
       SIDEBAR PANEL ROUTER
       ========================================================== */
    async loadSidebarPanel(panel) {
      if (panel === 'Dashboard')   { await this.loadDashboard(); return; }
      if (panel === 'Complaints')  { this.currentPage = 1; await this.loadComplaints(); return; }
      if (panel === 'Heatmap')     { await this.loadHeatmap(); return; }
      if (panel === 'Analytics')   { await this.loadAnalytics(); return; }
      if (panel === 'Departments') { await this.loadDepartmentsPanel(); return; }
      if (panel === 'SLA Rules')   { await this.loadSlaRules(); return; }
      if (panel === 'Leaderboard') { await this.loadLeaderboard(); return; }
      if (panel === 'Officers')    { await this.loadOfficers(); return; }
    },

    /* ==========================================================
       HEATMAP PANEL
       ========================================================== */
    async loadHeatmap() {
      this.loading.heatmap = true;
      try {
        const data = await api.analytics.heatmap();
        this.heatmapData = data.heatmap || [];
      } catch (err) {
        this.toast('Failed to load heatmap: ' + err.message, 'error');
      } finally {
        this.loading.heatmap = false;
      }
    },

    /* ==========================================================
       ANALYTICS PANEL
       ========================================================== */
    async loadAnalytics() {
      this.loading.analytics = true;
      try {
        const [monthly, byCat, violations, predictive] = await Promise.all([
          api.analytics.monthly(),
          api.analytics.byCategory(),
          api.analytics.violations(),
          api.analytics.predictive(),
        ]);

        this.slaViolations = violations.violations || [];
        this.aiInsights    = predictive.insights   || [];

        this.chartCategories = (byCat.categories || []).map((c, i) => ({
          label: c.category.charAt(0).toUpperCase() + c.category.slice(1),
          color: ['#06B6D4','#3B82F6','#8B5CF6','#F59E0B','#64748B','#10B981'][i] || '#64748B',
          pct:   c.total,
        }));

        this.$nextTick(() => {
          this.initNamedChart('analyticsBarChart',   monthly.trend    || [], byCat.categories || []);
          this.initNamedChart('analyticsDonutChart', monthly.trend    || [], byCat.categories || []);
        });
      } catch (err) {
        this.toast('Failed to load analytics: ' + err.message, 'error');
      } finally {
        this.loading.analytics = false;
      }
    },

    /* ==========================================================
       DEPARTMENTS PANEL
       ========================================================== */
    async loadDepartmentsPanel() {
      this.loading.departments = true;
      try {
        const [lb] = await Promise.all([api.analytics.leaderboard()]);
        this.departments = lb.leaderboard || [];
      } catch (err) {
        this.toast('Failed to load departments: ' + err.message, 'error');
      } finally {
        this.loading.departments = false;
      }
    },

    /* ==========================================================
       SLA RULES PANEL
       ========================================================== */
    async loadSlaRules() {
      this.loading.sla = true;
      try {
        const data = await api.get('/sla');
        this.slaRules = data.rules || [];
      } catch (err) {
        this.toast('Failed to load SLA rules: ' + err.message, 'error');
      } finally {
        this.loading.sla = false;
      }
    },

    async saveSlaRule(rule) {
      try {
        await api.put('/sla/' + rule.id, { sla_hours: parseInt(this.editingSlaHours) });
        rule.sla_hours   = parseInt(this.editingSlaHours);
        this.editingSlaId = null;
        this.toast('SLA rule updated.');
      } catch (err) {
        this.toast(err.message, 'error');
      }
    },

    /* ==========================================================
       LEADERBOARD PANEL
       ========================================================== */
    async loadLeaderboard() {
      // Departments array is shared — already loaded by loadDashboard
      // Refresh if empty
      if (!this.departments.length) {
        try {
          const data = await api.analytics.leaderboard();
          this.departments = data.leaderboard || [];
        } catch (err) { this.toast(err.message, 'error'); }
      }
    },

    /* ==========================================================
       OFFICERS PANEL
       ========================================================== */
    async loadOfficers() {
      this.loading.officers = true;
      try {
        const data = await api.get('/users?role=officer&limit=50');
        this.officersList = data.users || [];
      } catch (err) {
        this.toast('Failed to load officers: ' + err.message, 'error');
      } finally {
        this.loading.officers = false;
      }
    },

    /* ==========================================================
       NAMED CHART HELPER (for analytics panel separate canvases)
       ========================================================== */
    initNamedChart(canvasId, trendData, categoryData) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      if (canvas._chart) canvas._chart.destroy();

      const isDonut = canvasId.toLowerCase().includes('donut');
      if (isDonut) {
        canvas._chart = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels:   categoryData.map(c => c.category),
            datasets: [{ data: categoryData.map(c => c.total), backgroundColor: ['#06B6D4','#3B82F6','#8B5CF6','#F59E0B','#64748B','#10B981'], borderWidth: 0, hoverOffset: 4 }]
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 8 } } }
        });
      } else {
        canvas._chart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels:   trendData.map(r => r.month),
            datasets: [{ data: trendData.map(r => r.total), backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0,0,0,200); g.addColorStop(0,'rgba(6,182,212,0.85)'); g.addColorStop(1,'rgba(59,130,246,0.3)'); return g; }, borderRadius: 8, borderSkipped: false }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#E2E8F0', padding: 10, cornerRadius: 8 } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748B', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748B', font: { size: 11 } } } } }
        });
      }
    },

  }; // end return
} // end app()