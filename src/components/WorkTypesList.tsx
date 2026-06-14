/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WorkType, RoomType, ALL_ROOM_TYPES, Task } from '../types.ts';
import { Pencil, Plus, Trash2, CheckCircle, Save, Info, ListTodo, Layers, RefreshCw, CheckSquare } from 'lucide-react';

interface WorkTypesListProps {
  workTypes: WorkType[];
  tasks: Task[];
  onRefresh: () => void;
}

export default function WorkTypesList({ workTypes, tasks, onRefresh }: WorkTypesListProps) {
  const [selectedWtId, setSelectedWtId] = useState<string>(workTypes[0]?.id || '');
  
  // Для добавления нового вида работ
  const [newWtName, setNewWtName] = useState<string>('');
  const [newWtApplicable, setNewWtApplicable] = useState<RoomType[]>(['Квартира']);
  const [newWtChecklists, setNewWtChecklists] = useState<string[]>([
    '1. Исполнительная схема',
    '2. Акт АОСР',
    '3. Сертификаты соответствия',
  ]);
  const [isAddingWt, setIsAddingWt] = useState(false);

  // Для редактирования выбранного
  const targetWt = workTypes.find((wt) => wt.id === selectedWtId);
  const [editApplicable, setEditApplicable] = useState<RoomType[]>([]);
  const [editChecklists, setEditChecklists] = useState<string[]>([]);
  const [newTemplateItem, setNewTemplateItem] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Проверяем, задействован ли выбранный вид работы в активных или архивных задачах
  const isWorkTypeUsed = selectedWtId ? tasks.some((t) => t.workTypeId === selectedWtId) : false;

  // Очистка / удаление вида работ
  const handleDeleteWorkType = async () => {
    if (!selectedWtId || !targetWt) return;
    if (isWorkTypeUsed) {
      setErrorMsg(`Этот вид работы сейчас задействован в ПТО-задачах (${tasks.filter(t => t.workTypeId === selectedWtId).length} шт.) и не может быть удален!`);
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/worktypes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workTypeId: selectedWtId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при удалении вида работ');
      }

      setSuccessMsg(`Вид работы "${targetWt.name}" успешно удален из справочника.`);
      setSelectedWtId(workTypes.find((wt) => wt.id !== selectedWtId)?.id || '');
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
      setShowDeleteConfirm(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Синхронизация при выборе другого вида работ
  React.useEffect(() => {
    if (targetWt) {
      setEditApplicable(targetWt.applicableEntityTypes || []);
      setEditChecklists(targetWt.checklistTemplates || []);
      setNewTemplateItem('');
      setSuccessMsg(null);
      setErrorMsg(null);
      setShowDeleteConfirm(false);
    }
  }, [selectedWtId, targetWt]);

  // Таблица применимости: изменить чекбокс
  const handleToggleApplicable = (type: RoomType) => {
    if (editApplicable.includes(type)) {
      setEditApplicable(editApplicable.filter((t) => t !== type));
    } else {
      setEditApplicable([...editApplicable, type]);
    }
  };

  // Добавить документ в шаблон выбранного вида работ
  const handleAddTemplateItem = () => {
    if (!newTemplateItem.trim()) return;
    const num = editChecklists.length + 1;
    setEditChecklists([...editChecklists, `${num}. ${newTemplateItem.trim()}`]);
    setNewTemplateItem('');
  };

  // Удалить документ из шаблона
  const handleRemoveTemplateItem = (index: number) => {
    const list = [...editChecklists];
    list.splice(index, 1);
    // Сделаем перенумерацию
    const renumbered = list.map((item, idx) => {
      // Отрежем старый номер типа "Цифра. " и подставим новый
      const cleanName = item.replace(/^\d+\.\s*/, '');
      return `${idx + 1}. ${cleanName}`;
    });
    setEditChecklists(renumbered);
  };

  // Сохранить изменения в БД ПТО
  const handleSaveWorkType = async () => {
    if (!selectedWtId) return;
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/worktypes/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workTypeId: selectedWtId,
          applicableEntityTypes: editApplicable,
          checklistTemplates: editChecklists,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка при обновлении вида работ');

      setSuccessMsg(`Параметры работы "${targetWt?.name}" успешно сохранены!`);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Создать новый вид работ
  const handleCreateWorkType = async () => {
    if (!newWtName.trim()) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/worktypes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWtName,
          applicableEntityTypes: newWtApplicable,
          checklistTemplates: newWtChecklists,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка при добавлении вида работы');

      setNewWtName('');
      setIsAddingWt(false);
      setSelectedWtId(data.id);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  return (
    <div id="worktypes_root" className="grid grid-cols-1 md:grid-cols-12 gap-6">
      
      {/* ЛЕВАЯ ЧАСТЬ: СПИСОК РАБОТ */}
      <div className="md:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Layers className="w-5 h-5 text-slate-800" />
          <h3 className="font-bold text-slate-900 uppercase tracking-wide font-mono">Виды техпроцессов</h3>
        </div>

        <div className="flex-1 space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {workTypes.map((wt) => (
            <button
              key={wt.id}
              onClick={() => setSelectedWtId(wt.id)}
              className={`w-full text-left p-3.5 rounded-lg border transition-all flex flex-col gap-1 ${
                selectedWtId === wt.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-800 text-slate-700 hover:bg-white'
              }`}
            >
              <span className="text-sm font-bold block">{wt.name}</span>
              <span className={`text-[10px] font-medium font-mono uppercase ${selectedWtId === wt.id ? 'text-slate-300' : 'text-slate-400'}`}>
                Шаблон доков: {wt.checklistTemplates?.length || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Форма добавления работы */}
        {!isAddingWt ? (
          <button
            onClick={() => setIsAddingWt(true)}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить вид работ</span>
          </button>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase font-mono">Добавление вида работ</h4>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Например, Шлифовка потолка"
                value={newWtName}
                onChange={(e) => setNewWtName(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={handleCreateWorkType}
                  className="px-3 py-1 bg-slate-900 text-white text-[11px] font-bold rounded"
                >
                  Создать
                </button>
                <button
                  onClick={() => setIsAddingWt(false)}
                  className="px-3 py-1 bg-slate-200 text-slate-600 text-[11px] font-bold rounded"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ПРАВАЯ ЧАСТЬ: МАТРИЦА ПРИМЕНИМОСТИ И ШАБЛОН ЧЕК-ЛИСТА */}
      <div className="md:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        {targetWt ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{targetWt.name}</h3>
                <span className="inline-block text-[11px] font-bold text-slate-400 font-mono uppercase tracking-widest mt-0.5">Код: {targetWt.id}</span>
              </div>
              <div className="flex gap-2">
                {!isWorkTypeUsed ? (
                  !showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                      title="Удалить данный вид работы из справочника"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Удалить работу</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 p-1.5 rounded-lg shadow-sm">
                      <span className="text-[10px] text-rose-800 font-bold font-mono uppercase px-1">Желаете удалить?</span>
                      <button
                        type="button"
                        onClick={handleDeleteWorkType}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-550 text-white rounded text-[10px] font-bold uppercase transition-all"
                      >
                        Да
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded text-[10px] font-bold uppercase transition-all"
                      >
                        Нет
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-60"
                    title="Этот вид работы задействован в ПТО-задачах и не может быть удален"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400" />
                    <span>В работе (Нельзя удалить)</span>
                  </button>
                )}
                <button
                  onClick={handleSaveWorkType}
                  disabled={isSaving}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-bold transition-all shadow-xs hover:shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Сохранение...' : 'Записать матрицу ПТО'}</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-rose-50 border-l-4 border-rose-600 p-3 rounded text-rose-900 text-xs font-mono">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="bg-emerald-50 border-l-4 border-emerald-600 p-3 rounded text-emerald-900 text-xs font-mono flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* МАТРИЦА ПРИМЕНИМОСТИ К КЛАССАМ ПОМЕЩЕНИЙ */}
            <div className="space-y-3 bg-slate-50/50 p-4 border border-slate-180 rounded-xl">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-mono flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4" />
                  Матрица применимости вида работ
                </h4>
                <p className="text-[11px] text-slate-400">В каких типах помещений разрешено нарезать эту задачу. Система защищает от ошибочного назначения строителями.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {ALL_ROOM_TYPES.map((type) => {
                  const isChecked = editApplicable.includes(type);

                  return (
                    <label
                      key={type}
                      className={`p-2 border rounded-lg flex items-center gap-2.5 transition-all cursor-pointer ${
                        isChecked 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleApplicable(type)}
                        className="w-4 h-4 rounded-sm border-slate-300 focus:ring-slate-900 text-slate-900 cursor-pointer"
                      />
                      <span className="text-xs font-semibold select-none leading-none">{type}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ШАБЛОН ДОКУМЕНТОВ И АКТОВ ПТО */}
            <div className="space-y-3 bg-slate-50/50 p-4 border border-slate-180 rounded-xl">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-mono flex items-center gap-1.5">
                  <ListTodo className="w-4 h-4" />
                  Шаблонные документы для приемки
                </h4>
                <p className="text-[11px] text-slate-400">Состав обязательных документов, которые инженер обязан загрузить в карточку задачи.</p>
              </div>

              {/* Список текущих доков */}
              <div className="bg-white border border-slate-200 divide-y divide-slate-100 rounded-lg overflow-hidden">
                {editChecklists.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">Нет документов. Добавьте первый!</p>
                ) : (
                  editChecklists.map((item, index) => (
                    <div key={index} className="px-4 py-2 text-xs font-semibold text-slate-700 flex justify-between items-center bg-white hover:bg-slate-50">
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTemplateItem(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Удалить из шаблона"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Форма добавления нового дока */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Назовите документ, например: АOSR на гидроизоляцию..."
                  value={newTemplateItem}
                  onChange={(e) => setNewTemplateItem(e.target.value)}
                  className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAddTemplateItem}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center h-full">
            <Info className="w-8 h-8 text-slate-300 stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Выберите Техпроцесс в левой панели для просмотра матрицы применимости.</p>
          </div>
        )}
      </div>

    </div>
  );
}
