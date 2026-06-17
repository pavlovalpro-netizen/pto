/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Section, WorkType, Task, Room, RoomType } from '../types.ts';
import { RefreshCw, LayoutGrid, Info, Layers, ToggleLeft, ToggleRight, X, ChevronRight, FileList, Plus, Download } from 'lucide-react';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface ChessboardProps {
  section: Section;
  workTypes: WorkType[];
  tasks: Task[];
  allSections: Section[];
  onSelectTask: (task: Task) => void;
  onOpenMassTaskForm?: () => void;
}

export default function Chessboard({ section, workTypes, tasks, allSections, onSelectTask, onOpenMassTaskForm }: ChessboardProps) {
  // Режим отображения: 'project' (Основная ИД) или 'reclamation' (Рекламации)
  const [mode, setMode] = useState<'project' | 'reclamation'>('project');
  
  // Выбранная ячейка для всплывающего модального окна деталей этажа
  const [selectedCell, setSelectedCell] = useState<{
    floorNumber: number;
    workType: WorkType;
  } | null>(null);

  // Сортировка этажей снизу вверх (например, -1, 1, 2, 3...)
  const sortedFloors = [...section.floors].sort((a, b) => a.floorNumber - b.floorNumber);

  // Получить статусную характеристику ячейки
  const getCellStatus = (floorNumber: number, workType: WorkType) => {
    // 1. Проверяем, есть ли на этом этаже хоть одно помещение, к которому применим этот вид работ
    const floor = section.floors.find((f) => f.floorNumber === floorNumber);
    if (!floor) return { state: 'not_applicable' };

    const applicableRooms = floor.rooms.filter((r) =>
      workType.applicableEntityTypes.includes(r.type)
    );

    if (applicableRooms.length === 0) {
      return { state: 'not_applicable' }; // Прочерк "-"
    }

    // 2. Ищем задачи на этом этаже по этой работе
    const floorTasks = tasks.filter(
      (t) =>
        t.location &&
        t.location.sectionId === section.id &&
        t.workTypeId === workType.id &&
        (
          t.location.floorNumber === floorNumber ||
          (t.location.floorNumber === undefined && t.location.roomId === undefined && t.location.roomName && t.location.roomName.includes('Все этажи')) ||
          (t.location.floorNumber === undefined && t.location.roomName && t.location.roomName.includes('Типовые этажи') && floorNumber >= 2)
        )
    );

    // В зависимости от режима, смотрим либо Проект (тип 'main'), либо Рекламации (тип 'reclamation')
    const targetType = mode === 'project' ? 'main' : 'reclamation';
    const filteredTasks = floorTasks.filter((t) => t.type === targetType);

    if (filteredTasks.length === 0) {
      // Задач нет
      if (mode === 'reclamation') {
        // В режиме рекламации отсутствие задач означает нейтральный серый
        return { state: 'empty_rec', totalCount: 0 };
      }
      return { state: 'untouched', totalCount: 0 }; // Серый цвет
    }

    // 3. Вычисляем приоритет критичности статусов задач
    // СТАТУС 5 (Замечания технадзора) -> КРАСНЫЙ (Максимальный приоритет)
    if (filteredTasks.some((t) => t.status === 5)) {
      return { state: 'red', displayStatus: 5 };
    }

    // СТАТУС 3 (На проверке у Начальника ПТО) -> ОРАНЖЕВЫЙ
    if (filteredTasks.some((t) => t.status === 3)) {
      return { state: 'orange', displayStatus: 3 };
    }

    // СТАТУСЫ 1 (Назначена), 2 (В работе), 4, 6 -> ЖЕЛТЫЙ
    const yellowTasks = filteredTasks.filter((t) => [1, 2, 4, 6].includes(t.status));
    if (yellowTasks.length > 0) {
      const minStatus = Math.min(...yellowTasks.map(t => t.status));
      return { state: 'yellow', displayStatus: minStatus };
    }

    // Если все задачи находятся в статусе 7 (В архиве) -> ЗЕЛЕНЫЙ
    if (filteredTasks.length > 0 && filteredTasks.every((t) => t.status === 7)) {
      return { state: 'green', displayStatus: 7 };
    }

    return { state: 'untouched', displayStatus: 0 };
  };

  const getCellColorClass = (state: string) => {
    // В режиме рекламации основная сетка становится нейтрально-серой, а рекламации подсвечиваются яркими цветами
    if (mode === 'reclamation') {
      switch (state) {
        case 'red':
          return 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs';
        case 'orange':
          return 'bg-amber-500 hover:bg-amber-400 text-white shadow-xs';
        case 'yellow':
          return 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-xs'; // Фиолетовый/синий для активной рекламации
        case 'green':
          return 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs';
        case 'not_applicable':
          return 'bg-slate-100/70 text-slate-300 font-mono text-center cursor-not-allowed';
        default:
          return 'bg-slate-100 hover:bg-slate-200 text-slate-400';
      }
    }

    // Стандартный режим Проект
    switch (state) {
      case 'red':
        return 'bg-rose-600 hover:bg-rose-500 text-white shadow-inner font-semibold';
      case 'orange':
        return 'bg-orange-500 hover:bg-orange-400 text-white shadow-inner font-semibold';
      case 'yellow':
        return 'bg-amber-300 hover:bg-amber-200 text-slate-900 font-medium';
      case 'green':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-inner font-semibold';
      case 'not_applicable':
        return 'bg-slate-100/70 text-slate-300 font-mono text-center cursor-not-allowed';
      case 'untouched':
      default:
        return 'bg-slate-200 hover:bg-slate-300 text-slate-500';
    }
  };

  const getStatusLabelText = (task: Task) => {
    switch (task.status) {
      case 1:
        return 'Назначена';
      case 2:
        return 'В работе';
      case 3:
        return 'На проверке';
      case 4:
        return 'Передано технадзору';
      case 5:
        return 'Замечания технадзора';
      case 6:
        return 'На подписании';
      case 7:
        return 'В архиве (Сдано)';
      default:
        return 'Неизвестно';
    }
  };

  const getStatusBadgeStyle = (status: number) => {
    switch (status) {
      case 5:
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 3:
        return 'bg-orange-100 text-orange-850 border-orange-200';
      case 7:
        return 'bg-emerald-1100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    
    // --- Лист 1: Сводная шахматка (Текущая секция) ---
    const sheet1 = workbook.addWorksheet(`${section.number} - Шахматка`);
    
    // Заголовки (Этажи)
    const columns1 = [{ header: 'Технологические Работы ПТО', key: 'workType', width: 40 }];
    sortedFloors.forEach((fl) => {
      columns1.push({ header: fl.floorNumber === -1 ? 'Подвал' : `${fl.floorNumber} ЭТАЖ`, key: `floor_${fl.floorNumber}`, width: 12 });
    });
    sheet1.columns = columns1;
    
    // Стили заголовков
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    sheet1.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // Данные
    workTypes.forEach((wt) => {
      const rowData: any = { workType: wt.name };
      const rowColors: any = {};
      
      sortedFloors.forEach((fl) => {
        const cellInfo = getCellStatus(fl.floorNumber, wt);
        let val = '';
        if (cellInfo.state === 'not_applicable') val = '—';
        else if (cellInfo.state === 'untouched' || cellInfo.state === 'empty_rec') val = '0';
        else val = String(cellInfo.displayStatus || '');
        
        rowData[`floor_${fl.floorNumber}`] = val;
        
        let bgColor = 'FFF8FAFC'; // default / not applicable
        if (cellInfo.state === 'untouched' || cellInfo.state === 'empty_rec') bgColor = 'FFE2E8F0';
        else if (cellInfo.state === 'red') bgColor = 'FFE11D48';
        else if (cellInfo.state === 'orange') bgColor = 'FFF97316';
        else if (cellInfo.state === 'yellow') bgColor = 'FFFCD34D';
        else if (cellInfo.state === 'green') bgColor = 'FF059669';
        
        rowColors[`floor_${fl.floorNumber}`] = bgColor;
      });
      
      const addedRow = sheet1.addRow(rowData);
      
      // Применяем цвета к ячейкам
      sortedFloors.forEach((fl) => {
        const colNumber = sheet1.getColumn(`floor_${fl.floorNumber}`)?.number;
        if (!colNumber) return;
        const cell = addedRow.getCell(colNumber);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (rowColors[`floor_${fl.floorNumber}`]) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowColors[`floor_${fl.floorNumber}`] }
          };
          if (rowColors[`floor_${fl.floorNumber}`] === 'FFE11D48' || rowColors[`floor_${fl.floorNumber}`] === 'FFF97316' || rowColors[`floor_${fl.floorNumber}`] === 'FF059669') {
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
          } else {
             cell.font = { bold: true };
          }
        }
      });
    });

    // --- Лист 2: Сводка по всем секциям ---
    const sheet2 = workbook.addWorksheet('Сводка по всем секциям');
    sheet2.columns = [
      { header: 'Секция', key: 'sectionName', width: 20 },
      { header: 'Всего задач', key: 'total', width: 15 },
      { header: 'Назначено (1)', key: 's1', width: 15 },
      { header: 'В работе (2)', key: 's2', width: 15 },
      { header: 'На проверке (3)', key: 's3', width: 15 },
      { header: 'Технадзор (4)', key: 's4', width: 15 },
      { header: 'Замечания (5)', key: 's5', width: 15 },
      { header: 'На подписании (6)', key: 's6', width: 15 },
      { header: 'В архиве (7)', key: 's7', width: 15 },
    ];
    
    sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    
    const targetType = mode === 'project' ? 'main' : 'reclamation';
    allSections.forEach(sec => {
      const secTasks = tasks.filter(t => t.location?.sectionId === sec.id && t.type === targetType);
      
      sheet2.addRow({
        sectionName: sec.number,
        total: secTasks.length,
        s1: secTasks.filter(t => t.status === 1).length,
        s2: secTasks.filter(t => t.status === 2).length,
        s3: secTasks.filter(t => t.status === 3).length,
        s4: secTasks.filter(t => t.status === 4).length,
        s5: secTasks.filter(t => t.status === 5).length,
        s6: secTasks.filter(t => t.status === 6).length,
        s7: secTasks.filter(t => t.status === 7).length,
      });
    });

    // --- Лист 3: Легенда ---
    const sheet3 = workbook.addWorksheet('Легенда');
    sheet3.columns = [
      { header: 'Цвет', key: 'color', width: 25 },
      { header: 'Значение', key: 'desc', width: 50 },
      { header: 'Пример статуса', key: 'stat', width: 20 },
    ];
    sheet3.getRow(1).font = { bold: true };
    
    const legendData = [
      { color: 'Красный', desc: 'Замечания технадзора (Макс. приоритет)', stat: '5', hex: 'FFE11D48', fontWhite: true },
      { color: 'Оранжевый', desc: 'На проверке у ПТО', stat: '3', hex: 'FFF97316', fontWhite: true },
      { color: 'Желтый', desc: 'Назначена, В работе, На подписании', stat: '1, 2, 4, 6', hex: 'FFFCD34D', fontWhite: false },
      { color: 'Зеленый', desc: 'В архиве (Готово)', stat: '7', hex: 'FF059669', fontWhite: true },
      { color: 'Серый', desc: 'Задач нет (не приступали)', stat: '0', hex: 'FFE2E8F0', fontWhite: false },
    ];
    
    legendData.forEach(l => {
      const row = sheet3.addRow({ color: l.color, desc: l.desc, stat: l.stat });
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.hex } };
      if (l.fontWhite) {
        row.getCell(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }
    });

    // Скачивание
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Шахматка_${section.number}.xlsx`);
  };

  return (
    <div id="chessboard_root" className="space-y-6">
      
      {/* Шапка управления Шахматкой */}
      <div id="chessboard_toolbar" className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900 text-white rounded-xl shadow-md border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-800 rounded-lg text-slate-300">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white uppercase font-mono">{section.number} — Сводная Шахматка</h3>
            <p className="text-xs text-slate-400 mt-0.5">Визуализация хода согласования комплектов документов на этажах</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>

          {/* Переключатель Проект / Рекламации */}
          <div id="layer_mode_selector" className="flex items-center gap-2.5 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
            <button
            type="button"
            onClick={() => setMode('project')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              mode === 'project'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Проектная ИД
          </button>
          <button
            type="button"
            onClick={() => setMode('reclamation')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              mode === 'reclamation'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-rose-400'
            }`}
          >
            Рекламации
          </button>
        </div>
      </div>

      {/* Контейнер интерактивной таблицы с горизонтальным скроллом */}
      <div id="chessboard_matrix_wrapper" className="bg-white rounded-xl shadow-sm border border-slate-250 overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="sticky left-0 z-10 p-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider font-mono bg-slate-100 w-64 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                Технологические Работы ПТО
              </th>
              {sortedFloors.map((fl) => (
                <th
                  key={fl.floorNumber}
                  className="p-3.5 text-center text-xs font-bold text-slate-500 uppercase tracking-widest font-mono border-r border-slate-200 min-w-[75px]"
                >
                  {fl.floorNumber === -1 ? 'Подвал' : `${fl.floorNumber} ЭТАЖ`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150">
            {workTypes.map((wt) => (
              <tr key={wt.id} className="hover:bg-slate-50/50">
                
                {/* Левый столбец работы */}
                <td className="sticky left-0 z-10 p-3 text-sm font-semibold text-slate-800 bg-white border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <div className="line-clamp-2" title={wt.name}>
                    {wt.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wt.applicableEntityTypes.slice(0, 3).map((item, idx) => (
                      <span key={idx} className="inline-block text-[9px] bg-slate-105 text-slate-500 px-1 py-0.2 rounded-sm font-mono leading-none">
                        {item}
                      </span>
                    ))}
                    {wt.applicableEntityTypes.length > 3 && (
                      <span className="inline-block text-[9px] text-slate-400 px-0.5 font-mono leading-none">
                        +{wt.applicableEntityTypes.length - 3}
                      </span>
                    )}
                  </div>
                </td>

                {/* Ячейки этажей */}
                {sortedFloors.map((fl) => {
                  const cellInfo = getCellStatus(fl.floorNumber, wt);
                  const isApp = cellInfo.state !== 'not_applicable';

                  return (
                    <td
                      key={fl.floorNumber}
                      onClick={() => isApp && setSelectedCell({ floorNumber: fl.floorNumber, workType: wt })}
                      className={`p-2 border-r border-slate-180 text-center transition-all ${
                        isApp ? 'cursor-pointer select-none font-sans font-medium' : ''
                      } ${getCellColorClass(cellInfo.state)}`}
                    >
                      {cellInfo.state === 'not_applicable' ? (
                        <span className="text-slate-300 font-bold block">—</span>
                      ) : cellInfo.state === 'untouched' || cellInfo.state === 'empty_rec' ? (
                        <span className="text-[10px] font-bold block tracking-tight font-mono text-slate-300">0</span>
                      ) : (
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-xs font-bold block">
                            {cellInfo.displayStatus}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Сноска с легендой цветов */}
      <div id="chessboard_colors_legend" className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-5 gap-3.5 text-xs text-slate-600 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-rose-600 shadow-xs"></div>
          <span>Замечания технадзора (Красный)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-orange-500 shadow-xs"></div>
          <span>На проверке у ПТО (Оранжевый)</span>
        </div>
        {mode === 'reclamation' ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-indigo-500 shadow-xs"></div>
            <span>Активная рекламация (Фиолетовый)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-amber-300 shadow-xs"></div>
            <span>В работе / Назначено (Желтый)</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-emerald-600 shadow-xs"></div>
          <span>Все сдано в архив (Зеленый)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-slate-200 text-center text-[10px] font-bold">0</div>
          <span>Задачи не нарезались (Серый)</span>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ЭТАЖА ПРИ КЛИКЕ НА ЯЧЕЙКУ (6.3) */}
      {selectedCell && (() => {
        const { floorNumber, workType } = selectedCell;

        // Помещения на этом этаже, применимые к виду работ
        const floor = section.floors.find((f) => f.floorNumber === floorNumber);
        const applicableRooms = floor?.rooms.filter((r) =>
          workType.applicableEntityTypes.includes(r.type)
        ) || [];

        const targetType = mode === 'project' ? 'main' : 'reclamation';
        // Задачи по этой работе на этаже
        const floorTasks = tasks.filter(
          (t) =>
            t.location &&
            t.location.sectionId === section.id &&
            t.workTypeId === workType.id &&
            t.type === targetType &&
            (
              t.location.floorNumber === floorNumber ||
              (t.location.floorNumber === undefined && t.location.roomId === undefined && t.location.roomName && t.location.roomName.includes('Все этажи')) ||
              (t.location.floorNumber === undefined && t.location.roomName && t.location.roomName.includes('Типовые этажи') && floorNumber >= 2)
            )
        );

        return (
          <div id="flyout_modal_backdrop" className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div id="flyout_modal_container" className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
              
              <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-bold tracking-tight uppercase font-mono">Детализация этажа: {floorNumber === -1 ? 'Подвал' : `${floorNumber} этаж`}</h4>
                  <p className="text-xs text-slate-300">{workType.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Список помещений и их статусов */}
              <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono border-b border-slate-100 pb-1.5 flex justify-between">
                  <span>Помещение / Локация</span>
                  <span>Статус комплекта ИД</span>
                </div>

                {applicableRooms.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Нет подходящих типов помещений для этого вида работ.</p>
                ) : (
                  applicableRooms.map((room) => {
                    // Ищем точечную задачу на конкретную комнату в первую очередь, иначе берем общую этажную/секционную задачу
                    let task = floorTasks.find((t) => t.location?.roomId === room.id);
                    if (!task) {
                      task = floorTasks.find((t) => t.location?.roomId === undefined);
                    }

                    return (
                      <div
                        key={room.id}
                        className={`p-3 border rounded-lg flex items-center justify-between transition-all ${
                          task 
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-slate-350 cursor-pointer' 
                          : 'bg-slate-100/50 border-slate-200 opacity-60'
                        }`}
                        onClick={() => {
                          if (task) {
                            onSelectTask(task);
                            setSelectedCell(null);
                          }
                        }}
                      >
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-900 tracking-tight block">
                            {room.name}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase font-mono block">
                            {room.type}
                          </span>
                        </div>

                        <div>
                          {task ? (
                            <div className="flex items-center gap-1.55">
                              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md border tracking-tight ${getStatusBadgeStyle(task.status)}`}>
                                {getStatusLabelText(task)}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-slate-400 font-mono">
                              Задача не нарезалась
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-150 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-lg transition-colors"
                >
                  Закрыть
                </button>
              </div>

            </div>
          </div>
        );
      })()}
      
    </div>
  );
}
