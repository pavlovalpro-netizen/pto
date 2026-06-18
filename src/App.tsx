/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { AppState, User, Task, Invite, PTONotification } from './types.ts';
import Chessboard from './components/Chessboard.tsx';
import LocationConstructor from './components/LocationConstructor.tsx';
import WorkTypesList from './components/WorkTypesList.tsx';
import KanbanBoard from './components/KanbanBoard.tsx';
import TaskModal from './components/TaskModal.tsx';
import MassTaskForm from './components/MassTaskForm.tsx';
import TaskListTab from './components/TaskListTab.tsx';
import { 
  Building2, 
  LayoutGrid, 
  Settings, 
  Layers, 
  User as UserIcon, 
  Users, 
  Kanban,  
  LogOut, 
  HelpCircle, 
  RotateCw, 
  ClipboardCheck, 
  Plus, 
  Copy, 
  Check, 
  TriangleAlert,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Bell
} from 'lucide-react';

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage blocked in iframe sandbox. Using memory fallback.", e);
      return (window as any).__memStorage?.[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage blocked in iframe sandbox. Using memory fallback.", e);
      if (!(window as any).__memStorage) {
        (window as any).__memStorage = {};
      }
      (window as any).__memStorage[key] = value;
    }
  }
};

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Стейты уведомлений ПТО
  const [notifications, setNotifications] = useState<PTONotification[]>([]);
  const [showNotificationTray, setShowNotificationTray] = useState(false);
  const [newNotificationToast, setNewNotificationToast] = useState<PTONotification | null>(null);
  
  // Активные вкладки системы ПТО: 'chessboard' | 'tasks' | 'constructor' | 'worktypes' | 'team' | 'kanban'
  const [activeTab, setActiveTab] = useState<string>('chessboard');
  
  // Массив секций и фильтрация
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  
  // Всплывающие формы
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showMassTaskForm, setShowMassTaskForm] = useState(false);

  // Для генерации ссылок приглашений
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Для формы приглашения (invite?token=xxx)
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);



  // Модалка настроек профиля и компании
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsName, setSettingsName] = useState('');

  // Форма входа
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsCompany, setSettingsCompany] = useState('');
  const [settingsOldPassword, setSettingsOldPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Стейты для редактирования членов команды (для Начальника ПТО в табе Команда)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [editingUserEmail, setEditingUserEmail] = useState('');
  const [editingUserRole, setEditingUserRole] = useState<'director' | 'engineer'>('engineer');
  const [isSavingTeamUser, setIsSavingTeamUser] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Стейты увольнения/удаления инженера ПТО
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [transferUserId, setTransferUserId] = useState<string>('');
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Фильтруем личные задачи (тип 'general'): начальник ПТО не должен видеть личные задачи других инженеров, только свои (и инженеры видят только свои):
  const visibleTasks = useMemo(() => {
    return state?.tasks ? state.tasks.filter((task) => {
      if (task.type === 'general') {
        const executorEmail = task.executorEmail ? task.executorEmail.toLowerCase() : '';
        const userEmail = currentUser?.email ? currentUser.email.toLowerCase() : '';
        return executorEmail && userEmail && executorEmail === userEmail;
      }
      return true;
    }) : [];
  }, [state?.tasks, currentUser]);

  // Читаем параметры адреса при инициализации на случай приглашения
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('token');
    if (tok) {
      setInviteToken(tok);
    }
  }, []);

  // Загрузка состояния приложения
  const loadState = async (skipAuth: boolean = false) => {
    try {
      const response = await fetch(`/api/state?_t=${Date.now()}`);
      if (!response.ok) throw new Error('Ошибка связи с сервером ПTO');
      
      const data: AppState = await response.json();
      setState(data);

      if (!skipAuth) {
        // Пытаемся восстановить сессию
        const storedEmail = safeLocalStorage.getItem('pto_auth_email');
        const storedPwd = safeLocalStorage.getItem('pto_auth_pwd');

      if (storedEmail && storedPwd) {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: storedEmail, password: storedPwd }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          if (loginData.success && loginData.user) {
            setCurrentUser(loginData.user);
          }
        } else {
          // Если пароль сменили или удалили
          safeLocalStorage.setItem('pto_auth_email', '');
          safeLocalStorage.setItem('pto_auth_pwd', '');
        }
      }
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Получение уведомлений ПТО
  const fetchNotifications = async (email: string) => {
    try {
      const response = await fetch(`/api/notifications?email=${encodeURIComponent(email)}&_t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const fetchedNotifs = data.notifications || [];
          
          setNotifications((prev) => {
            const prevUnreadIds = prev.filter(n => !n.isRead).map(n => n.id);
            const currentUnread = fetchedNotifs.filter((n: any) => !n.isRead);
            const newlyCreated = currentUnread.filter((n: any) => !prevUnreadIds.includes(n.id));

            if (newlyCreated.length > 0) {
              const latest = newlyCreated[0];
              setNewNotificationToast(latest);
            }
            return fetchedNotifs;
          });
        }
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  };

  // Автоскрытие всплывающего тоста уведомления
  useEffect(() => {
    if (newNotificationToast) {
      const t = setTimeout(() => {
        setNewNotificationToast(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [newNotificationToast]);

  // Подключение к SSE потоку для мгновенных обновлений
  useEffect(() => {
    if (!currentUser?.email) return;

    fetchNotifications(currentUser.email);

    const sse = new EventSource('/api/stream');
    sse.onmessage = (e) => {
      if (e.data === 'update') {
        loadState();
        fetchNotifications(currentUser.email);
      }
    };

    return () => {
      sse.close();
    };
  }, [currentUser?.email]);

  const handleMarkNotificationRead = async (id: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id, email: currentUser.email }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/notifications/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      });
      if (res.ok) {
        setNotifications([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (notif: PTONotification) => {
    await handleMarkNotificationRead(notif.id);
    if (notif.taskId && state) {
      const matched = state.tasks.find((t) => t.id === notif.taskId);
      if (matched) {
        setSelectedTask(matched);
        setShowNotificationTray(false);
      }
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  // Автоматическая корректировка таба при смене роли (Начальник <-> Инженер)
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'director') {
        setActiveTab('chessboard');
      } else {
        // У исполнителя-инженера нет вкладки 'chessboard', показываем сразу задачи
        setActiveTab('tasks');
      }
    }
  }, [currentUser?.role]);

  // Кнопка принудительного обновления
  const handleRefresh = () => {
    setLoading(true);
    setErrorMsg(null);
    loadState();
  };

  // Метод очистки базы данных для тестирования всего пути с нуля
  const handleResetDatabase = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/state/reset', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка сброса состояния');

      await loadState();
      setShowResetConfirm(false);
      // Направляем Начальника в Конструктор, чтобы он мог начать разметку нового ЖК
      setActiveTab('constructor');
    } catch (e: any) {
      setErrorMsg(e.message);
      setShowResetConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  // Метод обновления одной задачи
  const handleTaskUpdated = (updatedTask: Task) => {
    if (!state) return;
    const updatedTasks = state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    setState({ ...state, tasks: updatedTasks });
    
    // Если обновилась задача, которая сейчас открыта, синхронизируем ее
    if (selectedTask?.id === updatedTask.id) {
      setSelectedTask(updatedTask);
    }
  };

  // Метод удаления одной задачи
  const handleTaskDeleted = (taskId: string) => {
    if (!state) return;
    const filteredTasks = state.tasks.filter((t) => t.id !== taskId);
    setState({ ...state, tasks: filteredTasks });
    setSelectedTask(null);
  };

  // Генерация одноразовой ссылки для инженера
  const handleGenerateInvite = async () => {
    try {
      const response = await fetch('/api/invites/generate', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Симулируем добавление в локальный стейт
      if (state) {
        setState({
          ...state,
          invites: [...state.invites, data],
        });
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  // Активация приглашения через фейк Google Auth
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) {
      setInviteError('Пожалуйста, заполните Имя, Email и придумайте Пароль!');
      return;
    }

    try {
      const response = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          name: inviteName,
          email: inviteEmail,
          password: invitePassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка активации ссылки');

      setInviteSuccess(true);
      safeLocalStorage.setItem('pto_auth_email', data.user.email);
      safeLocalStorage.setItem('pto_auth_pwd', invitePassword);
      setCurrentUser(data.user);
      
      // Стираем параметры из строки поиска
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        setInviteToken(null);
        setInviteSuccess(false);
        loadState(true);
      }, 400);

    } catch (err: any) {
      setInviteError(err.message);
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.protocol}//${window.location.host}/?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };



  // Сохранение настроек собственного профиля + компании
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSettingsError(null);
    setSettingsSuccess(null);
    setIsSavingSettings(true);

    try {
      // 1. Обновляем данные пользователя
      const userResp = await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser.id,
          name: settingsName,
          email: settingsEmail,
          role: currentUser.role,
        }),
      });
      const userData = await userResp.json();
      if (!userResp.ok) {
        throw new Error(userData.error || 'Ошибка при обновлении профиля');
      }

      // Обновляем текущего пользователя в стейте и localStorage
      setCurrentUser(userData.user);
      safeLocalStorage.setItem('pto_auth_email', userData.user.email);

      // Смена пароля (если заполнен новый пароль)
      if (settingsNewPassword) {
        const passResp = await fetch('/api/users/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email,
            oldPassword: settingsOldPassword,
            newPassword: settingsNewPassword,
            isMasterAccess: currentUser.role === 'director'
          }),
        });
        const passData = await passResp.json();
        if (!passResp.ok) {
          throw new Error(passData.error || 'Ошибка при изменении пароля');
        }
        safeLocalStorage.setItem('pto_auth_pwd', settingsNewPassword);
      }

      // 2. Если мы директор, то сохраняем еще и название компании ПТО
      if (currentUser.role === 'director' && settingsCompany.trim()) {
        const compResp = await fetch('/api/company/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: settingsCompany }),
        });
        const compData = await compResp.json();
        if (!compResp.ok) {
          throw new Error(compData.error || 'Ошибка при изменении компании');
        }
      }

      setSettingsSuccess('Данные успешно сохранены!');
      await loadState(true);
      setTimeout(() => {
        setShowSettingsModal(false);
        setSettingsSuccess(null);
      }, 1500);
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Сохранение отредактированного члена команды (инженера) директором
  const handleSaveTeamUser = async (id: string) => {
    setTeamError(null);
    setIsSavingTeamUser(true);
    try {
      const resp = await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editingUserName,
          email: editingUserEmail,
          role: editingUserRole,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Ошибка сохранения данных сотрудника');
      }

      setEditingUserId(null);
      await loadState();
    } catch (err: any) {
      setTeamError(err.message);
    } finally {
      setIsSavingTeamUser(false);
    }
  };

  // Удаление (увольнение) сотрудника ПТО директором с передачей задач
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    if (!transferUserId) {
      setTeamError('Выберите, кому передать строительные задачи увольняемого сотрудника!');
      return;
    }

    setTeamError(null);
    setIsDeletingUser(true);
    try {
      const resp = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userToDelete.id,
          transferToUserId: transferUserId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Ошибка при удалении сотрудника');
      }

      setUserToDelete(null);
      setTransferUserId('');
      await loadState();
    } catch (err: any) {
      setTeamError(err.message);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleResetPasswordToDefault = async (email: string) => {
    if (!window.confirm('Сбросить пароль этого пользователя на 123456?')) return;
    
    setTeamError(null);
    try {
      const resp = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newPassword: '123456',
          isMasterAccess: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Ошибка при сбросе пароля');
      }
      alert('Пароль успешно сброшен на 123456');
    } catch (err: any) {
      setTeamError(err.message);
    }
  };

  if (loading) {
    return (
      <div id="app_loading_screen" className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0f1115] text-white">
        <RotateCw className="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <h2 className="text-sm font-bold tracking-tight uppercase font-mono text-gray-200">Подключение к системе ПТО...</h2>
        <p className="text-xs text-gray-400 mt-1 font-mono">{state?.companyName || 'Загрузка данных'} ➔ Строительный Контроль</p>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');

      setCurrentUser(data.user);
      safeLocalStorage.setItem('pto_auth_email', loginEmail);
      safeLocalStorage.setItem('pto_auth_pwd', loginPassword);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- ЭКРАН ВХОДА ---
  if (!currentUser && !inviteToken) {
    return (
      <div id="login_screen" className="min-h-screen flex items-center justify-center p-4 bg-[#0f1115] text-[#d1d5db]">
        <div className="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl p-6.5 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-orange-600 rounded-lg text-white shadow-md shadow-orange-950/30">
              <Building2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">ПТО Стройконтроль</h2>
            <p className="text-xs text-slate-400 font-mono">Авторизация в системе</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <p className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono rounded-lg">{loginError}</p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase font-mono">Ваш Email</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase font-mono">Пароль</label>
              <input
                type="password"
                required
                placeholder="••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-2.5 rounded-lg font-bold text-white transition-all text-xs flex justify-center items-center gap-2 shadow-md ${
                isLoggingIn ? 'bg-orange-600/50 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-500 shadow-orange-950/20'
              }`}
            >
              {isLoggingIn ? <RotateCw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4 rotate-180" />}
              <span>Войти в систему</span>
            </button>
          </form>
        </div>
      </div>
    );
  }


  // --- ЭКРАН ИНВАЙТА РЕГИСТРАЦИИ (2.2) ---
  if (inviteToken) {
    return (
      <div id="invite_registration_screen" className="min-h-screen flex items-center justify-center p-4 bg-[#0f1115] text-[#d1d5db]">
        <div className="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl p-6.5 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-orange-500/10 text-orange-500 rounded-full">
              <ClipboardCheck className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Приглашение инженера ПТО</h2>
            <p className="text-xs text-slate-400 font-mono">Регистрация и привязка аккаунта в {state?.companyName || 'ООО "Ал-Про"'}</p>
          </div>

          {inviteSuccess ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl text-center space-y-2 text-emerald-400">
              <UserCheck className="w-10 h-10 mx-auto" />
              <p className="text-sm font-bold">Аккаунт привязан!</p>
              <p className="text-xs text-slate-300 font-mono">Добро пожаловать в систему ПТО. Сейчас мы перенаправим вас на Канбан-доску...</p>
            </div>
          ) : (
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              {inviteError && (
                <p className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono rounded-lg">{inviteError}</p>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase font-mono">Токен авторизации</label>
                <input
                  type="text"
                  readOnly
                  value={inviteToken}
                  className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-slate-400 rounded-lg font-mono outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase font-mono">ФИО Исполнителя</label>
                <input
                  type="text"
                  required
                  placeholder="Иванов И.И."
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase font-mono">Ваш Email</label>
                <input
                  type="email"
                  required
                  placeholder="example@gmail.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg font-mono focus:border-orange-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase font-mono">Придумайте пароль</label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg font-mono focus:border-orange-500 outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-orange-950/20 flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Зарегистрироваться в системе</span>
                </button>
              </div>
            </form>
          )}

          <div className="text-center">
            <button
              onClick={() => setInviteToken(null)}
              className="text-xs text-slate-500 hover:text-white transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Стейты для работы с секциями
  const activeSection = state?.sections[selectedSectionIndex];
  const isDirector = currentUser?.role === 'director';

  // Фильтруем личные задачи (тип 'general'): перемещено вверх для предотвращения ошибки React 310

  return (
    <div id="pto_layout" className="min-h-screen bg-[#0f1115] flex flex-col font-sans text-gray-300 antialiased">
      
      {/* ВСПЛЫВАЮЩИЙ ТОСТ УВЕДОМЛЕНИЯ ПТО (ВВЕРХУ ЭКРАНА) */}
      {newNotificationToast && (
        <div 
          id="pto_toast_notification"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#161b22] border border-orange-500/50 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.6)] p-3.5 max-w-sm w-[90%] flex flex-col gap-1.5 cursor-pointer hover:scale-[1.02] transition-transform animate-bounce"
          onClick={() => handleNotificationClick(newNotificationToast)}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
              <span className="text-[9px] font-bold tracking-wider text-orange-400 font-mono uppercase">Новое уведомление</span>
            </div>
            <button 
              type="button"
              className="text-gray-400 hover:text-white text-xs font-bold font-mono px-1 hover:bg-white/5 rounded"
              onClick={(e) => {
                e.stopPropagation();
                setNewNotificationToast(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="text-left leading-tight">
            <div className="text-[10px] font-bold text-gray-300 font-mono">{newNotificationToast.senderName}</div>
            <p className="text-[11.5px] text-white mt-0.5 font-semibold leading-normal">{newNotificationToast.text}</p>
          </div>
          <div className="text-[8px] text-gray-500 font-mono self-end">Нажмите для перехода к задаче</div>
        </div>
      )}
      
      {/* КРАСИВЫЙ ГЛАВНЫЙ HEADER */}
      <header id="pto_header" className="bg-[#161b22] border-b border-white/10 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Название */}
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-orange-600 rounded-lg text-white shrink-0 shadow-md shadow-orange-950/30 animate-pulse">
                <Building2 className="w-5.5 h-5.5" />
              </div>
              <div className="min-w-0 flex items-center">
                <div>
                  <span className="text-sm font-bold tracking-tight text-white block">СТРОИТЕЛЬНЫЙ КОНТРОЛЬ ПТО</span>
                  <span className="text-[10px] text-gray-400 font-mono tracking-widest font-semibold block uppercase">{state?.companyName || 'ООО "Ал-Про"'}</span>
                </div>
                <span className="ml-3 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-bold rounded font-mono border border-orange-500/30">v1.1</span>
              </div>
            </div>

            {/* Быстрые кнопули */}
            <div className="flex items-center gap-3">
              
              {/* Авторизованный пользователь профиль */}
              {currentUser && (
                <div id="user_profile_badge" className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] rounded-lg border border-white/10">
                  <UserIcon className="w-4 h-4 text-gray-400" />
                  <div className="text-left leading-none">
                    <span className="text-xs font-semibold block text-gray-100">{currentUser.name}</span>
                    <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                      {isDirector ? 'Начальник ПТО' : 'Инженер ПТО'}
                    </span>
                  </div>
                </div>
              )}


              {/* Настройки профиля и компании */}
              {currentUser && (
                <div className="flex items-center gap-2">
                  <button
                    id="user_settings_btn"
                    type="button"
                    onClick={() => {
                      setSettingsName(currentUser.name);
                      setSettingsEmail(currentUser.email);
                      setSettingsCompany(state?.companyName || 'ООО "Ал-Про"');
                      setSettingsError(null);
                      setSettingsSuccess(null);
                      setShowSettingsModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#0d1117] hover:bg-white/5 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                    title="Настройки профиля и компании"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Настройки</span>
                  </button>
                  <button
                    id="logout_btn"
                    type="button"
                    onClick={() => {
                      safeLocalStorage.setItem('pto_auth_email', '');
                      safeLocalStorage.setItem('pto_auth_pwd', '');
                      setCurrentUser(null);
                    }}
                    className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                    title="Выйти из аккаунта"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Колокольчик уведомлений ПТО */}
              {currentUser && (
                <div className="relative shrink-0">
                  <button
                    id="notifications_bell_btn"
                    type="button"
                    onClick={() => setShowNotificationTray(!showNotificationTray)}
                    className={`p-1.5 px-2.5 rounded-lg border text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 relative ${
                      showNotificationTray 
                        ? 'bg-orange-600 border-orange-500 text-white' 
                        : 'bg-[#0d1117] hover:bg-white/5 border-white/10 text-gray-300 hover:text-white'
                    }`}
                    title="Уведомления ПТО"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Уведомления</span>
                    {notifications.filter(n => !n.isRead).length > 0 && (
                      <span className="absolute -top-1 -right-1.5 bg-orange-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-[#161b22] px-0.5 animate-bounce">
                        {notifications.filter(n => !n.isRead).length}
                      </span>
                    )}
                  </button>

                  {/* Выпадающий список уведомлений */}
                  {showNotificationTray && (
                    <div id="pto_notifications_tray" className="absolute right-0 mt-2.5 w-80 bg-[#161b22] rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
                      <div className="p-3 bg-[#0d1117] border-b border-white/10 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-gray-400">Уведомления</span>
                        <div className="flex gap-2.5">
                          {notifications.length > 0 && (
                            <button
                              type="button"
                              onClick={handleMarkAllNotificationsRead}
                              className="text-[9px] text-gray-400 hover:text-orange-400 font-bold uppercase transition-colors"
                            >
                              Все прочитано
                            </button>
                          )}
                          {notifications.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearNotifications}
                              className="text-[9px] text-gray-400 hover:text-rose-400 font-bold uppercase transition-colors"
                            >
                              Очистить
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-xs text-gray-500 font-mono">
                            Новых уведомлений нет
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-3 text-left transition-all hover:bg-white/5 cursor-pointer flex flex-col gap-1 ${!notif.isRead ? 'bg-orange-500/5' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-bold font-mono ${!notif.isRead ? 'text-orange-400' : 'text-gray-400'}`}>
                                  {notif.senderName}
                                </span>
                                <span className="text-[8px] text-gray-500 font-mono">
                                  {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-xs text-gray-200 leading-normal">
                                {notif.text}
                              </p>
                              {notif.taskTitle && (
                                <span className="text-[9px] text-gray-450 font-mono bg-[#0d1117] px-1.5 py-0.5 rounded border border-white/5 self-start mt-1">
                                  Задача: {notif.taskTitle}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Кнопка сброса базы */}
              {isDirector && (
                !showResetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 text-rose-300 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                    title="Очистить все заведенные объекты, дома и задачи для тестирования с чистого листа"
                  >
                    <TriangleAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>Очистить Базу</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-rose-950 border border-rose-500/40 p-1 py-0.5 rounded-lg shrink-0">
                    <span className="text-[10px] text-rose-300 font-bold font-mono uppercase px-1">Сбросить ВСЁ?</span>
                    <button
                      type="button"
                      onClick={handleResetDatabase}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-550 text-white rounded text-[10px] font-bold uppercase transition-all"
                    >
                      Да
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded text-[10px] font-bold uppercase transition-all"
                    >
                      Нет
                    </button>
                  </div>
                )
              )}

              {/* Refresh кнопка */}
              <button
                onClick={handleRefresh}
                className="p-2 bg-[#0d1117] hover:bg-white/5 text-gray-300 hover:text-white rounded-lg border border-white/10 transition-colors"
                title="Перезагрузить данные"
              >
                <RotateCw className="w-4 h-4" />
              </button>

            </div>

          </div>
        </div>
      </header>


      {/* ОШИБКА ПОДКЛЮЧЕНИЯ */}
      {errorMsg && (
        <div className="max-w-7xl mx-auto p-4 px-6 sm:px-8 mt-4">
          <div className="bg-rose-950/40 border border-rose-500/20 p-4 rounded text-rose-300 text-sm flex items-center gap-2">
            <TriangleAlert className="w-5 h-5 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}


      {/* ГЛАВНЫЙ КОНТЕНТ */}
      <main id="pto_main_container" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {state && currentUser ? (
          <>
            {/* РЕЖИМ: НАЧАЛЬНИК ПТО (Полный доступ) */}
            {isDirector ? (
              <div id="director_workspace" className="space-y-6">
                
                {/* Табы навигации Начальника (Раздел 2.1) */}
                <div id="director_tabs_navigation" className="flex flex-wrap border-b border-white/10 gap-1.5">
                  <button
                    onClick={() => setActiveTab('chessboard')}
                    className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                      activeTab === 'chessboard'
                        ? 'border-orange-500 text-orange-500 bg-[#161b22]/85 rounded-t-lg shadow-sm font-display'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Сводная Шахматка
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                      activeTab === 'tasks'
                        ? 'border-orange-500 text-orange-500 bg-[#161b22]/85 rounded-t-lg shadow-sm font-display'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Задачи ПТО
                  </button>
                  <button
                    onClick={() => setActiveTab('constructor')}
                    className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                      activeTab === 'constructor'
                        ? 'border-orange-500 text-orange-500 bg-[#161b22]/85 rounded-t-lg shadow-sm font-display'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Конструктор объектов
                  </button>
                  <button
                    onClick={() => setActiveTab('worktypes')}
                    className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                      activeTab === 'worktypes'
                        ? 'border-orange-500 text-orange-500 bg-[#161b22]/85 rounded-t-lg shadow-sm font-display'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Справочники
                  </button>
                  <button
                    onClick={() => setActiveTab('team')}
                    className={`px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                      activeTab === 'team'
                        ? 'border-orange-500 text-orange-500 bg-[#161b22]/85 rounded-t-lg shadow-sm font-display'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Команда ({state.users.length})
                  </button>
                </div>

                {/* Вкладка: СВОДНАЯ ШАХМАТКА */}
                {activeTab === 'chessboard' && (
                  <div className="space-y-6">
                    {/* Селектор секций для вывода шахматки (Раздел 6) */}
                    {state.sections.length > 0 ? (
                      <div className="bg-[#161b22] p-4 rounded-xl border border-white/10 flex flex-wrap items-center gap-4 shadow-lg">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Фильтр Шахматки:</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {state.sections.map((sec, idx) => {
                            const house = state.houses.find((h) => h.id === sec.houseId);
                            const obj = state.objects.find((o) => o.id === house?.objectId);

                            return (
                              <button
                                key={sec.id}
                                onClick={() => setSelectedSectionIndex(idx)}
                                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                                  selectedSectionIndex === idx
                                    ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-950/30'
                                    : 'bg-[#0d1117] hover:bg-white/5 text-gray-300 border-white/10'
                                }`}
                              >
                                {obj?.name} ➔ {house?.name} ➔ {sec.number}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-12 text-center bg-[#161b22] border rounded-xl border-dashed border-white/10">
                        <p className="text-sm text-gray-400 font-bold uppercase tracking-wider font-mono">В базе данных нет ни одной сгенерированной секции!</p>
                        <p className="text-xs text-slate-500 mt-2">Перейдите во вкладку "Конструктор объектов", чтобы сгенерировать или разметить первый корпус.</p>
                      </div>
                    )}

                    {/* Вывод Шахматки */}
                    {activeSection && (
                      <Chessboard
                        section={activeSection}
                        workTypes={state.workTypes}
                        tasks={visibleTasks}
                        onSelectTask={(task) => setSelectedTask(task)}
                        onOpenMassTaskForm={() => setShowMassTaskForm(true)}
                      />
                    )}
                  </div>
                )}

                {/* Вкладка: СПИСОК И УПРАВЛЕНИЕ ЗАДАЧАМИ ПТО */}
                {activeTab === 'tasks' && (
                  <TaskListTab
                    tasks={visibleTasks}
                    objects={state.objects}
                    houses={state.houses}
                    sections={state.sections}
                    workTypes={state.workTypes}
                    users={state.users}
                    currentUser={currentUser}
                    onRefresh={loadState}
                    onSelectTask={(task) => setSelectedTask(task)}
                    onOpenMassTaskForm={() => setShowMassTaskForm(true)}
                  />
                )}

                {/* Вкладка: КОНСТРУКТОР ОБЪЕКТОВ */}
                {activeTab === 'constructor' && (
                  <LocationConstructor
                    objects={state.objects}
                    houses={state.houses}
                    sections={state.sections}
                    onRefresh={loadState}
                  />
                )}

                {/* Вкладка: СПРАВОЧНИКИ */}
                {activeTab === 'worktypes' && (
                  <WorkTypesList
                    workTypes={state.workTypes}
                    tasks={visibleTasks}
                    onRefresh={loadState}
                  />
                )}

                {/* Вкладка: КОМАНДА & ПРИГЛАШЕНИЯ (Раздел 2.1) */}
                {activeTab === 'team' && (
                  <div className="space-y-6">
                    
                    {/* Кнопка приглашения */}
                    <div className="p-6 bg-[#161b22] rounded-xl border border-white/10 shadow-lg space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4">
                        <div className="space-y-1">
                          <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wide">Рекрутинг: Команда {state?.companyName || 'ООО "Ал-Про"'}</h3>
                          <p className="text-xs text-gray-400">Генерация уникальных одноразовых ссылок-токенов для авторизации инженеров (24ч)</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateInvite}
                          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-orange-950/20"
                        >
                          <Users className="w-4.5 h-4.5" />
                          <span>Пригласить инженера ПТО</span>
                        </button>
                      </div>

                      {/* Список активных ссылок */}
                      {state.invites.length > 0 && (
                        <div className="space-y-2.5">
                          <span className="text-xs font-bold text-gray-400 font-mono block">Активные одноразовые ссылки-токены приглашения:</span>
                          <div className="grid grid-cols-1 gap-2">
                            {state.invites.map((inv) => {
                              const inviteUrl = `${window.location.protocol}//${window.location.host}/?token=${inv.token}`;
                              const isCopied = copiedToken === inv.token;

                              return (
                                <div key={inv.token} className="p-3.5 bg-[#0d1117] border border-white/10 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="text-xs font-bold text-gray-200 truncate">
                                      {inviteUrl}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                      Истекает: {new Date(inv.expiresAt).toLocaleDateString()} {new Date(inv.expiresAt).toLocaleTimeString()}
                                    </div>
                                  </div>
                                  <div className="flex gap-2 shrink-0 self-end sm:self-center">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLink(inv.token)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
                                        isCopied 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/20'
                                      }`}
                                    >
                                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                      <span>{isCopied ? 'Скопировано!' : 'Копировать'}</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                     {/* Таблица пользователей */}
                     {teamError && (
                       <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono rounded-lg mb-3">
                         {teamError}
                       </div>
                     )}
                     <div className="bg-[#161b22] rounded-xl border border-white/10 shadow-lg overflow-hidden">
                       <table className="w-full text-left">
                         <thead>
                           <tr className="bg-[#0d1117] border-b border-white/10 text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">
                             <th className="p-4 px-6">Имя Сотрудника</th>
                             <th className="p-4">Google Email</th>
                             <th className="p-4 px-6 text-right">Ролевой Группа</th>
                             <th className="p-4 px-6 text-center">Действия</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-white/5 text-sm">
                           {state.users.map((u) => {
                             const isEditing = editingUserId === u.id;
                             return (
                               <tr key={u.id} className="hover:bg-white/2 border-white/5">
                                 {isEditing ? (
                                   <>
                                     <td className="p-3 px-6">
                                       <input
                                         type="text"
                                         value={editingUserName}
                                         onChange={(e) => setEditingUserName(e.target.value)}
                                         className="px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded text-xs text-white outline-none focus:border-orange-500 w-full"
                                       />
                                     </td>
                                     <td className="p-3">
                                       <input
                                         type="email"
                                         value={editingUserEmail}
                                         onChange={(e) => setEditingUserEmail(e.target.value)}
                                         className="px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded text-xs text-white outline-none font-mono focus:border-orange-500 w-full"
                                       />
                                     </td>
                                     <td className="p-3 text-right">
                                       <select
                                         value={editingUserRole}
                                         onChange={(e) => setEditingUserRole(e.target.value as 'director' | 'engineer')}
                                         className="px-2 py-1 bg-[#0d1117] border border-white/10 rounded text-xs text-white outline-none focus:border-orange-500"
                                       >
                                         <option value="director">Начальник ПТО</option>
                                         <option value="engineer font-mono font-bold">Инженер ПТО</option>
                                       </select>
                                     </td>
                                     <td className="p-3 px-6 text-center">
                                       <div className="flex items-center justify-center gap-1.5">
                                         <button
                                           type="button"
                                           onClick={() => handleSaveTeamUser(u.id)}
                                           disabled={isSavingTeamUser}
                                           className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold uppercase transition-colors"
                                         >
                                           {isSavingTeamUser ? '...' : 'Сохранить'}
                                         </button>
                                         <button
                                           type="button"
                                           onClick={() => setEditingUserId(null)}
                                           className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px] font-bold uppercase transition-colors"
                                         >
                                           Отмена
                                         </button>
                                       </div>
                                     </td>
                                   </>
                                 ) : (
                                   <>
                                     <td className="p-4 px-6 font-bold text-white">{u.name}</td>
                                     <td className="p-4 font-mono text-xs text-gray-400">{u.email}</td>
                                     <td className="p-4 px-6 text-right font-mono">
                                       <span className={`inline-block px-2.5 py-1 text-[11px] font-bold rounded-md border ${
                                         u.role === 'director' 
                                         ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
                                         : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                       }`}>
                                         {u.role === 'director' ? 'Начальник ПТО (Admin)' : 'Инженер ПТО (Исполнитель)'}
                                       </span>
                                     </td>
                                     <td className="p-4 px-6 text-center">
                                       <div className="flex items-center justify-center gap-2">
                                         <button
                                           type="button"
                                           onClick={() => handleResetPasswordToDefault(u.email)}
                                           className="px-3 py-1 bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/30 rounded text-xs text-gray-300 hover:text-orange-400 font-semibold transition-all"
                                           title="Сбросить пароль на 123456"
                                         >
                                           Сброс пароля
                                         </button>
                                         <button
                                           type="button"
                                           onClick={() => {
                                             setEditingUserId(u.id);
                                             setEditingUserName(u.name);
                                             setEditingUserEmail(u.email);
                                             setEditingUserRole(u.role);
                                           }}
                                           className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-gray-300 hover:text-white font-semibold transition-all"
                                         >
                                           Изменить
                                         </button>
                                         {currentUser && currentUser.email.toLowerCase() !== u.email.toLowerCase() && (
                                           <button
                                             type="button"
                                             onClick={() => {
                                               setUserToDelete(u);
                                               const otherUsr = state.users.find((oth) => oth.id !== u.id);
                                               setTransferUserId(otherUsr ? otherUsr.id : '');
                                              }}
                                             className="px-3 py-1 bg-rose-950/40 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded text-xs font-bold transition-all shadow-sm"
                                             title="Уволить сотрудника и передать задачи"
                                           >
                                             Уволить
                                           </button>
                                         )}
                                       </div>
                                     </td>
                                   </>
                                 )}
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>

                  </div>
                )}

              </div>
            ) : (
              /* РЕЖИМ: ИНЖЕНЕР ПТО (Исполнитель) - Ограниченный интерфейс (Раздел 2.2) */
              <div id="engineer_workspace" className="space-y-6">
                
                {/* Предупредительный баннер об ограниченном интерфейсе */}
                <div id="engineer_hint_banner" className="p-4 bg-[#161b22] border border-white/10 rounded-xl flex items-start gap-3 text-xs leading-relaxed text-gray-300 shadow-lg">
                  <UserIcon className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold uppercase tracking-wider font-mono text-orange-400 block mb-0.5">Личный кабинет инженера</span>
                    <p className="font-normal text-gray-405">Вы зашли как Исполнитель ПТО <strong className="text-white">{currentUser.name}</strong>. В вашем распоряжении все назначенные строительные задачи и личные поручения.</p>
                  </div>
                </div>

                <TaskListTab
                  tasks={visibleTasks}
                  objects={state.objects}
                  houses={state.houses}
                  sections={state.sections}
                  workTypes={state.workTypes}
                  users={state.users}
                  currentUser={currentUser}
                  onRefresh={loadState}
                  onSelectTask={(task) => setSelectedTask(task)}
                  onOpenMassTaskForm={() => setShowMassTaskForm(true)}
                />

              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center bg-[#161b22] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center">
            <TriangleAlert className="w-8 h-8 text-rose-500 mb-2" />
            <h3 className="font-bold text-white">Ошибка авторизации в ПТО</h3>
            <p className="text-xs text-gray-400 mt-1">Доступ заблокирован. Пожалуйста, обратитесь к администратору или воспользуйтесь Ссылкой-Приглашением.</p>
          </div>
        )}
      </main>

      {/* ОКОННАЯ ДЕТАЛИЗАЦИЯ ЗАДАЧИ ЧЕРЕЗ ПОРТАЛ СДК (Раздел 5) */}
      {selectedTask && state && currentUser && (
        <TaskModal
          task={selectedTask}
          users={state.users}
          currentUser={currentUser}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdated}
          onDelete={isDirector ? handleTaskDeleted : undefined}
        />
      )}

      {/* ФОРМА ПАКЕТНОЙ НАРЕЗКИ ЗАДАЧ (Раздел 4) */}
      {showMassTaskForm && state && (
        <MassTaskForm
          objects={state.objects}
          houses={state.houses}
          sections={state.sections}
          workTypes={state.workTypes}
          users={state.users}
          onClose={() => setShowMassTaskForm(false)}
          onRefresh={loadState}
          currentUser={currentUser}
        />
      )}

      {/* МОДАЛЬНОЕ ОКНО: НАСТРОЙКИ ПРОФИЛЯ И КОМПАНИИ */}
      {showSettingsModal && currentUser && (
        <div id="settings_modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all animate-fadeIn">
          <div className="w-full max-w-sm bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl p-6.5 space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-orange-400" />
                <span>Настройки профиля</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white transition-colors text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {settingsError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono rounded-lg">
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono rounded-lg">
                  {settingsSuccess}
                </div>
              )}

              {/* Секция: Личный профиль */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest font-mono">Личные данные (Мой профиль)</h4>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono">Ваше ФИО / Инициалы</label>
                  <input
                    type="text"
                    required
                    placeholder="Например: Павлов М.Н."
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono">Рабочий Email</label>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={settingsEmail}
                    onChange={(e) => setSettingsEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg font-mono focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Секция: Смена пароля */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h4 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest font-mono">Смена пароля (Опционально)</h4>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono">Старый пароль</label>
                  <input
                    type="password"
                    placeholder="••••••"
                    value={settingsOldPassword}
                    onChange={(e) => setSettingsOldPassword(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono">Новый пароль</label>
                  <input
                    type="password"
                    placeholder="••••••"
                    value={settingsNewPassword}
                    onChange={(e) => setSettingsNewPassword(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Секция: Компания */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <h4 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest font-mono">Параметры организации</h4>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                    Название компании ПТО ПТО {!isDirector && <span className="text-gray-500">(Только Начальник)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isDirector}
                    placeholder="Например: ООО 'Ал-Про'"
                    value={settingsCompany}
                    onChange={(e) => setSettingsCompany(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-[#0d1117] hover:bg-white/5 text-gray-350 text-xs font-bold rounded-xl border border-white/10 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-orange-950/20"
                >
                  {isSavingSettings ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: УВОЛЬНЕНИЕ / УДАЛЕНИЕ СОТРУДНИКА С ПЕРЕДАЧЕЙ ЗАДАЧ */}
      {userToDelete && state && (
        <div id="dismiss_user_modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-all animate-fadeIn">
          <div className="w-full max-w-md bg-[#161b22] border border-rose-500/20 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-500 border border-rose-500/20 shrink-0">
                <TriangleAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Увольнение сотрудника из ПТО
                </h3>
                <p className="text-xs text-rose-400">Внимание! Это действие закроет доступ и полностью удалит сотрудника.</p>
              </div>
            </div>

            <div className="p-4 bg-[#0d1117] border border-white/5 rounded-xl space-y-2.5">
              <div className="text-xs text-gray-400">Увольняемый сотрудник:</div>
              <div className="text-sm font-bold text-white font-mono">{userToDelete.name}</div>
              <div className="text-xs text-gray-450 font-mono">{userToDelete.email}</div>
            </div>

            {/* Выбор преемника задач */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-gray-350 uppercase tracking-wide font-mono block">
                Кому передать все строительные задачи? <span className="text-rose-400">*</span>
              </label>
              <select
                required
                value={transferUserId}
                onChange={(e) => setTransferUserId(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg focus:border-rose-500 outline-none"
              >
                <option value="">-- Выберите преемника задач --</option>
                {state.users
                  .filter((u) => u.id !== userToDelete.id)
                  .map((u) => (
                    <option key={u.id} value={u.id} className="bg-[#161b22]">
                      {u.name} ({u.role === 'director' ? 'Начальник ПТО' : 'Инженер ПТО'})
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-gray-500 leading-normal">
                Все активные комплекты исполнительной документации и рекламации сотрудника будут мгновенно переназначены на этого человека.
              </p>
            </div>

            {teamError && (
              <p className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs font-mono animate-shake">
                {teamError}
              </p>
            )}

            <div className="pt-3 flex justify-end gap-2.5 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  setUserToDelete(null);
                  setTransferUserId('');
                  setTeamError(null);
                }}
                className="px-4 py-2 bg-[#0d1117] hover:bg-white/5 text-gray-350 text-xs font-bold rounded-xl border border-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeletingUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 text-xs font-bold rounded-xl transition-all shadow-md shadow-rose-950/20"
              >
                {isDeletingUser ? 'Перевод задач и удаление...' : 'Подтвердить увольнение'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ФУТЕР */}
      <footer id="pto_footer" className="bg-[#0f1115] border-t border-white/10 text-gray-500 text-xs py-5 mt-auto text-center font-mono">
        <p>© 2026 {state?.companyName || 'ООО "Ал-Про"'} - Исполнительная строительная документация ПТО.</p>
        <p className="text-[10px] text-gray-600 mt-1">Сервер авторизован в Cloud Run. База данных MySQL / ORM.</p>
      </footer>

    </div>
  );
}
