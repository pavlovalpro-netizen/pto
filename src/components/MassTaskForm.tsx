/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ConstructionObject, House, Section, WorkType, User, RoomType, ALL_ROOM_TYPES, Room } from '../types.ts';
import { ChevronDown, ChevronRight, X, AlertCircle, Plus, Sparkles, FolderIcon, HelpCircle } from 'lucide-react';

interface MassTaskFormProps {
  objects: ConstructionObject[];
  houses: House[];
  sections: Section[];
  workTypes: WorkType[];
  users: User[];
  onClose: () => void;
  onRefresh: () => void;
  currentUser: User;
}

export default function MassTaskForm({
  objects,
  houses,
  sections,
  workTypes,
  users,
  onClose,
  onRefresh,
  currentUser,
}: MassTaskFormProps) {
  const isDirector = currentUser.role === 'director';

  const [taskType, setTaskType] = useState<'main' | 'reclamation' | 'general'>(
    isDirector ? 'main' : 'general'
  );

  // Выбранные сущности
  const [objectId, setObjectId] = useState('');
  const [houseId, setHouseId] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  
  // Область действия (Filter Domain)
  const [selectionScope, setSelectionScope] = useState<'all' | 'apartments' | 'mop' | 'manual'>('all');
  const [selectedMopTypes, setSelectedMopTypes] = useState<RoomType[]>([]);
  const [manualRoomIds, setManualRoomIds] = useState<string[]>([]);
  
  // Фильтрация этажей
  const [startFloorFilter, setStartFloorFilter] = useState<string>('');
  const [endFloorFilter, setEndFloorFilter] = useState<string>('');

  // Для рендера ручного выбора комнат
  const [expandedFloors, setExpandedFloors] = useState<number[]>([]);

  // Режим группировки/нарезки задач по умолчанию
  const [groupingMode, setGroupingMode] = useState<'room' | 'floor' | 'typical-floors' | 'section'>('typical-floors');

  // Детали задачи
  const [workTypeId, setWorkTypeId] = useState('');
  const [executorEmail, setExecutorEmail] = useState(
    isDirector ? '' : currentUser.email
  );
  const [taskTitle, setTaskTitle] = useState('');
  const [deadline, setDeadline] = useState(() => {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  });
  const [driveFolderUrl, setDriveFolderUrl] = useState('');

  // Для рекламации
  const [reclamationCause, setReclamationCause] = useState<string>('Брак');
  const [reclamationDescription, setReclamationDescription] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmiting, setIsSubmiting] = useState(false);

  // Списки для селекторов
  const filteredHouses = houses.filter((h) => h.objectId === objectId);
  const filteredSections = sections.filter((s) => s.houseId === houseId);
  const activeSections = sections.filter((s) => selectedSectionIds.includes(s.id));

  // Автоматическая подстановка первого исполнителя (только для руководителей)
  React.useEffect(() => {
    if (isDirector && users.length > 0 && !executorEmail) {
      setExecutorEmail(users[0].email);
    }
  }, [users, executorEmail, isDirector]);

  // Сброс зависимых полей
  const handleObjectChange = (id: string) => {
    setObjectId(id);
    setHouseId('');
    setSelectedSectionIds([]);
    setManualRoomIds([]);
  };

  const handleHouseChange = (id: string) => {
    setHouseId(id);
    setSelectedSectionIds([]);
    setManualRoomIds([]);
  };

  const handleSectionCheckboxChange = (secId: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedSectionIds([...selectedSectionIds, secId]);
    } else {
      setSelectedSectionIds(selectedSectionIds.filter((id) => id !== secId));
    }
    setManualRoomIds([]); // ресет ручного выбора
  };

  const handleSelectAllSections = () => {
    const allSecIds = filteredSections.map((s) => s.id);
    setSelectedSectionIds(allSecIds);
    setManualRoomIds([]);
  };

  const handleClearAllSections = () => {
    setSelectedSectionIds([]);
    setManualRoomIds([]);
  };

  const toggleFloorExpand = (floorNum: number) => {
    if (expandedFloors.includes(floorNum)) {
      setExpandedFloors(expandedFloors.filter((f) => f !== floorNum));
    } else {
      setExpandedFloors([...expandedFloors, floorNum]);
    }
  };

  const handleManualRoomToggle = (roomId: string) => {
    if (manualRoomIds.includes(roomId)) {
      setManualRoomIds(manualRoomIds.filter((id) => id !== roomId));
    } else {
      setManualRoomIds([...manualRoomIds, roomId]);
    }
  };

  const handleSelectAllRoomsOnFloor = (floorRooms: Room[], selectAll: boolean) => {
    const ids = floorRooms.map((r) => r.id);
    if (selectAll) {
      // Добавляем все которых еще нет
      const union = Array.from(new Set([...manualRoomIds, ...ids]));
      setManualRoomIds(union);
    } else {
      // Исключаем все
      setManualRoomIds(manualRoomIds.filter((id) => !ids.includes(id)));
    }
  };

  const handleSelectAllFilteredRooms = () => {
    const allMatchingIds: string[] = [];
    activeSections.forEach((sec) => {
      sec.floors.forEach((fl) => {
        // Проверяем фильтр этажей
        if (startFloorFilter !== '') {
          const minF = parseInt(startFloorFilter, 10);
          if (!isNaN(minF) && fl.floorNumber < minF) return;
        }
        if (endFloorFilter !== '') {
          const maxF = parseInt(endFloorFilter, 10);
          if (!isNaN(maxF) && fl.floorNumber > maxF) return;
        }
        fl.rooms.forEach((r) => {
          allMatchingIds.push(r.id);
        });
      });
    });
    setManualRoomIds(allMatchingIds);
  };

  const handleClearAllSelectedRooms = () => {
    setManualRoomIds([]);
  };

  // ФИЛЬТРАЦИЯ ВИДОВ РАБОТ С УЧЕТОМ МАТРИЦЫ ПРИМЕНИМОСТИ К ВЫБРАННЫМ ПОМЕЩЕНИЯМ
  // Это важнейшее требование (Раздел 4): вид работы фильтруется по выбранным типам помещений!
  const getSelectedRoomTypes = (): RoomType[] => {
    if (taskType === 'general') return ALL_ROOM_TYPES; // для общих нет привязки к матрице
    if (selectedSectionIds.length === 0) return [];

    const selectedTypes = new Set<RoomType>();

    activeSections.forEach((sec) => {
      sec.floors.forEach((fl) => {
        fl.rooms.forEach((room) => {
          let matchesScope = false;

          if (selectionScope === 'all') {
            matchesScope = true;
          } else if (selectionScope === 'apartments') {
            matchesScope = room.type === 'Квартира';
          } else if (selectionScope === 'mop') {
            matchesScope = room.type === mopType;
          } else if (selectionScope === 'manual') {
            matchesScope = manualRoomIds.includes(room.id);
          }

          if (matchesScope) {
            selectedTypes.add(room.type);
          }
        });
      });
    });

    return Array.from(selectedTypes);
  };

  const selectedRoomTypes = getSelectedRoomTypes();

  // Фильтруем виды работ по матрице
  const filteredWorkTypes = workTypes.filter((wt) => {
    if (selectedRoomTypes.length === 0) return true; // если еще ничего не выбрано, покажем все
    // Вид работы должен быть применим к КАЖДОМУ из выбранных типов комнат
    // или хотя бы к одному (в зависимости от желаемой строгости). Сделаем strict: применим хотя бы к одному из выбранных,
    // а неподходящие комнаты сервер автоматически отфильтрует при нарезке!
    return selectedRoomTypes.some((type) => wt.applicableEntityTypes.includes(type));
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Валидация
    if (taskType !== 'general') {
      if (!objectId || !houseId || selectedSectionIds.length === 0) {
        setFormError('Пожалуйста, выберите Объект, Корпус и хотя бы одну Секцию!');
        return;
      }
      if (selectionScope === 'manual' && manualRoomIds.length === 0) {
        setFormError('При выборе параметров "Выбрать вручную" укажите хотя бы одно помещение из дерева!');
        return;
      }
    }

    if (!workTypeId && taskType !== 'general') {
      setFormError('Укажите вид выполняемых работ!');
      return;
    }
    if (!executorEmail) {
      setFormError('Укажите ответственного исполнителя ПТО!');
      return;
    }

    setIsSubmiting(true);

    try {
      if (taskType === 'general') {
        if (!taskTitle.trim()) {
          setFormError('Пожалуйста, введите название (тему) личной задачи!');
          return;
        }

        // Личная задача (блокнот)
        const response = await fetch('/api/tasks/create-mass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'general',
            title: taskTitle.trim(),
            objectId: objectId || 'general',
            houseId: houseId || 'general',
            sectionIds: selectedSectionIds.length > 0 ? selectedSectionIds : ['general'],
            selectionScope: 'all',
            workTypeId: 'general_task',
            executorEmail,
            deadline: deadline || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            driveFolderUrl,
            reclamationCause: 'Личная задача',
            reclamationDescription: reclamationDescription || 'Личная задача (блокнот).',
            creatorEmail: currentUser.email,
          }),
        });

        const d = await response.json();
        if (!response.ok) throw new Error(d.error || 'Ошибка добавления поручения');

        setFormSuccess('Общее поручение успешно создано!');
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1200);
      } else {
        // Основная ИД или Рекламация массово режется на атомарные задачи по помещениям
        const response = await fetch('/api/tasks/create-mass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: taskType,
            objectId,
            houseId,
            sectionIds: selectedSectionIds,
            selectionScope,
            mopTypes: selectedMopTypes,
            manualRooms: manualRoomIds,
            workTypeId,
            creatorEmail: currentUser.email,
            executorEmail,
            deadline,
            driveFolderUrl,
            startFloorFilter: startFloorFilter !== '' ? parseInt(startFloorFilter, 10) : undefined,
            endFloorFilter: endFloorFilter !== '' ? parseInt(endFloorFilter, 10) : undefined,
            reclamationCause: taskType === 'reclamation' ? reclamationCause : undefined,
            reclamationDescription: taskType === 'reclamation' ? reclamationDescription : undefined,
            grouping: groupingMode,
          }),
        });

        const d = await response.json();
        if (!response.ok) throw new Error(d.error || 'Ошибка при нарезке задач');

        setFormSuccess(`Успешно нарезано и добавлено отдельных задач: ${d.countCreated} шт! (Пропущено согласно матрице применимости: ${d.countSkippedDueToMatrix} шт.)`);
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 2200);
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmiting(false);
    }
  };

  const selectedWorkType = workTypes.find(wt => wt.id === workTypeId);
  const MOP_OPTIONS = ALL_ROOM_TYPES.filter((t) => 
    t !== 'Квартира' && t !== 'Коммерция' && 
    (!selectedWorkType || selectedWorkType.applicableEntityTypes.includes(t))
  );
  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[92vh]">
        
        <div className="px-6 py-4 bg-[#0d1117] text-white flex justify-between items-center border-b border-white/10">
          <div>
            <h3 className="text-base font-bold tracking-tight uppercase font-mono text-white">Генератор комплектов Задач</h3>
            <p className="text-xs text-gray-400">Пакетная автоматическая нарезка атомарных задач по помещениям ПТО</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar text-gray-300">
          
          {formError && (
            <p className="bg-rose-950/40 border-l-4 border-rose-500 p-3 text-rose-300 text-xs font-mono rounded-r-lg">{formError}</p>
          )}
          {formSuccess && (
            <p className="bg-emerald-950/40 border-l-4 border-emerald-500 p-3 text-emerald-300 text-xs font-medium flex items-center gap-1.5 font-mono rounded-r-lg">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
              <span>{formSuccess}</span>
            </p>
          )}

          {/* Тип задачи (Раздел 4) */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-gray-405 uppercase tracking-widest font-mono block">Категория Задачи</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" id="task_category_selector_grid">
              {isDirector ? (
                <>
                  <div 
                    onClick={() => setTaskType('main')}
                    className={`p-3 border rounded-xl flex flex-col gap-1 cursor-pointer transition-all ${taskType === 'main' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#0d1117] border-white/10 hover:bg-[#11161e] text-gray-300'}`}
                  >
                    <span className="text-xs font-bold">1. Проектная ИД</span>
                    <span className={`text-[9px] ${taskType === 'main' ? 'text-orange-400 font-mono' : 'text-gray-450'}`}>С привязкой к шахматке</span>
                  </div>

                  <div 
                    onClick={() => setTaskType('reclamation')}
                    className={`p-3 border rounded-xl flex flex-col gap-1 cursor-pointer transition-all ${taskType === 'reclamation' ? 'bg-[#4c1d24] border-rose-500 text-white shadow' : 'bg-[#0d1117] border-white/10 hover:bg-[#201014] text-gray-300'}`}
                  >
                    <span className="text-xs font-bold">2. Рекламация</span>
                    <span className={`text-[9px] ${taskType === 'reclamation' ? 'text-rose-300 font-mono' : 'text-gray-450'}`}>Аварийный инцидент</span>
                  </div>
                </>
              ) : null}

              <div 
                onClick={() => setTaskType('general')}
                className={`p-3 border rounded-xl flex flex-col gap-1 cursor-pointer transition-all ${taskType === 'general' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#0d1117] border-white/10 hover:bg-[#11161e] text-gray-300'} ${isDirector ? '' : 'md:col-span-3'}`}
              >
                <span className="text-xs font-bold">Личная задача (Общее поручение)</span>
                <span className={`text-[9px] ${taskType === 'general' ? 'text-orange-400 font-mono' : 'text-gray-450'}`}>Лично для исполнителя</span>
              </div>
            </div>
          </div>

          {/* ПОЛЯ ДЛЯ РЕКЛАМАЦИЙ */}
          {taskType === 'reclamation' && (
            <div className="p-4 bg-[#201014] border border-rose-500/20 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs uppercase font-mono">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>Параметры инцидента</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-gray-400 font-medium">Причина рекламации</span>
                  <select
                    value={reclamationCause}
                    onChange={(e) => setReclamationCause(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-rose-500/20 rounded-lg text-white font-medium outline-none"
                  >
                    <option value="Затопление" className="bg-[#161b22]">Затопление</option>
                    <option value="Прорыв кровли" className="bg-[#161b22]">Прорыв кровли</option>
                    <option value="Брак" className="bg-[#161b22]">Заводской брак / дефект</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <span className="text-xs text-slate-400 font-medium">Описание инцидента</span>
                  <textarea
                    rows={2}
                    value={reclamationDescription}
                    onChange={(e) => setReclamationDescription(e.target.value)}
                    placeholder="Детально укажите масштаб протечки, локацию повреждения, дефектные объемы штукатурки/стяжки..."
                    className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-rose-500/20 rounded-lg text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ПОЛЯ ДЛЯ ЛИЧНЫХ ЗАДАЧ (БЛОКНОТ СТРОИТЕЛЯ) */}
          {taskType === 'general' && (
            <div className="p-4 bg-[#0d1117] border border-white/10 rounded-xl space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-400 uppercase font-mono block">Название личной задачи (блокнот) *</span>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Например: Сдать документы по ЖД1 или Купить лампочки..."
                  className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-400 uppercase font-mono block">Описание задачи / Личные заметки</span>
                <textarea
                  rows={4}
                  value={reclamationDescription}
                  onChange={(e) => setReclamationDescription(e.target.value)}
                  placeholder="Детали задачи, ссылки, пометки к выполнению..."
                  className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none font-sans leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-white/5 space-y-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block font-mono">Привязка к объекту ПТО (Необязательно, только для фильтрации)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Объект выбор */}
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400 font-medium font-mono">Объект (ЖК)</span>
                    <select
                      value={objectId}
                      onChange={(e) => handleObjectChange(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white outline-none"
                    >
                      <option value="" className="bg-[#161b22]">-- Без привязки к объекту --</option>
                      {objects.map((o) => (
                        <option key={o.id} value={o.id} className="bg-[#161b22]">{o.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Опциональный выбор секции */}
                  {objectId && (
                    <div className="space-y-1">
                      <span className="text-xs text-gray-400 font-medium font-mono">Секция</span>
                      <select
                        value={selectedSectionIds[0] || ''}
                        onChange={(e) => setSelectedSectionIds(e.target.value ? [e.target.value] : [])}
                        className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white outline-none"
                      >
                        <option value="">-- Без привязки к секции --</option>
                        {filteredSections.map((sec) => (
                          <option key={sec.id} value={sec.id}>Секция {sec.number}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ЛОКАЛИЗАЦИЯ И ХОЗЯЙСТВО (Секции и Помещения) - Скрыто для General задач */}
          {taskType !== 'general' && (
            <div className="space-y-4 bg-[#0d1117] p-4 rounded-xl border border-white/10">
              <span className="text-[11px] font-bold text-gray-405 uppercase tracking-widest font-mono block">Локации и Область Действия</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Объект выбор */}
                <div className="space-y-1">
                  <span className="text-xs text-gray-400 font-medium font-mono">Объект (ЖК)</span>
                  <select
                    required
                    value={objectId}
                    onChange={(e) => handleObjectChange(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white outline-none"
                  >
                    <option value="" className="bg-[#161b22]">-- Выбрать Объект --</option>
                    {objects.map((o) => (
                      <option key={o.id} value={o.id} className="bg-[#161b22]">{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* Корпус */}
                <div className="space-y-1">
                  <span className="text-xs text-gray-400 font-medium font-mono">Дом / Корпус</span>
                  <select
                    required
                    disabled={!objectId}
                    value={houseId}
                    onChange={(e) => handleHouseChange(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white disabled:opacity-50 outline-none"
                  >
                    <option value="" className="bg-[#161b22]">-- Выбрать Корпус --</option>
                    {filteredHouses.map((h) => (
                      <option key={h.id} value={h.id} className="bg-[#161b22]">{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Чекбоксы секций */}
              {houseId && (
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400 font-medium font-mono">Секции (Мультивыбор чекбоксом):</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllSections}
                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-orange-400 hover:text-orange-300 rounded text-[10px] font-bold uppercase border border-white/10 transition-colors"
                      >
                        Выбрать все
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllSections}
                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[10px] font-bold uppercase border border-white/10 transition-colors"
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {filteredSections.map((sec) => {
                      const isChecked = selectedSectionIds.includes(sec.id);
                      return (
                        <label key={sec.id} className={`px-3 py-1.5 border rounded-lg flex items-center gap-2 text-xs font-semibold cursor-pointer transition-colors ${isChecked ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#161b22] text-gray-300 border-white/10 hover:bg-white/5'}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleSectionCheckboxChange(sec.id, e.target.checked)}
                            className="w-4 h-4 rounded text-orange-550 cursor-pointer accent-orange-530"
                          />
                          <span>{sec.number} секция</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Область действия (Фильтр области) */}
              {selectedSectionIds.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-white/10">
                  
                  {/* Диапазон этажей */}
                  <div className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide font-mono block">Диапазон этажей для нарезки (Фильтр)</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 font-mono">Начальный этаж (подвал = -1):</span>
                        <input
                          type="number"
                          placeholder="Все (начиная с подвала = -1)"
                          value={startFloorFilter}
                          onChange={(e) => setStartFloorFilter(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded-md text-white font-mono outline-none focus:border-orange-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 font-mono">Конечный этаж (например, 17):</span>
                        <input
                          type="number"
                          placeholder="Все этажи до верха"
                          value={endFloorFilter}
                          onChange={(e) => setEndFloorFilter(e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 bg-[#0d1117] border border-white/10 rounded-md text-white font-mono outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 italic font-mono leading-normal">
                      * Если оставить пустым, генератор по умолчанию покроет все этажи. Если указать со 2 по 17, система создаст задачи только на этом интервале.
                    </p>
                  </div>

                  <span className="text-xs text-gray-400 font-bold block mb-1">Область действия внутри секций:</span>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" id="selection_scope_selector_grid">
                    <div 
                      onClick={() => setSelectionScope('all')}
                      className={`p-2.5 border rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer text-center select-none transition-all ${selectionScope === 'all' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                    >
                      <span className="text-xs font-bold leading-normal">По всей секции</span>
                      <span className="text-[9px] opacity-75 leading-none">Все 100% помещений</span>
                    </div>

                    <div 
                      onClick={() => setSelectionScope('apartments')}
                      className={`p-2.5 border rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer text-center select-none transition-all ${selectionScope === 'apartments' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                    >
                      <span className="text-xs font-bold leading-normal">Только Квартиры</span>
                      <span className="text-[9px] opacity-75 leading-none font-mono">Сквозные квартиры</span>
                    </div>

                    <div 
                      onClick={() => setSelectionScope('mop')}
                      className={`p-2.5 border rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer text-center select-none transition-all ${selectionScope === 'mop' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                    >
                      <span className="text-xs font-bold leading-normal">МОП</span>
                      <span className="text-[9px] opacity-75 leading-none font-mono">Шахты/Холл/Тамбур</span>
                    </div>

                    <div 
                      onClick={() => setSelectionScope('manual')}
                      className={`p-2.5 border rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer text-center select-none transition-all ${selectionScope === 'manual' ? 'bg-[#1f2937] border-orange-500 text-white shadow' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                    >
                      <span className="text-xs font-bold leading-normal">Выбрать вручную</span>
                      <span className="text-[9px] opacity-75 leading-none">Поэтажная разметка</span>
                    </div>
                  </div>

                  {/* Дополнительный селектор МОП */}
                  {selectionScope === 'mop' && (
                    <div className="p-3 bg-[#161b22] border border-white/10 rounded-lg space-y-2 max-w-sm">
                      <span className="text-xs text-gray-400 font-medium">Выберите типы помещений МОП</span>
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {MOP_OPTIONS.map((t) => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={selectedMopTypes.includes(t as RoomType)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMopTypes([...selectedMopTypes, t as RoomType]);
                                } else {
                                  setSelectedMopTypes(selectedMopTypes.filter(m => m !== t));
                                }
                              }}
                              className="w-3.5 h-3.5 rounded border-gray-600 text-orange-500 focus:ring-orange-500/20 bg-[#0d1117]"
                            />
                            <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{t}</span>
                          </label>
                        ))}
                        {MOP_OPTIONS.length === 0 && (
                          <span className="text-[10px] text-gray-500 italic">Нет доступных типов МОП для выбранного вида работ.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Дерево ручной генерации */}
                  {selectionScope === 'manual' && (
                    <div className="p-4 bg-[#161b22] border border-white/10 rounded-xl space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                        <span className="text-xs font-bold text-gray-300 block font-mono">Поэтажная разметка ({manualRoomIds.length} выбр.):</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSelectAllFilteredRooms}
                            className="px-2 py-1 bg-orange-600/80 hover:bg-orange-600 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            Выбрать все
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAllSelectedRooms}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[10px] font-bold uppercase border border-white/10 transition-colors"
                          >
                            Снять все
                          </button>
                        </div>
                      </div>
                      
                      {activeSections.map((sec) => (
                        <div key={sec.id} className="space-y-2 border-l border-white/10 pl-3">
                          <span className="text-xs font-bold text-white block">{sec.number} секция</span>
                          
                          {[...sec.floors]
                            .sort((a, b) => b.floorNumber - a.floorNumber)
                            .filter((floor) => {
                              if (startFloorFilter !== '') {
                                const minF = parseInt(startFloorFilter, 10);
                                if (!isNaN(minF) && floor.floorNumber < minF) return false;
                              }
                              if (endFloorFilter !== '') {
                                const maxF = parseInt(endFloorFilter, 10);
                                if (!isNaN(maxF) && floor.floorNumber > maxF) return false;
                              }
                              return true;
                            })
                            .map((floor) => {
                              const isExp = expandedFloors.includes(floor.floorNumber);
                              const floorRooms = floor.rooms;
                              const isAllOnFloorSelected = floorRooms.length > 0 && floorRooms.every((r) => manualRoomIds.includes(r.id));

                              return (
                                <div key={floor.floorNumber} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs py-1 bg-[#0d1117]/60 px-2 rounded border border-white/5">
                                    <div className="flex items-center gap-1.5">
                                      {/* Отметить весь этаж */}
                                      <input
                                        type="checkbox"
                                        checked={isAllOnFloorSelected}
                                        onChange={(e) => handleSelectAllRoomsOnFloor(floorRooms, e.target.checked)}
                                        className="w-3.5 h-3.5 rounded-sm accent-orange-500"
                                      />
                                      <button type="button" onClick={() => toggleFloorExpand(floor.floorNumber)} className="font-mono font-bold text-gray-200">
                                        {floor.floorNumber === -1 ? 'Подвал' : `${floor.floorNumber} этаж`}
                                      </button>
                                    </div>
                                    <button type="button" onClick={() => toggleFloorExpand(floor.floorNumber)} className="text-[10px] text-gray-450">
                                      {isExp ? 'Свернуть' : `Развернуть (${floorRooms.length})`}
                                    </button>
                                  </div>

                                  {isExp && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 pl-4 bg-black/20 border border-white/5 rounded">
                                      {floorRooms.map((room) => {
                                        const isRoomChecked = manualRoomIds.includes(room.id);
                                        return (
                                          <label key={room.id} className={`p-1.5 border rounded-md flex items-center gap-1.5 cursor-pointer text-[11px] font-medium leading-none ${isRoomChecked ? 'bg-[#1c222b] border-orange-550 text-white shadow-sm' : 'bg-[#0d1117] text-gray-400 border-white/5 hover:bg-white/5 hover:text-white'}`}>
                                            <input
                                              type="checkbox"
                                              checked={isRoomChecked}
                                              onChange={() => handleManualRoomToggle(room.id)}
                                              className="w-3.5 h-3.5 accent-orange-550"
                                            />
                                            <span className="truncate">{room.name}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ГРУППИРОВКА ЗАДАЧ (Разрезание) - Показывать только если ИД/Рекламация */}
          {taskType !== 'general' && (
            <div className="space-y-2 bg-[#0d1117] p-4 rounded-xl border border-white/10" id="task_grouping_mode_container">
              <span className="text-[11px] font-bold text-gray-405 uppercase tracking-widest font-mono block">Масштаб нарезки (Группировка)</span>
              <p className="text-xs text-gray-400 font-normal leading-normal">
                Выберите, насколько крупные задачи нужно ставить, чтобы не засорять журнал лишними сущностями:
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div
                  onClick={() => setGroupingMode('room')}
                  className={`p-2.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${groupingMode === 'room' ? 'bg-[#1f2937] border-orange-500 text-white shadow font-medium' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                >
                  <span className="text-xs font-bold font-mono">ПОКОМНАТНО</span>
                  <span className="text-[9px] text-gray-405 leading-tight mt-1.5 block">Каждая комната - отдельная задача (атомарные ИД)</span>
                </div>

                <div
                  onClick={() => setGroupingMode('floor')}
                  className={`p-2.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${groupingMode === 'floor' ? 'bg-[#1f2937] border-orange-500 text-white shadow font-medium' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                >
                  <span className="text-xs font-bold font-mono">ПОЭТАЖНО</span>
                  <span className="text-[9px] text-gray-405 leading-tight mt-1.5 block">Все помещения этажа секции в 1 задачу</span>
                </div>

                <div
                  onClick={() => setGroupingMode('typical-floors')}
                  className={`p-2.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${groupingMode === 'typical-floors' ? 'bg-[#1f2937] border-orange-500 text-white shadow font-medium' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                >
                  <span className="text-xs font-bold font-mono">ТИПОВЫЕ ЭТАЖИ ★</span>
                  <span className="text-[9px] text-yellow-500 leading-tight mt-1.5 block font-medium">Подвал и 1эт отдельно, жилые этажи 2+ вместе по секциям!</span>
                </div>

                <div
                  onClick={() => setGroupingMode('section')}
                  className={`p-2.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${groupingMode === 'section' ? 'bg-[#1f2937] border-orange-500 text-white shadow font-medium' : 'bg-[#161b22] border-white/10 text-gray-300 hover:bg-white/5'}`}
                >
                  <span className="text-xs font-bold font-mono">СЕКЦИОННО</span>
                  <span className="text-[9px] text-gray-450 leading-tight mt-1.5 block">Все помещения секции целиком в 1 задачу</span>
                </div>
              </div>
            </div>
          )}

          {/* НАЗНАЧЕНИЕ (Вид работ, Исполнитель, Дедлайн) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#0d1117] rounded-xl border border-white/10">
            {/* Вид работ */}
            {taskType !== 'general' && (
              <div className="space-y-1 sm:col-span-3">
                <span className="text-xs text-gray-400 font-bold block">Вид выполняемой строительной работы</span>
                <select
                  required
                  value={workTypeId}
                  disabled={selectedSectionIds.length === 0}
                  onChange={(e) => setWorkTypeId(e.target.value)}
                  className="w-full text-xs px-2.5 py-2.5 bg-[#161b22] border border-white/10 rounded-lg text-white disabled:opacity-50 outline-none"
                >
                  <option value="" className="bg-[#161b22]">-- Выбрать вид работы --</option>
                  {filteredWorkTypes.map((wt) => (
                    <option key={wt.id} value={wt.id} className="bg-[#161b22]">
                      {wt.name} (Комплектов ИД: {wt.checklistTemplates?.length || 0})
                    </option>
                  ))}
                </select>
                {selectedSectionIds.length > 0 && selectedRoomTypes.length > 0 && (
                  <p className="text-[10px] text-gray-400 font-mono mt-1">
                    * Учитывая матрицу применимости для типов: {selectedRoomTypes.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Исполнитель */}
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold">Ответственный исполнитель ПТО</span>
              <select
                required
                disabled={!isDirector}
                value={executorEmail}
                onChange={(e) => setExecutorEmail(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white outline-none disabled:opacity-65"
              >
                <option value="" className="bg-[#161b22]">-- Назначить Исполнителя --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.email} className="bg-[#161b22]">{u.name} ({u.role === 'director' ? 'Нач. ПТО' : 'Инженер ПТО'})</option>
                ))}
              </select>
            </div>

            {/* Срок выполнения */}
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold">Срок сдачи (Дедлайн)</span>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg text-white outline-none"
              />
            </div>

            {/* Единая папка на Google Диске */}
            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold">Шаблонная папка Google Drive</span>
              <input
                type="url"
                placeholder="https://drive.google.com/..."
                value={driveFolderUrl}
                onChange={(e) => setDriveFolderUrl(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-[#161b22] border border-white/10 rounded-lg font-mono text-white outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3 bg-amber-500/5 rounded-lg p-3 text-[11px] text-amber-200/90 border border-amber-500/10">
            <HelpCircle className="w-5 h-5 shrink-0 text-amber-500" />
            <p className="leading-normal font-mono">
              <strong>Атомарность БД СДК:</strong> Наш генератор создаст индивидуальные, автономные задачи под каждые выбранные помещения в БД. Это позволит отслеживать ход согласования исполнительной независимо.
            </p>
          </div>

        </form>

        <div className="px-6 py-4 bg-[#161b22] border-t border-white/10 flex justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold rounded-lg transition-all"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={isSubmiting}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white disabled:bg-gray-700 text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            {isSubmiting ? 'Генерация...' : 'Запустить нарезку задач'}
          </button>
        </div>

      </div>
    </div>
  );
}
