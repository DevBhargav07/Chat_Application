import { Link } from "react-router-dom";
import { Eye, MessageCircle, ShieldCheck, UserCheck, Users, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { username, hasPermission, isSuperuser } = useAuth();

  return (
    <div className="page-content dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="dashboard-badge">
            <Sparkles size={14} />
            <span>Workspace Online</span>
          </div>
          <h1>Welcome back, {username || "Member"}! 👋</h1>
          <p className="dashboard-subtitle">
            Manage your conversations, adjust your regional presence, and collaborate with your team securely.
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        <Link to="/chat" className="dashboard-card">
          <div className="dashboard-card-icon chat-icon">
            <MessageCircle size={24} />
          </div>
          <div className="dashboard-card-info">
            <h3>Direct Chat</h3>
            <p>Connect with discoverable colleagues in real-time. Ephemeral messages disappear safely.</p>
          </div>
          <span className="dashboard-card-link">Open Chat &rarr;</span>
        </Link>

        <Link to="/chat/visibility" className="dashboard-card">
          <div className="dashboard-card-icon visibility-icon">
            <Eye size={24} />
          </div>
          <div className="dashboard-card-info">
            <h3>Chat Visibility</h3>
            <p>Choose who can find and message you: everyone, selected regions, or stay invisible.</p>
          </div>
          <span className="dashboard-card-link">Configure Privacy &rarr;</span>
        </Link>

        {hasPermission("view_users") && (
          <Link to="/users" className="dashboard-card">
            <div className="dashboard-card-icon users-icon">
              <Users size={24} />
            </div>
            <div className="dashboard-card-info">
              <h3>Team Directory</h3>
              <p>Explore members, view roles, and manage permissions across your organization.</p>
            </div>
            <span className="dashboard-card-link">View Directory &rarr;</span>
          </Link>
        )}

        <Link to="/profile" className="dashboard-card">
          <div className="dashboard-card-icon profile-icon">
            <UserCheck size={24} />
          </div>
          <div className="dashboard-card-info">
            <h3>Account Profile</h3>
            <p>Check your assigned permissions, group memberships, and account credentials.</p>
          </div>
          <span className="dashboard-card-link">Manage Profile &rarr;</span>
        </Link>

        {(isSuperuser || hasPermission("change_groups")) && (
          <Link to="/admin/groups" className="dashboard-card">
            <div className="dashboard-card-icon admin-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="dashboard-card-info">
              <h3>Admin & Permissions</h3>
              <p>Create groups, assign granular permissions, and oversee system authorization.</p>
            </div>
            <span className="dashboard-card-link">Admin Console &rarr;</span>
          </Link>
        )}
      </div>
    </div>
  );
}
