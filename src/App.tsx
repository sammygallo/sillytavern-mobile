import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { ProfilePage } from './components/auth/ProfilePage';
import { RequireRole } from './components/auth/RequireRole';
import { MainLayout } from './components/layout/MainLayout';
import { ChatView } from './components/chat/ChatView';
import { SettingsPage, GenerationSettingsPage, InvitationManager, UserManagementPage, QuickReplyPage, ExtensionsPage, DataBankPage, GalleryPage, PromptTemplatesPage } from './components/settings';
import { WorldInfoPage } from './components/worldinfo';
import { RegexScriptPage } from './components/regexscripts';
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
        <Route path="/settings" element={<RequireRole minRole="admin"><SettingsPage /></RequireRole>} />
        <Route path="/settings/generation" element={<RequireRole minRole="admin"><GenerationSettingsPage /></RequireRole>} />
        <Route path="/settings/prompts" element={<RequireRole minRole="admin"><PromptTemplatesPage /></RequireRole>} />
        <Route path="/settings/worldinfo" element={<RequireRole minRole="admin"><WorldInfoPage /></RequireRole>} />
        <Route path="/settings/regex" element={<RequireRole minRole="admin"><RegexScriptPage /></RequireRole>} />
        <Route path="/settings/invitations" element={<RequireRole minRole="admin"><InvitationManager /></RequireRole>} />
        <Route path="/settings/users" element={<RequireRole minRole="admin"><UserManagementPage /></RequireRole>} />
        <Route path="/settings/quickreplies" element={<RequireRole minRole="end_user"><QuickReplyPage /></RequireRole>} />
        <Route path="/settings/extensions" element={<RequireRole minRole="end_user"><ExtensionsPage /></RequireRole>} />
        <Route path="/settings/databank" element={<RequireRole minRole="end_user"><DataBankPage /></RequireRole>} />
        <Route path="/settings/gallery" element={<RequireRole minRole="end_user"><GalleryPage /></RequireRole>} />
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
