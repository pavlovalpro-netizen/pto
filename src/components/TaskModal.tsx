/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Task, TaskChecklistItem, TaskComment, User, ALL_ROOM_TYPES, RoomType } from '../types.ts';
import { X, Send, Link2, TriangleAlert, ArrowRight, CornerDownRight, Layers, User as UserIcon, Calendar, CheckSquare, MessageSquare, ArrowUpDown, Trash2, ShieldAlert } from 'lucide-react';

interface TaskModalProps {
  task: Task;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onUpdate: (updatedTask: Task) => void;
  onDelete?: (taskId: string) => void;
}

interface GeneralCommentItem {
  id: string;
  username: string;
  text: string;
  timestamp: string;
}

function renderTextWithLinks(text: string) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 hover:text-orange-300 underline break-all font-semibold inline"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

const parseGeneralComments = (raw: string): GeneralCommentItem[] => {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as GeneralCommentItem[];
    }
  } catch (e) {
    return [
      {
        id: 'initial',
        username: 'Описание задачи',
        text: raw,
        timestamp: ''
      }
    ];
  }
  return [
    {
      id: 'initial',
      username: 'Описание задачи',
      text: raw,
      timestamp: ''
    }
  ];
};

export default function TaskModal({ task, users, currentUser, onClose, onUpdate, onDelete }: TaskModalProps) {
  const [status, setStatus] = useState<number>(task.status);
  const [statusComments, setStatusComments] = useState<string>(task.statusComments || '');
  const [executorEmail, setExecutorEmail] = useState<string>(task.executorEmail);
  const [deadline, setDeadline] = useState<string>(task.deadline);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>(task.driveFolderUrl || '');
  const [generalComment, setGeneralComment] = useState<string>(task.generalComment || '');
  const [showTaskDeleteConfirm, setShowTaskDeleteConfirm] = useState(false);

  // Для главного общего комментария / заданий
  const [newGeneralCommentText, setNewGeneralCommentText] = useState('');
  const [showGeneralCommentsHistory, setShowGeneralCommentsHistory] = useState(false);
  const [generalCommentsList, setGeneralCommentsList] = useState<GeneralCommentItem[]>(() =>
    parseGeneralComments(task.generalComment || '')
  );

  const saveGeneralCommentsToBackend = async (newList: GeneralCommentItem[]) => {
    try {
      await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          generalComment: JSON.stringify(newList),
          userRole: currentUser.role,
        }),
      });
    } catch (err) {
      console.error('Failed to auto-save general comment:', err);
    }
  };

  const handleAddGeneralComment = async () => {
    if (!newGeneralCommentText.trim()) return;
    const newItem: GeneralCommentItem = {
      id: 'gcomm_' + Math.random().toString(36).substring(2, 9),
      username: currentUser.name,
      text: newGeneralCommentText.trim(),
      timestamp: new Date().toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    const updatedList = [...generalCommentsList, newItem];
    setGeneralCommentsList(updatedList);
    setNewGeneralCommentText('');
    setGeneralComment(JSON.stringify(updatedList));
    await saveGeneralCommentsToBackend(updatedList);
  };

  const handleRemoveGeneralComment = async (commentId: string) => {
    const updatedList = generalCommentsList.filter(item => item.id !== commentId);
    setGeneralCommentsList(updatedList);
    setGeneralComment(JSON.stringify(updatedList));
    await saveGeneralCommentsToBackend(updatedList);
  };
  
  // Чат по конкретному документу
  const [activeCommentItemId, setActiveCommentItemId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');
  
  // Для чек-листа
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(task.checklist || []);
  const [newChecklistItemName, setNewChecklistItemName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddChecklistItem = () => {
    if (!newChecklistItemName.trim()) return;
    const newItem: TaskChecklistItem = {
      id: 'item_' + Math.random().toString(36).substring(2, 9),
      name: newChecklistItemName.trim(),
      isCompleted: false,
      driveUrl: '',
      comments: [],
    };
    setChecklist([...checklist, newItem]);
    setNewChecklistItemName('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    const list = [...checklist];
    list.splice(index, 1);
    setChecklist(list);
  };

  const STATUSES = [
    { value: 1, label: '1. Назначена' },
    { value: 2, label: '2. В работе' },
    { value: 3, label: '3. На проверке у Начальника ПТО' },
    { value: 4, label: '4. Передано технадзору' },
    { value: 5, label: '5. Замечания технадзора' },
    { value: 6, label: '6. На подписании' },
    { value: 7, label: '7. В архиве (Сдано)' },
  ];

  const handleStatusChange = (newStatus: number) => {
    setStatus(newStatus);
    setErrorMsg(null);
  };

  // Drag and Drop логика
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const list = [...checklist];
    const draggedItem = list[dragIndex];
    list.splice(dragIndex, 1);
    list.splice(index, 0, draggedItem);
    setChecklist(list);
    setDragIndex(null);
  };

  const handleChecklistCheck = (index: number, isChecked: boolean) => {
    const list = [...checklist];
    list[index].isCompleted = isChecked;
    setChecklist(list);
  };

  const handleChecklistUrlChange = (index: number, url: string) => {
    const list = [...checklist];
    list[index].driveUrl = url;
    setChecklist(list);
  };

  const handleSave = async () => {
    // ВАЛИДАЦИЯ ПРАВИЛА: При статусе 5 "Замечания технадзора" поле Текст замечания обязательно
    if (status === 5 && (!statusComments || statusComments.trim() === '')) {
      setErrorMsg('Для перехода в статус "Замечания технадзора" обязательно укажите Текст замечания!');
      return;
    }

    // ВАЛИДАЦИЯ ПРАВИЛА: Только Начальник ПТО может переводить в Сдано (7) (исключение: личные задачи)
    if (status === 7 && currentUser.role !== 'director' && task.type !== 'general') {
      setErrorMsg('Только Начальник ПТО имеет полномочия изменять статус на "В архиве (Сдано)"!');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          status,
          statusComments: status === 5 ? statusComments : (status === 7 ? '' : statusComments),
          generalComment,
          checklist,
          executorEmail,
          deadline,
          driveFolderUrl,
          userRole: currentUser.role,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка сохранения задачи');
      }

      onUpdate(data.task);
      onClose();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComment = async (itemId: string) => {
    if (!commentText.trim()) return;

    try {
      const response = await fetch('/api/tasks/comment/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          checklistItemId: itemId,
          text: commentText,
          username: currentUser.name,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при добавлении комментария');
      }

      // Обновляем локально состояние
      const list = [...checklist];
      const foundItem = list.find((itm) => itm.id === itemId);
      if (foundItem) {
        if (!foundItem.comments) foundItem.comments = [];
        foundItem.comments.push(data.comment);
        setChecklist(list);
      }
      setCommentText('');
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleToggleCommentCompleted = async (itemId: string, commentId: string, currentCompletedStatus: boolean) => {
    try {
      const response = await fetch('/api/tasks/comment/toggle-completed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          checklistItemId: itemId,
          commentId,
          isCompleted: !currentCompletedStatus,
          username: currentUser.name,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при изменении статуса комментария');
      }

      // Обновляем локально состояние списка чек-листа в модалке
      const updatedChecklist = checklist.map((itm) => {
        if (itm.id === itemId) {
          const updatedComments = (itm.comments || []).map((comm) => {
            if (comm.id === commentId) {
              return { ...comm, isCompleted: !currentCompletedStatus };
            }
            return comm;
          });
          return { ...itm, comments: updatedComments };
        }
        return itm;
      });

      setChecklist(updatedChecklist);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleTaskDelete = async () => {
    if (!onDelete) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          userRole: currentUser.role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка удаления задачи');
      }

      onDelete(task.id);
      onClose();
    } catch (e: any) {
      setErrorMsg(e.message);
      setShowTaskDeleteConfirm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const isDirector = currentUser.role === 'director';

  return (
    <div id="task_modal_backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div id="task_modal_container" className="relative w-full max-w-4xl bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col my-4 max-h-[90vh]">
        
        {/* Хедер модалки */}
        <div id="task_modal_header" className="px-6 py-4 bg-[#0d1117] text-white flex justify-between items-start border-b border-white/10">
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${
              task.type === 'reclamation' 
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' 
              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}>
              <Layers className="w-3.5 h-3.5" />
              {task.type === 'reclamation' ? `Рекламация (${task.reclamationCause})` : 'Проектная ИД'}
            </span>
            <h2 id="task_modal_title" className="text-xl font-bold tracking-tight text-white font-display">
              {task.workTypeName}
            </h2>
            {task.location && (
              <p className="text-xs text-gray-450 flex items-center gap-1.5 font-mono">
                {task.location.objectName} ➔ {task.location.houseName} ➔ {task.location.sectionNumber} ➔ Этаж {task.location.floorNumber} ➔ {task.location.roomName} ({task.location.roomType})
              </p>
            )}
          </div>
          <button 
            id="close_task_modal_btn"
            onClick={onClose} 
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Тело модалки с прокруткой */}
        <div id="task_modal_body" className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-gray-300">
          
          {/* КРАСНЫЙ БАННЕР ЗАМЕЧАНИЯ ТЕХНАДЗОРА (Статус 5) */}
          {status === 5 && (
            <div id="tech_reject_alert_banner" className="bg-rose-950/40 border border-rose-500/20 p-4 rounded-lg flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider font-mono">
                  Замечание Технического Надзора:
                </span>
                <p className="text-sm text-rose-200 font-medium font-mono leading-relaxed">
                  {statusComments || 'Текст замечания не указан. Заполните поле ниже.'}
                </p>
              </div>
            </div>
          )}

          {/* Предупреждение / Ошибки */}
          {errorMsg && (
            <div id="task_modal_error_alert" className="bg-[#1a140d] border border-orange-500/20 p-4 rounded-lg text-orange-300 text-xs font-mono flex items-center gap-2">
              <TriangleAlert className="w-5 h-5 text-orange-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Описание рекламации при наличии */}
          {task.type === 'reclamation' && task.reclamationDescription && (
            <div id="reclamation_details_section" className="p-4 bg-orange-500/10 rounded-lg border border-orange-500/20 text-orange-200 font-mono text-xs">
              <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-1 font-mono">Описание аварийного инцидента:</h4>
              <p className="text-gray-300 font-medium leading-relaxed">{task.reclamationDescription}</p>
            </div>
          )}

          {/* ОБЩИЙ РАЗВЕРНУТЫЙ КОММЕНТАРИЙ ПТО */}
          <div id="task_general_comment_section" className="p-5 bg-amber-500/[0.04] border border-amber-500/20 rounded-xl space-y-3.5 relative shadow-inner">
            <div className="flex items-center justify-between border-b border-orange-500/10 pb-2">
              <label className="text-xs font-bold text-orange-400 uppercase font-mono flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-500 animate-pulse" />
                <span>Главный общий комментарий / Задание ПТО</span>
              </label>
              {generalCommentsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowGeneralCommentsHistory(!showGeneralCommentsHistory)}
                  className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-[11px] font-bold text-orange-400 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{showGeneralCommentsHistory ? 'Свернуть историю' : 'История комментов'}</span>
                  <span className="px-1.5 py-0.2 bg-orange-600 font-bold text-white rounded-full text-[9px] font-mono">
                    {generalCommentsList.length}
                  </span>
                </button>
              )}
            </div>

            {/* Текстовое поле для нового ввода */}
            <div className="space-y-2">
              <textarea
                id="task_general_comment_new_textarea"
                value={newGeneralCommentText}
                onChange={(e) => setNewGeneralCommentText(e.target.value)}
                placeholder="Напишите новое замечание, задание или общий комментарий по этой задаче..."
                rows={3}
                disabled={task.status === 7 && !isDirector} // Блокировка архивных задач для инженеров
                className="w-full px-4 py-2.5 bg-[#0d1117] border border-white/10 rounded-lg text-xs md:text-sm text-white placeholder-gray-500 focus:border-orange-500 outline-none transition-all font-sans leading-relaxed shadow-lg resize-none"
              />
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-gray-500 italic">
                  * Нажмите "Зафиксировать", чтобы добавить комментарий в хронологическую историю задачи
                </p>
                <button
                  type="button"
                  onClick={handleAddGeneralComment}
                  disabled={!newGeneralCommentText.trim() || (task.status === 7 && !isDirector)}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1 shrink-0"
                >
                  <span>Зафиксировать</span>
                </button>
              </div>
            </div>

            {/* Блок истории общих комментариев */}
            {showGeneralCommentsHistory && generalCommentsList.length > 0 && (
              <div id="general_comments_history_container" className="pt-3 border-t border-orange-500/10 space-y-2 max-h-60 overflow-y-auto pr-1">
                {generalCommentsList.map((comm) => (
                  <div key={comm.id} className="p-3 bg-[#0d1117]/60 border border-white/5 rounded-lg space-y-1 relative group font-mono">
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-orange-400 uppercase tracking-wide font-bold">{comm.username}</strong>
                        {comm.timestamp && <span className="text-gray-600">({comm.timestamp})</span>}
                      </div>
                      {(isDirector || comm.username === currentUser.name) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveGeneralComment(comm.id)}
                          className="text-rose-450 hover:text-rose-400 transition-colors opacity-60 group-hover:opacity-100"
                          title="Удалить комментарий"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap break-all pr-5">
                      {renderTextWithLinks(comm.text)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div id="task_inputs_grid" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Статус задачи */}
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-bold text-gray-400 uppercase font-mono">Статус выполнения</label>
              {task.type === 'general' ? (
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block px-2.5 py-1 text-[10px] font-mono border rounded-full ${
                      status === 7 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      ● {status === 7 ? 'Закрыта (В архиве)' : 'Активна'}
                    </span>
                  </div>
                  {status !== 7 ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(7)}
                      className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded-lg transition-all focus:outline-none uppercase font-mono tracking-wider shadow-md"
                    >
                      Закрыть задачу
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(1)}
                      className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold rounded-lg transition-all focus:outline-none uppercase font-mono tracking-wider shadow-md"
                    >
                      Открыть заново
                    </button>
                  )}
                </div>
              ) : (
                <select
                  id="task_status_select"
                  value={status}
                  onChange={(e) => handleStatusChange(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white focus:border-orange-500 outline-none font-medium"
                >
                  {STATUSES.map((st) => (
                    <option 
                      key={st.value} 
                      value={st.value}
                      disabled={st.value === 7 && !isDirector} // Блокировка перевода в Архив для инженера
                      className="bg-[#161b22] text-white"
                    >
                      {st.label} {st.value === 7 && !isDirector ? '(Только Начальник ПТО)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Исполнитель */}
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-bold text-gray-400 uppercase font-mono">Исполнитель ПТО</label>
              {isDirector ? (
                <select
                  id="task_executor_select"
                  value={executorEmail}
                  onChange={(e) => setExecutorEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white focus:border-orange-500 outline-none font-medium"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.email} className="bg-[#161b22] text-white">
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-gray-300 flex items-center gap-1.5 font-medium">
                  <UserIcon className="w-4 h-4 text-orange-500" />
                  <span>{task.executorName}</span>
                </div>
              )}
            </div>

            {/* Срок выполнения */}
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-bold text-gray-400 uppercase font-mono">Срок выполнения (Дедлайн)</label>
              <input
                id="task_deadline_input"
                type="date"
                value={deadline}
                disabled={!isDirector && task.status === 7} // Блокировка изменений для закрытых не-директором
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white focus:border-orange-500 outline-none font-medium font-mono"
              />
            </div>

            {/* Поле URL общей папки на диске */}
            <div className="space-y-1.5 col-span-1 md:col-span-3">
              <label className="text-xs font-bold text-gray-400 uppercase font-mono">Ссылка на общую папку комплекта работ на Google Диске</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-2.5 w-4 h-4 text-gray-450" />
                  <input
                    id="task_drive_folder_url_input"
                    type="text"
                    value={driveFolderUrl}
                    onChange={(e) => setDriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    disabled={!isDirector && task.status === 7} // Блокировка архивных задач
                    className="w-full pl-10 pr-3 py-2 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white placeholder-gray-550 focus:border-orange-500 outline-none font-mono"
                  />
                </div>
                {driveFolderUrl && (
                  <a
                    id="open_task_drive_folder_link"
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noreferrer referrer"
                    className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 hover:text-white font-medium rounded-lg text-xs transition-all flex items-center gap-1"
                  >
                    <span>Открыть</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>



            {/* Поле Текст Замечаний при статусе "Замечания технадзора" */}
            {status === 5 && (
              <div id="tech_comment_input_wrapper" className="space-y-1.5 col-span-1 md:col-span-3 bg-[#2a1318] p-4 border border-rose-500/20 rounded-lg">
                <label className="text-xs font-bold text-rose-400 uppercase font-mono flex items-center gap-1">
                  <TriangleAlert className="w-4 h-4 text-rose-400" />
                  Текст замечания Технадзора (Обязательно для сохранения!)
                </label>
                <textarea
                  id="task_status_comments_textarea"
                  value={statusComments}
                  onChange={(e) => setStatusComments(e.target.value)}
                  placeholder="Опишите детальное замечание контролирующего органа (какие элементы, объемы дефектов, отклонения, что переделать)..."
                  disabled={!isDirector} // Только директор может редактировать замечания технадзора в ПТО
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-rose-500/20 rounded-lg text-xs text-white placeholder-gray-500 focus:border-rose-400 outline-none"
                />
                {!isDirector && (
                  <p className="text-[10px] text-rose-450 font-mono mt-1 leading-normal">
                    * Текст замечаний вводит Начальник ПТО. Вы должны исправить работы и отправить модератору.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ИНТЕРАКТИВНЫЙ ЧЕК-ЛИСТ ДОКУМЕНТОВ */}
          <div id="task_checklist_section" className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/5 pb-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wide font-mono flex items-center gap-1.5">
                <CheckSquare className="w-4.5 h-4.5 text-orange-500" />
                Чек-лист исполнительной документации ({checklist.filter((c) => c.isCompleted).length} / {checklist.length})
              </h3>
              <p className="text-[10px] text-gray-550 font-mono flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-600" />
                Перетаскивайте строки (Drag-and-Drop) для изменения порядка
              </p>
            </div>

            {/* Добавление пунктов в чек-лист (если начальник или если это личная задача) */}
            {(isDirector || task.type === 'general') && (
              <div id="checklist_add_item_panel" className="flex gap-2 bg-[#161b22] p-3 rounded-xl border border-white/10 shadow-md">
                <input
                  id="checklist_add_item_input"
                  type="text"
                  value={newChecklistItemName}
                  onChange={(e) => setNewChecklistItemName(e.target.value)}
                  placeholder="Добавить новый документ / пункт чек-листа..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:border-orange-500 outline-none font-medium"
                />
                <button
                  id="checklist_add_item_btn"
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all shadow"
                >
                  Добавить
                </button>
              </div>
            )}

            <div id="checklist_drag_list" className="border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden bg-[#0d1117]">
              {checklist.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-xs font-mono select-none">Шаблон документов пуст</div>
              ) : (
                checklist.map((item, index) => {
                  const hasComments = item.comments && item.comments.length > 0;
                  const isActiveTab = activeCommentItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(index)}
                      className={`p-4 bg-[#161b22] hover:bg-[#1c222b] transition-colors flex flex-col gap-3 cursor-move ${
                        dragIndex === index ? 'opacity-40 bg-[#0d1117]' : ''
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Чекбокс */}
                          <input
                            type="checkbox"
                            checked={item.isCompleted}
                            onChange={(e) => handleChecklistCheck(index, e.target.checked)}
                            disabled={task.status === 7 && !isDirector}
                            className="w-4.5 h-4.5 text-orange-500 rounded border-white/20 bg-black cursor-pointer accent-orange-500 mt-1 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className={`text-sm font-semibold block truncate ${item.isCompleted ? 'text-gray-550 line-through font-normal' : 'text-gray-100 font-display'}`}>
                              {item.name}
                            </span>
                            {/* Ссылка на диск для этого дока */}
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase font-mono shrink-0">Ссылка:</span>
                              <input
                                type="text"
                                value={item.driveUrl || ''}
                                onChange={(e) => handleChecklistUrlChange(index, e.target.value)}
                                placeholder="Вставьте прямую ссылку на документ на Google Диске"
                                disabled={task.status === 7 && !isDirector}
                                className="text-xs bg-[#0d1117] border border-white/10 text-white placeholder-gray-650 hover:border-orange-500/20 rounded px-2.5 py-1 w-full max-w-sm font-mono focus:border-orange-500 outline-none transition-colors"
                              />
                              {item.driveUrl && (
                                <a
                                  href={item.driveUrl}
                                  target="_blank"
                                  rel="noreferrer referrer"
                                  className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
                                  title="Открыть файл"
                                >
                                  <Link2 className="w-3.5 h-3.5 text-orange-400" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Кнопка обсуждения/комментариев этого документа */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => setActiveCommentItemId(isActiveTab ? null : item.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                              hasComments 
                              ? 'bg-orange-500/15 text-orange-400 border-orange-500/20 hover:bg-orange-500/25' 
                              : 'bg-white/5 text-gray-305 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Чат дока ({item.comments?.length || 0})</span>
                          </button>

                          {(isDirector || task.type === 'general') && (
                            <button
                              id={`checklist_remove_item_btn_${index}`}
                              type="button"
                              onClick={() => handleRemoveChecklistItem(index)}
                              className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-600/20 border border-white/10 rounded-lg text-xs transition-colors"
                              title="Удалить пункт из чек-листа"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Панель комментов к документу */}
                      {isActiveTab && (
                        <div className="mt-2 pl-4 border-l-2 border-orange-500/30 space-y-3 bg-[#0d1117] p-3 rounded-lg font-mono">
                          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">Лента обсуждения документа:</h4>
                          
                          {/* Список комментов */}
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {!item.comments || item.comments.length === 0 ? (
                              <p className="text-xs text-gray-550 italic">Комментариев пока нет. Напишите замечание или вопрос исполнителю.</p>
                            ) : (
                              item.comments.map((comm) => {
                                const isDone = !!comm.isCompleted;
                                return (
                                  <div 
                                    key={comm.id} 
                                    className={`text-xs text-gray-305 leading-relaxed bg-[#161b22]/40 p-2 rounded border border-white/5 flex gap-2.5 items-start ${
                                      isDone ? 'opacity-55' : ''
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isDone}
                                      onChange={() => handleToggleCommentCompleted(item.id, comm.id, isDone)}
                                      className="w-3.5 h-3.5 rounded border-white/10 text-orange-600 focus:ring-orange-550/30 bg-[#0d1117] mt-0.5 shrink-0 cursor-pointer"
                                      title={isDone ? "Отметить как невыполненный" : "Отметить как выполненный (перечеркнуть)"}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5 font-mono">
                                        <strong className={isDone ? 'text-gray-500 line-through' : 'text-orange-400 uppercase font-mono tracking-wide'}>
                                          {comm.username}
                                        </strong>
                                        <span>{comm.timestamp}</span>
                                      </div>
                                      <span className={`text-white block whitespace-pre-wrap break-all ${
                                        isDone ? 'line-through text-gray-500' : ''
                                      }`}>
                                        {renderTextWithLinks(comm.text)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Форма отправки сообщения */}
                          {task.status !== 7 || isDirector ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddComment(item.id);
                                }}
                                placeholder="Введите сообщение в обсуждение..."
                                className="flex-1 bg-[#161b22] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(item.id)}
                                className="bg-orange-600 hover:bg-orange-500 text-white rounded-lg px-2.5 py-1.5 flex items-center justify-center transition-colors"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Футер модалки */}
        <div id="task_modal_footer" className="px-6 py-4 bg-[#0d1117] border-t border-white/10 flex flex-col sm:flex-row sm:justify-between items-center gap-3">
          
          {/* Удаление доступно Начальнику ПТО или всем для личных задач */}
          <div className="self-start sm:self-center">
            {(isDirector || task.type === 'general') && onDelete && (
              !showTaskDeleteConfirm ? (
                <button
                  id="task_delete_btn"
                  type="button"
                  onClick={() => setShowTaskDeleteConfirm(true)}
                  className="px-4 py-2 text-rose-400 hover:text-white border border-rose-500/20 hover:bg-rose-600 hover:border-rose-650 rounded-lg text-xs font-semibold font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5"
                  title="Удалить эту задачу из базы ПТО"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Удалить задачу</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-rose-950/25 border border-rose-500/35 p-1.5 rounded-lg">
                  <span className="text-[10px] text-rose-300 font-bold font-mono uppercase tracking-wide px-1">Удалить навсегда?</span>
                  <button
                    id="task_delete_confirm_btn"
                    type="button"
                    onClick={handleTaskDelete}
                    className="px-2 py-1 bg-rose-650 hover:bg-rose-605 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    Да, удалить
                  </button>
                  <button
                    id="task_delete_cancel_btn"
                    type="button"
                    onClick={() => setShowTaskDeleteConfirm(false)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              )
            )}
          </div>

          <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
            <button
              id="cancel_task_modal_changes_btn"
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-gray-300 hover:text-white font-medium rounded-lg transition-all"
            >
              Отмена
            </button>
            <button
              id="save_task_modal_changes_btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white disabled:bg-slate-700 disabled:text-gray-500 rounded-lg text-xs font-bold shadow-md shadow-orange-950/25 transition-all flex items-center justify-center gap-1"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
