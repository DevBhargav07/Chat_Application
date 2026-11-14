import { useState } from "react";
import { Link, useNavigate, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { getSafeNextUrl } from "@/utils/redirect";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, Moon, Sun } from "lucide-react";
import { loginUser } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const redirectTo = getSafeNextUrl(searchParams, location.state?.from || "/dashboard");

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error("Please fill in both fields");
      return;
    }

    setLoading(true);
    try {
      const response = await loginUser(formData.email, formData.password);
      const { access_token, refresh_token, username, permissions, groups, user_id, is_superuser } = response.data;

      login({
        access: access_token,
        refresh: refresh_token,
        username: username,
        permissions: permissions,
        groups: groups,
        user_id: user_id,
        is_superuser: is_superuser,
      });

      toast.success("Logged in successfully!");
      const target = getSafeNextUrl(searchParams, location.state?.from || "/dashboard");
      navigate(target, { replace: true });
    } catch (error) {
      const message =
        error.response?.data?.detail || "Invalid email or password";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Theme toggle, top-right */}
      <button
        onClick={toggleTheme}
        className="auth-theme-btn"
        aria-label="Toggle theme"
        title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {/* Background ambient accents */}
      <div className="auth-glow-top" />
      <div className="auth-glow-bottom" />

      <form onSubmit={handleSubmit} className="auth-card">
        <div className="auth-header">
          {/* <div className="auth-brand-badge">ChaT</div> */}
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue to your account</p>
        </div>

        <div className="auth-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@gmail.com"
              value={formData.email}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                className="form-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="eye-btn"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="auth-btn">
            <LogIn size={16} />
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>

        {/* <p className="auth-footer">
          Don't have an account?
          <Link to="/signup">Sign up</Link>
        </p> */}
      </form>
    </div>
  );
}