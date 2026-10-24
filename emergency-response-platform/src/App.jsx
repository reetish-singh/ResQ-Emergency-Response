import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Login from "./auth/Login.jsx";
import Signup from "./auth/Signup.jsx";
import EmergencyMap from "./EmergencyMap.jsx";
import ResponderLiveMap from "./ResponderLiveMap.jsx";
import MapLocationPicker from "./MapLocationPicker.jsx";
import "./App.css";
import "leaflet/dist/leaflet.css";
import "./map.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const SOCKET_URL = API_URL.replace(/\/api$/, "");

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("resq-token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `Request failed: ${response.status}`
    );
  }

  return data;
}

const initialReports = [
  {
    id: 1001,
    type: "Medical Emergency",
    location: "City Hospital Road",
    severity: "Critical",
    status: "Pending",
    description: "Urgent medical assistance required.",
    phone: "",
    time: new Date().toLocaleString(),
  },
  {
    id: 1002,
    type: "Road Accident",
    location: "Main Market Junction",
    severity: "High",
    status: "Dispatched",
    description: "Vehicle collision reported.",
    phone: "",
    time: new Date().toLocaleString(),
  },
  {
    id: 1003,
    type: "Fire",
    location: "Industrial Area",
    severity: "Medium",
    status: "Resolved",
    description: "Small fire reported in a building.",
    phone: "",
    time: new Date().toLocaleString(),
  },
];

const emptyForm = {
  type: "Medical Emergency",
  location: "",
  severity: "High",
  phone: "",
  description: "",
};

function readReports() {
  try {
    const saved = localStorage.getItem("ero-reports");
    return saved ? JSON.parse(saved) : initialReports;
  } catch {
    return initialReports;
  }
}

function readActivities() {
  try {
    const saved = localStorage.getItem("resq-activities");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function readNotifications() {
  try {
    const saved = localStorage.getItem("resq-notifications");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}


function exportIncidentPdf(report) {
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fields = [
    ["Incident ID", report._id || report.id],
    ["Type", report.type],
    ["Location", report.location],
    ["Severity", report.severity],
    ["Status", report.status],
    ["Description", report.description],
    ["Reported", report.time || (report.createdAt ? new Date(report.createdAt).toLocaleString() : "")],
    ["Latitude", report.latitude],
    ["Longitude", report.longitude],
    ["Contact", report.phone],
    ["Assigned responder", report.assignedTo?.name || report.assignedTo?.email || report.assignedTo || "Not assigned"],
  ];
  const win = window.open("", "_blank", "width=850,height=700");
  if (!win) {
    window.alert("Please allow pop-ups for this site to export the PDF report.");
    return;
  }
  const rows = fields.filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ResQ Incident Report</title>
    <style>
      body{font-family:Arial,sans-serif;color:#172033;margin:36px;line-height:1.45}
      header{border-bottom:3px solid #dc2626;padding-bottom:14px;margin-bottom:24px}
      h1{margin:0;color:#b91c1c;font-size:25px} .sub{color:#667085;margin-top:6px}
      table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:11px;border:1px solid #dfe5ec;vertical-align:top}
      th{width:30%;background:#f6f8fb} .note{margin-top:24px;color:#667085;font-size:12px}
      @media print{button{display:none}body{margin:18mm}}
    </style></head><body><header><h1>ResQ Emergency Services</h1>
    <div class="sub">Incident Report • Generated ${escapeHtml(new Date().toLocaleString())}</div></header>
    <table>${rows}</table><p class="note">This report is generated from the ResQ incident record. Verify details before operational use.</p>
    <button onclick="window.print()">Print / Save as PDF</button>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  win.document.close();
}

export default function App({ user }) {
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [form, setForm] = useState(emptyForm);
  const [classificationSuggestion, setClassificationSuggestion] = useState(null);
  const [classifying, setClassifying] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: "", longitude: "" });
  const [notice, setNotice] = useState("");
  const [notifications, setNotifications] = useState(readNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activities, setActivities] = useState(readActivities);
  const [directory, setDirectory] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [alertForm, setAlertForm] = useState({ title: "Emergency Alert", message: "", severity: "critical" });
  const [alertSending, setAlertSending] = useState(false);
  const [emergencyPopup, setEmergencyPopup] = useState(null);
  const [tracking, setTracking] = useState([]);
  const [locations, setLocations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [alertAnalytics, setAlertAnalytics] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const yes=()=>setOnline(true),no=()=>setOnline(false);
    window.addEventListener("online",yes);window.addEventListener("offline",no);
    return ()=>{window.removeEventListener("online",yes);window.removeEventListener("offline",no);};
  }, []);
  useEffect(()=>{
    if(user?.role!=="admin")return;
    let cancelled=false;
    async function refresh(){
      try{
        const [t,l,a,stats]=await Promise.all([apiRequest("/notifications/tracking"),apiRequest("/operations/locations"),apiRequest("/operations/audit"),apiRequest("/operations/analytics")]);
        if(!cancelled){setTracking(t.notifications||[]);setLocations(l.locations||[]);setAuditLogs(a.logs||[]);setAlertAnalytics(stats);}
      }catch(error){console.warn("Operations refresh:",error.message);}
    }
    void refresh();const timer=setInterval(refresh,10000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[user?.role,refreshTick]);
  useEffect(()=>{
    if(user?.role!=="responder"||!sharingLocation||!navigator.geolocation)return;
    const id=navigator.geolocation.watchPosition(async(position)=>{
      try{await apiRequest("/operations/location",{method:"POST",body:JSON.stringify({latitude:position.coords.latitude,longitude:position.coords.longitude})});}
      catch(error){setNotice(`GPS sharing failed: ${error.message}`);}
    },(error)=>setNotice(`GPS unavailable: ${error.message}`),{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
    return ()=>navigator.geolocation.clearWatch(id);
  },[user?.role,sharingLocation]);

 useEffect(() => {
  let cancelled = false;

  async function loadReports() {
    try {
      setReportsLoading(true);

      const data = await apiRequest("/incidents");

      if (!cancelled) {
        const normalizedReports = (data.incidents || []).map((incident) => ({
          ...incident,
          id: incident._id || incident.id,
          time: incident.createdAt
            ? new Date(incident.createdAt).toLocaleString()
            : "",
        }));

        setReports(normalizedReports);
      }
    } catch (error) {
      console.error("Failed to load incidents:", error);

      if (!cancelled) {
        setNotice(`Could not load reports: ${error.message}`);
      }
    } finally {
      if (!cancelled) {
        setReportsLoading(false);
      }
    }
  }

  loadReports();

  return () => {
    cancelled = true;
  };
}, []);

  // Socket.IO: receive incident changes without waiting for a page refresh.
  useEffect(() => {
    // Send the same JWT used by apiRequest so the backend can authenticate
    // this Socket.IO connection. Never send a user ID or role from the client.
    const socketToken = localStorage.getItem("resq-token");

    const socket = io(SOCKET_URL, {
      auth: socketToken ? { token: socketToken } : {},
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    let disposed = false;

    async function refreshIncidents() {
      try {
        const data = await apiRequest("/incidents");
        if (disposed) return;

        const normalizedReports = (data.incidents || []).map((incident) => ({
          ...incident,
          id: incident._id || incident.id,
          time: incident.createdAt
            ? new Date(incident.createdAt).toLocaleString()
            : "",
        }));
        setReports(normalizedReports);
      } catch (error) {
        console.error("Could not refresh incidents after real-time event:", error);
      }
    }

    async function refreshServerNotifications() {
      try {
        const data = await apiRequest("/notifications");
        if (disposed) return;

        setNotifications((data.notifications || []).map((item) => ({
          id: item._id,
          title: item.title,
          message: item.message,
          time: item.createdAt ? new Date(item.createdAt).toLocaleString() : "",
          read: Boolean(item.readAt),
          severity: item.severity,
          incident: item.incident,
        })));
      } catch (error) {
        console.warn("Could not refresh notifications after socket event:", error.message);
      }
    }

    const onIncidentChanged = () => { void refreshIncidents(); };
    const onCriticalIncident = (payload) => {
      void refreshIncidents();
      void refreshServerNotifications();
      if (payload?.message) {
        setNotice(`🚨 Critical emergency: ${payload.message}`);
      }
    };
    const onNotification = (item) => {
      if (!item) return;
      const incomingSeverity = String(item.severity || "info").toLowerCase();
      // Show an in-app popup for incoming emergency notifications.
      setEmergencyPopup({
        id: item._id || item.id || `${Date.now()}`,
        title: item.title || "ResQ Emergency Alert",
        message: item.message || "A new emergency update is available.",
        severity: incomingSeverity,
        time: item.createdAt ? new Date(item.createdAt).toLocaleString() : new Date().toLocaleString(),
      });
      if (incomingSeverity === "critical") playEmergencyTone();
      setNotifications((previous) => {
        const notificationId = item._id || item.id;
        if (notificationId && previous.some((entry) => String(entry.id) === String(notificationId))) {
          return previous;
        }
        const next = {
          id: notificationId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: item.title || "ResQ notification",
          message: item.message || "A ResQ update is available.",
          time: item.createdAt ? new Date(item.createdAt).toLocaleString() : new Date().toLocaleString(),
          read: Boolean(item.readAt),
          severity: item.severity || "warning",
          incident: item.incident,
        };
        return [next, ...previous].slice(0, 50);
      });
    };

    socket.on("connect", () => {
      setLiveConnected(true);
      console.info("ResQ authenticated real-time connection established.");
      // Re-sync after connecting/reconnecting so missed events are recovered.
      void refreshIncidents();
      void refreshServerNotifications();
    });
    socket.on("disconnect",()=>setLiveConnected(false));
    socket.on("connect_error", (error) => {
      setLiveConnected(false);
      console.warn("ResQ real-time connection error:", error.message);
    });
    socket.on("incident:created", onIncidentChanged);
    socket.on("incident:updated", onIncidentChanged);
    socket.on("incident:deleted", onIncidentChanged);
    socket.on("critical-incident", onCriticalIncident);
    socket.on("notification:new", onNotification);
    socket.on("notification:acknowledged",()=>setRefreshTick(x=>x+1));
    socket.on("alert:escalated",(payload)=>{setNotice(`⚠️ Alert escalation: ${payload.title}`);setRefreshTick(x=>x+1);});
    socket.on("responder:location",()=>setRefreshTick(x=>x+1));
    socket.on("responder:assigned", (payload) => {
      if (payload?.message) setNotice(payload.message);
      void refreshIncidents();
      void refreshServerNotifications();
    });

    return () => {
      disposed = true;
      socket.off("incident:created", onIncidentChanged);
      socket.off("incident:updated", onIncidentChanged);
      socket.off("incident:deleted", onIncidentChanged);
      socket.off("critical-incident", onCriticalIncident);
      socket.off("notification:new", onNotification);
      socket.off("notification:acknowledged");socket.off("alert:escalated");socket.off("responder:location");socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    async function refreshServerNotifications() {
      try {
        const data = await apiRequest("/notifications");
        if (!stopped) {
          setNotifications((data.notifications || []).map((item) => ({
            id: item._id,
            title: item.title,
            message: item.message,
            time: item.createdAt ? new Date(item.createdAt).toLocaleString() : "",
            read: Boolean(item.readAt),
            severity: item.severity,
            incident: item.incident,
          })));
        }
      } catch (error) {
        // Keep the existing local activity feed available if notification API is unavailable.
      }
    }
    refreshServerNotifications();
    const timer = window.setInterval(refreshServerNotifications, 10000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    localStorage.setItem("resq-activities", JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem("resq-notifications", JSON.stringify(notifications));
  }, [notifications]);

  const critical = reports.filter(
    (r) => r.severity === "Critical" && r.status !== "Resolved"
  ).length;
  const pending = reports.filter((r) => r.status === "Pending").length;
  const active = reports.filter((r) => r.status !== "Resolved").length;
  const resolved = reports.filter((r) => r.status === "Resolved").length;
  const unreadCount = notifications.filter((item) => !item.read).length;

  const visibleReports = reports.filter((r) => {
    const searchableText =
      `${r.id} ${r.type} ${r.location} ${r.status} ${r.severity} ${r.description}`.toLowerCase();
    const matchesSearch = searchableText.includes(search.toLowerCase().trim());
    const matchesStatus = filter === "All" || r.status === filter;
    const matchesSeverity =
      severityFilter === "All" || r.severity === severityFilter;
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  function addActivity(message) {
    const activity = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      time: new Date().toLocaleString(),
      read: false,
    };

    setActivities((previous) => [activity, ...previous].slice(0, 8));
    setNotifications((previous) => [activity, ...previous].slice(0, 20));
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }


  async function suggestClassification() {
    if (!form.description.trim()) {
      setNotice("Enter an incident description before requesting a suggestion.");
      return;
    }
    setClassifying(true);
    setNotice("");
    try {
      const result = await apiRequest("/incidents/classify", {
        method: "POST",
        body: JSON.stringify({ description: form.description }),
      });
      setClassificationSuggestion(result);
    } catch (error) {
      setNotice(`Classification suggestion unavailable: ${error.message}`);
    } finally {
      setClassifying(false);
    }
  }

  function applyClassificationSuggestion() {
    if (!classificationSuggestion?.suggestion) return;
    setForm((previous) => ({
      ...previous,
      type: classificationSuggestion.suggestion.type,
      severity: classificationSuggestion.suggestion.severity,
    }));
    setNotice("Suggestion applied. Review the category and severity before submitting.");
  }

  async function submitReport(event) {
  event.preventDefault();
  setNotice("");

  try {
    const payload = {
      ...form,
      latitude:
        coordinates.latitude === "" ? null : Number(coordinates.latitude),
      longitude:
        coordinates.longitude === "" ? null : Number(coordinates.longitude),
    };

    const data = await apiRequest("/incidents", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const savedIncident = data.incident;

    const report = {
      ...savedIncident,
      id: savedIncident._id || savedIncident.id,
      time: savedIncident.createdAt
        ? new Date(savedIncident.createdAt).toLocaleString()
        : new Date().toLocaleString(),
    };

    setReports((previous) => [report, ...previous]);

    addActivity(`New ${report.type} reported at ${report.location}`);

    setForm(emptyForm);
    setClassificationSuggestion(null);
    setCoordinates({ latitude: "", longitude: "" });
    setNotice("Emergency report saved to MongoDB successfully.");
    setPage("incidents");
    setSearch("");
    setFilter("All");
    setSeverityFilter("All");
  } catch (error) {
    console.error("Submit incident error:", error);
    setNotice(`Could not save report: ${error.message}`);
  }
}

  async function updateStatus(id, status) {
    const report = reports.find(
      (item) => String(item.id || item._id) === String(id)
    );

    if (!report || report.status === status) return;

    const incidentId = report._id || report.id;

    if (!incidentId) {
      setNotice("Could not update status: incident ID is missing.");
      return;
    }

    try {
      await apiRequest(`/incidents/${incidentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setReports((previous) =>
        previous.map((item) =>
          String(item.id || item._id) === String(incidentId)
            ? { ...item, id: item._id || item.id, status }
            : item
        )
      );

      addActivity(`${report.type} #${incidentId} changed to ${status}`);
      setNotice(`Incident status updated to ${status}.`);
    } catch (error) {
      console.error("Update status error:", error);
      setNotice(`Could not update status: ${error.message}`);
    }
  }

  async function deleteReport(id) {
    const report = reports.find(
      (item) => String(item.id || item._id) === String(id)
    );
    if (!report) return;

    const incidentId = report._id || report.id;
    if (!incidentId) {
      setNotice("Could not delete incident: incident ID is missing.");
      return;
    }

    if (
      !window.confirm(
        `Delete emergency report #${incidentId} (${report.type})?`
      )
    ) {
      return;
    }

    try {
      await apiRequest(`/incidents/${incidentId}`, { method: "DELETE" });

      setReports((previous) =>
        previous.filter(
          (item) => String(item.id || item._id) !== String(incidentId)
        )
      );
      addActivity(`Deleted ${report.type} report #${incidentId}`);
      setNotice(`Incident #${incidentId} deleted.`);
    } catch (error) {
      console.error("Delete incident error:", error);
      setNotice(`Could not delete incident: ${error.message}`);
    }
  }

  async function fetchResponderDirectory() {
    const data = await apiRequest("/responders/directory");
    setDirectory(data.users || []);
    return data.users || [];
  }

  async function loadResponderDirectory() {
    try {
      await fetchResponderDirectory();
      setPage("responders");
      setNotice("");
    } catch (error) {
      setNotice(`Could not load responder directory: ${error.message}`);
    }
  }

  async function changeUserRole(account, role) {
    try {
      await apiRequest(`/responders/${account._id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setDirectory((previous) => previous.map((item) =>
        item._id === account._id ? { ...item, role } : item
      ));
      setNotice(`${account.name} role updated to ${role}.`);
    } catch (error) {
      setNotice(`Could not update role: ${error.message}`);
    }
  }

  async function loadAssignments() {
    try {
      const data = await apiRequest("/responders/my-assignments");
      setAssignments(data.incidents || []);
      setPage("assignments");
      setNotice("");
    } catch (error) {
      setNotice(`Could not load assignments: ${error.message}`);
    }
  }

  async function assignResponder(incidentId, responderId) {
    try {
      await apiRequest(`/incidents/${incidentId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ responderId }),
      });
      setNotice("Responder assigned successfully.");
      const data = await apiRequest("/incidents");
      setReports((data.incidents || []).map((incident) => ({
        ...incident,
        id: incident._id || incident.id,
        time: incident.createdAt ? new Date(incident.createdAt).toLocaleString() : "",
      })));
    } catch (error) {
      setNotice(`Could not assign responder: ${error.message}`);
    }
  }

  async function updateResponseStatus(incidentId, responseStatus) {
    try {
      await apiRequest(`/incidents/${incidentId}/response-status`, {
        method: "PATCH",
        body: JSON.stringify({ responseStatus }),
      });
      await loadAssignments();
      setNotice(`Response status updated to ${responseStatus}.`);
    } catch (error) {
      setNotice(`Could not update response status: ${error.message}`);
    }
  }

  async function submitEmergencyAlert(event) {
    event.preventDefault();
    setNotice("");

    const title = alertForm.title.trim();
    const message = alertForm.message.trim();
    if (!title || !message) {
      setNotice("Please enter both an alert title and message.");
      return;
    }

    if (!window.confirm("Send this emergency alert to every registered responder?")) return;

    try {
      setAlertSending(true);
      const data = await apiRequest("/notifications/broadcast", {
        method: "POST",
        body: JSON.stringify({ title, message, severity: alertForm.severity }),
      });
      setNotice(`${data.message || "Emergency alert processed."} Responders notified: ${data.sentCount ?? 0}.`);
      setAlertForm({ title: "Emergency Alert", message: "", severity: "critical" });
    } catch (error) {
      setNotice(`Could not send emergency alert: ${error.message}`);
    } finally {
      setAlertSending(false);
    }
  }

  
async function acknowledgeEmergencyAlert() {
  if (!emergencyPopup?.id) {
    setEmergencyPopup(null);
    return;
  }

  const notificationId = emergencyPopup.id;

  try {
    await apiRequest(
      `/notifications/${notificationId}/acknowledge`,
      { method: "PATCH" }
    );

    setNotifications((previous) =>
      previous.map((item) =>
        String(item.id) === String(notificationId)
          ? { ...item, read: true, acknowledgedAt: new Date().toISOString() }
          : item
      )
    );

    setNotice("Emergency alert acknowledged successfully.");
    setEmergencyPopup(null);
  } catch (error) {
    setNotice(`Could not acknowledge alert: ${error.message}`);
  }
}



  function navigate(destination) {
    setPage(destination);
    setNotice("");
    setShowNotifications(false);
  }

  async function markAllRead() {
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
    try {
      await apiRequest("/notifications/read-all", { method: "PATCH" });
    } catch (error) {
      console.warn("Could not mark server notifications as read:", error.message);
    }
  }

  function clearNotifications() {
    markAllRead();
    setShowNotifications(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✚</div>
          <div>
            <h2>ResQ</h2>
            <span>EMERGENCY RESPONSE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <button
          className={`nav-item ${page === "dashboard" ? "selected" : ""}`}
          onClick={() => navigate("dashboard")}
        >
          <span>▦</span> Dashboard
        </button>

        <button
          className={`nav-item ${page === "incidents" ? "selected" : ""}`}
          onClick={() => navigate("incidents")}
        >
          <span>☷</span> All Incidents
          <span className="nav-count">{active}</span>
        </button>

        <button
          className={`nav-item ${page === "report" ? "selected" : ""}`}
          onClick={() => navigate("report")}
        >
          <span>＋</span> Report Emergency
        </button>
        {user?.role === "admin" && (
          <button className={`nav-item ${page === "responders" ? "selected" : ""}`} onClick={loadResponderDirectory}>
            <span>♙</span> Responder Management
          </button>
        )}
        {user?.role === "admin" && (
          <button
            className={`nav-item ${page === "emergency-alert" ? "selected" : ""}`}
            onClick={() => navigate("emergency-alert")}
          >
            <span>🚨</span> Send Emergency Alert
          </button>
        )}
        {(user?.role === "responder" || user?.role === "admin") && (
          <button className={`nav-item ${page === "assignments" ? "selected" : ""}`} onClick={loadAssignments}>
            <span>🚑</span> Assignments
          </button>
        )}

        {user?.role === "admin" && <button className={`nav-item ${page === "operations" ? "selected" : ""}`} onClick={() => navigate("operations")}>📡 Live Operations</button>}
        {user?.role === "responder" && <button className="nav-item" onClick={() => setSharingLocation(x=>!x)}>{sharingLocation ? "📍 Stop GPS Sharing" : "📍 Start GPS Sharing"}</button>}
        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot" />
            <div>
              <strong>Frontend Online</strong>
              <p>Incident response workspace</p>
            </div>
          </div>
          <p className="sidebar-foot">ResQ Emergency Services</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb">ResQ / {pageLabel(page)}</div>
            <h1>
              {page === "dashboard"
                ? "Emergency Overview"
                : page === "report"
                  ? "Report an Emergency"
                  : page === "responders"
                    ? "Responder Management"
                    : page === "emergency-alert"
                      ? "Send Emergency Alert"
                      : page === "assignments"
                        ? "My Assignments"
                        : "Incident Management"}
            </h1>
          </div>

          <div className="topbar-right">
            <span className="live-pill" title="Browser and real-time connectivity">{online ? (liveConnected ? "🟢 Live" : "🟡 Reconnecting") : "🔴 Offline"}</span>
            <span className="live-pill">
              <span className="status-dot" /> System Workspace
            </span>

            <div className="notification-wrapper">
              <button
                type="button"
                className="notification-button"
                aria-label="Open notifications"
                aria-expanded={showNotifications}
                onClick={() => setShowNotifications((value) => !value)}
              >
                ♧
                {unreadCount > 0 && (
                  <span className="notification-count">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-heading">
                    <strong>Notifications</strong>
                    <button type="button" onClick={markAllRead}>
                      Mark all read
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="notification-empty">
                      No notifications yet. Report an incident or change a status
                      to see activity here.
                    </p>
                  ) : (
                    <>
                      <div className="notification-list">
                        {notifications.map((item) => (
                          <div
                            key={item.id}
                            className={`notification-item ${item.read ? "" : "unread"}`}
                          >
                            <p>{item.message}</p>
                            <small>{item.time}</small>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="clear-notifications"
                        onClick={clearNotifications}
                      >
                        Clear notifications
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="avatar" title="ResQ user">
              ER
            </div>
          </div>
        </header>

        <div className="content">
          {notice && (
            <div className="notice" role="status">
              <span>✓ {notice}</span>
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          {page === "dashboard" && (
            <>
              <section className="welcome-row">
                <div>
                  <h2>Situation overview</h2>
                  <p>Monitor reported incidents and response status.</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => navigate("report")}
                >
                  + Report Emergency
                </button>
              </section>

              <section className="stats-grid">
                <StatCard
                  label="Total Incidents"
                  value={reports.length}
                  icon="▤"
                  color="blue"
                  note="All recorded reports"
                />
                <StatCard
                  label="Active Incidents"
                  value={active}
                  icon="◉"
                  color="orange"
                  note={`${pending} awaiting dispatch`}
                />
                <StatCard
                  label="Critical Emergencies"
                  value={critical}
                  icon="!"
                  color="red"
                  note="Require urgent attention"
                />
                <StatCard
                  label="Resolved Incidents"
                  value={resolved}
                  icon="✓"
                  color="green"
                  note="Marked as resolved"
                />
              </section>

              <section className="analytics-grid" aria-label="Incident analytics">
                <article className="panel analytics-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Incident Status</h2>
                      <p>Current distribution by response status</p>
                    </div>
                  </div>
                  <div className="analytics-bars">
                    {[
                      { label: "Pending", count: reports.filter((r) => r.status === "Pending").length, className: "bar-pending" },
                      { label: "Dispatched", count: reports.filter((r) => r.status === "Dispatched").length, className: "bar-dispatched" },
                      { label: "Resolved", count: reports.filter((r) => r.status === "Resolved").length, className: "bar-resolved" },
                    ].map((item) => (
                      <div className="analytics-bar-row" key={item.label}>
                        <div className="analytics-bar-label"><span>{item.label}</span><strong>{item.count}</strong></div>
                        <div className="analytics-bar-track" role="img" aria-label={`${item.label}: ${item.count} incidents`}>
                          <span className={item.className} style={{ width: `${reports.length ? (item.count / reports.length) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel analytics-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Severity Breakdown</h2>
                      <p>Reports grouped by severity</p>
                    </div>
                  </div>
                  <div className="analytics-bars">
                    {[
                      { label: "Critical", count: reports.filter((r) => r.severity === "Critical").length, className: "bar-critical" },
                      { label: "High", count: reports.filter((r) => r.severity === "High").length, className: "bar-high" },
                      { label: "Medium", count: reports.filter((r) => r.severity === "Medium").length, className: "bar-medium" },
                      { label: "Low", count: reports.filter((r) => r.severity === "Low").length, className: "bar-low" },
                    ].map((item) => (
                      <div className="analytics-bar-row" key={item.label}>
                        <div className="analytics-bar-label"><span>{item.label}</span><strong>{item.count}</strong></div>
                        <div className="analytics-bar-track" role="img" aria-label={`${item.label}: ${item.count} incidents`}>
                          <span className={item.className} style={{ width: `${reports.length ? (item.count / reports.length) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="panel analytics-panel weekly-analytics">
                <div className="panel-heading">
                  <div>
                    <h2>Last 7 Days</h2>
                    <p>Incident reports created per day, based on saved report timestamps</p>
                  </div>
                </div>
                <div className="weekly-chart">
                  {Array.from({ length: 7 }, (_, index) => {
                    const day = new Date();
                    day.setHours(0, 0, 0, 0);
                    day.setDate(day.getDate() - (6 - index));
                    const nextDay = new Date(day);
                    nextDay.setDate(day.getDate() + 1);
                    const count = reports.filter((report) => {
                      const rawDate = report.createdAt || report.time;
                      const date = rawDate ? new Date(rawDate) : null;
                      return date && !Number.isNaN(date.getTime()) && date >= day && date < nextDay;
                    }).length;
                    const maxCount = Math.max(1, ...Array.from({ length: 7 }, (_, dayIndex) => {
                      const target = new Date();
                      target.setHours(0, 0, 0, 0);
                      target.setDate(target.getDate() - (6 - dayIndex));
                      const end = new Date(target);
                      end.setDate(target.getDate() + 1);
                      return reports.filter((report) => {
                        const rawDate = report.createdAt || report.time;
                        const date = rawDate ? new Date(rawDate) : null;
                        return date && !Number.isNaN(date.getTime()) && date >= target && date < end;
                      }).length;
                    }));
                    return (
                      <div className="weekly-chart-column" key={day.toISOString()}>
                        <strong>{count}</strong>
                        <div className="weekly-chart-track" title={`${day.toLocaleDateString()}: ${count} incidents`}>
                          <span style={{ height: `${count ? Math.max(8, (count / maxCount) * 100) : 0}%` }} />
                        </div>
                        <small>{day.toLocaleDateString(undefined, { weekday: "short" })}</small>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="panel emergency-map-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Emergency Map</h2>
                    <p>Map markers appear for reports that include valid latitude and longitude.</p>
                  </div>
                </div>
                <EmergencyMap reports={reports} />
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent incidents</h2>
                    <p>Latest emergency reports</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("incidents")}
                  >
                    View all →
                  </button>
                </div>

                <div className="toolbar dashboard-toolbar">
                  <input
                    className="search-input"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search recent incidents..."
                    aria-label="Search recent incidents"
                  />
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    aria-label="Filter dashboard incidents by status"
                  >
                    <option>All</option>
                    <option>Pending</option>
                    <option>Dispatched</option>
                    <option>Resolved</option>
                  </select>
                </div>

                <IncidentTable
                  reports={visibleReports.slice(0, 5)}
                  onStatusChange={updateStatus}
                  onDelete={deleteReport}
                  onExport={exportIncidentPdf}
                  user={user}
                  responders={directory.filter((account) => account.role === "responder")}
                  onAssign={assignResponder}
                  onLoadResponders={fetchResponderDirectory}
                />
              </section>

              <section className="panel activity-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent activity</h2>
                    <p>Latest changes made in this browser</p>
                  </div>
                  <span className="activity-count">
                    {activities.length} activities
                  </span>
                </div>

                {activities.length === 0 ? (
                  <div className="empty-state">
                    No activity yet. Create a test incident or change a status
                    to see updates here.
                  </div>
                ) : (
                  <div className="activity-list">
                    {activities.map((activity) => (
                      <div className="activity-item" key={activity.id}>
                        <span className="activity-marker">•</span>
                        <div>
                          <p>{activity.message}</p>
                          <small>{activity.time}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="info-banner">
                <div className="info-symbol">i</div>
                <div>
                  <strong>Emergency response notice</strong>
                  <p>
                    Use this dashboard to manage incident reports and response status. For immediate danger, contact your local emergency services directly.
                  </p>
                </div>
              </section>
            </>
          )}

          {page === "operations" && user?.role === "admin" && (
            <section className="panel" style={{padding:24}}>
              <div className="panel-heading"><div><h2>📡 ResQ Live Operations</h2><p>Live acknowledgment, escalation, GPS, responder recommendations and audit records.</p></div><button className="secondary-button" onClick={()=>setRefreshTick(x=>x+1)}>Refresh</button></div>
              {alertAnalytics && <div className="stats-grid">
                <StatCard label="Alert deliveries" value={alertAnalytics.total} icon="🔔" color="blue" note="Broadcast recipients" />
                <StatCard label="Acknowledged" value={alertAnalytics.acknowledged} icon="✓" color="green" note="Responders confirmed" />
                <StatCard label="Pending" value={alertAnalytics.pending} icon="!" color="red" note="Awaiting confirmation" />
                <StatCard label="Avg acknowledgment" value={alertAnalytics.averageAcknowledgmentSeconds===null?"—":`${alertAnalytics.averageAcknowledgmentSeconds}s`} icon="◷" color="orange" note="Based on confirmed alerts" />
              </div>}
              <h3>Emergency Alert Tracking</h3>
              <div className="table-wrap"><table><thead><tr><th>Responder</th><th>Alert</th><th>Status</th><th>Sent</th><th>Acknowledged</th></tr></thead><tbody>
              {tracking.map(n=><tr key={n._id}><td>{n.recipient?.name||"Unknown"}</td><td>{n.title}</td><td>{n.acknowledgedAt?"✅ Acknowledged":n.escalatedAt?"🚨 Escalated":"⏳ Pending"}</td><td>{new Date(n.createdAt).toLocaleString()}</td><td>{n.acknowledgedAt?new Date(n.acknowledgedAt).toLocaleString():"—"}</td></tr>)}
              </tbody></table></div>{!tracking.length&&<p>No broadcast alerts yet. New alerts will appear here.</p>}
              <h3 style={{marginTop:28}}>📍 Responder GPS Map</h3>
              <p>Shows responders who explicitly enabled location sharing. Locations expire from the live view after 15 minutes.</p>
              <ResponderLiveMap locations={locations}/>
              <h3 style={{marginTop:28}}>Nearest Responder Recommendations</h3>
              <p>Approximate straight-line distance from incident coordinates, not driving ETA.</p>
              {reports.filter(r=>Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude))&&r.latitude!=null&&r.longitude!=null&&r.status!=="Resolved").slice(0,10).map(report=>{
                const ranked=locations.map(loc=>({loc,km:geoDistance(Number(report.latitude),Number(report.longitude),loc.latitude,loc.longitude)})).sort((a,b)=>a.km-b.km).slice(0,3);
                return <p key={report._id||report.id}><strong>{report.type} — {report.location}:</strong> {ranked.length?ranked.map(x=>`${x.loc.responder?.name||"Responder"} (${x.km.toFixed(1)} km)`).join(" • "):"No active GPS-sharing responders"}</p>;
              })}
              <h3 style={{marginTop:28}}>🛡️ Security Audit Log</h3>
              <div className="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th></tr></thead><tbody>{auditLogs.map(log=><tr key={log._id}><td>{new Date(log.createdAt).toLocaleString()}</td><td>{log.action}</td><td>{log.actor?.name||"System"}</td></tr>)}</tbody></table></div>
              <button className="secondary-button" onClick={()=>{const rows=[["Responder","Alert","Status","Sent","Acknowledged"],...tracking.map(n=>[n.recipient?.name||"Unknown",n.title,n.acknowledgedAt?"Acknowledged":n.escalatedAt?"Escalated":"Pending",n.createdAt,n.acknowledgedAt||""])];const csv=rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="resq-alert-tracking.csv";a.click();URL.revokeObjectURL(a.href);}}>Export Tracking CSV</button>
            </section>
          )}
          {page === "emergency-alert" && user?.role === "admin" && (
            <section className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <h2>Broadcast emergency alert</h2>
                  <p>This message will be saved as a notification for every registered responder.</p>
                </div>
                <span className="required-note">Admin only</span>
              </div>

              <form onSubmit={submitEmergencyAlert}>
                <div className="form-grid">
                  <label className="full-width">
                    Alert title *
                    <input
                      value={alertForm.title}
                      onChange={(event) => setAlertForm((previous) => ({ ...previous, title: event.target.value }))}
                      placeholder="e.g. Emergency response required"
                      maxLength={160}
                      required
                    />
                    <small className="character-count">{alertForm.title.length}/160 characters</small>
                  </label>

                  <label className="full-width">
                    Emergency message *
                    <textarea
                      value={alertForm.message}
                      onChange={(event) => setAlertForm((previous) => ({ ...previous, message: event.target.value }))}
                      placeholder="Enter clear instructions for responders..."
                      rows={5}
                      maxLength={500}
                      required
                    />
                    <small className="character-count">{alertForm.message.length}/500 characters</small>
                  </label>

                  <label className="full-width">
                    Alert severity *
                    <select
                      value={alertForm.severity}
                      onChange={(event) => setAlertForm((previous) => ({ ...previous, severity: event.target.value }))}
                      required
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={alertSending}
                    onClick={() => setAlertForm({ title: "Emergency Alert", message: "", severity: "critical" })}
                  >
                    Clear form
                  </button>
                  <button type="submit" className="primary-button" disabled={alertSending}>
                    {alertSending ? "Sending alert..." : "🚨 Send Alert to All Responders"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {page === "report" && (
            <section className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <h2>Emergency details</h2>
                  <p>Enter accurate information about the incident.</p>
                </div>
                <span className="required-note">* Required fields</span>
              </div>

              <form onSubmit={submitReport}>
                <div className="form-grid">
                  <label>
                    Emergency type *
                    <select
                      name="type"
                      value={form.type}
                      onChange={updateField}
                      required
                    >
                      <option>Medical Emergency</option>
                      <option>Fire</option>
                      <option>Road Accident</option>
                      <option>Crime or Security Threat</option>
                      <option>Natural Disaster</option>
                      <option>Rescue Request</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label>
                    Severity *
                    <select
                      name="severity"
                      value={form.severity}
                      onChange={updateField}
                      required
                    >
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </label>

                  <label className="full-width">
                    Incident location *
                    <input
                      name="location"
                      value={form.location}
                      onChange={updateField}
                      placeholder="Street, area, city, or landmark"
                      maxLength={160}
                      required
                    />
                  </label>

                  <div className="full-width">
                    <h3>Select incident location on the map</h3>
                    <p className="map-note">Click anywhere on the map to set the incident coordinates, or use your current location. This is optional.</p>
                    <MapLocationPicker
                      latitude={coordinates.latitude}
                      longitude={coordinates.longitude}
                      onChange={setCoordinates}
                    />
                  </div>

                  <label className="full-width">
                    Contact phone (optional)
                    <input
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={updateField}
                      placeholder="Enter a contact number"
                      maxLength={25}
                    />
                  </label>

                  <label className="full-width">
                    Incident description *
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={updateField}
                      placeholder="Describe what happened and what help is needed..."
                      rows="5"
                      maxLength={2000}
                      required
                    />
                    <small className="character-count">
                      {form.description.length}/2000 characters
                    </small>
                    <div className="classification-actions">
                      <button type="button" className="secondary-button" onClick={suggestClassification} disabled={classifying || !form.description.trim()}>
                        {classifying ? "Analyzing description…" : "✨ Suggest category & severity"}
                      </button>
                    </div>
                    {classificationSuggestion && (
                      <div className="classification-card" role="status">
                        <strong>Suggested classification (rule-based)</strong>
                        <p>Category: <b>{classificationSuggestion.suggestion.type}</b> · Suggested severity: <b>{classificationSuggestion.suggestion.severity}</b></p>
                        {classificationSuggestion.suggestion.matchedTerms?.length > 0 && <small>Matched terms: {classificationSuggestion.suggestion.matchedTerms.join(", ")}</small>}
                        <p className="classification-disclaimer">{classificationSuggestion.disclaimer}</p>
                        <button type="button" className="secondary-button" onClick={applyClassificationSuggestion}>Apply suggestion for review</button>
                      </div>
                    )}
                  </label>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setForm(emptyForm);
                      setClassificationSuggestion(null);
                      setCoordinates({ latitude: "", longitude: "" });
                      setNotice("");
                    }}
                  >
                    Clear form
                  </button>
                  <button type="submit" className="primary-button">
                    Submit Report →
                  </button>
                </div>
              </form>
            </section>
          )}

          {page === "responders" && user?.role === "admin" && (
            <section className="panel">
              <div className="panel-heading"><div><h2>Responder management</h2><p>Promote trusted registered accounts to responders. Admin access is server-controlled.</p></div></div>
              <div className="table-wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>CURRENT ROLE</th><th>ACTION</th></tr></thead>
                <tbody>{directory.map((account) => <tr key={account._id}>
                  <td><strong>{account.name}</strong></td><td>{account.email}</td><td>{account.role}</td>
                  <td><button className="secondary-button" onClick={() => changeUserRole(account, account.role === "responder" ? "user" : "responder")}>{account.role === "responder" ? "Remove responder role" : "Make responder"}</button></td>
                </tr>)}</tbody></table></div>
              {directory.length === 0 && <div className="empty-state">No registered user accounts found.</div>}
            </section>
          )}

          {page === "assignments" && (user?.role === "responder" || user?.role === "admin") && (
            <section className="panel">
              <div className="panel-heading"><div><h2>Response assignments</h2><p>Track responder progress for assigned incidents.</p></div><button className="secondary-button" onClick={loadAssignments}>Refresh</button></div>
              {assignments.length === 0 ? <div className="empty-state">No assigned incidents yet.</div> : <div className="table-wrap"><table><thead><tr><th>INCIDENT</th><th>LOCATION</th><th>SEVERITY</th><th>ASSIGNED RESPONDER</th><th>RESPONSE STATUS</th></tr></thead><tbody>
                {assignments.map((incident) => <tr key={incident._id}><td><strong>{incident.type}</strong><span className="cell-sub">#{incident._id}</span></td><td>{incident.location}</td><td>{incident.severity}</td><td>{incident.assignedTo?.name || "—"}</td><td><select className="status-select" value={incident.responseStatus || "Assigned"} onChange={(event) => updateResponseStatus(incident._id, event.target.value)}><option>Assigned</option><option>On the Way</option><option>On Scene</option><option>Completed</option></select></td></tr>)}
              </tbody></table></div>}
            </section>
          )}

          {page === "incidents" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>All incidents</h2>
                  <p>Search reports and manage their status.</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => navigate("report")}
                >
                  + New Report
                </button>
              </div>

              <div className="toolbar incident-toolbar">
                <input
                  className="search-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search type, location, ID, description..."
                  aria-label="Search incidents"
                />
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  aria-label="Filter by status"
                >
                  <option>All</option>
                  <option>Pending</option>
                  <option>Dispatched</option>
                  <option>Resolved</option>
                </select>
                <select
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                  aria-label="Filter by severity"
                >
                  <option>All</option>
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSearch("");
                    setFilter("All");
                    setSeverityFilter("All");
                  }}
                >
                  Reset filters
                </button>
              </div>

              <IncidentTable
                reports={visibleReports}
                onStatusChange={updateStatus}
                onDelete={deleteReport}
                onExport={exportIncidentPdf}
                user={user}
                responders={directory.filter((account) => account.role === "responder")}
                onAssign={assignResponder}
                onLoadResponders={fetchResponderDirectory}
              />
              <p className="table-foot">
                Showing {visibleReports.length} of {reports.length} reports
              </p>
            </section>
          )}
        </div>
      </main>
      {emergencyPopup && (
        <div className="emergency-popup-backdrop" role="presentation">
          <section
            className={`emergency-popup severity-${emergencyPopup.severity}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="emergency-popup-title"
            aria-describedby="emergency-popup-message"
          >
            <div className="emergency-popup-icon" aria-hidden="true">
              {emergencyPopup.severity === "critical" ? "🚨" : emergencyPopup.severity === "warning" ? "⚠️" : "🔔"}
            </div>
            <div className="emergency-popup-content">
              <p className="emergency-popup-eyebrow">
                {emergencyPopup.severity === "critical" ? "CRITICAL EMERGENCY" : "RESQ NOTIFICATION"}
              </p>
              <h2 id="emergency-popup-title">{emergencyPopup.title}</h2>
              <p id="emergency-popup-message">{emergencyPopup.message}</p>
              <small>{emergencyPopup.time}</small>
              <div className="emergency-popup-actions">
                <button type="button" className="primary-button" onClick={acknowledgeEmergencyAlert} >
                  Acknowledge / Close
                </button>
                <button type="button" className="secondary-button" onClick={() => { setEmergencyPopup(null); setShowNotifications(true); }}>
                  View notifications
                </button>
              </div>
            </div>
            <button type="button" className="emergency-popup-close" aria-label="Close emergency alert" onClick={() => setEmergencyPopup(null)}>×</button>
          </section>
        </div>
      )}
    </div>
  );
}

function playEmergencyTone() {
  // Browser policies may block audio until the user has interacted with the page.
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const playBeep = (startAt, frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.23);
    };
    void context.resume().then(() => {
      const now = context.currentTime;
      playBeep(now, 880);
      playBeep(now + 0.28, 660);
      playBeep(now + 0.56, 880);
      window.setTimeout(() => context.close().catch(() => {}), 1200);
    }).catch(() => context.close().catch(() => {}));
  } catch (error) {
    console.warn("Emergency sound could not play:", error.message);
  }
}

function pageLabel(page) {
  if (page === "dashboard") return "Dashboard";
  if (page === "report") return "Report Emergency";
  if (page === "responders") return "Responder Management";
  if (page === "emergency-alert") return "Send Emergency Alert";
  if (page === "assignments") return "Assignments";
  if (page === "operations") return "Live Operations";
  return "All Incidents";
}

function StatCard({ label, value, icon, color, note }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-value" key={value}>
        {value}
      </div>
      <div className="stat-note">{note}</div>
    </article>
  );
}

function IncidentTable({ reports, onStatusChange, onDelete, onExport, user, responders, onAssign, onLoadResponders }) {
  if (!reports.length) {
    return <div className="empty-state">No incidents match your search.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>INCIDENT</th>
            <th>LOCATION</th>
            <th>SEVERITY</th>
            <th>STATUS</th>
            <th>REPORTED</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report._id || report.id}>
              <td>
                <strong>{report.type}</strong>
                <span className="cell-sub">#{report._id || report.id}</span>
              </td>
              <td>{report.location}</td>
              <td>
                <span
                  className={`badge severity-${report.severity.toLowerCase()}`}
                >
                  {report.severity}
                </span>
              </td>
              <td>
                <select
                  className="status-select"
                  value={report.status}
                  onChange={(event) =>
                    onStatusChange(report._id || report.id, event.target.value)
                  }
                  aria-label={`Status for ${report.type}`}
                >
                  <option>Pending</option>
                  <option>Dispatched</option>
                  <option>Resolved</option>
                </select>
              </td>
              <td className="time-cell">{report.time}</td>
              {user?.role === "admin" && <td>
                <select className="status-select" value={report.assignedTo?._id || report.assignedTo || ""} onFocus={() => onLoadResponders().catch(() => {})} onChange={(event) => event.target.value && onAssign(report._id || report.id, event.target.value)}>
                  <option value="">Unassigned</option>
                  {responders.map((responder) => <option key={responder._id} value={responder._id}>{responder.name}</option>)}
                </select>
              </td>}
              <td className="incident-actions">
                <button
                  className="secondary-button"
                  onClick={() => onExport(report)}
                  aria-label={`Export ${report.type} report as PDF`}
                >
                  PDF
                </button>
                <button
                  className="delete-button"
                  onClick={() => onDelete(report._id || report.id)}
                  aria-label={`Delete ${report.type} report`}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function geoDistance(lat1,lon1,lat2,lon2){const rad=x=>x*Math.PI/180;const dlat=rad(lat2-lat1),dlon=rad(lon2-lon1);const a=Math.sin(dlat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
