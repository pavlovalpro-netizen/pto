/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Task, Section, House, ConstructionObject, WorkType, User, RoomType } from '../types.ts';
import { Kanban, Plus, Calendar, MapPin, CheckSquare, MessageSquare, AlertCircle, ChevronRight, HelpCircle } from 'lucide-react';

interface KanbanBoardProps {
  tasks: Task[];
  objects: ConstructionObject[];
  houses: House[];
  sections: Section[];
  workTypes: WorkType[];
  currentUser: User;
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
}

export default function KanbanBoard({
  tasks,
  objects,
  houses,
  sections,
  workTypes,
  currentUser,
  onRefresh,
  onSelectTask,
}: KanbanBoardProps) {
  // Фильтруем задачи, принадлежащие ТОЛЬКО текущему инженеру (категория Личные/Заметки здесь скрыта, так как не имеет этапов ПТО)
  const personalTasks = tasks.filter(
    (t) => t.executorEmail.toLowerCase() === currentUser.email.toLowerCase() && t.type !== 'general'
  );

  // Стейты формы создания задачи "для себя"
  const [showSelfTaskForm, setShowSelfTaskForm] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [selectedHouseId, setSelectedHouseId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedFloorNum, setSelectedFloorNum] = useState<number | ''>('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState('');
  const [taskDeadline, setTaskDeadline] = useState(() => {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  });
  const [taskFolderUrl, setTaskFolderUrl] = useState('');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmiting, setIsSubmiting] = useState(false);

  // Фильтрованные структуры для селектора
  const filteredHouses = houses.filter((h) => h.objectId === selectedObjectId);
  const filteredSections = sections.filter((s) => s.houseId === selectedHouseId);
  const activeSection = sections.find((s) => s.id === selectedSectionId);

  // Применимость работ к комнате
  const matchedRoom = activeSection?.floors
    .find((f) => f.floorNumber === selectedFloorNum)
    ?.rooms.find((r) => r.id === selectedRoomId);

  const filteredWorkTypes = workTypes.filter((wt) => {
    if (!matchedRoom) return true;
    return wt.applicableEntityTypes.includes(matchedRoom.type);
  });

  const handleCreateSelfTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedRoomId || !selectedWorkId || !taskDeadline) {
      setFormError('Пожалуйста, выберите помещение, вид работы и дедлайн!');
      return;
    }

    setIsSubmiting(true);

    try {
      const response = await fetch('/api/tasks/create-mass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'main',
          objectId: selectedObjectId,
          houseId: selectedHouseId,
          sectionIds: [selectedSectionId],
          selectionScope: 'manual',
          manualRooms: [selectedRoomId],
          workTypeId: selectedWorkId,
          executorEmail: currentUser.email,
          deadline: taskDeadline,
          driveFolderUrl: taskFolderUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при создании задачи');
      }

      setShowSelfTaskForm(false);
      // Сброс полей
      setSelectedRoomId('');
      setSelectedWorkId('');
      setTaskDeadline('');
      setTaskFolderUrl('');
      onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmiting(false);
    }
  };

  // Колонки Канбан
  const COLUMNS = [
    { id: 'todo', label: 'Назначена', statuses: [1] },
    { id: 'progress', label: 'В работе', statuses: [2] },
    { id: 'reviews', label: 'На проверке ПТО', statuses: [3, 4] },
    { id: 'rejects', label: 'Замечания технадзора', statuses: [5] },
    { id: 'signing', label: 'На подписании', statuses: [6] },
    { id: 'done', label: 'Сдано (В архиве)', statuses: [7] },
  ];

  const getTaskStatusLabel = (t: Task) => {
    switch (t.status) {
      case 1: return 'Назначена';
      case 2: return 'В работе';
      case 3: return 'Проверка ПТО';
      case 4: return 'У технадзора';
      case 5: return 'Замечания';
      case 6: return 'Подписание';
      case 7: return 'Сдано';
      default: return 'Активна';
    }
  };

  return (
    <div id="kanban_root" className="space-y-6">
      
      {/* Шапка Канбана */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#161b22] text-white rounded-xl shadow-lg border border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#0d1117] rounded-lg text-orange-500 border border-white/5 shadow-inner">
            <Kanban className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-tight font-mono">Моя Канбан Доска</h3>
            <p className="text-xs text-gray-450 mt-0.5">Личный строительный поток инженера: {currentUser.name}</p>
          </div>
        </div>

        <button
          onClick={() => setShowSelfTaskForm(true)}
          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md shadow-emerald-950/20 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Создать задачу «для себя»</span>
        </button>
      </div>

      {/* Сетка колонок */}
      <div id="kanban_columns_grid" className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = personalTasks.filter((t) => col.statuses.includes(t.status));
          const isRejectCol = col.id === 'rejects';
          const isDoneCol = col.id === 'done';

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-xl border p-3 min-h-[500px] h-full transition-all ${
                isRejectCol 
                ? 'bg-rose-950/10 border-rose-500/20' 
                : isDoneCol 
                ? 'bg-emerald-950/10 border-emerald-500/20' 
                : 'bg-[#161b22] border-white/10'
              }`}
            >
              {/* Хедер Колонки */}
              <div className={`flex justify-between items-center mb-3.5 pb-2 border-b ${
                isRejectCol ? 'border-rose-500/10' : isDoneCol ? 'border-emerald-500/10' : 'border-white/5'
              }`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider font-mono ${
                  isRejectCol ? 'text-rose-450' : isDoneCol ? 'text-emerald-400' : 'text-gray-300'
                }`}>
                  {col.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                  isRejectCol 
                  ? 'bg-[#ffe4e6]/5 text-rose-400' 
                  : isDoneCol 
                  ? 'bg-[#d1fae5]/5 text-emerald-400' 
                  : 'bg-[#0d1117] text-gray-400'
                }`}>
                  {colTasks.length}
                </span>
              </div>

              {/* Карточки задач */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[80vh] pr-1.5 custom-scrollbar">
                {colTasks.length === 0 ? (
                  <div className="py-12 text-center text-gray-555 italic text-xs">Нет задач</div>
                ) : (
                  colTasks.map((task) => {
                    const complCount = task.checklist?.filter((c) => c.isCompleted).length || 0;
                    const totalCount = task.checklist?.length || 0;

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all hover:-translate-y-0.5 ${
                          isRejectCol 
                          ? 'bg-[#2a1318] hover:bg-[#34161d] border-rose-500/30 text-rose-100 hover:border-rose-405' 
                          : 'bg-[#0d1117] border-white/10 text-gray-300 hover:border-orange-500/80 hover:bg-[#11161e]'
                        }`}
                      >
                        {/* Лейбл типа задачи */}
                        {task.type === 'reclamation' && (
                          <span className="inline-block text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded-sm mb-1.5 uppercase font-mono leading-none">
                            Рекламация
                          </span>
                        )}

                        <span className="text-xs font-bold text-white leading-snug tracking-tight block mb-2 line-clamp-2">
                          {task.workTypeName}
                        </span>

                        {/* Адрес квартиры */}
                        {task.location && (
                          <div className="text-[10px] text-gray-400 font-mono flex items-start gap-1 mb-2 leading-relaxed">
                            <MapPin className="w-3 h-3 text-orange-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">
                              {task.location.objectName} ➔ {task.location.sectionNumber} ➔ эт. {task.location.floorNumber} ➔ {task.location.roomName}
                            </span>
                          </div>
                        )}

                        {/* Текст замечания технадзора */}
                        {task.status === 5 && task.statusComments && (
                          <div className="p-2 mb-2 bg-[#1f0e11] border border-rose-500/20 rounded text-[10px] text-rose-300 font-medium leading-normal line-clamp-3 font-mono">
                            {task.statusComments}
                          </div>
                        )}

                        {/* Прогресс доков + Дедлайн */}
                        <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px] text-gray-400 font-mono">
                          <span className="flex items-center gap-1 font-semibold">
                            <CheckSquare className="w-3 h-3 text-orange-500" />
                            {complCount}/{totalCount} док.
                          </span>
                          <span className="flex items-center gap-1 text-gray-500">
                            <Calendar className="w-3 h-3 text-gray-600" />
                            {task.deadline}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* МОДАЛЬНАЯ ФОРМА СОЗДАНИЯ ЗАДАЧИ "ДЛЯ СЕБЯ" */}
      {showSelfTaskForm && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSelfTask}
            className="bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
          >
            <div className="px-5 py-4 bg-[#0d1117] text-white flex justify-between items-center border-b border-white/10">
              <div>
                <h4 className="text-sm font-bold tracking-tight uppercase font-mono text-white">Создать задачу для себя</h4>
                <p className="text-xs text-gray-400">Прямое назначение комплекта ИД на рабочем месте</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelfTaskForm(false)}
                className="text-gray-400 hover:text-white rounded-md p-1"
              >
                ×
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
              
              {formError && (
                <p className="bg-rose-950/40 border border-rose-500/20 p-2.5 text-rose-300 text-xs font-mono rounded-lg">{formError}</p>
              )}

              {/* Объект */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Выберите Объект ЖК</label>
                <select
                  required
                  value={selectedObjectId}
                  onChange={(e) => {
                    setSelectedObjectId(e.target.value);
                    setSelectedHouseId('');
                    setSelectedSectionId('');
                    setSelectedFloorNum('');
                    setSelectedRoomId('');
                    setSelectedWorkId('');
                  }}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg focus:border-orange-500 outline-none"
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать Объект --</option>
                  {objects.map((o) => (
                    <option key={o.id} value={o.id} className="bg-[#161b22] text-white">{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Дом */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Дом (Корпус)</label>
                <select
                  required
                  disabled={!selectedObjectId}
                  value={selectedHouseId}
                  onChange={(e) => {
                    setSelectedHouseId(e.target.value);
                    setSelectedSectionId('');
                    setSelectedFloorNum('');
                    setSelectedRoomId('');
                    setSelectedWorkId('');
                  }}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg disabled:opacity-50 focus:border-orange-500 outline-none"
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать Дом --</option>
                  {filteredHouses.map((h) => (
                    <option key={h.id} value={h.id} className="bg-[#161b22] text-white">{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Секция */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Секция</label>
                <select
                  required
                  disabled={!selectedHouseId}
                  value={selectedSectionId}
                  onChange={(e) => {
                    setSelectedSectionId(e.target.value);
                    setSelectedFloorNum('');
                    setSelectedRoomId('');
                    setSelectedWorkId('');
                  }}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg disabled:opacity-50 focus:border-orange-500 outline-none"
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать Секцию --</option>
                  {filteredSections.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#161b22] text-white">{s.number}</option>
                  ))}
                </select>
              </div>

              {/* Этаж и Помещение */}
              {activeSection && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase font-mono">Этаж</label>
                    <select
                      required
                      value={selectedFloorNum}
                      onChange={(e) => {
                        setSelectedFloorNum(parseInt(e.target.value, 10));
                        setSelectedRoomId('');
                        setSelectedWorkId('');
                      }}
                      className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg focus:border-orange-500 outline-none"
                    >
                      <option value="" className="bg-[#161b22]">-- Выбрать --</option>
                      {[...activeSection.floors]
                        .sort((a, b) => a.floorNumber - b.floorNumber)
                        .map((f) => (
                          <option key={f.floorNumber} value={f.floorNumber} className="bg-[#161b22] text-white">
                            {f.floorNumber === -1 ? 'Подвал' : `${f.floorNumber} этаж`}
                          </option>
                        ))}
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase font-mono">Помещение</label>
                    <select
                      required
                      disabled={selectedFloorNum === ''}
                      value={selectedRoomId}
                      onChange={(e) => {
                        setSelectedRoomId(e.target.value);
                        setSelectedWorkId('');
                      }}
                      className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg disabled:opacity-50 focus:border-orange-500 outline-none"
                    >
                      <option value="" className="bg-[#161b22]">-- Выбрать --</option>
                      {activeSection.floors
                        .find((f) => f.floorNumber === selectedFloorNum)
                        ?.rooms.map((r) => (
                          <option key={r.id} value={r.id} className="bg-[#161b22] text-white">
                            {r.name} ({r.type})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Вид работы (подстраивается под матрицу применимости!) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Вид работы (Фильтр по применимости)</label>
                <select
                  required
                  disabled={!selectedRoomId}
                  value={selectedWorkId}
                  onChange={(e) => setSelectedWorkId(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg disabled:opacity-50 focus:border-orange-500 outline-none"
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать работу --</option>
                  {filteredWorkTypes.map((wt) => (
                    <option key={wt.id} value={wt.id} className="bg-[#161b22] text-white">{wt.name}</option>
                  ))}
                </select>
                {selectedRoomId && filteredWorkTypes.length === 0 && (
                  <p className="text-[10px] text-rose-450 italic mt-1 font-mono">Нет подходящих видов работ из-за ограничений матрицы применимости.</p>
                )}
              </div>

              {/* Срок выполнения */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Срок выполнения (Дедлайн)</label>
                <input
                  type="date"
                  required
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg outline-none focus:border-orange-500"
                />
              </div>

              {/* Папка на Google Диске */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase font-mono">Ссылка на Google Диск задачи (необязательно)</label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/..."
                  value={taskFolderUrl}
                  onChange={(e) => setTaskFolderUrl(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#0d1117] text-white rounded-lg font-mono outline-none focus:border-orange-500"
                />
              </div>

            </div>

            <div className="px-5 py-3.5 bg-[#0d1117] border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSelfTaskForm(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition-all"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmiting}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-505 text-white text-xs font-bold rounded-lg shadow-md shadow-orange-950/25 transition-all"
              >
                Создать задачу
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
