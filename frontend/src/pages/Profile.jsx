import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyProfile } from "../api/auth";
import { FormatDate } from "../components/FormatDate";
import { ShieldCheck } from "lucide-react";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await getMyProfile();
        setProfile(response.data);
      } catch (error) {
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (loading)
    return (
      <div className="page-content">
        <div className="users-loading">
          <div className="visibility-spinner" />
          <p>Loading profile...</p>
        </div>
      </div>
    );

  if (!profile)
    return (
      <div className="page-content">
        <p style={{ color: "var(--text-muted)" }}>Could not load profile.</p>
      </div>
    );

  const initials = profile.username?.slice(0, 2).toUpperCase() || "U";

  return (
    <div className="page-content profile-page">
      {/* Avatar header */}
      <div className="profile-avatar-header">
        <div className="profile-avatar-circle">{initials}</div>
        <div className="profile-avatar-info">
          <h1>{profile.username}</h1>
          <span className="profile-role-pill">
            {profile.is_superuser ? (
              <>
                <ShieldCheck size={12} />
                Superuser
              </>
            ) : (
              "Member"
            )}
          </span>
        </div>
      </div>

      <div className="profile-section">
        <h2>Account Details</h2>
        <div className="profile-row">
          <span className="profile-label">Username</span>
          <span className="profile-value">{profile.username}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Email</span>
          <span className="profile-value">{profile.email}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Account created</span>
          <span className="profile-value">
            <FormatDate timestamp={profile.created_at} />
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Role</span>
          <span className="profile-value">
            {profile.is_superuser ? "Superuser" : "Standard user"}
          </span>
        </div>
      </div>

      <div className="profile-section">
        <h2>Groups</h2>
        {profile.groups.length === 0 ? (
          <p className="profile-empty">No groups assigned.</p>
        ) : (
          <div className="profile-tags">
            {profile.groups.map((g) => (
              <span key={g} className="profile-tag">{g}</span>
            ))}
          </div>
        )}
      </div>

      <div className="profile-section">
        <h2>Permissions</h2>
        {profile.permissions.length === 0 ? (
          <p className="profile-empty">No permissions assigned.</p>
        ) : (
          <div className="profile-tags">
            {profile.permissions.map((p) => (
              <span key={p} className="profile-tag">{p}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}