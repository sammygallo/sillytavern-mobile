import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { RequireRole } from './components/auth/RequireRole';
import { MainLayout } from './components/layout/MainLayout';
import { ChatView } from './components/chat/ChatView';
import { SettingsPage, GenerationSettingsPage } from './components/settings';
import { WorldInfoPage } from './components/worldinfo';
import { RegexScriptPage } from './components/regexscripts';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/settings" element={<RequireRole minRole="admin"><SettingsPage /></RequireRole>} />
        <Route path="/settings/generation" element={<RequireRole minRole="admin"><GenerationSettingsPage /></RequireRole>} />
        <Route path="/settings/worldinfo" element={<RequireRole minRole="admin"><WorldInfoPage /></RequireRole>} />
        <Route path="/settings/regex" element={<RequireRole minRole="admin"><RegexScriptPage /></RequireRole>} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<ChatView />} />
          <Route path="chat/:characterId" element={<ChatView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
