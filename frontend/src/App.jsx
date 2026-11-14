import { BrowserRouter, Routes, Route, Navigate, Outlet, useSearchParams } from "react-router-dom";
import { Toaster } from "sonner";
import { useState } from "react";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { getSafeNextUrl } from "./utils/redirect";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
import Topbar from "./components/Topbar";
import Profile from "./pages/Profile";
import UserDetail from "./pages/UserDetail";
import GroupsAdmin from "./pages/GroupsAdmin";
import RequirePermission from "./components/RequirePermission";
import RequirePermissionOrSelf from "./components/RequirePermissionorSelf";
import VisibilitySettings from "./pages/VisibilitySettings";
import Chat from "./pages/Chat";

// Every logged-in page (Dashboard, Users, ...) gets wrapped in this:
// sidebar on the left, page content on the right. Add new protected
// pages by wrapping them the same way in the Routes below.
function AppLayout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <Topbar onMenuClick={() => setMobileNavOpen((open) => !open)} />
      <div className="app-layout">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <main className="app-main">{children}</main>
        <Outlet />
      </div>
    </div>
  );
}

function PublicOnlyRoute({ children }){
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  if (isAuthenticated) {
    const target = getSafeNextUrl(searchParams, "/dashboard");
    return <Navigate to={target} replace/>;
  }
  return children;
}

function FallbackRoute() {
  const { isAuthenticated } = useAuth();
  // Logged in & unknown URL -> 404 NotFound (inside layout or standalone)
  // Logged out & unknown URL -> block and send to /login (replace history so Back won't revisit)
  return isAuthenticated ? <NotFound /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/signin" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/signup" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <RequirePermission permission="view_users">
                    <AppLayout>
                      <Users />
                    </AppLayout>
                  </RequirePermission>
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Chat />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Profile />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute>
                   <RequirePermissionOrSelf permission="view_users">
                    <AppLayout>
                      <UserDetail />
                    </AppLayout>
                  </RequirePermissionOrSelf>
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/visibility"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <VisibilitySettings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/visibility"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <VisibilitySettings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/regions"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <VisibilitySettings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/regions/"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <VisibilitySettings />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/groups"
              element={
                <ProtectedRoute>
                  <RequirePermission permission="change_groups">
                    <AppLayout>
                      <GroupsAdmin />
                    </AppLayout>
                  </RequirePermission>
                </ProtectedRoute>
              }
            />

            {/* Catch-all: any unmatched URL shows the 404 page */}
            <Route path="*" element={<FallbackRoute />} />
          </Routes>
        </BrowserRouter>

        {/* Global toast notification container */}
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
