/* ============================================================
   CivicPulse — app.js
   Alpine.js Application Logic + Chart.js Initialization
   ============================================================ */

/* ---------- Tailwind Config (must run before Tailwind CDN) ---------- */
window.tailwindConfig = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        dm: ['DM Sans', 'sans-serif'],
      },
      colors: {
        midnight: '#0A0F1E',
        navy: '#0F172A',
        cyan: { DEFAULT: '#06B6D4', glow: 'rgba(6,182,212,0.4)' },
        neon: '#3B82F6',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-up': 'slideUp 0.6s ease both',
        'fade-in': 'fadeIn 0.5s ease both',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        float:     { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% center' }, '100%': { backgroundPosition: '200% center' } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(32px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        glowPulse: { '0%,100%': { boxShadow: '0 0 8px rgba(6,182,212,0.4)' }, '50%': { boxShadow: '0 0 24px rgba(6,182,212,0.9)' } },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        'cyan': '0 0 20px rgba(6,182,212,0.3)',
        'cyan-lg': '0 0 40px rgba(6,182,212,0.5)',
        'card': '0 4px 30px rgba(0,0,0,0.4)',
        'float': '0 20px 60px rgba(0,0,0,0.5)',
      }
    }
  }
};

/* ============================================================
   Alpine.js App Component
   ============================================================ */
function app() {
  return {

    /* ---------- State ---------- */
    page: 'landing',
    mobileMenu: false,
    showNotifs: false,
    activeSidebar: 'Dashboard',
    searchQuery: '',
    filterStatus: '',
    trackId: '',
    trackedComplaint: null,
    selectedComplaint: null,
    feedbackRating: 0,
    feedbackText: '',
    feedbackSubmitted: false,
    liveComplaints: 47,
    isSubmitting: false,
    submitSuccess: false,
    complaintId: '',
    uploadedFile: null,
    isDragOver: false,
    mapClicked: false,
    clickX: 0,
    clickY: 0,
    slaTime: '48 hours',

    form: {
      category: '',
      title: '',
      description: '',
      priority: 'medium',
      zone: 'zone1',
    },

    /* ---------- Notifications ---------- */
    notifications: [
      { id: 1, type: 'breach', msg: 'Sewage overflow in Zone 1 breached SLA',    time: '2 min ago' },
      { id: 2, type: 'warn',   msg: '4 complaints nearing SLA deadline',          time: '15 min ago' },
      { id: 3, type: 'breach', msg: 'Road repair in Zone 3 overdue by 6h',        time: '1 hr ago' },
    ],

    /* ---------- Landing – Hero Stats ---------- */
    stats: [
      { label: 'Issues Resolved',    display: '14,782' },
      { label: 'Active Complaints',  display: '341' },
      { label: 'Avg Resolution',     display: '18h' },
      { label: 'SLA Compliance',     display: '98%' },
    ],

    /* ---------- Landing – Feature Cards ---------- */
    features: [
      {
        icon: '📍', title: 'GPS-Pinned Reporting',
        desc: 'Citizens submit complaints with real-time coordinates and photo evidence. Auto-assigns to the correct department.',
        iconBg: 'bg-cyan-500/15 text-cyan-400', hoverGlow: 'bg-gradient-to-br from-cyan-500/5 to-transparent'
      },
      {
        icon: '⏱', title: 'SLA Countdown Engine',
        desc: 'Every complaint has a live countdown. Auto-escalates with red glow alerts when SLA thresholds are breached.',
        iconBg: 'bg-blue-500/15 text-blue-400', hoverGlow: 'bg-gradient-to-br from-blue-500/5 to-transparent'
      },
      {
        icon: '🔥', title: 'Area Risk Heatmaps',
        desc: 'Interactive geo-density maps reveal complaint hotspots. Areas scored Low / Medium / High risk by frequency.',
        iconBg: 'bg-violet-500/15 text-violet-400', hoverGlow: 'bg-gradient-to-br from-violet-500/5 to-transparent'
      },
      {
        icon: '🏆', title: 'Department Leaderboard',
        desc: 'Gamified rankings by resolution speed, SLA compliance, and citizen feedback score across departments.',
        iconBg: 'bg-emerald-500/15 text-emerald-400', hoverGlow: 'bg-gradient-to-br from-emerald-500/5 to-transparent'
      },
      {
        icon: '🔮', title: 'Predictive AI Insights',
        desc: 'Trend analysis flags emerging patterns before they spike. Proactive urban management, not reactive.',
        iconBg: 'bg-amber-500/15 text-amber-400', hoverGlow: 'bg-gradient-to-br from-amber-500/5 to-transparent'
      },
      {
        icon: '📊', title: 'Live Analytics Dashboard',
        desc: 'Animated KPI cards, monthly trend charts, and resolution time analytics updating in real time.',
        iconBg: 'bg-red-500/15 text-red-400', hoverGlow: 'bg-gradient-to-br from-red-500/5 to-transparent'
      },
    ],

    /* ---------- Status Cards ---------- */
    statusCards: [
      { icon: '🔴', name: 'Open',        color: 'text-orange-400', desc: 'Complaint filed. Awaiting assignment.',                     glow: 'bg-orange-500' },
      { icon: '🔵', name: 'In Progress', color: 'text-blue-400',   desc: 'Officer assigned. Active work underway with SLA countdown.', glow: 'bg-blue-500' },
      { icon: '✅', name: 'Resolved',    color: 'text-emerald-400', desc: 'Issue fixed. Citizen notified for feedback.',               glow: 'bg-emerald-500' },
      { icon: '⬛', name: 'Closed',      color: 'text-slate-400',   desc: 'Feedback received. Archived in logs.',                      glow: 'bg-slate-500' },
    ],

    /* ---------- Complaint Submission – Categories ---------- */
    categories: [
      { val: 'roads',       icon: '🛣',  label: 'Roads' },
      { val: 'water',       icon: '💧',  label: 'Water' },
      { val: 'sanitation',  icon: '🗑',  label: 'Sanitation' },
      { val: 'electricity', icon: '⚡',  label: 'Electricity' },
      { val: 'parks',       icon: '🌳',  label: 'Parks' },
      { val: 'other',       icon: '📋',  label: 'Other' },
    ],

    /* ---------- Map Dots ---------- */
    mapDots: [
      { id: 1, top: '25%', left: '30%', color: 'red',   bg: '#EF4444' },
      { id: 2, top: '40%', left: '60%', color: 'amber', bg: '#F59E0B' },
      { id: 3, top: '65%', left: '45%', color: 'amber', bg: '#F59E0B' },
      { id: 4, top: '20%', left: '70%', color: 'green', bg: '#10B981' },
      { id: 5, top: '55%', left: '20%', color: 'red',   bg: '#EF4444' },
      { id: 6, top: '70%', left: '75%', color: 'green', bg: '#10B981' },
    ],

    /* ---------- Dashboard – Sidebar ---------- */
    sidebarItems: [
      { icon: '⚡', label: 'Dashboard' },
      { icon: '📋', label: 'Complaints' },
      { icon: '🗺',  label: 'Heatmap' },
      { icon: '📈', label: 'Analytics' },
    ],
    sidebarManage: [
      { icon: '🏢', label: 'Departments' },
      { icon: '⚙️', label: 'SLA Rules' },
      { icon: '🏆', label: 'Leaderboard' },
      { icon: '👤', label: 'Officers' },
    ],

    /* ---------- Dashboard – KPIs ---------- */
    kpis: [
      { label: 'Total Complaints', value: '2,847', delta: '+12%',   up: true,  bar: 72, barColor: 'bg-cyan-500' },
      { label: 'Active Issues',    value: '341',   delta: '-5%',    up: true,  bar: 34, barColor: 'bg-blue-500' },
      { label: 'Avg Resolution',   value: '18h',   delta: 'Better', up: true,  bar: 80, barColor: 'bg-emerald-500' },
      { label: 'SLA Breaches',     value: '14',    delta: 'Alert',  up: false, bar: 14, barColor: 'bg-red-500', color: 'text-red-400' },
    ],

    /* ---------- Dashboard – Chart Categories ---------- */
    chartCategories: [
      { label: 'Roads & Potholes', color: '#06B6D4', pct: 34 },
      { label: 'Water Supply',     color: '#3B82F6', pct: 28 },
      { label: 'Sanitation',       color: '#8B5CF6', pct: 19 },
      { label: 'Electricity',      color: '#F59E0B', pct: 12 },
      { label: 'Other',            color: '#64748B', pct: 7  },
    ],

    /* ---------- Departments ---------- */
    departments: [
      { name: 'Roads & Infra',  icon: '🛣',  iconBg: 'bg-cyan-500/15',    resolved: 342, avgTime: '16h', rating: 4.7, sla: 2, efficiency: 92 },
      { name: 'Water Supply',   icon: '💧',  iconBg: 'bg-blue-500/15',    resolved: 289, avgTime: '21h', rating: 4.4, sla: 4, efficiency: 85 },
      { name: 'Sanitation',     icon: '🗑',  iconBg: 'bg-violet-500/15',  resolved: 231, avgTime: '24h', rating: 4.1, sla: 7, efficiency: 78 },
      { name: 'Electricity',    icon: '⚡',  iconBg: 'bg-amber-500/15',   resolved: 198, avgTime: '12h', rating: 4.6, sla: 3, efficiency: 89 },
      { name: 'Parks & Garden', icon: '🌳',  iconBg: 'bg-emerald-500/15', resolved: 156, avgTime: '36h', rating: 3.9, sla: 9, efficiency: 71 },
    ],

    /* ---------- Complaints Data ---------- */
    complaints: [
      {
        id: '2847', issue: 'Broken streetlight near school', zone: 'Zone 3',
        priority: 'high', status: 'progress', slaStatus: 'warn', slaLabel: '18h left',
        submitted: '2h ago', dept: 'Electricity Dept', officer: 'Ravi Kumar', cat: 'Electricity',
        timeline: [
          { label: 'Complaint Submitted', time: '27 Feb, 9:42 AM',  desc: 'Complaint registered. ID #CP-2847 assigned.',                   color: '#06B6D4', active: false },
          { label: 'Under Review',        time: '27 Feb, 10:15 AM', desc: 'Department head reviewed. Priority marked High.',                color: '#3B82F6', active: false },
          { label: 'Officer Assigned',    time: '27 Feb, 11:00 AM', desc: 'Officer Ravi Kumar assigned. SLA countdown started.',            color: '#F59E0B', active: true  },
          { label: 'Resolution',          time: 'Pending',          desc: 'Expected within 18 hours.',                                     color: '#334155', active: false },
          { label: 'Closed',              time: '—',                desc: '—',                                                             color: '#1E293B', active: false },
        ]
      },
      {
        id: '2846', issue: 'Sewage overflow on main road', zone: 'Zone 1',
        priority: 'high', status: 'open', slaStatus: 'breach', slaLabel: 'Breached',
        submitted: '4h ago', dept: 'Sanitation Dept', officer: 'Unassigned', cat: 'Sanitation',
        timeline: [
          { label: 'Complaint Submitted', time: '27 Feb, 7:30 AM',  desc: 'Complaint registered by citizen.',                              color: '#06B6D4', active: false },
          { label: 'Breach Detected',     time: '27 Feb, 11:30 AM', desc: 'SLA breached. Auto-escalation triggered to senior officer.',     color: '#EF4444', active: true  },
          { label: 'Officer Assigned',    time: 'Pending',          desc: 'Urgent assignment in progress.',                                color: '#334155', active: false },
          { label: 'Resolution',          time: '—',                desc: '—',                                                             color: '#1E293B', active: false },
          { label: 'Closed',              time: '—',                desc: '—',                                                             color: '#1E293B', active: false },
        ]
      },
      {
        id: '2845', issue: 'Large pothole on MG Road', zone: 'Zone 2',
        priority: 'medium', status: 'progress', slaStatus: 'ok', slaLabel: '36h left',
        submitted: '6h ago', dept: 'Roads & Infra', officer: 'Suresh Patel', cat: 'Roads',
        timeline: [
          { label: 'Complaint Submitted', time: '27 Feb, 6:00 AM', desc: 'Reported by citizen with photo.',             color: '#06B6D4', active: false },
          { label: 'Under Review',        time: '27 Feb, 7:30 AM', desc: 'Reviewed and confirmed by supervisor.',        color: '#3B82F6', active: false },
          { label: 'Officer Assigned',    time: '27 Feb, 9:00 AM', desc: 'Road crew dispatched.',                        color: '#F59E0B', active: true  },
          { label: 'Resolution',          time: 'Pending',         desc: 'Road repair scheduled.',                       color: '#334155', active: false },
          { label: 'Closed',              time: '—',               desc: '—',                                            color: '#1E293B', active: false },
        ]
      },
      {
        id: '2844', issue: 'Park garbage not collected', zone: 'Zone 4',
        priority: 'low', status: 'resolved', slaStatus: 'ok', slaLabel: 'Done',
        submitted: '1d ago', dept: 'Sanitation Dept', officer: 'Priya Singh', cat: 'Sanitation',
        timeline: [
          { label: 'Complaint Submitted', time: '26 Feb, 10:00 AM', desc: 'Reported via mobile app.',            color: '#06B6D4', active: false },
          { label: 'Under Review',        time: '26 Feb, 11:00 AM', desc: 'Confirmed and assigned.',              color: '#3B82F6', active: false },
          { label: 'Officer Assigned',    time: '26 Feb, 12:00 PM', desc: 'Priya Singh assigned.',                color: '#F59E0B', active: false },
          { label: 'Resolved',            time: '26 Feb, 4:00 PM',  desc: 'Garbage collected. Area cleaned.',     color: '#10B981', active: true  },
          { label: 'Closed',              time: '27 Feb, 9:00 AM',  desc: 'Citizen confirmed. ★★★★★',            color: '#06B6D4', active: false },
        ]
      },
      {
        id: '2843', issue: 'Water supply cut for 24 hours', zone: 'Zone 2',
        priority: 'high', status: 'progress', slaStatus: 'warn', slaLabel: '6h left',
        submitted: '10h ago', dept: 'Water Supply', officer: 'Amit Verma', cat: 'Water',
        timeline: [
          { label: 'Complaint Submitted', time: '26 Feb, 11:00 PM', desc: 'Emergency complaint submitted.',           color: '#06B6D4', active: false },
          { label: 'Emergency Flag',      time: '26 Feb, 11:30 PM', desc: 'Flagged as emergency. Escalated.',         color: '#EF4444', active: false },
          { label: 'Officer Assigned',    time: '27 Feb, 1:00 AM',  desc: 'Amit Verma deployed.',                    color: '#F59E0B', active: true  },
          { label: 'Resolution',          time: 'Pending',          desc: 'Pipe repair in progress.',                 color: '#334155', active: false },
          { label: 'Closed',              time: '—',                desc: '—',                                        color: '#1E293B', active: false },
        ]
      },
      {
        id: '2842', issue: 'Electricity pole leaning dangerously', zone: 'Zone 1',
        priority: 'high', status: 'resolved', slaStatus: 'ok', slaLabel: 'Done',
        submitted: '2d ago', dept: 'Electricity Dept', officer: 'Rahul Das', cat: 'Electricity',
        timeline: [
          { label: 'Complaint Submitted', time: '25 Feb, 8:00 AM',  desc: 'Reported with photo evidence.',    color: '#06B6D4', active: false },
          { label: 'Under Review',        time: '25 Feb, 9:00 AM',  desc: 'Marked critical.',                  color: '#3B82F6', active: false },
          { label: 'Officer Assigned',    time: '25 Feb, 10:00 AM', desc: 'Rahul Das with crew.',              color: '#F59E0B', active: false },
          { label: 'Resolved',            time: '25 Feb, 3:00 PM',  desc: 'Pole secured. Area safe.',          color: '#10B981', active: true  },
          { label: 'Closed',              time: '26 Feb, 10:00 AM', desc: 'Verified and closed.',              color: '#06B6D4', active: false },
        ]
      },
    ],

    /* ---------- Computed – Filtered Complaints ---------- */
    get filteredComplaints() {
      return this.complaints.filter(c => {
        const q = this.searchQuery.toLowerCase();
        const matchSearch = !q || c.issue.toLowerCase().includes(q) || c.id.includes(q);
        const matchStatus = !this.filterStatus || c.status === this.filterStatus;
        return matchSearch && matchStatus;
      });
    },

    /* ---------- Helpers ---------- */

    /** Returns alternating dark navy colours for the fake map grid cells */
    mapCellColor(i) {
      const colors = ['#0F172A', '#1E293B', '#0F172A', '#1E293B', '#0A0F1E', '#1E293B'];
      return colors[i % colors.length];
    },

    /** Recalculates the SLA preview based on selected category + priority */
    updateSLA() {
      const slaMap = {
        high:   { roads: '24 hours', water: '12 hours', sanitation: '24 hours', electricity: '12 hours', parks: '48 hours', other: '48 hours' },
        medium: { roads: '48 hours', water: '24 hours', sanitation: '48 hours', electricity: '24 hours', parks: '72 hours', other: '72 hours' },
        low:    { roads: '72 hours', water: '48 hours', sanitation: '72 hours', electricity: '48 hours', parks: '96 hours', other: '96 hours' },
      };
      const cat = this.form.category || 'other';
      const pri = this.form.priority  || 'medium';
      this.slaTime = (slaMap[pri] && slaMap[pri][cat]) || '48 hours';
    },

    /** Places the red pin marker on the map when citizen clicks */
    handleMapClick(e) {
      const rect = e.currentTarget.getBoundingClientRect();
      this.clickX = e.clientX - rect.left;
      this.clickY = e.clientY - rect.top;
      this.mapClicked = true;
    },

    /** Handles drag-and-drop file upload */
    handleDrop(e) {
      this.isDragOver = false;
      const file = e.dataTransfer.files[0];
      if (file) this.uploadedFile = file.name;
    },

    /** Handles click-to-browse file select */
    handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) this.uploadedFile = file.name;
    },

    /** Simulates API call with spinner → success state */
    async submitComplaint() {
  if (!this.form.category || !this.form.title) return;

  this.isSubmitting = true;

  try {
    const res = await fetch("http://localhost:5000/api/complaints", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(this.form)
    });

    const data = await res.json();

    if (data.success) {
      this.submitSuccess = true;
      this.complaintId = data.id;
    }

  } catch (err) {
    console.error("Error submitting complaint:", err);
  }

  this.isSubmitting = false;
},

    /** Resets the complaint form back to initial state */
    resetForm() {
      this.form          = { category: '', title: '', description: '', priority: 'medium', zone: 'zone1' };
      this.submitSuccess = false;
      this.uploadedFile  = null;
      this.mapClicked    = false;
      this.slaTime       = '48 hours';
    },

    /** Looks up a complaint by ID from the tracker search bar */
    lookupComplaint() {
      const id    = this.trackId.replace(/[^0-9]/g, '');
      const found = this.complaints.find(c => c.id === id);
      this.trackedComplaint  = found || this.complaints[0];
      this.feedbackSubmitted = false;
      this.feedbackRating    = 0;
    },

    /** Submits citizen feedback on a resolved complaint */
    submitFeedback() {
      this.feedbackSubmitted = true;
    },

    /* ---------- Chart.js Initialization ---------- */
    initCharts() {
      // ── Bar Chart – Monthly Complaints ──
      const barCanvas = document.getElementById('barChart');
      if (barCanvas && !barCanvas._chartInitialized) {
        barCanvas._chartInitialized = true;
        new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
            datasets: [{
              data: [320, 410, 280, 520, 390, 547],
              backgroundColor: (ctx) => {
                const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
                g.addColorStop(0, 'rgba(6,182,212,0.8)');
                g.addColorStop(1, 'rgba(59,130,246,0.3)');
                return g;
              },
              borderRadius: 8,
              borderSkipped: false,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1E293B',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#94A3B8',
                bodyColor: '#E2E8F0',
                padding: 12,
                cornerRadius: 8,
              }
            },
            scales: {
              x: {
                grid: { display: false, drawBorder: false },
                ticks: { color: '#64748B', font: { size: 11 } }
              },
              y: {
                grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                ticks: { color: '#64748B', font: { size: 11 } }
              }
            }
          }
        });
      }

      // ── Doughnut Chart – Category Breakdown ──
      const donutCanvas = document.getElementById('donutChart');
      if (donutCanvas && !donutCanvas._chartInitialized) {
        donutCanvas._chartInitialized = true;
        new Chart(donutCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Roads', 'Water', 'Sanitation', 'Electricity', 'Other'],
            datasets: [{
              data: [34, 28, 19, 12, 7],
              backgroundColor: ['#06B6D4', '#3B82F6', '#8B5CF6', '#F59E0B', '#64748B'],
              borderWidth: 0,
              hoverOffset: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1E293B',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#94A3B8',
                bodyColor: '#E2E8F0',
                padding: 10,
                cornerRadius: 8,
              }
            }
          }
        });
      }
    },
async loadComplaints() {
  try {
    const res = await fetch("http://localhost:5000/api/complaints");
    const data = await res.json();

    this.complaints = data;
  } catch (err) {
    console.error("Error loading complaints:", err);
  }
},
    /* ---------- init() – Runs on Alpine component mount ---------- */
    init() {
      // Immediately set display values (count-up feel is handled by animation)
      this.stats = this.stats.map((s, i) => ({
        ...s,
        display: ['14,782', '341', '18h', '98%'][i]
      }));

      // Simulate live complaint ticking counter
      setInterval(() => {
        if (Math.random() > 0.7) this.liveComplaints++;
      }, 8000);

      // Init charts whenever user navigates to the dashboard
      this.$watch('page', (val) => {
        if (val === 'dashboard') {
          setTimeout(() => this.initCharts(), 120);
        }
      });
      this.loadComplaints();
    }

  }; // end return
} // end app()