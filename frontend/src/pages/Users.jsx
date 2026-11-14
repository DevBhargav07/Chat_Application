import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Users as UsersIcon, Shield } from "lucide-react";
import { getAllUsers } from "../api/auth";
import { FormatDate } from "../components/FormatDate";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    const fetchUsers = async () => {
      try {
        const response = await getAllUsers();
        if (!ignore) {
          setUsers(response.data || []);
        }
      } catch (error) {
        if (!ignore) {
          toast.error(error.response?.data?.detail || "Failed to load users");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  return (
    <div className="page-content users-page">
      <div className="users-header-row">
        <div>
          <div className="users-title-badge">
            <h1>All Users</h1>
            <span className="users-count-tag">{users.length} members</span>
          </div>
          <p className="users-subtitle">
            Browse and manage all registered members across your organization.
          </p>
        </div>
      </div>

      <div className="users-toolbar">
        <div className="users-search-box">
          <Search size={16} className="users-search-icon" />
          <input
            type="text"
            className="users-search-input"
            placeholder="Search by username or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="users-loading">
          <div className="visibility-spinner" />
          <p>Loading user directory...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="users-empty">
          <UsersIcon size={40} className="users-empty-icon" />
          <h3>No users found</h3>
          <p>
            {searchTerm
              ? `No users match "${searchTerm}". Try a different keyword.`
              : "No members are currently registered in the database."}
          </p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className="users-table-row-clickable"
                  onClick={() => navigate(`/users/${u.id}`)}
                >
                  <td>
                    <div className="users-td-username">
                      <span className="users-table-avatar">
                        {u.username?.charAt(0)?.toUpperCase() || "U"}
                      </span>
                      <span className="users-table-name">{u.username}</span>
                    </div>
                  </td>
                  <td className="users-td-email">{u.email}</td>
                  <td>
                    {u.is_superuser ? (
                      <span className="role-badge role-admin">
                        <Shield size={12} />
                        Admin
                      </span>
                    ) : (
                      <span className="role-badge role-member">Member</span>
                    )}
                  </td>
                  <td className="users-td-date">
                    <FormatDate timestamp={u.created_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
