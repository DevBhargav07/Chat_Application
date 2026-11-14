import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="notfound-page">
      <AlertCircle size={56} style={{ color: "var(--accent)", opacity: 0.7 }} />
      <h1>404</h1>
      <p>The page you're looking for doesn't exist or has been moved.</p>
      {/* Send logged-in users to the dashboard, logged-out users to login */}
      <Link to={isAuthenticated ? "/dashboard" : "/"} className="notfound-link">
        <Home size={15} />
        {isAuthenticated ? "Go to Dashboard" : "Go to Login"}
      </Link>
    </div>
  );
}
