/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ConstructionObject, House, Section, RoomType, ALL_ROOM_TYPES, Room } from '../types.ts';
import { Pencil, Trash2, Plus, Check, Settings, Layout, ChevronDown, ChevronRight, Building2, HelpCircle } from 'lucide-react';

interface LocationConstructorProps {
  objects: ConstructionObject[];
  houses: House[];
  sections: Section[];
  onRefresh: () => void;
}

interface FloorRangeRule {
  id: string;
  minFloor: number;
  maxFloor: number;
  compositions: { type: RoomType; qty: number }[];
}

export default function LocationConstructor({ objects, houses, sections, onRefresh }: LocationConstructorProps) {
  // Для генератора
  const [selectedObjectId, setSelectedObjectId] = useState<string>(objects[0]?.id || '');
  const [selectedHouseId, setSelectedHouseId] = useState<string>(houses[0]?.id || '');
  const [sectionNumber, setSectionNumber] = useState<string>('Секция 6');
  const [startFloor, setStartFloor] = useState<number>(-1);
  const [endFloor, setEndFloor] = useState<number>(3);
  
  // Правила состава этажей
  const [rules, setRules] = useState<FloorRangeRule[]>([
    {
      id: 'rule_1',
      minFloor: -1,
      maxFloor: -1,
      compositions: [
        { type: 'Кладовая', qty: 4 },
        { type: 'Подвал / Техпомещение', qty: 2 },
        { type: 'ЛК', qty: 1 },
      ],
    },
    {
      id: 'rule_2',
      minFloor: 1,
      maxFloor: 1,
      compositions: [
        { type: 'Квартира', qty: 4 },
        { type: 'Коммерция', qty: 2 },
        { type: 'Вестибюль', qty: 1 },
        { type: 'Тамбур', qty: 1 },
        { type: 'Колясочная', qty: 1 },
        { type: 'ЛХ', qty: 1 },
        { type: 'ЛК', qty: 1 },
      ],
    },
    {
      id: 'rule_3',
      minFloor: 2,
      maxFloor: 17,
      compositions: [
        { type: 'Квартира', qty: 9 },
        { type: 'ЛХ', qty: 1 },
        { type: 'ЛК', qty: 1 },
        { type: 'Коридор МОП', qty: 1 },
      ],
    },
  ]);

  // Сквозная нумерация квартир
  const [enableFlatNumbering, setEnableFlatNumbering] = useState<boolean>(true);
  const [flatStartNum, setFlatStartNum] = useState<number>(662);
  const [flatStartFloor, setFlatStartFloor] = useState<number>(1);

  // Кастомные формы добавления Объектов/Домов
  const [newObjectName, setNewObjectName] = useState<string>('');
  const [newHouseName, setNewHouseName] = useState<string>('');
  const [isCreatingObject, setIsCreatingObject] = useState<boolean>(false);
  const [isCreatingHouse, setIsCreatingHouse] = useState<boolean>(false);

  // Для ручной корректировки
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id || '');
  const [expandedFloor, setExpandedFloor] = useState<number | null>(null);
  
  // Редактирование помещения в реальном времени
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState<string>('');
  const [editingRoomType, setEditingRoomType] = useState<RoomType>('Квартира');

  // Добавление новой комнаты
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('Квартира');
  const [isAddingRoom, setIsAddingRoom] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [deletingObjectId, setDeletingObjectId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  // ---- СИНХРОНИЗАЦИЯ И ХУКИ (ПЕРЕНЕСЕНЫ НАВЕРХ) ----
  
  // Синхронизация при изменении / сбросе справочника объектов
  React.useEffect(() => {
    if (objects.length > 0 && !objects.some((o) => o.id === selectedObjectId)) {
      setSelectedObjectId(objects[0]?.id || '');
    }
  }, [objects, selectedObjectId]);

  // Синхронизация строений (домов) при смене ЖК
  React.useEffect(() => {
    const filtered = houses.filter((h) => h.objectId === selectedObjectId);
    if (filtered.length > 0 && !filtered.some((h) => h.id === selectedHouseId)) {
      setSelectedHouseId(filtered[0]?.id || '');
    }
  }, [houses, selectedObjectId, selectedHouseId]);

  const activeSection = sections.find((s) => s.id === activeSectionId);

  // Создать Объект
  const handleCreateObject = async () => {
    if (!newObjectName.trim()) return;
    try {
      const response = await fetch('/api/objects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newObjectName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setSelectedObjectId(data.id);
      setNewObjectName('');
      setIsCreatingObject(false);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  // Создать Дом
  const handleCreateHouse = async () => {
    if (!newHouseName.trim() || !selectedObjectId) return;
    try {
      const response = await fetch('/api/houses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectId: selectedObjectId, name: newHouseName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setSelectedHouseId(data.id);
      setNewHouseName('');
      setIsCreatingHouse(false);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  // Удалить Объект
  const handleDeleteObject = async (objId: string) => {
    if (deletingObjectId !== objId) {
      setDeletingObjectId(objId);
      setTimeout(() => setDeletingObjectId(null), 5000);
      return;
    }
    setDeletingObjectId(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const response = await fetch('/api/objects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectId: objId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка удаления объекта');

      setSuccessMsg('Строительный объект успешно удален из справочника.');
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  // Добавить строку состава этажей
  const handleAddRuleRow = () => {
    const nextId = 'rule_' + Math.random().toString(36).substring(2, 5);
    setRules([...rules, {
      id: nextId,
      minFloor: 1,
      maxFloor: 1,
      compositions: [{ type: 'Квартира', qty: 1 }],
    }]);
  };

  // Удалить строку состава
  const handleRemoveRuleRow = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  // Изменить диапазон
  const handleRuleFloorChange = (id: string, field: 'minFloor' | 'maxFloor', val: number) => {
    setRules(rules.map((r) => r.id === id ? { ...r, [field]: val } : r));
  };

  // Добавить тип помещения в состав этажей
  const handleAddTypeToRule = (ruleId: string, type: RoomType) => {
    setRules(rules.map((r) => {
      if (r.id !== ruleId) return r;
      if (r.compositions.some((c) => c.type === type)) return r;
      return {
        ...r,
        compositions: [...r.compositions, { type, qty: 1 }],
      };
    }));
  };

  // Изменить количество помещений в составе
  const handleQtyChange = (ruleId: string, type: RoomType, qty: number) => {
    setRules(rules.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        compositions: r.compositions.map((c) => c.type === type ? { ...c, qty: Math.max(0, qty) } : c),
      };
    }));
  };

  // Удалить помещение из состава
  const handleRemoveTypeFromRule = (ruleId: string, type: RoomType) => {
    setRules(rules.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        compositions: r.compositions.filter((c) => c.type !== type),
      };
    }));
  };

  // Сгенерировать общую геометрию дома
  const handleGenerateGeometry = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsGenerating(true);

    if (!selectedObjectId || !selectedHouseId) {
      setErrorMsg('Пожалуйста, выберите Объект строительства и Дом!');
      setIsGenerating(false);
      return;
    }

    try {
      const response = await fetch('/api/geometry/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: selectedObjectId,
          houseId: selectedHouseId,
          sectionNumber,
          startFloor,
          endFloor,
          floorTemplates: rules,
          flatStartNum: enableFlatNumbering ? flatStartNum : null,
          flatStartFloor: enableFlatNumbering ? flatStartFloor : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации');

      setSuccessMsg(`Структура "${sectionNumber}" успешно сгенерирована! От этажа ${startFloor} до ${endFloor}.`);
      setActiveSectionId(data.id);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- РУЧНАЯ КОРРЕКТИРОВКА ----
  const handleStartEditRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setEditingRoomName(room.name);
    setEditingRoomType(room.type);
  };

  const handleSaveRoomChanges = async (floorNum: number) => {
    if (!activeSectionId || !editingRoomId || !editingRoomName.trim()) return;

    try {
      const response = await fetch('/api/geometry/room/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: activeSectionId,
          floorNumber: floorNum,
          roomId: editingRoomId,
          name: editingRoomName,
          type: editingRoomType,
        }),
      });

      if (!response.ok) {
        const d = await response.json();
        throw new Error(d.error || 'Ошибка изменения помещения');
      }

      setEditingRoomId(null);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleDeleteRoom = async (floorNum: number, roomId: string) => {
    if (deletingRoomId !== roomId) {
      setDeletingRoomId(roomId);
      setTimeout(() => setDeletingRoomId(null), 5000);
      return;
    }
    setDeletingRoomId(null);

    try {
      const response = await fetch('/api/geometry/room/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: activeSectionId,
          floorNumber: floorNum,
          roomId,
        }),
      });

      if (!response.ok) {
        const d = await response.json();
        throw new Error(d.error || 'Ошибка удаления комнат');
      }

      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleCreateRoom = async (floorNum: number) => {
    if (!newRoomName.trim()) return;

    try {
      const response = await fetch('/api/geometry/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: activeSectionId,
          floorNumber: floorNum,
          name: newRoomName,
          type: newRoomType,
        }),
      });

      if (!response.ok) {
        const d = await response.json();
        throw new Error(d.error || 'Ошибка добавления помещения');
      }

      setNewRoomName('');
      setIsAddingRoom(false);
      onRefresh();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const filteredHouses = houses.filter((h) => h.objectId === selectedObjectId);

  return (
    <div id="constructor_root" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* ЛЕВАЯ ЧАСТЬ: КОНСТРУКТОР СЕКЦИЙ */}
      <div className="lg:col-span-6 space-y-6">
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 uppercase tracking-wide font-mono">Конструктор геометрии Секции</h3>
              <p className="text-xs text-slate-500">Генерация сетки этажей, раскладки и сквозных номеров ПТО</p>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-600 p-3.5 rounded text-rose-900 text-sm font-medium">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-emerald-600 p-3.5 rounded text-emerald-900 text-sm font-medium">
              {successMsg}
            </div>
          )}

          {/* Шаг 1: Выбор Объекта и Дома */}
          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">1. Связь Жилого Комплекса</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Объект выбор */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">Объект (ЖК)</label>
                {!isCreatingObject ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedObjectId}
                      onChange={(e) => {
                        setSelectedObjectId(e.target.value);
                        setSelectedHouseId('');
                      }}
                      className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
                    >
                      <option value="">-- Выбрать ЖК --</option>
                      {objects.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingObject(true)}
                      className="p-2 border border-slate-300 rounded-lg hover:border-slate-800 text-slate-700 bg-white"
                      title="Добавить новый ЖК"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newObjectName}
                      onChange={(e) => setNewObjectName(e.target.value)}
                      placeholder="Название нового ЖК..."
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-400 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleCreateObject}
                      className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs"
                    >
                      Ок
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingObject(false)}
                      className="text-xs text-slate-500"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>

              {/* Дом выбор */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">Строение (Дом / Корпус)</label>
                {!isCreatingHouse ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedHouseId}
                      onChange={(e) => setSelectedHouseId(e.target.value)}
                      disabled={!selectedObjectId}
                      className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 disabled:bg-slate-100"
                    >
                      <option value="">-- Выбрать Дом --</option>
                      {filteredHouses.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingHouse(true)}
                      disabled={!selectedObjectId}
                      className="p-2 border border-slate-300 rounded-lg hover:border-slate-800 text-slate-700 bg-white disabled:opacity-50"
                      title="Добавить Дом"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newHouseName}
                      onChange={(e) => setNewHouseName(e.target.value)}
                      placeholder="ЖД 1, Корпус 2..."
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-400 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleCreateHouse}
                      className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs"
                    >
                      Ок
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingHouse(false)}
                      className="text-xs text-slate-500"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Раздел 2: Номер секции и диапазон этажей */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 font-mono">Номер Секции</label>
              <input
                type="text"
                value={sectionNumber}
                onChange={(e) => setSectionNumber(e.target.value)}
                placeholder="Секция 6"
                className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 font-mono">Нижний этаж</label>
              <input
                type="number"
                value={startFloor}
                onChange={(e) => setStartFloor(parseInt(e.target.value, 10))}
                className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 font-mono">Верхний этаж</label>
              <input
                type="number"
                value={endFloor}
                onChange={(e) => setEndFloor(parseInt(e.target.value, 10))}
                className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
          </div>

          {/* Шаг 3: Шаблоны состава этажей */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">2. Сетки состава помещений по этажам</h4>
              <button
                type="button"
                onClick={handleAddRuleRow}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить диапазон
              </button>
            </div>

            <div className="space-y-4">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 relative group">
                  <button
                    type="button"
                    onClick={() => handleRemoveRuleRow(rule.id)}
                    className="absolute top-3 right-3 p-1 text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Удалить диапазон"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Диапазон этажей */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Для этажей с</span>
                    <input
                      type="number"
                      value={rule.minFloor}
                      onChange={(e) => handleRuleFloorChange(rule.id, 'minFloor', parseInt(e.target.value, 10))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded-center text-xs font-mono"
                    />
                    <span className="text-xs font-bold text-slate-600">по</span>
                    <input
                      type="number"
                      value={rule.maxFloor}
                      onChange={(e) => handleRuleFloorChange(rule.id, 'maxFloor', parseInt(e.target.value, 10))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded-center text-xs font-mono"
                    />
                  </div>

                  {/* Настроенный состав помещений */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide font-mono">Состав помещений на этаже:</div>
                    <div className="flex flex-wrap gap-2">
                      {rule.compositions.map((comp) => (
                        <div key={comp.type} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                          <span className="font-medium text-slate-700">{comp.type}:</span>
                          <input
                            type="number"
                            value={comp.qty}
                            onChange={(e) => handleQtyChange(rule.id, comp.type, parseInt(e.target.value, 10))}
                            className="w-8 border-b border-dashed border-slate-400 focus:border-slate-800 text-center text-xs font-bold text-slate-900 bg-transparent font-mono outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveTypeFromRule(rule.id, comp.type)}
                            className="text-slate-400 hover:text-rose-600 text-[10px] ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Добавить тип в этот диапазон */}
                    <div className="pt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-mono mr-1">Добавить тип:</span>
                      {ALL_ROOM_TYPES.map((type) => {
                        const exists = rule.compositions.some((c) => c.type === type);
                        if (exists) return null;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleAddTypeToRule(rule.id, type)}
                            className="px-2 py-0.5 border border-slate-200 hover:border-slate-800 bg-white rounded text-[10px] text-slate-600 font-mono transition-colors"
                          >
                            + {type}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Блок сквозной автоматической нумерации квартир */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="flat_numbering_checkbox"
                checked={enableFlatNumbering}
                onChange={(e) => setEnableFlatNumbering(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-900 cursor-pointer"
              />
              <label htmlFor="flat_numbering_checkbox" className="text-xs font-bold text-slate-700 uppercase tracking-wide cursor-pointer select-none">
                Автогенератор сквозной нумерации квартир
              </label>
            </div>

            {enableFlatNumbering && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs text-slate-600">Начать с этажа</span>
                  <input
                    type="number"
                    value={flatStartFloor}
                    onChange={(e) => setFlatStartFloor(parseInt(e.target.value, 10))}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-slate-600">Стартовый номер квартиры</span>
                  <input
                    type="number"
                    value={flatStartNum}
                    onChange={(e) => setFlatStartNum(parseInt(e.target.value, 10))}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
               type="button"
               onClick={handleGenerateGeometry}
               disabled={isGenerating}
               className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg disabled:bg-slate-400 flex items-center justify-center gap-2"
            >
               <span>ОТПРАВИТЬ СЕТКУ В ГЕНЕРАТОР</span>
            </button>
          </div>

        </div>

        {/* СПРАВОЧНИК И УДАЛЕНИЕ ОБЪЕКТОВ СТРОИТЕЛЬСТВА */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-5 h-5 text-slate-900" />
            <span className="font-bold text-slate-900 uppercase tracking-tight font-mono text-xs">Справочник Объектов (ЖК)</span>
          </div>
          <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
            Список строительных объектов в справочнике. Вы можете удалить неиспользуемый объект, если он не содержит созданных секций или задач в шахматке.
          </p>

          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
            {objects.map((o) => {
              const objHouses = houses.filter((h) => h.objectId === o.id);
              const objHouseIds = objHouses.map((h) => h.id);
              const isLocked = sections.some((s) => objHouseIds.includes(s.houseId));

              return (
                <div key={o.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800 block text-xs">{o.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                      {isLocked ? '🔒 Используется (Блокировка)' : '🔓 Свободен для удаления'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleDeleteObject(o.id)}
                    className={`p-1.5 rounded transition-all flex items-center justify-center min-w-[75px] gap-1 text-[10px] font-bold ${
                      isLocked 
                      ? 'text-slate-200 cursor-not-allowed bg-slate-50' 
                      : deletingObjectId === o.id
                        ? 'text-white bg-rose-600'
                        : 'text-rose-600 hover:text-white hover:bg-rose-600 bg-rose-50'
                    }`}
                    title={isLocked ? 'Объект уже размечен в шахматке' : deletingObjectId === o.id ? 'Нажмите повторно для удаления!' : 'Удалить пустой объект'}
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    {deletingObjectId === o.id && <span>Удалить?</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ПРАВАЯ ЧАСТЬ: РУЧНАЯ КОРРЕКТИРОВКА РАЗМЕТКИ */}
      <div className="lg:col-span-6 space-y-6">
        
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 uppercase tracking-wide font-mono">Ручная корректировка (Обязательно)</h3>
              <p className="text-xs text-slate-500">Точечное переименование, удаление или добавление ячеек для перепланировок</p>
            </div>
          </div>

          {/* Выбор секции для ручного редактирования */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase font-mono">Выберите секцию для корректировки</label>
            <select
              value={activeSectionId}
              onChange={(e) => {
                setActiveSectionId(e.target.value);
                setExpandedFloor(null);
                setEditingRoomId(null);
              }}
              className="w-full text-xs px-2.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800"
            >
              <option value="">-- Выбрать секцию --</option>
              {sections.map((s) => {
                const house = houses.find((h) => h.id === s.houseId);
                const obj = objects.find((o) => o.id === house?.objectId);
                return (
                  <option key={s.id} value={s.id}>
                    {obj?.name} ➔ {house?.name} ➔ {s.number}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Дерево этажей */}
          {activeSection ? (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-600 block">Этажи / Раскладка комнат:</div>

              <div className="divide-y divide-slate-150 border border-slate-200 rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
                {[...activeSection.floors]
                  .sort((a, b) => b.floorNumber - a.floorNumber)
                  .map((floor) => {
                    const isExpanded = expandedFloor === floor.floorNumber;

                    return (
                      <div key={floor.floorNumber} className="bg-white">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedFloor(isExpanded ? null : floor.floorNumber);
                            setEditingRoomId(null);
                          }}
                          className="w-full p-3.5 flex justify-between items-center hover:bg-slate-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                            <span className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wide">
                              {floor.floorNumber === -1 ? 'Подвал' : `${floor.floorNumber} ЭТАЖ`}
                            </span>
                          </div>
                          <span className="inline-block text-[11px] bg-slate-100/70 text-slate-500 px-2 py-0.5 rounded-full font-mono font-medium">
                            Помещений: {floor.rooms.length}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
                            
                            {/* Добавление комнаты */}
                            {!isAddingRoom ? (
                              <button
                                type="button"
                                onClick={() => setIsAddingRoom(true)}
                                className="px-3 py-1 bg-white border border-slate-300 hover:border-slate-800 rounded-lg text-[11px] font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-1 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Добавить помещение рук.
                              </button>
                            ) : (
                              <div className="bg-white p-3 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-2 align-middle">
                                <input
                                  type="text"
                                  placeholder="кв. 668а, Коридор 2..."
                                  value={newRoomName}
                                  onChange={(e) => setNewRoomName(e.target.value)}
                                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-md"
                                lobby-style-fix="true" />
                                <select
                                  value={newRoomType}
                                  onChange={(e) => setNewRoomType(e.target.value as RoomType)}
                                  className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
                                >
                                  {ALL_ROOM_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleCreateRoom(floor.floorNumber)}
                                    className="px-2.5 py-1 bg-slate-900 text-white text-[10px] uppercase font-bold rounded-md"
                                  >
                                    Ок
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsAddingRoom(false)}
                                    className="px-2.5 py-1 bg-slate-200 text-slate-600 text-[10px] uppercase font-bold rounded-md"
                                  >
                                    Х
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Список помещений на этаже */}
                            <div className="space-y-2">
                              {floor.rooms.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-2">На этом этаже пока нет помещений</p>
                              ) : (
                                floor.rooms.map((room) => {
                                  const isEditing = editingRoomId === room.id;

                                  return (
                                    <div key={room.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:shadow-xs transition-shadow">
                                      
                                      {isEditing ? (
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 min-w-0">
                                          <input
                                            type="text"
                                            value={editingRoomName}
                                            onChange={(e) => setEditingRoomName(e.target.value)}
                                            className="px-2 py-1 text-xs font-semibold text-slate-800 border border-slate-400 rounded-md bg-slate-50 w-full sm:w-36"
                                          />
                                          <select
                                            value={editingRoomType}
                                            onChange={(e) => setEditingRoomType(e.target.value as RoomType)}
                                            className="px-2 py-1 text-xs border border-slate-400 rounded-md bg-white w-full sm:w-auto"
                                          >
                                            {ALL_ROOM_TYPES.map((t) => (
                                              <option key={t} value={t}>{t}</option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : (
                                        <div className="min-w-0">
                                          <span className="text-xs font-bold text-slate-800 tracking-tight block">
                                            {room.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono font-medium block">
                                            Тип: {room.type}
                                          </span>
                                        </div>
                                      )}

                                      {/* Контролы */}
                                      <div className="flex justify-end gap-2 shrink-0">
                                        {isEditing ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveRoomChanges(floor.floorNumber)}
                                              className="p-1 px-2.5 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white rounded-md text-[10px] font-bold uppercase transition-colors flex items-center gap-0.5"
                                            >
                                              <Check className="w-3 h-3" />
                                              <span>Ок</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingRoomId(null)}
                                              className="p-1 px-2 bg-slate-200 border border-slate-200 rounded-md text-[10px] font-bold uppercase text-slate-600 transition-all"
                                            >
                                              Отмена
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditRoom(room)}
                                              className="p-1.5 border border-slate-200 hover:border-slate-800 bg-white rounded-md text-slate-600 hover:text-slate-900 transition-colors"
                                              title="Редактировать ячейку"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteRoom(floor.floorNumber, room.id)}
                                              className={`p-1.5 border rounded-md transition-all flex items-center gap-1 text-[9px] font-bold ${
                                                deletingRoomId === room.id
                                                  ? 'border-rose-500 bg-rose-600 text-white animate-pulse'
                                                  : 'border-slate-200 hover:border-rose-600 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600'
                                              }`}
                                              title={deletingRoomId === room.id ? "Повторите клик для удаления!" : "Удалить"}
                                            >
                                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                              {deletingRoomId === room.id && <span>Удалить?</span>}
                                            </button>
                                          </>
                                        )}
                                      </div>

                                    </div>
                                  );
                                })
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center">
              <HelpCircle className="w-8 h-8 text-slate-300 stroke-1 mb-2" />
              <p className="text-xs">Выберите ЖК и Секцию выше, чтобы подгрузить поэтажную разметку для ручных корректировок.</p>
            </div>
          )}

        </div>
      </div>
      
    </div>
  );
}