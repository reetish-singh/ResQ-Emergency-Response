import { useState } from "react";
import { Link } from "react-router-dom";

export default function Login({ onLogin }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            password: form.password,
          }),
        }
      );

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("Unexpected API response:", responseText);

        throw new Error(
          "The server returned an unexpected response. Check your backend."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message || "Invalid email or password."
        );
      }

      if (!data.token || !data.user) {
        throw new Error(
          "Login response is incomplete. Please try again."
        );
      }

      // Save the authentication token returned by the backend.
      localStorage.setItem("resq-token", data.token);

      // Pass the authenticated user to the existing authentication app.
      onLogin(data.user);
    } catch (err) {
      console.error("Login error:", err);

      if (err instanceof TypeError) {
        setError(
          `Network error: ${err.message}`
        );
      } else {
        setError(
          err.message || "Login failed. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">🚨</div>

        <h1>Welcome Back</h1>
        <p>Sign in to your ResQ account</p>

        {error && <div className="auth-error">{error}</div>}

        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          type="email"
          name="email"
          placeholder="Enter your email"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          placeholder="Enter your password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          required
        />

        <button
          className="auth-button"
          type="submit"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}