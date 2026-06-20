/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Task, ConstructionObject, House, Section, WorkType, User, Room, TaskType } from '../types.ts';
import { 
  Plus, 
  Search, 
  Layers, 
  User as UserIcon, 
  Calendar, 
  FolderCheck, 
  Play, 
  CheckCircle, 
  X, 
  FileText, 
  TriangleAlert, 
  HelpCircle, 
  LayoutGrid, 
  TrendingUp, 
  HardHat 
} from 'lucide-react';

interface TaskListTabProps {
  tasks: Task[];
  objects: ConstructionObject[];
  houses: House[];
  sections: Section[];
  workTypes: WorkType[];
  users: User[];
  currentUser: User;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
  onOpenMassTaskForm: () => void;
}

export default function TaskListTab({
  tasks,
  objects,
  houses,
  sections,
  workTypes,
  users,
  currentUser,
  onRefresh,
  onSelectTask,
  onOpenMassTaskForm,
}: TaskListTabProps) {
  // Фильтрация
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<number | 'all'>('all');
  const [selectedType, setSelectedType] = useState<TaskType | 'all'>('all');
  const [selectedObjId, setSelectedObjId] = useState<string | 'all'>('all');
  const [taskViewListTab, setTaskViewListTab] = useState<'active' | 'archived'>('active');

  // Форма добавления одной задачи
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formType, setFormType] = useState<TaskType>('main');
  const [formObjId, setFormObjId] = useState('');
  const [formHouseId, setFormHouseId] = useState('');
  const [formSecId, setFormSecId] = useState('');
  const [formFloorNum, setFormFloorNum] = useState<string>('');
  const [formRoomId, setFormRoomId] = useState('');
  
  const [formWorkTypeId, setFormWorkTypeId] = useState('');
  const [formExecutorEmail, setFormExecutorEmail] = useState('');
  const [formDeadline, setFormDeadline] = useState(() => {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  });
  const [formDriveUrl, setFormDriveUrl] = useState('');
  const [formRecCause, setFormRecCause] = useState('Брак');
  const [formRecDesc, setFormRecDesc] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmiting, setIsSubmiting] = useState(false);

  // Массовые операции (Bulk operations)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkExecutor, setBulkExecutor] = useState<string>('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Очищать выбранные ID только если они действительно пропали из общего списка задач (например, были удалены)
  useEffect(() => {
    if (tasks && tasks.length > 0) {
      const liveTaskIds = new Set(tasks.map((t) => t.id));
      setSelectedTaskIds((prev) => {
        const remaining = prev.filter((id) => liveTaskIds.has(id));
        // Сравниваем контент массивов, чтобы не вызывать лишних обновлений состояния и сохранить рендеринг стабильным
        if (remaining.length === prev.length && remaining.every((id, idx) => id === prev[idx])) {
          return prev;
        }
        return remaining;
      });
    }
  }, [tasks]);

  // Для динамического каскада в форме добавления
  const filteredFormHouses = houses.filter(h => h.objectId === formObjId);
  const filteredFormSections = sections.filter(s => s.houseId === formHouseId);
  const selectedSectionObj = sections.find(s => s.id === formSecId);
  
  // Компиляция этажей для выбранной секции
  const floorsList = selectedSectionObj 
    ? [...selectedSectionObj.floors].sort((a, b) => b.floorNumber - a.floorNumber)
    : [];
    
  // Компиляция комнат для выбранного этажа
  const selectedFloorObj = selectedSectionObj && formFloorNum !== '' 
    ? selectedSectionObj.floors.find(f => f.floorNumber === parseInt(formFloorNum, 10))
    : null;
    
  const roomsList = selectedFloorObj ? selectedFloorObj.rooms : [];

  // Сброс каскада формы при смене объектов
  useEffect(() => {
    setFormHouseId('');
    setFormSecId('');
    setFormFloorNum('');
    setFormRoomId('');
  }, [formObjId]);

  useEffect(() => {
    setFormSecId('');
    setFormFloorNum('');
    setFormRoomId('');
  }, [formHouseId]);

  useEffect(() => {
    setFormFloorNum('');
    setFormRoomId('');
  }, [formSecId]);

  useEffect(() => {
    setFormRoomId('');
  }, [formFloorNum]);

  // Сбросить форму
  const resetFormState = () => {
    setFormType('main');
    setFormObjId('');
    setFormHouseId('');
    setFormSecId('');
    setFormFloorNum('');
    setFormRoomId('');
    setFormWorkTypeId('');
    setFormExecutorEmail('');
    setFormDeadline('');
    setFormDriveUrl('');
    setFormRecCause('Брак');
    setFormRecDesc('');
    setFormError(null);
    setFormSuccess(null);
  };

  // Метод отправки формы одиночной задачи
  const handleCreateSingleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formExecutorEmail) {
      setFormError('Укажите ответственного исполнителя ПТО!');
      return;
    }

    if (formType !== 'general') {
      if (!formWorkTypeId) {
        setFormError('Укажите вид выполняемой работы!');
        return;
      }
      if (!formRoomId) {
        setFormError('Укажите конкретную локацию (Помещение) для связки с шахматкой!');
        return;
      }
    }

    setIsSubmiting(true);

    try {
      const response = await fetch('/api/tasks/create-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          location: formType !== 'general' ? {
            objectId: formObjId,
            houseId: formHouseId,
            sectionId: formSecId,
            floorNumber: formFloorNum,
            roomId: formRoomId,
          } : null,
          workTypeId: formType !== 'general' ? formWorkTypeId : undefined,
          executorEmail: formExecutorEmail,
          deadline: formDeadline || undefined,
          driveFolderUrl: formDriveUrl,
          reclamationCause: formType === 'reclamation' ? formRecCause : undefined,
          reclamationDescription: formType !== 'main' ? formRecDesc : undefined,
          creatorEmail: currentUser.email,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка добавления задачи');

      setFormSuccess('Задача успешно создана! Она добавлена в список и сопряжена с шахматкой.');
      setTimeout(() => {
        onRefresh();
        setShowCreateForm(false);
        resetFormState();
      }, 1500);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmiting(false);
    }
  };

  const handleToggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleToggleSelectAll = () => {
    const filteredIds = filteredTasks.map((t) => t.id);
    const allSelected = filteredIds.every((id) => selectedTaskIds.includes(id));

    if (allSelected) {
      setSelectedTaskIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedTaskIds((prev) => {
        const union = new Set([...prev, ...filteredIds]);
        return Array.from(union);
      });
    }
  };

  const handleBulkUpdate = async (type: 'status' | 'executor') => {
    setBulkError(null);
    setBulkSuccess(null);
    if (selectedTaskIds.length === 0) return;

    let payload: any = {
      taskIds: selectedTaskIds,
      userRole: currentUser.role,
    };

    if (type === 'status') {
      if (!bulkStatus) {
        setBulkError('Пожалуйста, выберите статус!');
        return;
      }
      payload.status = parseInt(bulkStatus, 10);
    } else if (type === 'executor') {
      if (!bulkExecutor) {
        setBulkError('Пожалуйста, выберите ответственного исполнителя!');
        return;
      }
      payload.executorEmail = bulkExecutor;
    }

    setIsBulkProcessing(true);
    try {
      const resp = await fetch('/api/tasks/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Ошибка массового обновления');
      }
      setBulkSuccess(`Успешно обновлено задач: ${data.updatedCount}`);
      setSelectedTaskIds([]);
      setBulkStatus('');
      setBulkExecutor('');
      setTimeout(() => {
        onRefresh();
        setBulkSuccess(null);
      }, 1500);
    } catch (err: any) {
      setBulkError(err.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkError(null);
    setBulkSuccess(null);
    if (selectedTaskIds.length === 0) return;

    if (currentUser.role !== 'director') {
      setBulkError('Только Начальник ПТО может удалять задачи!');
      return;
    }

    setIsBulkProcessing(true);
    try {
      const resp = await fetch('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: selectedTaskIds,
          userRole: currentUser.role,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Ошибка массового удаления');
      }
      setBulkSuccess(`Успешно удалено задач: ${data.deletedCount}`);
      setSelectedTaskIds([]);
      setShowBulkDeleteConfirm(false);
      setTimeout(() => {
        onRefresh();
        setBulkSuccess(null);
      }, 1500);
    } catch (err: any) {
      setBulkError(err.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Фильтруем задачи на основе параметров пользователя
  const filteredTasks = tasks.filter(task => {
    // Если залогинен инженер, отображаем только назначенные ему задачи
    if (currentUser.role === 'engineer' && task.executorEmail !== currentUser.email) {
      return false;
    }

    // 1. Поиск по тексту
    const text = searchTerm.toLowerCase();
    const matchesSearch = 
      task.id.toLowerCase().includes(text) ||
      task.workTypeName.toLowerCase().includes(text) ||
      task.executorName.toLowerCase().includes(text) ||
      task.executorEmail.toLowerCase().includes(text) ||
      (task.location && task.location.roomName.toLowerCase().includes(text)) ||
      (task.reclamationDescription && task.reclamationDescription.toLowerCase().includes(text));

    // 2. Статус
    const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus;

    // 3. Категория
    const matchesType = selectedType === 'all' || task.type === selectedType;

    // 4. ЖК / Объект
    const matchesObj = selectedObjId === 'all' || (task.location && task.location.objectId === selectedObjId);

    // 5. Разделение на вкладки Актуальные / Выполненные (статус 7)
    const isCompleted = task.status === 7;
    const matchesListTab = (taskViewListTab === 'archived') === isCompleted;

    return matchesSearch && matchesStatus && matchesType && matchesObj && matchesListTab;
  }).sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

  // Получить текстовый статус задачи
  const getStatusLabelText = (status: number, taskType?: TaskType) => {
    if (taskType === 'general') {
      return status === 7 ? 'Закрыта' : 'Активна';
    }
    switch (status) {
      case 1: return 'Назначена';
      case 2: return 'В работе';
      case 3: return 'На проверке';
      case 4: return 'Передано технадзору';
      case 5: return 'Замечания технадзора';
      case 6: return 'На подписании';
      case 7: return 'В архиве (Сдано)';
      default: return 'Неизвестно';
    }
  };

  const getStatusBadgeStyle = (status: number, taskType?: TaskType) => {
    if (taskType === 'general') {
      return status === 7 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
    switch (status) {
      case 1: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 2: return 'bg-yellow-500/10 text-yellow-450 border-yellow-500/20';
      case 3: return 'bg-orange-500/10 text-orange-450 border-orange-500/20';
      case 4: return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 5: return 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse';
      case 6: return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 7: return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getCategoryBadgeStyle = (type: TaskType) => {
    switch (type) {
      case 'main': return 'bg-orange-500/15 text-orange-400 border border-orange-500/20';
      case 'reclamation': return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
      case 'general': default: return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20';
    }
  };

  const getCategoryLabel = (type: TaskType) => {
    switch (type) {
      case 'main': return 'Проект';
      case 'reclamation': return 'Рекламация';
      case 'general': return 'Поручение';
    }
  };

  const isDirector = currentUser.role === 'director';

  return (
    <div id="tasks_workspace" className="space-y-6">
      
      {/* СТАТИСТИКА ПО ЗАДАЧАМ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] uppercase font-mono tracking-wider text-gray-400 block">Всего задач</span>
          <span className="text-2xl font-bold text-white block mt-1">{tasks.filter(t => t.type !== 'general').length}</span>
        </div>
        <div className="bg-[#2a1318] border border-rose-500/20 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] uppercase font-mono tracking-wider text-rose-300 block">Замечания технадзора</span>
          <span className="text-2xl font-bold text-rose-500 block mt-1">
            {tasks.filter(t => t.type !== 'general' && t.status === 5).length}
          </span>
        </div>
        <div className="bg-[#241c10] border border-orange-500/20 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] uppercase font-mono tracking-wider text-orange-300 block">Ожидают проверки (ПТО)</span>
          <span className="text-2xl font-bold text-orange-400 block mt-1">
            {tasks.filter(t => t.type !== 'general' && t.status === 3).length}
          </span>
        </div>
        <div className="bg-[#101915] border border-emerald-500/20 p-4 rounded-xl shadow-lg">
          <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-300 block">Сдано в архив</span>
          <span className="text-2xl font-bold text-emerald-500 block mt-1">
            {tasks.filter(t => t.type !== 'general' && t.status === 7).length}
          </span>
        </div>
      </div>

      {/* ПАНЕЛЬ УПРАВЛЕНИЯ И ФИЛЬТРАЦИИ */}
      <div className="bg-[#161b22] border border-white/10 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">Журнал управления задачами ИД</h2>
            <p className="text-xs text-gray-400">Формирование точечных задач и мониторинг их выполнения исполнителями</p>
          </div>
          
          <button
            onClick={onOpenMassTaskForm}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md self-start md:self-center uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" />
            <span>{isDirector ? 'Поставить новую задачу ПТО' : 'Создать личную задачу'}</span>
          </button>
        </div>

        {/* СЕТКА ФИЛЬТРОВ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10">
          
          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по работе, ФИО, кв..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-[#0d1117] border border-white/10 text-white rounded-lg focus:border-orange-500 outline-none"
            />
          </div>

          {/* ЖК / Объект */}
          <select
            value={selectedObjId}
            onChange={(e) => setSelectedObjId(e.target.value as any)}
            className="text-xs px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-white outline-none"
          >
            <option value="all">Все Объекты</option>
            {objects.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          {/* Статус выполнения */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedStatus(val === 'all' ? 'all' : parseInt(val, 10));
            }}
            className="text-xs px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-white outline-none"
          >
            <option value="all">Все Статусы</option>
            <option value="1">1. Назначена</option>
            <option value="2">2. В работе</option>
            <option value="3">3. На проверке Начальника</option>
            <option value="4">4. Передано технадзору</option>
            <option value="5">5. Замечания технадзора</option>
            <option value="6">6. На подписании</option>
            <option value="7">7. В архиве (Сдано)</option>
          </select>

          {/* Категория */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="text-xs px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-white outline-none"
          >
            <option value="all">Все Категории</option>
            <option value="main">Проектные задачи ИД</option>
            <option value="reclamation">Рекламации (Аварийные)</option>
            <option value="general">Общие поручения ПТО</option>
          </select>

        </div>
      </div>

      {/* ПАНЕЛЬ МАССОВЫХ ДЕЙСТВИЙ */}
      {selectedTaskIds.length > 0 && (
        <div className="bg-[#1b2230] border-2 border-orange-500/30 rounded-xl p-4 shadow-xl space-y-4 animate-fadeIn">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Информация о выбранных задачах */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-500/10 text-orange-400 rounded-lg border border-orange-500/20">
                <FolderCheck className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Выбрано задач: <span className="text-orange-400 text-sm font-black">{selectedTaskIds.length}</span></h4>
                <p className="text-[10px] text-gray-400">Примените массовое действие ко всем отмеченным строкам ниже</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              
              {/* Изменение статуса */}
              <div className="flex items-center gap-1.5 bg-[#0d1117] px-2.5 py-1.5 rounded-lg border border-white/5">
                <span className="text-[10px] uppercase font-mono text-gray-405">Статус:</span>
                <select
                  id="bulk_status_selector"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="text-[11px] bg-transparent text-white outline-none cursor-pointer max-w-[130px]"
                  disabled={isBulkProcessing}
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать --</option>
                  <option value="1" className="bg-[#161b22]">1. Назначена</option>
                  <option value="2" className="bg-[#161b22]">2. В работе</option>
                  <option value="3" className="bg-[#161b22]">3. На проверке</option>
                  <option value="4" className="bg-[#161b22]">4. Передано технадзору</option>
                  <option value="5" className="bg-[#161b22]">5. Замечания технадзора</option>
                  <option value="6" className="bg-[#161b22]">6. На подписании</option>
                  {isDirector && <option value="7" className="bg-[#161b22]">7. В архив (Сдано)</option>}
                </select>
                <button
                  id="bulk_status_apply_btn"
                  type="button"
                  onClick={() => handleBulkUpdate('status')}
                  disabled={!bulkStatus || isBulkProcessing}
                  className="px-2 py-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-45 text-white text-[10px] font-bold rounded transition-all uppercase tracking-wider font-mono"
                >
                  ОК
                </button>
              </div>

              {/* Изменение ответственного */}
              <div className="flex items-center gap-1.5 bg-[#0d1117] px-2.5 py-1.5 rounded-lg border border-white/5">
                <span className="text-[10px] uppercase font-mono text-gray-405">Исполнитель:</span>
                <select
                  id="bulk_executor_selector"
                  value={bulkExecutor}
                  onChange={(e) => setBulkExecutor(e.target.value)}
                  className="text-[11px] bg-transparent text-white outline-none cursor-pointer max-w-[150px]"
                  disabled={isBulkProcessing}
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.email} className="bg-[#161b22]">
                      {u.name} ({u.role === 'director' ? 'Нач. ПТО' : 'Инж. ПТО'})
                    </option>
                  ))}
                </select>
                <button
                  id="bulk_executor_apply_btn"
                  type="button"
                  onClick={() => handleBulkUpdate('executor')}
                  disabled={!bulkExecutor || isBulkProcessing}
                  className="px-2 py-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-45 text-white text-[10px] font-bold rounded transition-all uppercase tracking-wider font-mono"
                >
                  ОК
                </button>
              </div>

              {/* Массового Удаление */}
              {isDirector && (
                <button
                  id="bulk_delete_trigger"
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={isBulkProcessing}
                  className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/30 text-rose-400 hover:text-white text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 uppercase tracking-wider font-mono shadow-md"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Удалить выбранные</span>
                </button>
              )}

              <button
                id="bulk_reset_btn"
                type="button"
                onClick={() => {
                  setSelectedTaskIds([]);
                  setBulkError(null);
                  setBulkSuccess(null);
                }}
                className="text-xs text-gray-400 hover:text-white underline font-mono ml-1"
              >
                Сбросить
              </button>

            </div>
          </div>

          {bulkError && (
            <p id="bulk_error_message" className="bg-rose-955/40 border-l-4 border-rose-500 p-2.5 text-rose-300 text-[11px] font-mono rounded-r animate-fadeIn">
              {bulkError}
            </p>
          )}
          {bulkSuccess && (
            <p id="bulk_success_message" className="bg-emerald-955/40 border-l-4 border-emerald-500 p-2.5 text-emerald-300 text-[11px] font-mono rounded-r animate-pulse">
              {bulkSuccess}
            </p>
          )}

          {/* ДИАЛОГ ПОДТВЕРЖДЕНИЯ МАССОВОГО УДАЛЕНИЯ */}
          {showBulkDeleteConfirm && (
            <div id="bulk_delete_confirmation_box" className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5 text-rose-300">
                <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-400 animate-bounce" />
                <div className="space-y-1">
                  <h5 className="text-xs font-bold uppercase tracking-wider font-mono">Внимание: Безвозвратное удаление!</h5>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Вы собираетесь полностью удалить <strong className="text-white font-heavy font-mono">{selectedTaskIds.length}</strong> {selectedTaskIds.length === 1 ? 'задачу' : 'задач'}. Это действие сотрет их из базы данных и освободит ячейки в шахматке. Восстановить их будет невозможно!
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  id="bulk_delete_cancel_btn"
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="px-3 py-1.5 text-[11px] font-bold text-gray-400 bg-transparent hover:bg-white/5 border border-white/10 rounded-lg transition-all font-mono"
                >
                  ОТМЕНА
                </button>
                <button
                  id="bulk_delete_confirm_btn"
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isBulkProcessing}
                  className="px-3.5 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-all uppercase tracking-wider font-mono shadow-md"
                >
                  {isBulkProcessing ? 'УДАЛЕНИЕ...' : 'ПОДТВЕРДИТЬ УДАЛЕНИЕ'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ПЕРЕКЛЮЧАТЕЛЬ СПИСКОВ: АКТУАЛЬНЫЕ / ВЫПОЛНЕННЫЕ */}
      <div id="pto_task_list_tabs_header" className="flex border-b border-white/10 gap-2 mb-1.5 overflow-x-auto shrink-0 scrollbar-none">
        <button
          id="pto_task_list_active_tab_btn"
          type="button"
          onClick={() => {
            setTaskViewListTab('active');
            setSelectedStatus('all');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase font-mono tracking-wider border-b-2 transition-all flex items-center gap-2.5 shrink-0 select-none ${
            taskViewListTab === 'active'
              ? 'border-orange-500 text-white bg-white/5 font-black'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/[0.02]'
          }`}
        >
          <span>Текущие актуальные задачи</span>
          <span className="px-2 py-0.5 text-[9px] bg-orange-600 font-bold text-white rounded-full font-mono">
            {tasks.filter(t => (currentUser.role === 'director' || t.executorEmail.toLowerCase() === currentUser.email.toLowerCase()) && t.status !== 7).length}
          </span>
        </button>
        <button
          id="pto_task_list_archived_tab_btn"
          type="button"
          onClick={() => {
            setTaskViewListTab('archived');
            setSelectedStatus('all');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase font-mono tracking-wider border-b-2 transition-all flex items-center gap-2.5 shrink-0 select-none ${
            taskViewListTab === 'archived'
              ? 'border-emerald-500 text-white bg-white/5 font-black'
              : 'border-transparent text-gray-400 hover:text-white hover:bg-white/[0.02]'
          }`}
        >
          <span>Архив / Выполненные</span>
          <span className="px-2 py-0.5 text-[9px] bg-emerald-600 font-bold text-white rounded-full font-mono">
            {tasks.filter(t => (currentUser.role === 'director' || t.executorEmail.toLowerCase() === currentUser.email.toLowerCase()) && t.status === 7).length}
          </span>
        </button>
      </div>

      {/* ТАБЛИЦА / ЖУРНАЛ ЗАДАЧ */}
      <div id="task_table_container" className="bg-[#161b22] border border-white/10 rounded-xl overflow-hidden shadow-lg">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-mono text-xs">
            Задачи с указанными фильтрами не обнаружены. Измените поисковой запрос или создайте новую задачу.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0d1117] border-b border-white/10 text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">
                  <th className="p-4 pl-5 w-12 text-center">
                    <input 
                      id="bulk_select_all_checkbox"
                      type="checkbox"
                      checked={filteredTasks.length > 0 && filteredTasks.every(t => selectedTaskIds.includes(t.id))}
                      onChange={handleToggleSelectAll}
                      title="Выбрать все отфильтрованные"
                      className="w-4 h-4 rounded border-gray-600 text-orange-600 bg-[#0d1117] focus:ring-orange-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 px-5">Тип / ID</th>
                  <th className="p-4">Адрес / Локация</th>
                  <th className="p-4">Техпроцесс / Описание в ПТО</th>
                  <th className="p-4">Исполнитель</th>
                  <th className="p-4">Статус выполнения</th>
                  <th className="p-4 shrink-0 text-center">Срок сдачи</th>
                  <th className="p-4 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                {filteredTasks.map((task) => {
                  return (
                    <tr key={task.id} className="hover:bg-white/2 transition-colors">
                      <td className="p-4 pl-5 text-center">
                        <input 
                          id={`select_task_checkbox_${task.id}`}
                          type="checkbox"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={() => handleToggleSelectTask(task.id)}
                          className="w-4 h-4 rounded border-gray-600 text-orange-600 bg-[#0d1117] focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      {/* Тип / ID */}
                      <td className="p-4 px-5 space-y-1">
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded font-mono ${getCategoryBadgeStyle(task.type)}`}>
                          {getCategoryLabel(task.type)}
                        </span>
                        <div className="font-mono text-[10px] text-gray-500">{task.id.slice(0, 15)}</div>
                      </td>

                      {/* Адрес / Локация */}
                      <td className="p-4 font-medium">
                        {task.location ? (
                          <div className="space-y-0.5">
                            <span className="text-white block text-[11px] font-bold">
                              {task.location.objectName} ➔ {task.location.houseName}
                            </span>
                            <span className="text-gray-400 block text-[10px] font-mono">
                              {task.location.sectionNumber} ➔ Этаж {task.location.floorNumber} ➔ Room: <strong className="text-orange-400">{task.location.roomName}</strong>
                            </span>
                          </div>
                        ) : (
                          <span className="text-cyan-400 font-mono text-[10px]">Общее поручение ПТО</span>
                        )}
                      </td>

                      {/* Техпроцесс */}
                      <td className="p-4 max-w-xs space-y-1">
                        <div className="font-bold text-gray-200 text-[11px] truncate" title={task.workTypeName}>
                          {task.workTypeName}
                        </div>
                        {task.type !== 'main' && task.reclamationDescription && (
                          <div className="text-gray-450 text-[10px] italic truncate line-clamp-2 leading-relaxed" title={task.reclamationDescription}>
                            "{task.reclamationDescription}"
                          </div>
                        )}
                        {task.type === 'reclamation' && task.reclamationCause && (
                          <span className="inline-block mt-1 text-[9px] text-red-400 border border-red-500/10 bg-red-500/5 px-1 rounded uppercase font-mono">Причина: {task.reclamationCause}</span>
                        )}
                      </td>

                      {/* Исполнитель */}
                      <td className="p-4 font-mono text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-gray-500" />
                          <div>
                            <span className="block text-white text-[11px] font-medium leading-none">{task.executorName}</span>
                            <span className="text-[9px] text-gray-500 block mt-1">{task.executorEmail}</span>
                          </div>
                        </div>
                      </td>

                      {/* Статус */}
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-mono border rounded-full ${getStatusBadgeStyle(task.status, task.type)}`}>
                          ● {getStatusLabelText(task.status, task.type)}
                        </span>
                      </td>

                      {/* Срок сдачи */}
                      <td className="p-4 text-center font-mono">
                        <span className="text-gray-200 font-medium">{task.deadline}</span>
                      </td>

                      {/* Подробнее кнопка */}
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onSelectTask(task)}
                          className="px-2.5 py-1 bg-[#1c222b] hover:bg-orange-600 hover:text-white border border-white/5 rounded text-white font-bold transition-all text-[11px]"
                        >
                          Открыть
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* АЛЬТЕРНАТИВНАЯ МОДАЛЬНАЯ ФОРМА ОДИНОЧНОГО МАНУАЛЬНОГО СОЗДАНИЯ */}
      {showCreateForm && (
        <div className="fixed inset-0 z-45 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
            
            <div className="px-6 py-4 bg-[#0d1117] text-white flex justify-between items-center border-b border-white/10">
              <div>
                <h3 className="text-sm font-bold tracking-tight uppercase font-mono text-white">Новая точечная задача</h3>
                <p className="text-xs text-gray-400">Индивидуальное назначение на конкретное помещение и техпроцесс</p>
              </div>
              <button onClick={() => setShowCreateForm(false)} className="p-1 rounded text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateSingleTask} className="flex-1 overflow-y-auto p-6 space-y-4 text-gray-300">
              
              {formError && (
                <p className="bg-rose-950/40 border-l-4 border-rose-500 p-3 text-rose-300 text-xs font-mono rounded-r">{formError}</p>
              )}
              {formSuccess && (
                <p className="bg-emerald-950/40 border-l-4 border-emerald-500 p-3 text-emerald-300 text-xs font-mono rounded-r">{formSuccess}</p>
              )}

              {/* Категория */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Категория задачи</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('main')}
                    className={`p-2 py-2.5 text-xs font-bold rounded border transition-all ${
                      formType === 'main' 
                      ? 'bg-orange-600 border-orange-600 text-white font-bold' 
                      : 'bg-[#0d1117] border-white/5 hover:bg-white/5 text-gray-400'
                    }`}
                  >
                    1. Проект
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('reclamation')}
                    className={`p-2 py-2.5 text-xs font-bold rounded border transition-all ${
                      formType === 'reclamation' 
                      ? 'bg-rose-600 border-rose-600 text-white font-bold' 
                      : 'bg-[#0d1117] border-white/5 hover:bg-white/5 text-gray-400'
                    }`}
                  >
                    2. Рекламация
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('general')}
                    className={`p-2 py-2.5 text-xs font-bold rounded border transition-all ${
                      formType === 'general' 
                      ? 'bg-cyan-600 border-cyan-600 text-white font-bold' 
                      : 'bg-[#0d1117] border-white/5 hover:bg-white/5 text-gray-400'
                    }`}
                  >
                    3. Поручение
                  </button>
                </div>
              </div>

              {/* Рекламационные инциденты - Причина */}
              {formType === 'reclamation' && (
                <div className="p-3 bg-rose-500/5 rounded-lg border border-rose-500/10 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-rose-300 block">Причина рекламационного брака</span>
                    <select
                      value={formRecCause}
                      onChange={(e) => setFormRecCause(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-rose-500/20 text-white rounded outline-none"
                    >
                      <option value="Затопление">Затопление</option>
                      <option value="Прорыв кровли">Прорыв кровли</option>
                      <option value="Брак">Заводской брак / дефект</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Поручения и рекламации - Текстовое Описание */}
              {formType !== 'main' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase font-mono">
                    {formType === 'reclamation' ? 'Описание брака / Замечания' : 'Инструкции / Текст поручения'}
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={formRecDesc}
                    onChange={(e) => setFormRecDesc(e.target.value)}
                    placeholder={formType === 'reclamation' ? 'Опишите характер брака...' : 'Собрать акты, подготовить чертежи и т.д...'}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded text-white outline-none"
                  />
                </div>
              )}

              {/* ГЕОГРАФИЯ (Локация помещения) - Только для Проектов и Рекламаций */}
              {formType !== 'general' && (
                <div className="p-4 bg-[#0d1117] rounded-xl border border-white/10 space-y-3">
                  <span className="text-xs font-bold text-orange-400 uppercase tracking-widest font-mono block">Матрица Локализации</span>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    
                    {/* ЖК выбор */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-450 uppercase block font-mono">1. Объект (ЖК)</span>
                      <select
                        required
                        value={formObjId}
                        onChange={(e) => setFormObjId(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 bg-[#161b22] border border-white/10 rounded text-white outline-none"
                      >
                        <option value="">-- Выбрать --</option>
                        {objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>

                    {/* Корпус выбор */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-450 uppercase block font-mono">2. Корпус / Дом</span>
                      <select
                        required
                        disabled={!formObjId}
                        value={formHouseId}
                        onChange={(e) => setFormHouseId(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 bg-[#161b22] border border-white/10 rounded text-white disabled:opacity-50 outline-none"
                      >
                        <option value="">-- Выбрать --</option>
                        {filteredFormHouses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    </div>

                    {/* Секция выбор */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-450 uppercase block font-mono">3. Секция</span>
                      <select
                        required
                        disabled={!formHouseId}
                        value={formSecId}
                        onChange={(e) => setFormSecId(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 bg-[#161b22] border border-white/10 rounded text-white disabled:opacity-50 outline-none"
                      >
                        <option value="">-- Выбрать --</option>
                        {filteredFormSections.map(s => <option key={s.id} value={s.id}>{s.number}</option>)}
                      </select>
                    </div>

                    {/* Этаж выбор */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-450 uppercase block font-mono">4. Этаж</span>
                      <select
                        required
                        disabled={!formSecId}
                        value={formFloorNum}
                        onChange={(e) => setFormFloorNum(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 bg-[#161b22] border border-white/10 rounded text-white disabled:opacity-50 outline-none"
                      >
                        <option value="">-- Выбрать --</option>
                        {floorsList.map(fl => (
                          <option key={fl.floorNumber} value={fl.floorNumber}>
                            {fl.floorNumber === -1 ? 'Подвал (-1э)' : `${fl.floorNumber} этаж`}
                          </option>
                        ))}
                      </select>
                    </div>

                  </div>

                  {/* Помещение выбор */}
                  {formFloorNum !== '' && (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <span className="text-[11px] text-gray-400 font-bold block uppercase font-mono">5. Выберите конечное помещение ПТО</span>
                      {roomsList.length === 0 ? (
                        <p className="text-[10px] text-rose-450 font-mono">На данном этаже нет помещений!</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-32 overflow-y-auto p-1.5 bg-black/30 rounded border border-white/5">
                          {roomsList.map(room => (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => setFormRoomId(room.id)}
                              className={`p-1.5 text-[10px] font-bold rounded truncate transition-all text-center leading-none ${
                                formRoomId === room.id 
                                ? 'bg-orange-600 text-white' 
                                : 'bg-[#161b22] text-gray-400 border border-white/5 hover:border-white/10 hover:text-white'
                              }`}
                            >
                              {room.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

              {/* ИСПОЛНИТЕЛЬ, ВИД РАБОТ, СРОКИ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Вид выполняемой работы */}
                {formType !== 'general' && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-gray-400 uppercase font-mono">Вид работы</label>
                    <select
                      required
                      value={formWorkTypeId}
                      onChange={(e) => setFormWorkTypeId(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 bg-[#0d1117] border border-white/10 rounded text-white outline-none"
                    >
                      <option value="">-- Укажите техпроцесс --</option>
                      {workTypes.map(wt => (
                        <option key={wt.id} value={wt.id}>{wt.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Назначить ответственного исполнителя */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase font-mono">Исполнитель ПТО</label>
                  <select
                    required
                    value={formExecutorEmail}
                    onChange={(e) => setFormExecutorEmail(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.8 bg-[#0d1117] border border-white/10 rounded text-white outline-none"
                  >
                    <option value="">-- Выберите инженера --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.email}>{u.name} ({u.role === 'director' ? 'Нач. ПТО' : 'Инж. ПТО'})</option>
                    ))}
                  </select>
                </div>

                {/* Дедлайн */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase font-mono">Срок сдачи</label>
                  <input
                    type="date"
                    required
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded text-white outline-none"
                  />
                </div>

                {/* Google Диск ссылка */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-400 uppercase font-mono">Общая папка Google Drive (Ссылка)</label>
                  <input
                    type="text"
                    value={formDriveUrl}
                    onChange={(e) => setFormDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full text-xs px-2.5 py-2 bg-[#0d1117] border border-white/10 rounded text-white placeholder-gray-600 outline-none font-mono"
                  />
                </div>

              </div>

            </form>

            <div className="px-6 py-4 bg-[#161b22] border-t border-white/10 flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  resetFormState();
                }}
                className="px-4 py-2 bg-transparent hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-lg transition-all"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleCreateSingleTask}
                disabled={isSubmiting}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-white text-xs font-bold rounded-lg shadow transition-all"
              >
                {isSubmiting ? 'Создание...' : 'Добавить задачу'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
