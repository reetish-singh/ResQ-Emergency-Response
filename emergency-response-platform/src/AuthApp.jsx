import { useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import Login from "./auth/Login.jsx";
import Signup from "./auth/Signup.jsx";
import App from "./App.jsx";

function DashboardRoute({ user, onLogout }) {
  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <header className="auth-user-bar">
        <span>
          Logged in as <strong>{user.name}</strong>
        </span>

        <button onClick={onLogout} className="auth-logout-button">
          Logout
        </button>
      </header>

      <App user={user} />
    </div>
  );
}

export default function AuthApp() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("resq-session")) || null;
    } catch {
      return null;
    }
  });

  const navigate = useNavigate();

  function handleLogin(loggedInUser) {
    localStorage.setItem("resq-session", JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    navigate("/dashboard");
  }

  function handleLogout() {
    localStorage.removeItem("resq-session");
    setUser(null);
    navigate("/", { replace: true });
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />

      <Route
        path="/signup"
        element={
          user ? <Navigate to="/dashboard" replace /> : <Signup />
        }
      />

      <Route
        path="/dashboard"
        element={<DashboardRoute user={user} onLogout={handleLogout} />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}