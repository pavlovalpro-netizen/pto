/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ServerDB, dbEvents } from './server/db.ts';
import { Task, TaskChecklistItem, TaskComment, Room, Section, Invite, User, RoomType, TaskType, PTONotification } from './src/types.ts';

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function getRussianTimestamp(): string {
  const d = new Date();
  // Сделаем поправку на московское время или оставим UTC, но в красивом формате
  const date = padZero(d.getDate());
  const month = padZero(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = padZero(d.getHours());
  const minutes = padZero(d.getMinutes());
  return `${date}.${month}.${year} ${hours}:${minutes}`;
}

function addNotification(
  state: any,
  sender: { name: string; email: string },
  recipientEmail: string,
  text: string,
  taskId?: string,
  taskTitle?: string
) {
  if (!state.notifications) {
    state.notifications = [];
  }
  const newNotif: PTONotification = {
    id: 'notif_' + Math.random().toString(36).substring(2, 9),
    senderName: sender.name,
    senderEmail: sender.email,
    recipientEmail: recipientEmail,
    taskId,
    taskTitle,
    text,
    createdAt: new Date().toISOString(),
    isRead: false,
  };
  state.notifications.push(newNotif);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Парсинг JSON
  app.use(express.json());

  // Логирование запросов API
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API ${req.method}] ${req.path}`);
    }
    next();
  });

  // API РОУТЫ

  // 1. Получение текущего состояния базы данных и профиля текущего пользователя
  app.get('/api/state', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const state = ServerDB.get();
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Очистка состояния: стирание объектов, домов, секций и всех заведенных задач
  app.post('/api/state/reset', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const state = ServerDB.get();
      state.objects = [];
      state.houses = [];
      state.sections = [];
      state.tasks = [];
      // Оставляем пользователей (users) и приглашения (invites), чтобы не поломать текущую активную сессию
      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Добавление/выбор объекта
  app.post('/api/objects/create', (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Имя объекта обязательно' });

      const state = ServerDB.get();
      const id = 'obj_' + Math.random().toString(36).substring(2, 9);
      const newObj = { id, name };
      state.objects.push(newObj);
      ServerDB.save(state);

      res.json(newObj);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Удаление объекта (Только если он не используется в шахматке)
  app.post('/api/objects/delete', (req, res) => {
    try {
      const { objectId } = req.body;
      if (!objectId) return res.status(400).json({ error: 'ID объекта не предоставлен' });

      const state = ServerDB.get();

      // Найти все дома этого объекта
      const objHouses = state.houses.filter((h) => h.objectId === objectId);
      const houseIds = objHouses.map((h) => h.id);

      // Проверить, есть ли секции у этих домов
      const hasSections = state.sections.some((s) => houseIds.includes(s.houseId));
      
      // Проверить, есть ли задачи у этого объекта
      const hasTasks = state.tasks.some((t) => t.location && t.location.objectId === objectId);

      if (hasSections || hasTasks) {
        return res.status(400).json({
          error: 'Нельзя удалить этот объект, так как он используется в шахматке (имеет сгенерированные секции) или к нему привязаны задачи!'
        });
      }

      // Если ограничений нет, удаляем сам объект и все пустые дома, привязанные к нему
      state.objects = state.objects.filter((o) => o.id !== objectId);
      state.houses = state.houses.filter((h) => h.objectId !== objectId);

      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Добавление дома
  app.post('/api/houses/create', (req, res) => {
    try {
      const { objectId, name } = req.body;
      if (!objectId || !name) return res.status(400).json({ error: 'Не все поля заполнены' });

      const state = ServerDB.get();
      const id = 'house_' + Math.random().toString(36).substring(2, 9);
      const newHouse = { id, objectId, name };
      state.houses.push(newHouse);
      ServerDB.save(state);

      res.json(newHouse);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. КОНСТРУКТОР СЕКЦИЙ (Генератор этажей и геометрии дома с автонумерацией квартир)
  app.post('/api/geometry/generate', (req, res) => {
    try {
      const {
        objectId,
        houseId,
        sectionNumber, // например "Секция 6"
        startFloor,    // например -1
        endFloor,      // например 17
        floorTemplates, // массив настроек по этажам { minFloor, maxFloor, compositions: { type: RoomType, qty: number }[] }
        flatStartNum,  // стартовый сквозной номер квартир, например 662
        flatStartFloor // с какого этажа начинать нумерацию квартир, например 1
      } = req.body;

      if (!objectId || !houseId || !sectionNumber || startFloor === undefined || endFloor === undefined) {
        return res.status(400).json({ error: 'Недостаточно параметров для генерации структуры' });
      }

      const state = ServerDB.get();

      // Сформируем ID секции
      const sectionId = `${objectId}_${houseId}_sec_${Math.random().toString(36).substring(2, 6)}`;

      const floorsList: { floorNumber: number; rooms: Room[] }[] = [];
      let currentFlatNum = flatStartNum ? parseInt(flatStartNum, 10) : 1;
      const startFlatFloorNum = flatStartFloor !== undefined ? parseInt(flatStartFloor, 10) : 1;

      // Цикл снизу вверх по этажам (пропуская нулевой этаж в строительной сетке)
      for (let f = parseInt(startFloor, 10); f <= parseInt(endFloor, 10); f++) {
        if (f === 0) continue; // В российской строительной сетке нулевого этажа не существует! Идет подвал (-1), а затем сразу 1 этаж.
        // Ищем подходящий шаблон по этажу
        const matchedTemplate = floorTemplates?.find((t: any) => f >= t.minFloor && f <= t.maxFloor);
        const roomsList: Room[] = [];

        // Стандартные лестницы / холлы / коридоры ПТО (если шаблона нет, сделаем базовые МОПы)
        if (matchedTemplate && matchedTemplate.compositions) {
          matchedTemplate.compositions.forEach((comp: any) => {
            const { type, qty } = comp;
            const quantity = parseInt(qty, 10) || 0;

            for (let i = 1; i <= quantity; i++) {
              let name = '';
              const roomId = `${sectionId}_f${f}_${type}_${i}_${Math.random().toString(36).substring(2, 5)}`;

              if (type === 'Квартира') {
                if (f >= startFlatFloorNum) {
                  name = `кв. ${currentFlatNum}`;
                  currentFlatNum++;
                } else {
                  name = `кв. (резерв)`;
                }
              } else if (type === 'Кладовая') {
                name = `Кладовая Кл-${i}`;
              } else if (type === 'Подвал / Техпомещение') {
                name = `Техпомещение ${i}`;
              } else if (type === 'Коммерция') {
                name = `Коммерция ${i}`;
              } else if (type === 'ЛХ') {
                name = `Лифтовой холл ${f}э`;
              } else if (type === 'ЛК') {
                name = `Лестничная клетка ЛК-1 (${f}э)`;
              } else if (type === 'Коридор МОП') {
                name = `Коридор МОП ${f}э`;
              } else if (type === 'Вестибюль') {
                name = `Вестибюль`;
              } else if (type === 'Тамбур') {
                name = `Тамбур`;
              } else if (type === 'Колясочная') {
                name = `Колясочная`;
              } else {
                name = `${type} ${i}`;
              }

              roomsList.push({
                id: roomId,
                type,
                name,
                floorNumber: f,
              });
            }
          });
        } else {
          // Если шаблон не задан, сгенерируем дефолтный ЛК и ЛХ
          roomsList.push({
            id: `${sectionId}_f${f}_LK_1`,
            type: 'ЛК',
            name: `Лестничная клетка ЛК (${f}э)`,
            floorNumber: f,
          });
          roomsList.push({
            id: `${sectionId}_f${f}_LH_1`,
            type: 'ЛХ',
            name: `Лифтовой холл (${f}э)`,
            floorNumber: f,
          });
        }

        floorsList.push({
          floorNumber: f,
          rooms: roomsList,
        });
      }

      const newSection: Section = {
        id: sectionId,
        houseId,
        number: sectionNumber,
        startFloor: parseInt(startFloor, 10),
        endFloor: parseInt(endFloor, 10),
        floors: floorsList,
      };

      state.sections.push(newSection);
      ServerDB.save(state);

      res.json(newSection);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Удаление секции (Только если нет привязанных задач)
  app.post('/api/sections/delete', (req, res) => {
    try {
      const { sectionId } = req.body;
      if (!sectionId) return res.status(400).json({ error: 'ID секции не предоставлен' });

      const state = ServerDB.get();

      // Проверить, есть ли задачи у этой секции
      const hasTasks = state.tasks.some((t) => t.location && t.location.sectionId === sectionId);

      if (hasTasks) {
        return res.status(400).json({
          error: 'Нельзя удалить эту секцию, так как к ней привязаны задачи в шахматке!'
        });
      }

      // Удаляем секцию
      state.sections = state.sections.filter((s) => s.id !== sectionId);

      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5. РУЧНАЯ КОРРЕКТИРОВКА РАЗМЕТКИ ПОМЕЩЕНИЙ
  // Обновление конкретного помещения (переименование/тип)
  app.post('/api/geometry/room/update', (req, res) => {
    try {
      const { sectionId, floorNumber, roomId, name, type } = req.body;
      if (!sectionId || floorNumber === undefined || !roomId) {
        return res.status(400).json({ error: 'Недостаточно данных для обновления' });
      }

      const state = ServerDB.get();
      const sec = state.sections.find((s) => s.id === sectionId);
      if (!sec) return res.status(404).json({ error: 'Секция не найдена' });

      const fl = sec.floors.find((f) => f.floorNumber === parseInt(floorNumber, 10));
      if (!fl) return res.status(404).json({ error: 'Этаж не найден' });

      const room = fl.rooms.find((r) => r.id === roomId);
      if (!room) return res.status(404).json({ error: 'Помещение не найдено' });

      if (name) room.name = name;
      if (type) room.type = type as RoomType;

      // Также обновим денормализованные имена помещений в задачах, если они есть
      state.tasks.forEach((t) => {
        if (t.location && t.location.roomId === roomId) {
          t.location.roomName = room.name;
          t.location.roomType = room.type;
        }
      });

      ServerDB.save(state);
      res.json({ success: true, room });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Удаление помещения рукопашную
  app.post('/api/geometry/room/delete', (req, res) => {
    try {
      const { sectionId, floorNumber, roomId } = req.body;
      if (!sectionId || floorNumber === undefined || !roomId) {
        return res.status(400).json({ error: 'Параметры не предоставлены' });
      }

      const state = ServerDB.get();
      const sec = state.sections.find((s) => s.id === sectionId);
      if (!sec) return res.status(404).json({ error: 'Секция не найдена' });

      const fl = sec.floors.find((f) => f.floorNumber === parseInt(floorNumber, 10));
      if (!fl) return res.status(404).json({ error: 'Этаж не найден' });

      fl.rooms = fl.rooms.filter((r) => r.id !== roomId);

      // Удалим задачи, ассоциированные с этим удаленным помещением
      state.tasks = state.tasks.filter((t) => !t.location || t.location.roomId !== roomId);

      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Добавление единичного помещения руками
  app.post('/api/geometry/room/create', (req, res) => {
    try {
      const { sectionId, floorNumber, name, type } = req.body;
      if (!sectionId || floorNumber === undefined || !name || !type) {
        return res.status(400).json({ error: 'Не все поля заполнены' });
      }

      const state = ServerDB.get();
      const sec = state.sections.find((s) => s.id === sectionId);
      if (!sec) return res.status(404).json({ error: 'Секция не найдена' });

      const fl = sec.floors.find((f) => f.floorNumber === parseInt(floorNumber, 10));
      if (!fl) return res.status(404).json({ error: 'Этаж не найден' });

      const roomId = `${sectionId}_f${floorNumber}_manual_${Math.random().toString(36).substring(2, 7)}`;
      const newRoom: Room = {
        id: roomId,
        type: type as RoomType,
        name,
        floorNumber: parseInt(floorNumber, 10),
      };

      fl.rooms.push(newRoom);
      ServerDB.save(state);

      res.json({ success: true, room: newRoom });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. СПРАВОЧНИКИ РАБОТ И СТАТУСОВ
  // Обновление применимости вида работ
  app.post('/api/worktypes/update', (req, res) => {
    try {
      const { workTypeId, applicableEntityTypes, checklistTemplates } = req.body;
      if (!workTypeId) return res.status(400).json({ error: 'Идентификатор работы отсутствует' });

      const state = ServerDB.get();
      const wt = state.workTypes.find((w) => w.id === workTypeId);
      if (!wt) return res.status(404).json({ error: 'Вид работы не найден' });

      if (applicableEntityTypes !== undefined) {
        wt.applicableEntityTypes = applicableEntityTypes;
      }
      if (checklistTemplates !== undefined) {
        wt.checklistTemplates = checklistTemplates;
      }

      ServerDB.save(state);
      res.json({ success: true, workType: wt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Создание вида работы
  app.post('/api/worktypes/create', (req, res) => {
    try {
      const { name, applicableEntityTypes, checklistTemplates } = req.body;
      if (!name) return res.status(400).json({ error: 'Название работы отсутствует' });

      const state = ServerDB.get();
      const id = `wt_${Math.random().toString(36).substring(2, 7)}`;
      const newWt = {
        id,
        name,
        applicableEntityTypes: applicableEntityTypes || [],
        checklistTemplates: checklistTemplates || [],
      };

      state.workTypes.push(newWt);
      ServerDB.save(state);

      res.json({ success: true, id, workType: newWt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Удаление вида работы
  app.post('/api/worktypes/delete', (req, res) => {
    try {
      const { workTypeId } = req.body;
      if (!workTypeId) return res.status(400).json({ error: 'Идентификатор работы отсутствует' });

      const state = ServerDB.get();
      // Проверяем, задействован ли вид работы
      const isWorkTypeUsed = state.tasks.some((t) => t.workTypeId === workTypeId);
      if (isWorkTypeUsed) {
        return res.status(400).json({ error: 'Этот вид работы сейчас задействован в ПТО-задачах и не может быть удален!' });
      }

      state.workTypes = state.workTypes.filter((wt) => wt.id !== workTypeId);
      ServerDB.save(state);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 7. СОЗДАНИЕ МАССОВЫХ АТОМАРНЫХ ИЛИ ГРУППИРОВАННЫХ ЗАДАЧ
  app.post('/api/tasks/create-mass', (req, res) => {
    try {
      const {
        type,            // 'main' | 'reclamation' | 'general'
        objectId,
        houseId,
        sectionIds,      // массив ID секций
        selectionScope,  // 'all' | 'apartments' | 'mop' | 'manual'
        mopType,         // конкретный тип МОП, например 'ЛХ'
        manualRooms,     // список Room ID при 'manual'
        workTypeId,
        executorEmail,   // email исполнителя
        deadline,
        driveFolderUrl,  // URL общей папки
        reclamationCause,
        reclamationDescription,
        startFloorFilter, // Начальный этаж диапазона
        endFloorFilter,   // Конечный этаж диапазона
        grouping,        // 'room' | 'floor' | 'section'
      } = req.body;

      // Определение режима группировки по умолчанию
      const groupingMode = grouping || 'room';

      if (type === 'general') {
        const { title } = req.body;
        const state = ServerDB.get();
        // Проверим исполнителя
        const executor = state.users.find((u) => u.email === executorEmail) || {
          name: executorEmail.split('@')[0],
          email: executorEmail,
        };

        const checklist = [
          { id: `chk_${Math.random().toString(36).substring(2, 6)}_1`, name: '1. Выполнение поручения', isCompleted: false, driveUrl: '', comments: [] },
          { id: `chk_${Math.random().toString(36).substring(2, 6)}_2`, name: '2. Сдача результатов', isCompleted: false, driveUrl: '', comments: [] }
        ];

        // Опциональная привязка локации для фильтрации
        let taskLocation = null;
        if (objectId && objectId !== 'general') {
          const matchedObj = state.objects.find((o) => o.id === objectId);
          if (matchedObj) {
            let roomNameForGeneral = `Объект: ${matchedObj.name}`;
            let sectionNumberForGeneral = undefined;
            
            if (sectionIds && sectionIds.length > 0 && sectionIds[0] !== 'general') {
              const sec = state.sections.find((s) => s.id === sectionIds[0]);
              if (sec) {
                roomNameForGeneral = `${matchedObj.name}, секция ${sec.number}`;
                sectionNumberForGeneral = sec.number;
              }
            }
            
            taskLocation = {
              objectId,
              objectName: matchedObj.name,
              houseId: houseId || undefined,
              houseName: undefined,
              sectionId: (sectionIds && sectionIds[0]) || undefined,
              sectionNumber: sectionNumberForGeneral,
              floorNumber: undefined,
              roomId: undefined,
              roomName: roomNameForGeneral,
              roomType: undefined,
            };
          }
        }

        const taskId = `general_task_${Math.random().toString(36).substring(2, 9)}`;
        const newTask: Task = {
          id: taskId,
          type: 'general',
          location: taskLocation,
          workTypeId: 'general_task',
          workTypeName: title || 'Личная задача',
          executorName: executor.name,
          executorEmail: executor.email,
          status: 1,
          deadline: deadline || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          driveFolderUrl: driveFolderUrl || '',
          checklist,
          reclamationDescription: reclamationDescription || 'Личное / общее поручение',
          createdAt: new Date().toISOString(),
        };

        state.tasks.push(newTask);

        // Оповещение инженера о новом общем поручении
        const directorUser = state.users.find((u) => u.role === 'director') || { name: 'Начальник ПТО', email: 'pavlov.alpro@gmail.com' };
        addNotification(
          state,
          directorUser,
          newTask.executorEmail,
          `Вам назначено новое поручение: "${newTask.workTypeName}". Срок до ${newTask.deadline}.`,
          newTask.id,
          newTask.workTypeName
        );

        ServerDB.save(state);
        return res.json({ success: true, countCreated: 1, tasks: [newTask] });
      }

      if (!objectId || !houseId || !sectionIds || sectionIds.length === 0 || !workTypeId || !executorEmail) {
        return res.status(400).json({ error: 'Не все обязательные параметры для нарезки задач переданы' });
      }

      const state = ServerDB.get();

      // Проверим исполнителя
      const executor = state.users.find((u) => u.email === executorEmail) || {
        name: executorEmail.split('@')[0],
        email: executorEmail,
      };

      // Проверим вид работ и его применимость
      const workType = state.workTypes.find((wt) => wt.id === workTypeId);
      if (!workType) return res.status(404).json({ error: 'Вид работы не найден в справочнике' });

      const matchedObjects = state.objects.find((o) => o.id === objectId);
      const matchedHouse = state.houses.find((h) => h.id === houseId);
      const objName = matchedObjects ? matchedObjects.name : 'Unknown';
      const houseName = matchedHouse ? matchedHouse.name : 'Unknown';

      const generatedTasks: Task[] = [];
      let countCreated = 0;
      let countSkippedDueToMatrix = 0;

      // Проходимся по каждой выбранной секции
      sectionIds.forEach((secId: string) => {
        const sec = state.sections.find((s) => s.id === secId);
        if (!sec) return;

        if (groupingMode === 'section') {
          // --- ГРУППИРОВКА ПО СЕКЦИЯМ (1 задача на всю Секцию + диапазон этажей) ---
          const matchingRoomsInCabinet: Array<{ floorNum: number; room: Room }> = [];

          sec.floors.forEach((fl) => {
            // Проверка этажей
            if (startFloorFilter !== undefined && startFloorFilter !== null && startFloorFilter !== '') {
              const minF = parseInt(startFloorFilter, 10);
              if (!isNaN(minF) && fl.floorNumber < minF) return;
            }
            if (endFloorFilter !== undefined && endFloorFilter !== null && endFloorFilter !== '') {
              const maxF = parseInt(endFloorFilter, 10);
              if (!isNaN(maxF) && fl.floorNumber > maxF) return;
            }

            fl.rooms.forEach((room) => {
              let matchesScope = false;
              if (selectionScope === 'all') {
                matchesScope = true;
              } else if (selectionScope === 'apartments') {
                matchesScope = room.type === 'Квартира';
              } else if (selectionScope === 'mop') {
                matchesScope = room.type === mopType;
              } else if (selectionScope === 'manual') {
                matchesScope = manualRooms?.includes(room.id);
              }

              if (matchesScope) {
                // Проверяем применимость к виду работы
                if (workType.applicableEntityTypes.includes(room.type)) {
                  matchingRoomsInCabinet.push({ floorNum: fl.floorNumber, room });
                } else {
                  countSkippedDueToMatrix++;
                }
              }
            });
          });

          if (matchingRoomsInCabinet.length === 0) return;

          // Проверка дублей на секцию
          if (type === 'main') {
            const alreadyExists = state.tasks.some(
              (t) =>
                t.type === 'main' &&
                t.location &&
                t.location.sectionId === secId &&
                t.location.floorNumber === undefined &&
                t.location.roomId === undefined &&
                t.workTypeId === workTypeId
            );
            if (alreadyExists) return;
          }

          // Генерируем чек-лист напрямую из шаблонов, без умножения на квартиры
          const checklist: TaskChecklistItem[] = workType.checklistTemplates.map((templateName, index) => ({
            id: `chk_sec_${index}_${Math.random().toString(36).substring(2, 5)}`,
            name: templateName,
            isCompleted: false,
            driveUrl: '',
            comments: [],
          }));

          const taskId = `${type}_task_sec_${Math.random().toString(36).substring(2, 9)}`;
          const newTask: Task = {
            id: taskId,
            type: type as TaskType,
            location: {
              objectId,
              objectName: objName,
              houseId,
              houseName: houseName,
              sectionId: secId,
              sectionNumber: sec.number,
              floorNumber: undefined, // Секционная задача не привязана к конкретному этажу
              roomId: undefined,
              roomName: `Все этажи секции ${sec.number}`,
              roomType: undefined,
            },
            workTypeId,
            workTypeName: workType.name,
            executorName: executor.name,
            executorEmail: executor.email,
            status: 1,
            deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            driveFolderUrl: driveFolderUrl || '',
            checklist,
            createdAt: new Date().toISOString(),
          };

          if (type === 'reclamation') {
            newTask.reclamationCause = reclamationCause || 'Брак';
            newTask.reclamationDescription = reclamationDescription || 'Массовая рекламация на секцию';
          }

          state.tasks.push(newTask);
          generatedTasks.push(newTask);
          countCreated++;

        } else if (groupingMode === 'typical-floors') {
          // --- ГРУППИРОВКА ПО ТИПОВЫМ ЭТАЖАМ (Подвал отдельно, 1 этаж отдельно, все типовые вместе) ---
          const filteredFloors = sec.floors.filter((fl) => {
            if (startFloorFilter !== undefined && startFloorFilter !== null && startFloorFilter !== '') {
              const minF = parseInt(startFloorFilter, 10);
              if (!isNaN(minF) && fl.floorNumber < minF) return false;
            }
            if (endFloorFilter !== undefined && endFloorFilter !== null && endFloorFilter !== '') {
              const maxF = parseInt(endFloorFilter, 10);
              if (!isNaN(maxF) && fl.floorNumber > maxF) return false;
            }
            return true;
          });

          const basementFloors = filteredFloors.filter(fl => fl.floorNumber <= 0);
          const firstFloors = filteredFloors.filter(fl => fl.floorNumber === 1);
          const typicalFloors = filteredFloors.filter(fl => fl.floorNumber >= 2);

          const createGroupedTaskForFloors = (groupFloors: typeof filteredFloors, nameSuffix: string, isTypical: boolean) => {
            const matchingRooms: Array<{ floorNum: number; room: Room }> = [];
            groupFloors.forEach((fl) => {
              fl.rooms.forEach((room) => {
                let matchesScope = false;
                if (selectionScope === 'all') {
                  matchesScope = true;
                } else if (selectionScope === 'apartments') {
                  matchesScope = room.type === 'Квартира';
                } else if (selectionScope === 'mop') {
                  matchesScope = room.type === mopType;
                } else if (selectionScope === 'manual') {
                  matchesScope = manualRooms?.includes(room.id);
                }

                if (matchesScope) {
                  if (workType.applicableEntityTypes.includes(room.type)) {
                    matchingRooms.push({ floorNum: fl.floorNumber, room });
                  } else {
                    countSkippedDueToMatrix++;
                  }
                }
              });
            });

            if (matchingRooms.length === 0) return;

            // Проверка дублей
            if (type === 'main') {
              const alreadyExists = state.tasks.some(
                (t) =>
                  t.type === 'main' &&
                  t.location &&
                  t.location.sectionId === secId &&
                  t.location.roomName === nameSuffix &&
                  t.workTypeId === workTypeId
              );
              if (alreadyExists) return;
            }

            // Генерируем чек-лист напрямую из шаблонов, без умножения на квартиры
            const checklist: TaskChecklistItem[] = workType.checklistTemplates.map((templateName, index) => ({
              id: `chk_typ_${index}_${Math.random().toString(36).substring(2, 5)}`,
              name: templateName,
              isCompleted: false,
              driveUrl: '',
              comments: [],
            }));

            const taskId = `${type}_task_typ_${Math.random().toString(36).substring(2, 9)}`;
            const newTask: Task = {
              id: taskId,
              type: type as TaskType,
              location: {
                objectId,
                objectName: objName,
                houseId,
                houseName: houseName,
                sectionId: secId,
                sectionNumber: sec.number,
                floorNumber: isTypical ? undefined : groupFloors[0]?.floorNumber,
                roomId: undefined,
                roomName: nameSuffix,
                roomType: undefined,
              },
              workTypeId,
              workTypeName: workType.name,
              executorName: executor.name,
              executorEmail: executor.email,
              status: 1,
              deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              driveFolderUrl: driveFolderUrl || '',
              checklist,
              createdAt: new Date().toISOString(),
            };

            if (type === 'reclamation') {
              newTask.reclamationCause = reclamationCause || 'Брак';
              newTask.reclamationDescription = reclamationDescription || `Массовая рекламация (${nameSuffix})`;
            }

            state.tasks.push(newTask);
            generatedTasks.push(newTask);
            countCreated++;
          };

          basementFloors.forEach(fl => {
            createGroupedTaskForFloors([fl], `Подвал (${fl.floorNumber} эт.)`, false);
          });

          if (firstFloors.length > 0) {
            createGroupedTaskForFloors(firstFloors, '1 этаж', false);
          }

          if (typicalFloors.length > 0) {
            const minTyp = Math.min(...typicalFloors.map(f => f.floorNumber));
            const maxTyp = Math.max(...typicalFloors.map(f => f.floorNumber));
            createGroupedTaskForFloors(typicalFloors, `Типовые этажи (${minTyp}-${maxTyp})`, true);
          }

        } else if (groupingMode === 'floor') {
          // --- ГРУППИРОВКА ПО ЭТАЖАМ (1 задача на 1 этаж) ---
          sec.floors.forEach((fl) => {
            // Проверка этажей
            if (startFloorFilter !== undefined && startFloorFilter !== null && startFloorFilter !== '') {
              const minF = parseInt(startFloorFilter, 10);
              if (!isNaN(minF) && fl.floorNumber < minF) return;
            }
            if (endFloorFilter !== undefined && endFloorFilter !== null && endFloorFilter !== '') {
              const maxF = parseInt(endFloorFilter, 10);
              if (!isNaN(maxF) && fl.floorNumber > maxF) return;
            }

            const matchingRoomsOnFloor: Room[] = [];
            fl.rooms.forEach((room) => {
              let matchesScope = false;
              if (selectionScope === 'all') {
                matchesScope = true;
              } else if (selectionScope === 'apartments') {
                matchesScope = room.type === 'Квартира';
              } else if (selectionScope === 'mop') {
                matchesScope = room.type === mopType;
              } else if (selectionScope === 'manual') {
                matchesScope = manualRooms?.includes(room.id);
              }

              if (matchesScope) {
                if (workType.applicableEntityTypes.includes(room.type)) {
                  matchingRoomsOnFloor.push(room);
                } else {
                  countSkippedDueToMatrix++;
                }
              }
            });

            if (matchingRoomsOnFloor.length === 0) return;

            // Проверка дублей на этаж
            if (type === 'main') {
              const alreadyExists = state.tasks.some(
                (t) =>
                  t.type === 'main' &&
                  t.location &&
                  t.location.sectionId === secId &&
                  t.location.floorNumber === fl.floorNumber &&
                  t.location.roomId === undefined &&
                  t.workTypeId === workTypeId
              );
              if (alreadyExists) return;
            }

            // Генерируем чек-лист напрямую из шаблонов, без умножения на квартиры
            const checklist: TaskChecklistItem[] = workType.checklistTemplates.map((templateName, index) => ({
              id: `chk_fl_${index}_${Math.random().toString(36).substring(2, 5)}`,
              name: templateName,
              isCompleted: false,
              driveUrl: '',
              comments: [],
            }));

            const taskId = `${type}_task_fl_${Math.random().toString(36).substring(2, 9)}`;
            const newTask: Task = {
              id: taskId,
              type: type as TaskType,
              location: {
                objectId,
                objectName: objName,
                houseId,
                houseName: houseName,
                sectionId: secId,
                sectionNumber: sec.number,
                floorNumber: fl.floorNumber,
                roomId: undefined,
                roomName: `Все помещения этажа`,
                roomType: undefined,
              },
              workTypeId,
              workTypeName: workType.name,
              executorName: executor.name,
              executorEmail: executor.email,
              status: 1,
              deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              driveFolderUrl: driveFolderUrl || '',
              checklist,
              createdAt: new Date().toISOString(),
            };

            if (type === 'reclamation') {
              newTask.reclamationCause = reclamationCause || 'Брак';
              newTask.reclamationDescription = reclamationDescription || 'Массовая рекламация на этаж';
            }

            state.tasks.push(newTask);
            generatedTasks.push(newTask);
            countCreated++;
          });

        } else {
          // --- ПОКОМНАТНО (Атомарные) — СТАНДАРТНОЕ поведение ---
          sec.floors.forEach((fl) => {
            // Отсекаем по переданному диапазону этажей
            if (startFloorFilter !== undefined && startFloorFilter !== null && startFloorFilter !== '') {
              const minF = parseInt(startFloorFilter, 10);
              if (!isNaN(minF) && fl.floorNumber < minF) return;
            }
            if (endFloorFilter !== undefined && endFloorFilter !== null && endFloorFilter !== '') {
              const maxF = parseInt(endFloorFilter, 10);
              if (!isNaN(maxF) && fl.floorNumber > maxF) return;
            }

            fl.rooms.forEach((room) => {
              let matchesScope = false;

              if (selectionScope === 'all') {
                matchesScope = true;
              } else if (selectionScope === 'apartments') {
                matchesScope = room.type === 'Квартира';
              } else if (selectionScope === 'mop') {
                matchesScope = room.type === mopType;
              } else if (selectionScope === 'manual') {
                matchesScope = manualRooms?.includes(room.id);
              }

              if (matchesScope) {
                // Проверяем матрицу применимости!
                const isApplicable = workType.applicableEntityTypes.includes(room.type);
                if (!isApplicable) {
                  countSkippedDueToMatrix++;
                  return; // Не сечем задачу, так как матрица запрещает ламинат в подвалах и т.д.
                }

                // Проверим, нет ли уже ТОЧНО такой же задачи на это помещение по данному виду работ (для Проекта)
                if (type === 'main') {
                  const alreadyExists = state.tasks.some(
                    (t) =>
                      t.type === 'main' &&
                      t.location &&
                      t.location.roomId === room.id &&
                      t.workTypeId === workTypeId
                  );
                  if (alreadyExists) return; // Пропускаем дубль
                }

                // Строим чек-лист документов из шаблонов вида работ
                const checklist: TaskChecklistItem[] = workType.checklistTemplates.map((templateName, index) => ({
                  id: `chk_mass_${room.id}_${index}_${Math.random().toString(36).substring(2, 5)}`,
                  name: templateName,
                  isCompleted: false,
                  driveUrl: '',
                  comments: [],
                }));

                const taskId = `${type}_task_${Math.random().toString(36).substring(2, 9)}`;
                const newTask: Task = {
                  id: taskId,
                  type: type as TaskType,
                  location: {
                    objectId,
                    objectName: objName,
                    houseId,
                    houseName: houseName,
                    sectionId: secId,
                    sectionNumber: sec.number,
                    floorNumber: fl.floorNumber,
                    roomId: room.id,
                    roomName: room.name,
                    roomType: room.type,
                  },
                  workTypeId,
                  workTypeName: workType.name,
                  executorName: executor.name,
                  executorEmail: executor.email,
                  status: 1, // Назначена
                  deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  driveFolderUrl: driveFolderUrl || '',
                  checklist,
                  createdAt: new Date().toISOString(),
                };

                if (type === 'reclamation') {
                  newTask.reclamationCause = reclamationCause || 'Брак';
                  newTask.reclamationDescription = reclamationDescription || 'Без описания инцидента';
                }

                state.tasks.push(newTask);
                generatedTasks.push(newTask);
                countCreated++;
              }
            });
          });
        }
      });

      if (countCreated > 0) {
        const directorUser = state.users.find((u) => u.role === 'director') || { name: 'Начальник ПТО', email: 'pavlov.alpro@gmail.com' };
        addNotification(
          state,
          directorUser,
          executorEmail,
          `Вам массово назначено задач: ${countCreated} шт. по виду работ: "${workType.name}". Объект: ${objName}, д. ${houseName}. Срок до ${deadline || 'установленного по умолчанию'}.`,
          undefined,
          workType.name
        );
      }

      ServerDB.save(state);
      res.json({
        success: true,
        countCreated,
        countSkippedDueToMatrix,
        tasks: generatedTasks,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Создание одной одиночной задачи
  app.post('/api/tasks/create-single', (req, res) => {
    try {
      const {
        type, // 'main' | 'reclamation' | 'general'
        location, // { objectId, houseId, sectionId, floorNumber, roomId }
        workTypeId,
        executorEmail,
        deadline,
        driveFolderUrl,
        reclamationCause,
        reclamationDescription,
      } = req.body;

      if (!type || !executorEmail) {
        return res.status(400).json({ error: 'Не все обязательные параметры переданы' });
      }

      const state = ServerDB.get();

      // Найти исполнителя
      const executor = state.users.find((u) => u.email === executorEmail) || {
        name: executorEmail.split('@')[0],
        email: executorEmail,
      };

      // Определить название работы
      let workTypeName = 'Общее поручение';
      let actualWorkTypeId = 'general_task';
      if (type !== 'general') {
        const wt = state.workTypes.find((w) => w.id === workTypeId);
        if (!wt) return res.status(404).json({ error: 'Вид работы не найден в справочнике' });
        workTypeName = wt.name;
        actualWorkTypeId = wt.id;
      }

      // Сформировать объект локации
      let taskLocation = null;
      if (type !== 'general' && location && location.roomId) {
        const { objectId, houseId, sectionId, floorNumber, roomId } = location;
        const matchedObj = state.objects.find((o) => o.id === objectId);
        const matchedHouse = state.houses.find((h) => h.id === houseId);
        const matchedSec = state.sections.find((s) => s.id === sectionId);
        
        let foundRoom = null;
        if (matchedSec) {
          const fl = matchedSec.floors.find((f) => f.floorNumber === parseInt(floorNumber, 10));
          if (fl) {
            foundRoom = fl.rooms.find((r) => r.id === roomId);
          }
        }

        taskLocation = {
          objectId,
          objectName: matchedObj ? matchedObj.name : 'Unknown',
          houseId,
          houseName: matchedHouse ? matchedHouse.name : 'Unknown',
          sectionId,
          sectionNumber: matchedSec ? matchedSec.number : 'Unknown',
          floorNumber: parseInt(floorNumber, 10),
          roomId,
          roomName: foundRoom ? foundRoom.name : 'Unknown',
          roomType: foundRoom ? foundRoom.type : 'Квартира',
        };
      }

      // Собрать шаблоны чек-листа
      let checklistTemplates: string[] = [];
      if (type !== 'general') {
        const wt = state.workTypes.find((w) => w.id === workTypeId);
        if (wt && wt.checklistTemplates) {
          checklistTemplates = wt.checklistTemplates;
        }
      } else {
        checklistTemplates = ['1. Выполнение поручения', '2. Согласование результатов'];
      }

      const checklist = checklistTemplates.map((templateName, index) => ({
        id: `chk_single_${Math.random().toString(36).substring(2, 6)}_${index}`,
        name: templateName,
        isCompleted: false,
        driveUrl: '',
        comments: [],
      }));

      const taskId = `${type}_task_single_${Math.random().toString(36).substring(2, 9)}`;
      const newTask: Task = {
        id: taskId,
        type: type as TaskType,
        location: taskLocation,
        workTypeId: actualWorkTypeId,
        workTypeName,
        executorName: executor.name,
        executorEmail: executor.email,
        status: 1, // Назначена
        deadline: deadline || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        driveFolderUrl: driveFolderUrl || '',
        checklist,
        createdAt: new Date().toISOString(),
      };

      if (type === 'reclamation') {
        newTask.reclamationCause = reclamationCause || 'Брак';
        newTask.reclamationDescription = reclamationDescription || 'Без описания инцидента';
      } else if (type === 'general') {
        newTask.reclamationDescription = reclamationDescription || 'Общее поручение';
      }

      state.tasks.push(newTask);

      // Оповещение инженера о новой задаче
      const directorUser = state.users.find((u) => u.role === 'director') || { name: 'Начальник ПТО', email: 'pavlov.alpro@gmail.com' };
      const locStr = taskLocation 
        ? ` по адресу: ${taskLocation.objectName}, д. ${taskLocation.houseName}, сп. ${taskLocation.sectionNumber}, этаж ${taskLocation.floorNumber}, помещение ${taskLocation.roomName}` 
        : '';
      addNotification(
        state,
        directorUser,
        newTask.executorEmail,
        `Вам назначена новая задача: "${newTask.workTypeName}"${locStr}. Срок до ${newTask.deadline}.`,
        newTask.id,
        newTask.workTypeName
      );

      ServerDB.save(state);

      res.json({ success: true, task: newTask });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 8. Редактирование или обновление задачи (Исполнителем или Начальником)
  app.post('/api/tasks/update', (req, res) => {
    try {
      const { taskId, status, statusComments, checklist, executorEmail, executorName, deadline, driveFolderUrl, userRole, generalComment } = req.body;
      if (!taskId) return res.status(400).json({ error: 'ID задачи отсутствует' });

      const state = ServerDB.get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Задача не найдена' });

      // ПРАВИЛО: Только Начальник ПТО (role: 'director') может архивировать задачи (статус 7) (исключение: личные задачи)
      const currentRole = userRole || 'engineer';
      if (status === 7 && currentRole !== 'director' && task.type !== 'general') {
        return res.status(403).json({ error: 'Только Начальник ПТО имеет право переводить задачи в архив (Сдано)' });
      }

      // ПРАВИЛО: "Замечания технадзора" требует Текст Замечаний
      if (status === 5) {
        const commentToEnforce = statusComments || task.statusComments;
        if (!commentToEnforce || commentToEnforce.trim() === '') {
          return res.status(400).json({ error: 'Для статуса "Замечания технадзора" обязательно заполнить поле "Текст замечания"' });
        }
      }

      // Накатываем изменения
      const oldStatus = task.status;
      const newStatus = status !== undefined ? parseInt(status, 10) : undefined;
      const statusChanged = newStatus !== undefined && oldStatus !== newStatus;

      if (status !== undefined) {
        task.status = parseInt(status, 10);
      }
      if (statusComments !== undefined) {
        task.statusComments = statusComments;
      }
      if (generalComment !== undefined) {
        task.generalComment = generalComment;
      }
      if (checklist !== undefined) {
        task.checklist = checklist;
      }
      if (executorEmail !== undefined) {
        task.executorEmail = executorEmail;
        const matchedUsr = state.users.find((u) => u.email === executorEmail);
        task.executorName = matchedUsr ? matchedUsr.name : executorName || executorEmail;
      }
      if (deadline !== undefined) {
        task.deadline = deadline;
      }
      if (driveFolderUrl !== undefined) {
        task.driveFolderUrl = driveFolderUrl;
      }

      // Отправка уведомлений о смене статуса
      if (statusChanged && newStatus !== undefined) {
        const statusNames: { [key: number]: string } = {
          1: 'Назначена',
          2: 'В работе',
          3: 'На проверке у Начальника ПТО',
          4: 'Передано технадзору',
          5: 'Замечания технадзора',
          6: 'На подписании',
          7: 'В архиве (Сдано)',
        };
        const statusName = statusNames[newStatus] || `Статус ${newStatus}`;

        if (currentRole === 'director') {
          const directorUser = state.users.find((u) => u.role === 'director') || { name: 'Начальник ПТО', email: 'pavlov.alpro@gmail.com' };
          let commentText = '';
          if (newStatus === 5 && (statusComments || task.statusComments)) {
            commentText = ` Замечание: "${statusComments || task.statusComments}"`;
          }
          addNotification(
            state,
            directorUser,
            task.executorEmail,
            `Начальник ПТО изменил статус вашей задачи "${task.workTypeName}" на: "${statusName}".${commentText}`,
            task.id,
            task.workTypeName
          );
        } else if (task.type !== 'general') {
          const engineersName = task.executorName || 'Инженер';
          const senderUser = state.users.find((u) => u.email === task.executorEmail) || { name: engineersName, email: task.executorEmail };
          const directors = state.users.filter((u) => u.role === 'director');
          directors.forEach((dir) => {
            addNotification(
              state,
              senderUser,
              dir.email,
              `Инженер ${engineersName} изменил статус задачи "${task.workTypeName}" на: "${statusName}".`,
              task.id,
              task.workTypeName
            );
          });
        }
      }

      ServerDB.save(state);
      res.json({ success: true, task });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 9. Добавление комментария в обсуждение документа чек-листа
  app.post('/api/tasks/comment/add', (req, res) => {
    try {
      const { taskId, checklistItemId, text, username } = req.body;
      if (!taskId || !checklistItemId || !text || !username) {
        return res.status(400).json({ error: 'Не все параметры переданы' });
      }

      const state = ServerDB.get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Задача не найдена' });

      const item = task.checklist.find((chk) => chk.id === checklistItemId);
      if (!item) return res.status(404).json({ error: 'Пункт чек-листа не найден' });

      const ts = getRussianTimestamp();
      const newComment: TaskComment = {
        id: 'comm_' + Math.random().toString(36).substring(2, 9),
        timestamp: ts,
        username,
        text,
      };

      if (!item.comments) item.comments = [];
      item.comments.push(newComment);

      // Рассылка уведомлений об оставленном комментарии к документу в чек-листе
      const matchedUser = state.users.find((u) => u.name === username);
      const isDirector = matchedUser ? matchedUser.role === 'director' : username.includes('Начальник');
      const senderEmail = matchedUser ? matchedUser.email : (isDirector ? 'pavlov.alpro@gmail.com' : task.executorEmail);
      const sender = { name: username, email: senderEmail };
      const commentShortText = text.length > 50 ? `${text.substring(0, 50)}...` : text;

      if (isDirector) {
        addNotification(
          state,
          sender,
          task.executorEmail,
          `Начальник ПТО оставил комментарий к документу "${item.name}" в задаче "${task.workTypeName}": "${commentShortText}"`,
          task.id,
          task.workTypeName
        );
      } else if (task.type !== 'general') {
        const directors = state.users.filter((u) => u.role === 'director');
        directors.forEach((dir) => {
          addNotification(
            state,
            sender,
            dir.email,
            `Инженер ${username} оставил комментарий к документу "${item.name}" в задаче "${task.workTypeName}": "${commentShortText}"`,
            task.id,
            task.workTypeName
          );
        });
      }

      ServerDB.save(state);
      res.json({ success: true, comment: newComment });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 10. Удаление задачи (Только Начальник ПТО)
  app.post('/api/tasks/delete', (req, res) => {
    try {
      const { taskId, userRole } = req.body;
      if (!taskId) return res.status(400).json({ error: 'ID задачи отсутствует' });

      if (userRole !== 'director') {
        return res.status(403).json({ error: 'У вас нет прав на удаление задачи. Только Начальник ПТО может удалять задачи' });
      }

      const state = ServerDB.get();
      state.tasks = state.tasks.filter((t) => t.id !== taskId);
      ServerDB.save(state);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 10.1 Массовое обновление задач
  app.post('/api/tasks/bulk-update', (req, res) => {
    try {
      const { taskIds, status, executorEmail, userRole } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Список ID задач отсутствует или пуст' });
      }

      const state = ServerDB.get();
      let updatedCount = 0;

      // ПРАВИЛО: Только Начальник ПТО (role: 'director') может архивировать задачи (статус 7) (исключение: личные задачи)
      const currentRole = userRole || 'engineer';
      if (status !== undefined && parseInt(status, 10) === 7 && currentRole !== 'director') {
        const hasNonGeneral = state.tasks.some((t) => taskIds.includes(t.id) && t.type !== 'general');
        if (hasNonGeneral) {
          return res.status(403).json({ error: 'Только Начальник ПТО имеет право переводить проектные или рекламационные задачи в архив (Сдано)' });
        }
      }

      let matchedUsr: any = null;
      if (executorEmail) {
        matchedUsr = state.users.find((u) => u.email === executorEmail);
      }

      state.tasks = state.tasks.map((task) => {
        if (taskIds.includes(task.id)) {
          updatedCount++;
          const updated = { ...task };
          if (status !== undefined) {
            updated.status = parseInt(status, 10);
          }
          if (executorEmail !== undefined) {
            updated.executorEmail = executorEmail;
            updated.executorName = matchedUsr ? matchedUsr.name : executorEmail;
          }
          return updated;
        }
        return task;
      });

      ServerDB.save(state);
      res.json({ success: true, updatedCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 10.2 Массовое удаление задач (Только Начальник ПТО)
  app.post('/api/tasks/bulk-delete', (req, res) => {
    try {
      const { taskIds, userRole } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Список ID задач отсутствует или пуст' });
      }

      if (userRole !== 'director') {
        return res.status(403).json({ error: 'У вас нет прав на массовое удаление задач. Только Начальник ПТО может удалять задачи' });
      }

      const state = ServerDB.get();
      const initialCount = state.tasks.length;
      state.tasks = state.tasks.filter((t) => !taskIds.includes(t.id));
      const deletedCount = initialCount - state.tasks.length;
      ServerDB.save(state);

      res.json({ success: true, deletedCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 11. ГЕНЕРАЦИЯ ОДНОРАЗОВОЙ ССЫЛКИ ДЛЯ ИНЖЕНЕРА (Команда)
  app.post('/api/invites/generate', (req, res) => {
    try {
      const state = ServerDB.get();
      const token = 'token_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // ссылка активна 24 часа

      const newInvite: Invite = { token, expiresAt };
      state.invites.push(newInvite);
      ServerDB.save(state);

      res.json(newInvite);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 12. ПРИНЯТИЕ ПРИГЛАШЕНИЯ РЕГИСТРАЦИЯ ИНЖЕНЕРА ЧЕРЕЗ ССЫЛКУ-ТОКЕН
  app.post('/api/invites/accept', (req, res) => {
    try {
      const { token, name, email, password } = req.body;
      if (!token || !name || !email || !password) {
        return res.status(400).json({ error: 'Недостаточно данных для регистрации (укажите пароль)' });
      }

      const state = ServerDB.get();
      const inviteIdx = state.invites.findIndex((inv) => inv.token === token);
      if (inviteIdx === -1) {
        return res.status(400).json({ error: 'Ссылка-приглашение недействительна или не существует' });
      }

      const invite = state.invites[inviteIdx];
      if (new Date(invite.expiresAt).getTime() < Date.now()) {
        state.invites.splice(inviteIdx, 1); // чистим испорченные
        ServerDB.save(state);
        return res.status(400).json({ error: 'Срок действия ссылки-приглашения (24 часа) истек' });
      }

      if (invite.usedByEmail) {
        return res.status(400).json({ error: 'Приглашение уже было использовано' });
      }

      // Проверим, нет ли уже такого пользователя
      let user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        // Обновим имя и удостоверимся, что он инженер
        user.name = name;
        user.role = 'engineer';
      } else {
        user = {
          id: 'user_' + Math.random().toString(36).substring(2, 9),
          name,
          email,
          role: 'engineer',
          password,
        };
        state.users.push(user);
      }

      // Удалим данный токен, т.к. он одноразовый
      state.invites.splice(inviteIdx, 1);
      ServerDB.save(state);

      res.json({ success: true, user });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Смена роли / создание пользователя админом для быстрого переключения в демо
  app.post('/api/users/switch-or-create', (req, res) => {
    try {
      const { name, email, role } = req.body;
      if (!name || !email || !role) {
        return res.status(400).json({ error: 'Укажите Имя, Email и Роль' });
      }

      const state = ServerDB.get();
      let usr = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (usr) {
        usr.name = name;
        usr.role = role === 'director' ? 'director' : 'engineer';
      } else {
        usr = {
          id: 'user_' + Math.random().toString(36).substring(2, 9),
          name,
          email,
          role: role === 'director' ? 'director' : 'engineer',
          password: 'user', // по умолчанию
        };
        state.users.push(usr);
      }
      ServerDB.save(state);
      res.json({ success: true, user: usr });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 14. Переключение выполненности комментария в чек-листе
  app.post('/api/tasks/comment/toggle-completed', (req, res) => {
    try {
      const { taskId, checklistItemId, commentId, isCompleted } = req.body;
      if (!taskId || !checklistItemId || !commentId) {
        return res.status(400).json({ error: 'Недостаточно параметров для переключения комментария' });
      }

      const state = ServerDB.get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return res.status(404).json({ error: 'Задача не найдена' });

      const item = task.checklist.find((chk) => chk.id === checklistItemId);
      if (!item) return res.status(404).json({ error: 'Пункт чек-листа не найден' });

      if (!item.comments) item.comments = [];
      const comment = item.comments.find((c) => c.id === commentId);
      if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });

      comment.isCompleted = !!isCompleted;

      // Отправка уведомления о переключении выполненности замечания
      const username = req.body.username || 'Сотрудник';
      const matchedUser = state.users.find((u) => u.name === username);
      const isDirector = matchedUser ? matchedUser.role === 'director' : username.includes('Начальник');
      const senderEmail = matchedUser ? matchedUser.email : (isDirector ? 'pavlov.alpro@gmail.com' : task.executorEmail);
      const sender = { name: username, email: senderEmail };
      const commentShort = comment.text.length > 40 ? `${comment.text.substring(0, 40)}...` : comment.text;

      if (isDirector) {
        addNotification(
          state,
          sender,
          task.executorEmail,
          `Начальник ПТО отметил ваше замечание к документу "${item.name}" как ${isCompleted ? 'исправленное (ВЫПОЛНЕНО)' : 'неисправленное'}: "${commentShort}"`,
          task.id,
          task.workTypeName
        );
      } else if (task.type !== 'general') {
        const directors = state.users.filter((u) => u.role === 'director');
        directors.forEach((dir) => {
          addNotification(
            state,
            sender,
            dir.email,
            `Инженер ${username} отметил замечание к документу "${item.name}" как ${isCompleted ? 'исправленное (ВЫПОЛНЕНО)' : 'неисправленное'} в задаче "${task.workTypeName}": "${commentShort}"`,
            task.id,
            task.workTypeName
          );
        });
      }

      ServerDB.save(state);
      res.json({ success: true, comment });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 15. Обновление названия компании
  app.post('/api/company/update', (req, res) => {
    try {
      const { companyName } = req.body;
      if (!companyName || !companyName.trim()) {
        return res.status(400).json({ error: 'Название компании не может быть пустым' });
      }

      const state = ServerDB.get();
      state.companyName = companyName.trim();
      ServerDB.save(state);

      res.json({ success: true, companyName: state.companyName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 16. Обновление данных инженера или начальника
  app.post('/api/users/update', (req, res) => {
    try {
      const { id, name, email, role } = req.body;
      if (!id || !name || !email) {
        return res.status(400).json({ error: 'Не все обязательные параметры (id, name, email) переданы' });
      }

      const state = ServerDB.get();
      const usr = state.users.find((u) => u.id === id);
      if (!usr) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // Обновляем данные пользователя
      usr.name = name.trim();
      usr.email = email.trim();
      if (role) {
        usr.role = role === 'director' ? 'director' : 'engineer';
      }

      ServerDB.save(state);
      res.json({ success: true, user: usr });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 16.5 Удаление сотрудника (увольнение) ПТО с передачей всех его строительных задач другому инженеру или начальнику
  app.post('/api/users/delete', (req, res) => {
    try {
      const { id, transferToUserId } = req.body;
      if (!id || !transferToUserId) {
        return res.status(400).json({ error: 'Не все обязательные параметры (id, transferToUserId) переданы' });
      }

      const state = ServerDB.get();
      const userToDelete = state.users.find((u: any) => u.id === id);
      if (!userToDelete) {
        return res.status(404).json({ error: 'Сотрудник для удаления не найден' });
      }

      if (id === transferToUserId) {
        return res.status(400).json({ error: 'Нельзя перевести задачи удаляемого сотрудника на него же самого' });
      }

      const transferTargetUser = state.users.find((u: any) => u.id === transferToUserId);
      if (!transferTargetUser) {
        return res.status(404).json({ error: 'Сотрудник-получатель задач не найден' });
      }

      // Передаем все его задачи новому исполнителю
      let transferredCount = 0;
      state.tasks = state.tasks.map((task: any) => {
        if (task.executorEmail.toLowerCase() === userToDelete.email.toLowerCase()) {
          transferredCount++;
          return {
            ...task,
            executorEmail: transferTargetUser.email,
            executorName: transferTargetUser.name,
          };
        }
        return task;
      });

      // Удаляем сотрудника из списка
      state.users = state.users.filter((u: any) => u.id !== id);

      // Оповещаем получателя задач
      addNotification(
        state,
        { name: 'Система ПТО', email: 'system' },
        transferTargetUser.email,
        `Вам переданы строительные задачи сотрудника (${userToDelete.name}) в количестве ${transferredCount} шт. в связи с его увольнением.`,
        undefined,
        'Передача задач'
      );

      ServerDB.save(state);
      res.json({ success: true, transferredCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 17. Получение уведомлений текущего сотрудника
  app.get('/api/notifications', (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ error: 'Параметр email отсутствует' });
      }
      const state = ServerDB.get();
      if (!state.notifications) state.notifications = [];
      
      const filtered = state.notifications.filter(
        (n) => n.recipientEmail.toLowerCase() === (email as string).toLowerCase() || n.recipientEmail === 'all'
      );
      
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ success: true, notifications: filtered });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 18. Отметка уведомления (или всех) как прочитанного
  app.post('/api/notifications/mark-read', (req, res) => {
    try {
      const { notificationId, email } = req.body;
      const state = ServerDB.get();
      if (!state.notifications) state.notifications = [];

      if (notificationId) {
        const notif = state.notifications.find((n) => n.id === notificationId);
        if (notif) {
          notif.isRead = true;
        }
      } else if (email) {
        state.notifications.forEach((n) => {
          if (n.recipientEmail.toLowerCase() === email.toLowerCase() || n.recipientEmail === 'all') {
            n.isRead = true;
          }
        });
      }

      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 19. Очистка уведомлений текущего сотрудника
  app.post('/api/notifications/clear', (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Параметр email отсутствует' });
      }
      const state = ServerDB.get();
      if (!state.notifications) state.notifications = [];

      state.notifications = state.notifications.filter(
        (n) => n.recipientEmail.toLowerCase() !== email.toLowerCase() && n.recipientEmail !== 'all'
      );

      ServerDB.save(state);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 20. Авторизация по логину и паролю
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Не указан email или пароль' });
      }

      const state = ServerDB.get();
      const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      if (user.password !== password) {
        return res.status(401).json({ error: 'Неверный пароль' });
      }

      res.json({ success: true, user });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 21. Смена пароля
  app.post('/api/users/change-password', (req, res) => {
    try {
      const { email, oldPassword, newPassword, isMasterAccess } = req.body;
      if (!email || !newPassword) {
        return res.status(400).json({ error: 'Недостаточно данных для смены пароля' });
      }

      const state = ServerDB.get();
      const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      if (!isMasterAccess && user.password && user.password !== oldPassword) {
        return res.status(401).json({ error: 'Неверный старый пароль' });
      }

      user.password = newPassword;
      ServerDB.save(state);
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 22. SSE поток для мгновенного обновления в браузере
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onUpdate = () => {
      res.write('data: update\n\n');
    };
    dbEvents.on('update', onUpdate);

    req.on('close', () => {
      dbEvents.off('update', onUpdate);
    });
  });

  // ПОДКЛЮЧЕНИЕ VITE ИЛИ СТАТИЧЕСКИХ ФАЙЛОВ
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[BACKEND COMPONENT] Server listening globally on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Error:', err);
});
