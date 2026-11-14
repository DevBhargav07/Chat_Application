import { SkipBack } from "lucide-react";
import { createContext, useContext, useState, useEffect } from "react";


// Decodes a JWT's payload safely across all browsers without external dependencies.
// Handles URL-safe base64 (- and _), missing padding, and UTF-8 characters.
function decodeJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binaryStr = atob(base64);
    const bytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // On first load, check localStorage to see if a token already exists
  // (this is what keeps the user "logged in" after a page refresh)
  const [accessToken, setAccessToken] = useState(
    localStorage.getItem("access_token")
  );
  const [username, setUsername] = useState(
    localStorage.getItem("username") || ""
  );

  const [ permissions, setPermissions ] = useState(
    JSON.parse(localStorage.getItem("permissions") || "[]")
  )

  const [ groups,setGroups ] = useState(
    JSON.parse(localStorage.getItem("groups") || "[]")
  )

  const [userId, setUserId] = useState(
    localStorage.getItem("user_id") || null
  );

  const [isSuperuser, setIsSuperuser] = useState(
    localStorage.getItem("is_superuser") === "true"
  );


  const isAuthenticated = !!accessToken || !!localStorage.getItem("access_token");

  // Called after a successful login
  const login = ({ access, refresh, username: uname, permissions: perms, groups: grps, user_id, is_superuser }) => {
    if (refresh) localStorage.setItem("refresh_token", refresh);
    if (uname) localStorage.setItem("username", uname);
    if (user_id) localStorage.setItem("user_id", user_id);
    localStorage.setItem("permissions", JSON.stringify(perms || []));
    localStorage.setItem("groups", JSON.stringify(grps || []));
    localStorage.setItem("is_superuser", String(!!is_superuser));
    localStorage.setItem("access_token", access);

    setAccessToken(access);
    setUsername(uname || "");
    setUserId(user_id || null);
    setPermissions(perms || []);
    setGroups(grps || []);
    setIsSuperuser(!!is_superuser);
  }

  // Called on logout, or when a refresh attempt fails
  const logout = ({ skipBackend = false } = {}) => {
    // Notify backend to revoke session in Redis
    if (!localStorage.getItem("access_token") && !accessToken) return;

    if (!skipBackend){
      import("../api/auth").then(({ logoutUser }) => logoutUser?.()).catch(() => {});
    }

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");
    localStorage.removeItem("user_id");
    localStorage.removeItem("permissions");
    localStorage.removeItem("groups");
    localStorage.removeItem("is_superuser");
    setAccessToken(null);
    setUsername("");
    setUserId(null);
    setPermissions([]);
    setGroups([]);
    setIsSuperuser(false);
  };

  // Re-fetches the current user's permissions/groups from the backend
  // without needing to log in again. Call this after an admin changes
  // someone's groups, or periodically, to keep permissions fresh.
  const refreshPermissions = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      // Dynamic import avoids a circular import between AuthContext and api/auth.js
      const { getMyProfile } = await import("../api/auth");
      const response = await getMyProfile();
      const perms = response.data.permissions || [];
      const grps = response.data.groups || [];
      const superuser = !!response.data.is_superuser;


      setPermissions((prev) => {
        if(JSON.stringify(prev) === JSON.stringify(perms)) return prev;
        localStorage.setItem("permissions", JSON.stringify(perms));
        return perms;
      });

      setGroups((prev) => {
        if (JSON.stringify(prev) == JSON.stringify(grps)) return prev;
        localStorage.setItem("groups", JSON.stringify(grps));
        return grps;
      });

      setIsSuperuser((prev) => {
        if (prev == superuser) return prev;
        localStorage.setItem("is_superuser", superuser);
        return superuser;
      })

    } catch (err) {
      if (err.response?.status == 401){
        logout({ skipBackend: true });
      }
      // Silently ignore — if this fails, the user just keeps their
      // last-known permissions until the next successful refresh.
    }
  };
    
  const hasPermission = (codeName) => permissions.includes(codeName);
  const hasGroup = (groupName) => groups.includes(groupName);

  // Keep multiple tabs in sync (optional nice-to-have)
  // useEffect(() => {
  //   const syncLogout = (e) => {
  //     if (e.key === "access_token" && !e.newValue) {
  //       setAccessToken(null);
  //       setUsername("");
  //       setPermissions([]);
  //       setGroups([]);
  //     }
  //   };
  //   window.addEventListener("storage", syncLogout);
  //   return () => window.removeEventListener("storage", syncLogout);
  // }, []);
  // AuthContext.jsx — replace the sync effect with this
  useEffect(() => {
    const syncFromStorage = (e) => {
      // "access_token" changed in another tab — re-read everything
      if (e.key === "access_token") {
        const token = localStorage.getItem("access_token");
        if (!token) {
          // logged out (or deleted) in another tab
          setAccessToken(null);
          setUsername("");
          setUserId(null);
          setPermissions([]);
          setGroups([]);
          setIsSuperuser(false);
          // ProtectedRoute sees isAuthenticated=false → redirects, no refresh
        } else {
          // logged in in another tab — pick up the new session
          setAccessToken(token);
          setUsername(localStorage.getItem("username") || "");
          setUserId(localStorage.getItem("user_id") || null);
          setPermissions(JSON.parse(localStorage.getItem("permissions") || "[]"));
          setGroups(JSON.parse(localStorage.getItem("groups") || "[]"));
          setIsSuperuser(localStorage.getItem("is_superuser") === "true");
        }
      }
    };
    const handleAuthLogout = () => {
      logout({ skipBackend: true });
    };
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("auth:logout", handleAuthLogout);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("auth:logout", handleAuthLogout);
    };
  }, []);
  useEffect(() => {
    if (!accessToken) return;

    const payload = decodeJwt(accessToken);
    if(!payload?.exp){
      logout({ skipBackend: true });
      return;
    }

    const msUntilExpiry = payload.exp * 1000 - Date.now();
    if (msUntilExpiry <= 0){
      logout({ skipBackend: true });
      return;
    }

    let lastFetch = Date.now();
    const onFocus= () => {
      // At most once in every 60s when returning to the tab
      if (Date.now() - lastFetch > 60_000) {
        lastFetch = Date.now();
        refreshPermissions();
      }
    };

    window.addEventListener("focus", onFocus);
    const interval = setInterval(refreshPermissions, 2 * 60 * 1000);
    const timer = setTimeout(() => {
      logout({ skipBackend: true });
    }, Math.min(msUntilExpiry, 2147483647));

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval); // stop periodic refresh
      clearTimeout(timer); // cleanup if token changes/unmounts
    }
      
  }, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        username,
        userId,
        permissions,
        groups,
        isSuperuser,
        isAuthenticated,
        login,
        logout,
        hasPermission,
        hasGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
