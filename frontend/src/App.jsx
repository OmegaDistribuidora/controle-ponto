import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import HrCadastrosPage from "./pages/HrCadastrosPage";
import HrAnalyticsPage from "./pages/HrAnalyticsPage";
import HrDashboard from "./pages/HrDashboard";
import HrReportsPage from "./pages/HrReportsPage";
import LoginPage from "./pages/LoginPage";
import PublicPunchPage from "./pages/PublicPunchPage";
import UserDashboard from "./pages/UserDashboard";

const HomeRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (user.role === "USER") return <Navigate to="/app/user" replace />;
  return <Navigate to="/app/rh" replace />;
};

const App = () => (
  <Routes>
    <Route path="/" element={<PublicPunchPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute allowedRoles={["USER"]} />}>
      <Route path="/app/user" element={<UserDashboard />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={["RH", "ADMIN"]} />}>
      <Route path="/app/rh" element={<HrDashboard />} />
      <Route path="/app/rh/analise" element={<HrAnalyticsPage />} />
      <Route path="/app/rh/relatorios" element={<HrReportsPage />} />
      <Route path="/app/rh/cadastros/:tipo" element={<HrCadastrosPage />} />
    </Route>
    <Route path="/app" element={<HomeRedirect />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
