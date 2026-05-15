import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import { AuthProvider } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import ExamHistory from "./pages/ExamHistory";
import GenerateExam from "./pages/GenerateExam";
import Login from "./pages/Login";
import ReviewExam from "./pages/ReviewExam";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="history" element={<ExamHistory />} />
              <Route path="generate" element={<GenerateExam />} />
              <Route path="review" element={<ReviewExam />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
