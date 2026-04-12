import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { ProfilePage } from './components/auth/ProfilePage';
import { RequireRole } from './components/auth/RequireRole';
import { MainLayout } from './components/layout/MainLayout';
import { ChatView } from './components/chat/ChatView';
// Settings pages are now rendered inside the slide-in SettingsPanel (not routes).
import { InviteAcceptPage } from './components/auth/InviteAcceptPage';
import { ToastProvider } from './components/ui/Toast';

// Phase 7.1: Register all built-in extensions at app startup.
import './extensions';

function App() {
  return (
    <BrowserRouter>
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<RequireRole minRole="end_user"><ProfilePage /></RequireRole>} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<ChatView />} />
          <Route path="chat/:characterId" element={<ChatView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
